"""GB10 (DGX Spark / FusionXpark) 桌面浮动仪表盘 · 双机版.

无边框置顶小窗，通过 SSH 读取两台 GB10 的整机指标，外观仿 NVIDIA DGX Dashboard。
双机 = 同窗顶部标签切换（每台一个采集线程 + 独立状态/曲线；UI 按机渲染）。

════════════════════════════════════════════════════════════════════
▍维护手册：本文件只管「采集 + 窗口」，引擎解析全在 engine_adapters.py
════════════════════════════════════════════════════════════════════
▍改配置（加主机/换引擎端口）→ 只改 hosts.json（同目录；模板 hosts.example.json），
  重启面板生效。本文件里的 HOSTS 列表仅是 json 缺失/损坏时的回退默认。

▍数据流（一条链，改哪段搜对应名字）：
  Collector 线程（本文件 class Collector）
    └─ build_remote_cmd(hostcfg)          ← 按该机 engine+port 生成远端 bash 脚本
         远端每 POLL_SECONDS 一行 JSON：nvidia-smi + /proc/meminfo + spbm hwmon
         + 逐个 curl 引擎 URL → base64 → 键 "raw"
    └─ MetricsState.push(data, engine)    ← 窗口增量算实时 decode/prefill/TTFT
         └─ _norm() → EA.apply(raw, engine_id)   ← engine_adapters 出统一契约 eng 字典
  Api.get_metrics() → {hosts_meta, hosts:{id:快照}} → ui.html 按 activeHost 渲染

▍换/加推理引擎（新家族）→ 只改 engine_adapters.py（其文件头有完整维护手册），
  本文件与 ui.html 不动。hosts.json 的 engine 字段 = ADAPTERS 里的家族 id。

数据源（板级，与引擎无关）：
  - util / temp / power : nvidia-smi --query-gpu
  - 显存                : /proc/meminfo（GB10 为统一内存，nvidia-smi 不报显存）
  - 板级功率/能耗/温度   : spark_hwmon 驱动（hwmon 名 spbm，模块 spbm）
                          功率域 sys_total / dc_input / soc_pkg / cpu_gpu / gpu /
                                 cpu_p / cpu_e / vcore / dla / prereg
                          限额 pl1/pl2/syspl1/syspl2（当前 + cap）
                          能耗 pkg / cpu_p / cpu_e / gpu（累计）
                          温度 tj_max / cpu_p_clu0/1 / cpu_e_clu0/1 / gpu / soc / dla

前置：GB10 需装 spark_hwmon 驱动（DKMS 模块 spbm）才有板级数据；
      未装时功率域/限额/能耗/芯片温度自动隐藏，其余照常。

运行: pythonw gb10_monitor.py   （或双击 launch.vbs）
"""

import base64
import ctypes
import json
import os
import subprocess
import threading
import time
from collections import deque
from pathlib import Path

import webview
from webview.window import FixPoint

# ----------------------------- 配置 -----------------------------
APP_DIR = Path(__file__).resolve().parent
UI_HTML = APP_DIR / "ui.html"

SSH_EXE = os.path.join(
    os.environ.get("SystemRoot", r"C:\Windows"), "System32", "OpenSSH", "ssh.exe"
)
SSH_KEY = os.path.join(os.environ.get("USERPROFILE", ""), ".ssh", "id_ed25519")


def _load_hosts():
    """主机清单：优先 hosts.json（同目录，模块化入口），无则用内置默认。

    hosts.json 格式（每台一个对象）：
      {"id": "head", "label": "Head node", "host": "user@192.168.1.10",
       "engine": "tensorfold", "port": 8888}
    engine = 引擎家族 id（engine_adapters.ADAPTERS），"none"/缺省 = 不采集引擎；
    port   = 该机引擎端口（远端 localhost，随 SSH 在目标机上抓）。
    可选顶层键 "title"：窗口标题（ui.html 静态标题会被替换）。
    加/换主机或引擎 → 只改这个 json，重启面板即生效，不动代码。
    """
    global APP_TITLE
    try:
        cfg = json.loads((APP_DIR / "hosts.json").read_text("utf-8"))
        if isinstance(cfg, dict) and cfg.get("title"):
            APP_TITLE = str(cfg["title"])
        hosts = cfg.get("hosts") if isinstance(cfg, dict) else cfg
        if isinstance(hosts, list) and hosts:
            return [h for h in hosts if isinstance(h, dict) and h.get("id")]
    except FileNotFoundError:
        pass
    except Exception:  # noqa: BLE001 — 配置坏了退回默认并继续起面板
        pass
    return []


APP_TITLE = "DGX Dashboard"
HOSTS = _load_hosts()

POLL_SECONDS = 1.5          # 采样间隔
HIST_LEN = 60               # 曲线保留点数
POWER_MAX = 140.0           # 整机功率表盘上限（GB10 报 N/A，取板级 SYSPL1 cap≈231 之下的经验值）

WINDOW_W = 430
WINDOW_H = 720
MIN_W = 280                 # 与 ui.html 的 MIN_W 保持一致（拖拽缩放的钳制在 JS 侧）
MIN_H = 240

STATE_DIR = Path(os.environ.get("APPDATA", str(APP_DIR))) / "gb10-monitor"
STATE_FILE = STATE_DIR / "state.json"

# 推理引擎（模块化）：引擎家族在 engine_adapters.py，**实例参数（端口）在 hosts.json** ——
#   每台按 HOSTS[].engine 选家族、HOSTS[].port 出 URL；换端口/换机只改 hosts.json。
import engine_adapters as EA

NVME_HWMON_HINT = "nvme"


def build_remote_cmd(hostcfg):
    """按某台机器的引擎配置（家族 + 端口）生成远端采集命令（每机抓各自的引擎 URL）。

    hostcfg = HOSTS/hosts.json 里的一台 {"id","host","engine","port"}。
    engine="none" 或缺省 → urls 为空，远端脚本不抓引擎（纯板级）。
    引擎 URL 清单来自 engine_adapters.source_urls(engine, port)——换引擎不碰本函数。"""
    urls = EA.source_urls(hostcfg.get("engine"), hostcfg.get("port"))
    # 远端采集脚本：每 POLL_SECONDS 输出一行 JSON
    script = (
    "while :; do\n"
    "  g=$(nvidia-smi --query-gpu=utilization.gpu,temperature.gpu,power.draw "
    "--format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')\n"
    "  u=$(printf '%s' \"$g\" | cut -d, -f1)\n"
    "  t=$(printf '%s' \"$g\" | cut -d, -f2)\n"
    "  p=$(printf '%s' \"$g\" | cut -d, -f3)\n"
    "  read -r mt mu < <(awk '/^MemTotal:/{tot=$2}/^MemAvailable:/{av=$2}"
    "END{printf \"%.0f %.0f\", tot/1024, (tot-av)/1024}' /proc/meminfo)\n"
    # 硬盘：根分区 used/total（KiB）
    "  read -r dt du_ < <(df -k / 2>/dev/null | awk 'NR==2{print $2,$3}')\n"
    # ---- spark_hwmon (spbm) 板级通道：按 label 分组，原值输出（µW / µJ / 毫摄氏度）----
    "  sp=\n"
    "  for h in /sys/class/hwmon/hwmon*; do "
    "[ \"$(cat $h/name 2>/dev/null)\" = \"spbm\" ] && sp=$h && break; done\n"
    "  pw=; lim=; en=; tp=; nv=\n"
    "  if [ -n \"$sp\" ]; then\n"
    "    for f in $sp/power*_input; do\n"
    "      n=$(basename $f); n=${n#power}; n=${n%_input}\n"
    "      lb=$(cat $sp/power${n}_label 2>/dev/null); v=$(cat $f 2>/dev/null)\n"
    "      case \"$lb\" in\n"
    "        pl1|pl2|syspl1|syspl2) cp=$(cat $sp/power${n}_cap 2>/dev/null);"
    " lim=\"${lim}\\\"$lb\\\":[$v,$cp],\" ;;\n"
    "        *) pw=\"${pw}\\\"$lb\\\":$v,\" ;;\n"
    "      esac\n"
    "    done\n"
    "    for f in $sp/energy*_input; do\n"
    "      n=$(basename $f); n=${n#energy}; n=${n%_input}\n"
    "      lb=$(cat $sp/energy${n}_label 2>/dev/null); v=$(cat $f 2>/dev/null)\n"
    "      en=\"${en}\\\"$lb\\\":$v,\"\n"
    "    done\n"
    "    for f in $sp/temp*_input; do\n"
    "      n=$(basename $f); n=${n#temp}; n=${n%_input}\n"
    "      lb=$(cat $sp/temp${n}_label 2>/dev/null); v=$(cat $f 2>/dev/null)\n"
    "      tp=\"${tp}\\\"$lb\\\":$v,\"\n"
    "    done\n"
    "  fi\n"
    "  for h in /sys/class/hwmon/hwmon*; do "
    "nh=$(cat $h/name 2>/dev/null); "
    "if [ \"$nh\" = \"" + NVME_HWMON_HINT + "\" ]; then "
    "nv=$(cat $h/temp1_input 2>/dev/null); fi; done\n"
    # ---- 引擎指标：按适配器声明的 URL 逐个抓取并 base64（换引擎/端口只改 hosts.json）----
    "  raw=\n"
    "  for eu in " + " ".join(urls) + "; do "
    "b=$(curl -s -m 3 \"$eu\" 2>/dev/null | base64 -w0); "
    "raw=\"${raw}\\\"$eu\\\":\\\"$b\\\",\"; done\n"
    "  printf '{\"util\":%s,\"temp\":%s,\"power\":%s,\"mem_total\":%s,\"mem_used\":%s,"
    "\"disk_total\":%s,\"disk_used\":%s,"
    "\"spbm\":{\"power\":{%s},\"plim\":{%s},\"energy\":{%s},\"temp\":{%s}},"
    "\"nvme_c\":%s,"
    "\"raw\":{%s}}\\n' "
    "\"${u:-0}\" \"${t:-0}\" \"${p:-0}\" \"${mt:-0}\" \"${mu:-0}\" "
    "\"${dt:-0}\" \"${du_:-0}\" "
    "\"${pw%,}\" \"${lim%,}\" \"${en%,}\" \"${tp%,}\" "
    "\"${nv:-null}\" "
    "\"${raw%,}\"\n"
    "  sleep " + str(POLL_SECONDS) + "\n"
    "done\n"
    )
    # 以 base64 方式把脚本喂给远端 bash，避免脚本与 stdin 抢 fd0
    return "echo " + base64.b64encode(script.encode("utf-8")).decode("ascii") + " | base64 -d | bash"


# --------------------------- 数据整理 ---------------------------
def _num(v):
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _norm(d, engine=None, ctx_hint=None):
    """把远端原值（µW / µJ / 毫摄氏度）换算为 W / kJ / ℃，并扁平化板级通道。

    engine = 该机适配器 id（hosts.json[].engine），决定用哪个引擎适配器解析 raw。
    """
    sp = d.get("spbm") or {}
    out = {}
    for lb, v in (sp.get("power") or {}).items():
        out[lb] = _num(v)
        if out[lb] is not None:
            out[lb] = round(out[lb] / 1e6, 1)
    d["pw"] = out

    lim = {}
    for lb, pair in (sp.get("plim") or {}).items():
        cur = _num(pair[0]) if isinstance(pair, list) and pair else None
        cap = _num(pair[1]) if isinstance(pair, list) and len(pair) > 1 else None
        lim[lb] = [round(cur / 1e6, 1) if cur is not None else None,
                   round(cap / 1e6, 1) if cap is not None else None]
    d["lim"] = lim

    kj = {}
    for lb, v in (sp.get("energy") or {}).items():
        x = _num(v)
        kj[lb] = round(x / 1e6, 1) if x is not None else None
    d["kj"] = kj

    ct = {}
    for lb, v in (sp.get("temp") or {}).items():
        x = _num(v)
        ct[lb] = round(x / 1000, 1) if x is not None else None
    d["ct"] = ct

    nv = _num(d.get("nvme_c"))
    d["nvme_c"] = round(nv / 1000, 1) if nv is not None else None

    # 表盘/曲线用的几个主量
    d["sys_w"] = out.get("sys_total")
    d["gpu_w"] = out.get("gpu")
    d["soc_w"] = out.get("soc_pkg")
    d["cpu_w"] = None
    if out.get("cpu_p") is not None or out.get("cpu_e") is not None:
        d["cpu_w"] = round((out.get("cpu_p") or 0) + (out.get("cpu_e") or 0), 1)
    d["tj_max_c"] = ct.get("tj_max")
    d["chip_gpu_c"] = ct.get("gpu")

    # 引擎指标 → 统一契约（适配器在 engine_adapters.py；换引擎不动这里）
    d["eng"] = EA.apply(d.pop("raw", None) or {}, engine, ctx_hint)
    return d


# --------------------------- 共享状态 ---------------------------
class MetricsState:
    def __init__(self):
        self._lock = threading.Lock()
        self.connected = False
        self.error = ""
        self.latest = None
        self._rate = {"eng": deque(maxlen=24)}    # (t, gen, dec_s) 解码窗口
        self._pre = {"eng": deque(maxlen=24)}     # (t, pre_uncached, pre_s) 预填充窗口
        self._ttft = {"eng": deque(maxlen=24)}    # (t, ttft_sum, ttft_count) TTFT 窗口
        self._e2e = {"eng": deque(maxlen=24)}     # (t, lat_sum, lat_count) 端到端窗口
        self.decode = {"eng": None}               # 最近一次非零实时解码 t/s（空闲保留）
        self.decode_avg = {"eng": None}           # 最近一次可信的「平均 decode」（vLLM 仅空闲时给，忙碌沿用）
        self.prefill = {"eng": None}              # 最近一次非零实时 prefill t/s（空闲保留）
        self._gw_prompt = None                    # 上一帧网关 prompt 累计（回退=网关重启→重置 prefill）
        self.ttft = {"eng": None}                 # 最近一次非零实时 TTFT ms（空闲保留）
        self.e2e = {"eng": None}                  # 最近一次非零实时端到端 ms（空闲保留）
        self.hist = {k: deque(maxlen=HIST_LEN)
                     for k in ("mem", "util", "temp", "power", "sys", "gpu", "cpu",
                               "dec", "run")}

    def _delta_rate(self, dq, a, b, win=12.0, db_floor=0.0):
        """窗口速率 = 窗口内各相邻区间的 Δa/Δb 的**中位数**。

        用于把引擎的累计计数器还原成**当前负载窗口**的真实值：解码 Δgen/Δdecode_seconds、
        预填充 Δ(prompt−cached)/Δprefill_seconds、TTFT Δ(sum)/Δ(count)。空闲（无增量）返回
        None（调用方保留上一轮非零值）；计数回退（容器重启）清空基线重来。
        db_floor：分母增量小于它的区间不可信、直接丢弃（防「全缓存命中请求 Δpre_s 只有几毫秒
        → 相除爆表」的假尖刺，曾出现 65,270 t/s）；中位数进一步抗单区间离群。
        """
        now = time.time()
        if a is None or b is None:
            return None
        if dq and (a < dq[-1][1] or b < dq[-1][2]):
            dq.clear()
        dq.append((now, a, b))
        recent = [x for x in dq if now - x[0] <= win]
        val = None
        if len(recent) >= 2:
            rates = []
            for x0, x1 in zip(recent, recent[1:]):
                da, db = x1[1] - x0[1], x1[2] - x0[2]
                if da > 0 and db >= db_floor:
                    rates.append(da / db)
            if rates:
                val = sorted(rates)[len(rates) // 2] if len(rates) % 2 else \
                    (rates[len(rates)//2 - 1] + rates[len(rates)//2]) / 2
        while len(dq) > 2 and dq[0][0] < now - win:
            dq.popleft()
        return val

    def _delta_rate_wall(self, dq, a, win=12.0):
        """窗口增量 / 墙钟秒 = Δa / Δt（a 必须是随负载实时累加的计数）。

        用于 vLLM：其 generation_tokens_total 每步实时累加（含在飞请求），而
        request_decode_time_seconds 只在请求结束时结算——两者语义不同，必须用墙钟做分母
        才得到真实 decode t/s。空闲（无增量）返回 None（调用方保留上一轮非零值）。
        """
        now = time.time()
        if a is None:
            return None
        if dq and a < dq[-1][1]:
            dq.clear()
        dq.append((now, a, 0.0))
        recent = [x for x in dq if now - x[0] <= win]
        val = None
        if len(recent) >= 2:
            t0, a0, _ = recent[0]
            da, dt = a - a0, now - t0
            if da > 0 and dt > 0:
                val = da / dt
        while len(dq) > 2 and dq[0][0] < now - win:
            dq.popleft()
        return val

    def _rate_calc(self, key, gen, dec_s, den="dec_s"):
        """实时解码吞吐。

        den="dec_s"（TensorFold）：Δ生成 token / Δ累计解码秒——TF 的 generation 与
        decode_seconds 都是「已完成请求」的累计量，只在请求结束时才跳增；若用墙钟时间做分母，
        请求结束那一拍会把几十秒的生成压在单次轮询里，得到几百 t/s 的假尖刺（曾出现 531）。
        den="wall"（vLLM）：Δ生成 token / Δ墙钟秒——vLLM 的 generation 每步实时累加，
        必须用墙钟分母（见 _delta_rate_wall）。空闲（无增量）保留上一轮值；计数回退（容器重启）
        → 清空基线重来。
        """
        if gen is None:
            return
        if den == "wall":
            r = self._delta_rate_wall(self._rate[key], gen)
        else:
            r = self._delta_rate(self._rate[key], gen, dec_s)
        if r is not None:
            self.decode[key] = round(r, 1)

    def push(self, d, engine=None, ctx_hint=None):
        d = _norm(d, engine, ctx_hint)
        with self._lock:
            self.connected = True
            self.error = ""
            eng = d.get("eng") or {}
            self._rate_calc("eng", eng.get("gen"), eng.get("dec_s"), eng.get("rate_den") or "dec_s")
            if self.decode["eng"] is None and eng.get("decode_rate") is not None:
                self.decode["eng"] = eng.get("decode_rate")   # 冷启动先给生命周期均值
            # 「平均 decode」：vLLM 仅空闲时由适配器给可信值 → 缓存最近一次可信值，忙碌时沿用，
            # 避免请求进行中显示虚高的假平均。TensorFold 每拍都给（值稳定），缓存无副作用。
            if eng.get("decode_rate") is not None:
                self.decode_avg["eng"] = eng.get("decode_rate")
            elif self.decode_avg["eng"] is not None:
                eng["decode_rate"] = self.decode_avg["eng"]
            eng["live"] = self.decode["eng"]
            # 实时 prefill（窗口）= Δ(prompt−cached) / Δprefill_seconds；无窗口数据时保留
            # 适配器下发的累计均值作兜底（引擎刚起、还没跑满一个窗口）。
            # 网关的命中计数随它自己的进程归零，而引擎的 prompt 是生命周期累计；
            # 一重启网关，命中率就从 0 重新爬，跨重启算出来的 prefill 会虚高。
            # 检测到回退就丢掉预填窗口，等新样本攒够再说。
            gw_now = eng.get("gw_prompt")
            if gw_now is not None and self._gw_prompt is not None and gw_now < self._gw_prompt:
                self._pre["eng"].clear()
                self.prefill["eng"] = None
            self._gw_prompt = gw_now
            if "pre_s" not in eng:
                # 适配器判定这个引擎算不出可信 prefill（缺缓存命中累计量）→ 连历史缓存一起丢掉，
                # 否则空闲兜底会把上一台引擎/上一轮的旧值一直填回去。
                self.prefill["eng"] = None
                eng.pop("prefill_rate", None)
            else:
                pr = self._delta_rate(self._pre["eng"], eng.get("pre_uncached"),
                                      eng.get("pre_s"), db_floor=0.05)
                if pr is not None:
                    self.prefill["eng"] = round(pr, 1)
                if self.prefill["eng"] is not None:
                    eng["prefill_rate"] = self.prefill["eng"]
            # 实时 TTFT（窗口）= Δ(ttft_sum) / Δ(ttft_count) × 1000；同上兜底。
            tv = self._delta_rate(self._ttft["eng"], eng.get("ttft_sum"), eng.get("ttft_count"))
            if tv is not None:
                self.ttft["eng"] = round(tv * 1000, 1)
            if self.ttft["eng"] is not None:
                eng["ttft_ms"] = self.ttft["eng"]
            # 实时端到端（窗口）= Δ(latency_sum) / Δ(latency_count) × 1000；同上兜底。
            ev = self._delta_rate(self._e2e["eng"], eng.get("lat_sum"), eng.get("lat_count"))
            if ev is not None:
                self.e2e["eng"] = round(ev * 1000, 1)
            if self.e2e["eng"] is not None:
                eng["e2e_ms"] = self.e2e["eng"]
            d["dec_total"] = self.decode["eng"]
            d["run_total"] = eng.get("run") or 0
            self.latest = d
            self.hist["mem"].append(d.get("mem_used", 0))
            self.hist["util"].append(d.get("util", 0))
            self.hist["temp"].append(d.get("temp", 0))
            self.hist["power"].append(d.get("power", 0))
            self.hist["sys"].append(d.get("sys_w") or 0)
            self.hist["gpu"].append(d.get("gpu_w") or 0)
            self.hist["cpu"].append(d.get("cpu_w") or 0)
            self.hist["dec"].append(d.get("dec_total") or 0)
            self.hist["run"].append(d.get("run_total") or 0)

    def set_error(self, msg):
        with self._lock:
            self.connected = False
            self.error = str(msg)[:200]

    def snapshot(self):
        with self._lock:
            return {
                "connected": self.connected,
                "error": self.error,
                "latest": self.latest,
                "hist": {k: list(v) for k, v in self.hist.items()},
            }


# --------------------------- 采集线程 ---------------------------
class Collector(threading.Thread):
    def __init__(self, state, hostcfg):
        super().__init__(daemon=True)
        self.state = state
        self.hostcfg = hostcfg
        self.remote_cmd = build_remote_cmd(hostcfg)
        self._stop_ev = threading.Event()

    def stop(self):
        self._stop_ev.set()

    def run(self):
        while not self._stop_ev.is_set():
            try:
                self._session()
            except Exception as e:  # noqa: BLE001
                self.state.set_error(f'{self.hostcfg["label"]}: {e}')
            if not self._stop_ev.is_set():
                time.sleep(3)

    def _session(self):
        args = [
            SSH_EXE,
            "-o", "BatchMode=yes",
            "-o", "StrictHostKeyChecking=accept-new",
            "-o", "ConnectTimeout=8",
            "-o", "ServerAliveInterval=20",
            "-o", "ServerAliveCountMax=3",
            "-i", SSH_KEY,
            self.hostcfg["host"],
            self.remote_cmd,
        ]
        creationflags = 0x08000000 if os.name == "nt" else 0  # CREATE_NO_WINDOW
        proc = subprocess.Popen(
            args,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True, encoding="utf-8", errors="replace",
            bufsize=1,
            creationflags=creationflags,
        )
        got_data = False
        try:
            for line in proc.stdout:
                if self._stop_ev.is_set():
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue
                got_data = True
                self.state.push(data, self.hostcfg.get("engine"), self.hostcfg.get("ctx"))
        finally:
            if not got_data and not self._stop_ev.is_set():
                try:
                    err = (proc.stderr.read() or "").strip().replace("\n", " ")
                except Exception:  # noqa: BLE001
                    err = ""
                self.state.set_error(
                    f'{self.hostcfg["label"]}: ' + (err or "SSH 无数据，正在重连…"))
            try:
                proc.terminate()
            except Exception:  # noqa: BLE001
                pass


# ----------------------------- API -----------------------------
class Api:
    def __init__(self, states):
        self.states = states          # {host_id: MetricsState}

    def get_metrics(self):
        return {
            "hosts_meta": [{"id": h["id"], "label": h["label"],
                            "engine": h.get("engine") or "none"} for h in HOSTS],
            "hosts": {h["id"]: self.states[h["id"]].snapshot() for h in HOSTS},
        }

    def get_prefs(self):
        return {"on_top": bool(_PREFS.get("on_top", True))}

    def set_top(self, flag):
        _PREFS["on_top"] = bool(flag)
        win = _main_window()
        if win is not None:
            _set_topmost(win, bool(flag))
        save_state(win)

    def get_rect(self):
        win = _main_window()
        if win is None:
            return None
        return {"x": win.x, "y": win.y, "w": win.width, "h": win.height}

    def resize(self, direction, width, height):
        """direction 含 'e'/'w'/'n'/'s'，据此锚定对边。"""
        win = _main_window()
        if win is None:
            return
        fix = FixPoint.NORTH | FixPoint.WEST
        if "w" in direction:
            fix |= FixPoint.EAST
        if "n" in direction:
            fix |= FixPoint.SOUTH
        win.resize(int(width), int(height), fix)

    def save_geometry(self):
        win = _main_window()
        if win is not None:
            save_state(win)

    def close(self):
        for w in list(webview.windows):
            w.destroy()


# --------------------------- 状态持久化（位置/尺寸/置顶） ---------------------------
_PREFS = {"on_top": True}


def _main_window():
    return webview.windows[0] if webview.windows else None


def _hwnd(window):
    """取窗口原生句柄（int）；失败返回 None。"""
    try:
        return int(window.native.Handle.ToInt64())
    except Exception:  # noqa: BLE001
        return None


def _hide_from_taskbar(window):
    """从任务栏（及 Alt+Tab）隐藏：置 WS_EX_TOOLWINDOW、清 WS_EX_APPWINDOW。

    无边框浮动小组件不应占任务栏按钮；需在窗口 show 之后调用。
    非 UI 线程直接改 WinForms 属性会抛跨线程异常，这里走 Win32 样式 +
    隐藏后重新显示以刷新任务栏。只影响本窗口，可随时改回。
    """
    hwnd = _hwnd(window)
    if hwnd is None:
        return
    user32 = ctypes.windll.user32
    GWL_EXSTYLE = -20
    WS_EX_TOOLWINDOW = 0x00000080
    WS_EX_APPWINDOW = 0x00040000
    try:
        if ctypes.sizeof(ctypes.c_void_p) == 8:
            get_long, set_long = user32.GetWindowLongPtrW, user32.SetWindowLongPtrW
            long_t = ctypes.c_ssize_t
        else:
            get_long, set_long = user32.GetWindowLongW, user32.SetWindowLongW
            long_t = ctypes.c_long
        get_long.restype = long_t
        get_long.argtypes = [ctypes.c_void_p, ctypes.c_int]
        set_long.restype = long_t
        set_long.argtypes = [ctypes.c_void_p, ctypes.c_int, long_t]
        h = ctypes.c_void_p(hwnd)
        ex = get_long(h, GWL_EXSTYLE)
        set_long(h, GWL_EXSTYLE, (ex | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW)
        user32.ShowWindow.argtypes = [ctypes.c_void_p, ctypes.c_int]
        user32.ShowWindow(h, 0)  # SW_HIDE
        user32.ShowWindow(h, 5)  # SW_SHOW
    except Exception:  # noqa: BLE001
        pass


def _set_topmost(window, flag):
    """跨线程安全地切换置顶：直接用 SetWindowPos，
    避开 WinForms `TopMost` 在非 UI 线程赋值抛的跨线程异常。
    """
    hwnd = _hwnd(window)
    if hwnd is None:
        return
    user32 = ctypes.windll.user32
    swp = 0x0002 | 0x0001 | 0x0010  # NOMOVE | NOSIZE | NOACTIVATE
    try:
        fn = user32.SetWindowPos
        fn.restype = ctypes.c_int
        fn.argtypes = [
            ctypes.c_void_p, ctypes.c_void_p,
            ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
            ctypes.c_uint,
        ]
        insert_after = ctypes.c_void_p(-1 if flag else -2)  # TOPMOST / NOTOPMOST
        fn(ctypes.c_void_p(hwnd), insert_after, 0, 0, 0, 0, swp)
    except Exception:  # noqa: BLE001
        pass


def load_state():
    try:
        return json.loads(STATE_FILE.read_text("utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def save_state(window=None):
    data = load_state()
    if window is not None:
        try:
            data.update(
                {"x": window.x, "y": window.y, "w": window.width, "h": window.height}
            )
        except Exception:  # noqa: BLE001
            pass
    data["on_top"] = bool(_PREFS.get("on_top", True))
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(data), "utf-8")
    except Exception:  # noqa: BLE001
        pass


# ----------------------------- main -----------------------------
def main():
    states = {h["id"]: MetricsState() for h in HOSTS}
    collectors = []
    for h in HOSTS:
        c = Collector(states[h["id"]], h)
        c.start()
        collectors.append(c)

    geom = load_state()
    _PREFS["on_top"] = bool(geom.get("on_top", True))
    html = UI_HTML.read_text("utf-8")
    # 标题模块化：hosts.json 的 "title" → 注入 ui.html（替换静态标题），窗口名同步
    html = html.replace('<span class="title">你的DGX仪表盘</span>',
                        '<span class="title">' + APP_TITLE + '</span>', 1)

    # 旧版保存的尺寸装不下新明细面板 → 抬到新的最小尺寸
    win_w = max(MIN_W, int(geom.get("w", WINDOW_W)))
    win_h = max(MIN_H, int(geom.get("h", WINDOW_H)))

    window = webview.create_window(
        APP_TITLE,
        html=html,
        js_api=Api(states),
        width=win_w,
        height=win_h,
        x=geom.get("x"),
        y=geom.get("y"),
        frameless=True,
        easy_drag=False,
        on_top=_PREFS["on_top"],
        resizable=True,
        background_color="#000000",
    )
    window.events.shown += lambda: _hide_from_taskbar(window)
    window.events.closing += lambda: save_state(window)

    try:
        webview.start()
    finally:
        for c in collectors:
            c.stop()


if __name__ == "__main__":
    main()
