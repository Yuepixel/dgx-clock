"""推理引擎指标适配器（模块化，方案 B：引擎家族 + 实例参数）。

════════════════════════════════════════════════════════════════════
▍维护手册：换引擎/加引擎时看这里（其余代码不用读）
════════════════════════════════════════════════════════════════════

【场景 1：同一家族换端口/换配方】—— 零代码，改 hosts.json 即可
    例：tf-exl3:8080（旧 Qwen）→ glm53-flash-tf:8888（现役 GLM）。
    做法：hosts.json 该机 {"engine": "tensorfold", "port": 8888}，重启面板。
    同家族 = 同一 Prometheus 前缀（如 tensorfold:*）。

【场景 2：换到全新引擎家族（如 SGLang、llama.cpp）】—— 改本文件三步：
    ① 写 urls(port)：返回该引擎要抓的 URL 元组（远端 localhost，随 SSH 执行）。
      惯例命名 <FAM>_METRICS / _HEALTH(可选) / _MODELS：
        _METRICS = Prometheus 文本（主数据源，必须有）
        _HEALTH  = JSON（补 metrics 缺的量，可选）
        _MODELS  = OpenAI 兼容 /v1/models（自报模型名/ctx，强烈建议）
    ② 写 apply(raw)：raw = {url: base64 文本} → 返回统一契约 eng 字典（见下）。
      ★ 按键的**结尾路径**辨认响应（.endswith("/metrics")），别写死端口号。
      ★ 解析优先用本文件的通用工具：prom()（Prometheus→dict）、prom_max()、
        _dec()（base64→str）、_jload()、_num()、_avg()。
    ③ 在文件底部 ADAPTERS 注册表加一条 {"id": "<家族名>", "urls": urls, "apply": apply}。
    ④ hosts.json 里该机写 {"engine": "<家族名>", "port": <端口>}。完成。

    SGLang 备忘（v0.5.20 实测过的 metric 名，直接抄）：
      num_running_reqs / num_queue_reqs / full_token_usage /
      spec_accept_length / spec_accept_rate / gen_throughput /
      time_to_first_token_seconds_{sum,count}

【契约速查】apply(raw) 返回的 eng 字典——**缺哪项 UI 自动隐藏哪项**，从最小集起步：
    必给：ok=True / id / name / model / meta=[{label,value,unit}（"引擎口径"chips）]
    并发：run（运行路数）/ wait（排队）/ kv（0..1 最忙流缓存占用）
    速率：gen（累计生成 token，★必须有——实时解码 t/s 靠它的窗口增量）
          decode_rate（生命周期平均 decode）/ prefill_rate / ttft_ms（冷启动兜底）
    ★★★ rate_den（本引擎计数器语义，选错会显示假速率，见 README「已知坑」）：
          "dec_s"（默认）= generation 与 decode_seconds 都是「请求结束才跳增」
                           的完结计数 → 分母用同源累计量差分（TensorFold 家族）
          "wall"          = generation 每步实时累加、decode_seconds 完结才结算
                           → 分母必须用墙钟（vLLM 家族；选错实测虚高 4 万 t/s）
    可选：prompt / ctx / hit（0..1 缓存命中）/ done / rounds / port
          pre_uncached + pre_s（窗口实时 prefill）/ ttft_sum + ttft_count（窗口实时 TTFT）
          specs=[{label,len,rate,max}]（投机解码臂：MTP/lookup 接受统计；max=每步上限）

【验收清单】加完新家族后：
    1. python -m py_compile engine_adapters.py gb10_monitor.py
    2. 跑 DSH 会话reports 里的 test-engine-adapters.py，抄一份改成新家族样本，
       断言关键字段（或直接手写 raw dict 调 apply() 断言）
    3. 真机一帧：同目录 reports 的 e2e-final.py（改 HOSTS 或临时指新机）
    4. 重启面板（launch.vbs），对照引擎真值 curl 引擎/metrics 抽查两三个数

▍UI 侧（ui.html）通常零改动：契约字段驱动渲染，缺项自动隐藏；
  只有要「新增一张卡片/一行明细」才碰 ui.html（搜 renderView / renderEngine）。
════════════════════════════════════════════════════════════════════

远端约定：source_urls(engine_id, port) 里的 URL 会被远端脚本逐个 curl 并 base64，
apply(raw) 收到 raw = {url: base64 文本}（键 = 当次实际抓取的 URL）。
适配器**按 URL 结尾路径**辨认响应（/metrics、/health、/v1/models），不依赖写死端口。
"""
import base64
import json
import re

# 缺省适配器 id（调用方未指定 engine 时使用）。
# 每机引擎由 hosts.json 的 {"engine": ..., "port": ...} 指定；此处仅作兜底默认。
ACTIVE = "tensorfold"


# ----------------------------- 通用小工具（新适配器直接复用） -----------------------------
def _dec(b64):
    """base64 文本 → str（远端脚本报文都是 base64；坏了返回空串不抛）。"""
    if not b64:
        return ""
    try:
        return base64.b64decode(b64).decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return ""


def _jload(text):
    try:
        obj = json.loads(text)
    except Exception:  # noqa: BLE001
        return {}
    return obj if isinstance(obj, dict) else {}


def _num(v):
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def prom(text):
    """Prometheus 文本 → {metric: value}；同名多序列求和（计数类指标口径）。"""
    out = {}
    for line in (text or "").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        series, _, val = line.rpartition(" ")
        if not series:
            continue
        try:
            v = float(val)
        except ValueError:
            continue
        name = series.split("{", 1)[0]
        out[name] = out.get(name, 0.0) + v
    return out


def prom_max(text, name):
    """某 gauge 在多序列（如每流 KV 占用）下的最大值；无样本返回 None。"""
    best = None
    for line in (text or "").splitlines():
        series, _, val = line.strip().rpartition(" ")
        if not series or series.split("{", 1)[0] != name:
            continue
        try:
            v = float(val)
        except ValueError:
            continue
        best = v if best is None else max(best, v)
    return best


def _avg(sum_v, cnt):
    s, c = _num(sum_v), _num(cnt)
    if s is None or not c:
        return None
    return s / c


# ----------------------------- TensorFold 适配器（家族 id: "tensorfold"） -----------------------------
# 家族成员：tf-exl3 :8080（旧 Qwen 单机，已停）、glm53-flash-tf :8888（现役 GLM 双机 TP=2）。
#   /metrics  = Prometheus 文本，前缀 tensorfold:（vLLM 命名兼容）
#   /health   = JSON，补 ctx / 平均 prefill(非缓存) / 缓存命中 / 累计请求（/metrics 里没有）
#   /v1/models= OpenAI 兼容，data[0].id = 引擎自报的**实际模型名**（含量化，随换模型自动变）
# 旧常量 TF_METRICS/_HEALTH/_MODELS 仅作 _tf_model_id 兜底与文档锚点；
# 真正的抓取 URL 由 _tf_urls(port) 按机生成——换端口不碰这里。
TF_METRICS = "http://127.0.0.1:8080/metrics"
TF_HEALTH = "http://127.0.0.1:8080/health"
TF_MODELS = "http://127.0.0.1:8080/v1/models"


# 网关自报的命中计数（它是唯一知道 cached_tokens 的地方，引擎 /metrics 没有）。
# 两台网关都要：8870 = 记忆网关（Claude Code 主代理走这里），
# 8871 = 透传网关（子代理走这里）。只读一个就会漏掉一半流量。
TF_GATEWAY_METRICS = ("http://127.0.0.1:8870/metrics",
                      "http://127.0.0.1:8871/metrics")


def _tf_urls(port):
    """某端口的 TensorFold 三源 URL + 两台网关的命中计数（远端 localhost，随 SSH 在目标机执行）。"""
    p = int(port or 8080)
    return (f"http://127.0.0.1:{p}/metrics",
            f"http://127.0.0.1:{p}/health",
            f"http://127.0.0.1:{p}/v1/models") + TF_GATEWAY_METRICS


def _tf_model_id(raw):
    """引擎自报的实际模型 id（/v1/models data[0].id）；无则空串。"""
    md = _jload(_dec(raw.get(TF_MODELS)))
    try:
        data = md.get("data") or []
        return str(data[0].get("id") or "") if data else ""
    except Exception:  # noqa: BLE001
        return ""


def _tf_model_id_any(raw):
    """自报模型 id：优先 /v1/models，退回 raw 里任何一个 models 端点的结果（按实例端口）。"""
    mid = _tf_model_id(raw)
    if mid:
        return mid
    for v in (raw or {}).values():
        text = _dec(v)
        if text.lstrip().startswith("{"):
            try:
                data = json.loads(text).get("data") or []
                if data:
                    return str(data[0].get("id") or "")
            except Exception:  # noqa: BLE001
                pass
    return ""


def _tf_apply(raw, ctx_hint=None):
    """契约解析。URL 以**实际抓到的键**为准（按机端口参数化后不再写死）：
    raw 的键 = 当次远端脚本抓的 URL；models/health/metrics 按特征辨认。

    ctx_hint = hosts.json[].ctx（某些版本 TF 的 /health 不报 context_length，
    如 DSV4.1 只报 model/max_batch_size/memory/live，此时用它而不是猜 262144）。"""
    if not raw:
        return None
    mtext = h_json = ""
    gwtexts = []
    for k, v in raw.items():
        text = _dec(v)
        kl = str(k).lower()
        if kl.endswith("/metrics"):
            # 引擎和网关的指标都走 /metrics，按内容区分（网关前缀 hippo_gateway_）。
            if "hippo_gateway_" in text[:4096]:
                gwtexts.append(text)
            else:
                mtext = text
        elif kl.endswith("/health"):
            h_json = text
        # /v1/models 的辨认交给 _tf_model_id_any（按内容），这里不收集
    h = _jload(h_json)
    if not mtext and not h:
        return None
    m = prom(mtext)
    g = m.get
    gen = g("tensorfold:generation_tokens_total")
    ptok = g("tensorfold:prompt_tokens_total")
    # 实际模型名：优先引擎自报的 /v1/models id（换模型自动跟随），再从 id 里解析量化档；
    # 都没有时给中性占位，绝不硬编码某个具体量化/破甲名（否则换模型后即失真）。
    mid = _tf_model_id_any(raw)
    quant = ""
    base = mid
    mq = re.search(r'(\d+(?:\.\d+)?bpw)', mid, re.I)
    if mq:
        quant = mq.group(1)
        base = mid[:mq.start()].rstrip("-_ ") or mid
    if not base:
        base = (h.get("model") or "").strip() or "未知模型"
    eng = {
        "ok": True, "id": "tensorfold", "name": "tensorfold",
        "model": base, "model_id": mid or base,
        "port": "",
        "run": g("tensorfold:requests_running"),
        "wait": g("tensorfold:requests_waiting"),
        "kv": prom_max(mtext, "tensorfold:kv_cache_usage_ratio"),
        "gen": gen, "prompt": ptok,
        "ctx": int(_num(h.get("context_length")) or _num(ctx_hint) or 262144),
    }
    # 平均 decode t/s = 累计生成 / 累计解码秒（仅统计已完成请求）。
    # decode 秒的 metric 名**随 TF 版本/配方而异**（同一前缀 tensorfold:）：
    #   tf-exl3 (v0.6.5 Qwen)   = tensorfold:request_decode_seconds_sum（/metrics）
    #   glm53   (v0.6.0 GLM)    = tensorfold_health:decode_seconds_total（/health 字段的 metrics 镜像）
    # → 候选链逐个试，取第一个非零者；GLM 版另可回退 /health 的 decode_seconds_total。
    dec_s = None
    for _name in ("tensorfold:request_decode_seconds_sum",
                  "tensorfold_health:decode_seconds_total"):
        dec_s = g(_name)
        if dec_s:
            break
    if not dec_s:
        dec_s = _num(h.get("decode_seconds_total"))
    if dec_s and gen is not None:
        eng["decode_rate"] = round(gen / dec_s, 1)
    if dec_s is not None:
        eng["dec_s"] = dec_s          # 累计解码秒（供仪表盘算真·瞬时解码 = Δtok/Δ解码秒，避免墙钟尖刺）
    # 平均 prefill t/s（/health）：**非缓存**提示 token / 累计预填秒
    #   /health 的 prompt_tokens_total 含"缓存命中"的 token，而 prefill_seconds_total 只计
    #   真实预填耗秒 ⇒ 直接相除会把命中当预填，虚高 ~1/(1-hit)（实测 8103 vs 折实 ~1483）。
    pre_s = _num(h.get("prefill_seconds_total"))
    if not pre_s:
        # DSV4.1 起的 /health 只有 model/max_batch_size/memory/live；预填秒改从 /metrics 取。
        pre_s = g("tensorfold:request_prefill_seconds_sum")
    hpt = _num(h.get("prompt_tokens_total"))
    if hpt is None:
        hpt = ptok                  # 同上，/metrics 的同前缀累计提示 token
    ct = _num(h.get("cached_tokens_total"))   # 新版 /health 有就直接用
    # DSV4.1 的 /metrics 不报缓存命中 token（26 个指标里没有），但网关在请求路径上，
    # 从每个 upstream usage 的 prompt_tokens_details.cached_tokens 累加出来了。
    # 两台网关都要（8870 主代理 / 8871 子代理），否则漏一半流量。
    gw_pt = gw_ct = None
    for text in gwtexts:
        gw = prom(text)
        p = _num(gw.get("hippo_gateway_prompt_tokens_total"))
        c = _num(gw.get("hippo_gateway_cached_tokens_total"))
        if p is not None:
            gw_pt = (gw_pt or 0.0) + p
            gw_ct = (gw_ct or 0.0) + (c or 0.0)
    hit = None
    if ct is not None and hpt:
        hit = ct / hpt
    elif gw_pt and gw_pt >= 5000:
        # 网关计数器随进程重启归零；样本太少时命中率不可信。
        hit = min(max((gw_ct or 0.0) / gw_pt, 0.0), 1.0)
    if hit is not None:
        eng["hit"] = round(hit, 3)
    if gw_pt is not None:
        # 原样下传，供仪表盘识别网关重启（计数回退）后重置预填窗口。
        eng["gw_prompt"] = gw_pt
        eng["gw_cached"] = gw_ct if gw_ct is not None else 0.0
    # 分子必须和分母同期：**只用网关过手的未命中 token**，不要把网关短窗口的命中率
    # 折算到引擎的生命周期累计量上（那样会把 15k 样本的比例套到 877 万 token 上，
    # 实测得出 10,831 tok/s 的假值）。两台网关合计覆盖主代理+子代理流量。
    uncached = None
    if ct is not None and hpt is not None:
        uncached = hpt - ct
        # 分子分母同期（都在引擎生命周期内），可以给一个冷启动兜底值。
        if pre_s and uncached >= 0:
            eng["prefill_rate"] = round(uncached / pre_s, 1)
    elif gw_pt:
        # 网关计数器是进程级、随时归零，和引擎的累计预填秒不同期 → 只能交给仪表盘
        # 做窗口差分（Δ网关未命中 / Δ预填秒），这里不给跨期比值。
        uncached = max(gw_pt - (gw_ct or 0.0), 0.0)
    if pre_s and uncached is not None:
        # 原始累计量：供仪表盘按窗口增量算「实时 prefill」= Δuncached / Δprefill_seconds，
        # 否则累计相除几乎不动（看起来"不更新"）。
        eng["pre_uncached"] = uncached
        eng["pre_s"] = pre_s
    # 平均 TTFT（直方图 sum/count）
    tsum = g("tensorfold:time_to_first_token_seconds_sum")
    tcnt = g("tensorfold:time_to_first_token_seconds_count")
    ttft = _avg(tsum, tcnt)
    if ttft is not None:
        eng["ttft_ms"] = round(ttft * 1000, 1)             # 生命周期均值（冷启动兜底）
    if tsum is not None and tcnt is not None:
        # 原始直方图累计量：供仪表盘算窗口 TTFT = Δsum / Δcount。
        eng["ttft_sum"], eng["ttft_count"] = tsum, tcnt
    # 平均端到端（直方图 sum/count）：request_latency = 从到达到回复离开的总耗时。
    lsum = g("tensorfold:request_latency_seconds_sum")
    lcnt = g("tensorfold:request_latency_seconds_count")
    lat = _avg(lsum, lcnt)
    if lat is not None:
        eng["e2e_ms"] = round(lat * 1000, 1)               # 生命周期均值（冷启动兜底）
    if lsum is not None and lcnt is not None:
        eng["lat_sum"], eng["lat_count"] = lsum, lcnt      # 供仪表盘算窗口端到端 = Δsum/Δcount
    # 缓存/前缀命中（/health；ct 上面已取）
    if hpt and ct is not None:
        eng["hit"] = ct / hpt
    d = _num(h.get("requests_total"))
    if d is None:
        d = lcnt                    # /metrics 里已完成的请求数 = 端到端直方图的 count（DSV4.1）
    if d is not None:
        eng["done"] = d
    r = _num(h.get("rounds_total"))
    if r is None:
        r = g("tensorfold:decode_rounds_total")   # 每轮 = 一次前向（含 MTP 投机），DSV4.1 才有
    if r is not None:
        eng["rounds"] = r
    # 草稿接受（MTP 臂 + prompt-lookup 臂）
    specs = []
    md, ma = g("tensorfold:mtp_drafted_total"), g("tensorfold:mtp_accepted_total")
    if md and ma is not None:
        specs.append({"label": "MTP", "len": round(1 + ma / md, 2),
                      "rate": round(ma / md, 4), "max": 7})
    ld, la = g("tensorfold:lookup_drafted_total"), g("tensorfold:lookup_accepted_total")
    if ld and la is not None:
        specs.append({"label": "lookup", "len": round(1 + la / ld, 2),
                      "rate": round(la / ld, 4), "max": 7})
    if specs:
        eng["specs"] = specs
    # 口径 chips：全部由引擎实测/自报驱动，随换模型自动更新（UI 不硬编码）
    meta = []
    if base:
        meta.append({"label": "模型", "value": base, "unit": ""})
    meta.append({"label": "ctx", "value": round(eng["ctx"] / 1024), "unit": "k"})
    smax = None                      # 并行流数：引擎 streams.max（不再写死 2）
    try:
        smax = _num((h.get("streams") or {}).get("max"))
    except Exception:  # noqa: BLE001
        smax = None
    if not smax:
        smax = _num(h.get("max_batch_size"))    # DSV4.1：并行流数就叫 max_batch_size
    if smax:
        eng["lanes"] = int(smax)     # 并行流数上界（UI「运行中」条按此归一）
        meta.append({"label": "lane", "value": int(smax), "unit": "路"})
    if specs:                        # 投机档：按实际暴露的投机指标拼（无则不出该 chip）
        meta.append({"label": "投机", "value": "+".join(s["label"] for s in specs), "unit": ""})
    if quant:                        # 量化：从自报模型名解析（如 3.05bpw）
        meta.append({"label": "量化", "value": quant, "unit": ""})
    eng["meta"] = meta
    return eng


# ----------------------------- vLLM 适配器（家族 id: "vllm"） -----------------------------
#   /metrics  = Prometheus 文本，vllm:* 命名（注意 rate_den="wall"，见文件头契约速查）
#   /v1/models= OpenAI 兼容，data[0].id = 实际模型名、data[0].max_model_len = ctx
# 旧常量同上仅作锚点；抓取 URL 由 _vllm_urls(port) 按机生成。
VLLM_METRICS = "http://127.0.0.1:8000/metrics"
VLLM_MODELS = "http://127.0.0.1:8000/v1/models"


def _vllm_urls(port):
    """某端口的 vLLM 两源 URL。"""
    p = int(port or 8000)
    return (f"http://127.0.0.1:{p}/metrics",
            f"http://127.0.0.1:{p}/v1/models")


def _vllm_model_meta(raw):
    """引擎自报的模型 id + max_model_len（/v1/models data[0]）；无则 ("", None)。
    按实例端口参数化：任何以 /v1/models 结尾的键都认。"""
    for k, v in (raw or {}).items():
        if str(k).lower().endswith("/v1/models"):
            md = _jload(_dec(v))
            try:
                data = md.get("data") or []
                if not data:
                    continue
                item = data[0]
                return str(item.get("id") or ""), _num(item.get("max_model_len"))
            except Exception:  # noqa: BLE001
                continue
    return "", None


def _vllm_apply(raw, ctx_hint=None):
    mtext = ""
    for k, v in (raw or {}).items():
        if str(k).lower().endswith("/metrics"):
            mtext = _dec(v)
    if not mtext:
        return None
    m = prom(mtext)
    g = m.get
    mid, maxlen = _vllm_model_meta(raw)
    quant = ""
    base = mid
    mq = re.search(r'(\d+(?:\.\d+)?bpw)', mid, re.I)
    if mq:
        quant = mq.group(1)
        base = mid[:mq.start()].rstrip("-_ ") or mid
    if not base:
        base = "未知模型"
    gen = g("vllm:generation_tokens_total")
    ptok = g("vllm:prompt_tokens_total")
    run = g("vllm:num_requests_running")
    ctx = int(maxlen or 262144)
    eng = {
        "ok": True, "id": "vllm", "name": "vllm",
        "model": base, "model_id": mid or base,
        "port": "",
        "run": run,
        "wait": g("vllm:num_requests_waiting"),
        "kv": prom_max(mtext, "vllm:kv_cache_usage_perc"),
        "gen": gen, "prompt": ptok,
        "ctx": ctx,
        # 实时解码分母用**墙钟**：vLLM 的 generation_tokens_total 每步实时累加（含在飞请求），
        # 而 request_decode_time_seconds_sum 只在请求结束时结算——两者语义不同，若照 TensorFold
        # 用「Δgen/Δ解码秒」，请求进行中会虚高（实测报过 3.7 万 t/s），请求一结束才自愈。
        "rate_den": "wall",
    }
    # 平均 decode t/s = 累计生成 / 累计解码秒：**仅空闲（无在飞请求）时两者都已结算、才可信**；
    # 忙碌时不给该值，避免显示虚高的假平均（仪表盘会沿用上一次可信值）。
    dec_s = g("vllm:request_decode_time_seconds_sum")
    if dec_s and gen is not None and not run:
        eng["decode_rate"] = round(gen / dec_s, 1)
    if dec_s is not None:
        eng["dec_s"] = dec_s
    # 平均 prefill t/s（非缓存）：(prompt − cached) / 累计预填秒
    cpt = g("vllm:prompt_tokens_cached_total")
    pre_s = g("vllm:request_prefill_time_seconds_sum")
    if pre_s and ptok is not None:
        uncached = ptok - (cpt if cpt is not None else 0.0)
        if uncached < 0:
            uncached = ptok
        eng["prefill_rate"] = round(uncached / pre_s, 1)
        eng["pre_uncached"] = uncached
        eng["pre_s"] = pre_s
    # 平均 TTFT（直方图 sum/count）
    tsum = g("vllm:time_to_first_token_seconds_sum")
    tcnt = g("vllm:time_to_first_token_seconds_count")
    ttft = _avg(tsum, tcnt)
    if ttft is not None:
        eng["ttft_ms"] = round(ttft * 1000, 1)
    if tsum is not None and tcnt is not None:
        eng["ttft_sum"], eng["ttft_count"] = tsum, tcnt
    # 平均端到端（vLLM 直方图 sum/count）
    lsum = g("vllm:e2e_request_latency_seconds_sum")
    lcnt = g("vllm:e2e_request_latency_seconds_count")
    lat = _avg(lsum, lcnt)
    if lat is not None:
        eng["e2e_ms"] = round(lat * 1000, 1)
    if lsum is not None and lcnt is not None:
        eng["lat_sum"], eng["lat_count"] = lsum, lcnt
    # 前缀命中
    pq = g("vllm:prefix_cache_queries_total")
    ph = g("vllm:prefix_cache_hits_total")
    if pq and ph is not None:
        eng["hit"] = ph / pq
    done = g("vllm:request_success_total")
    if done is not None:
        eng["done"] = done
    # 投机接受（MTP）：len = 平均接受长度 = 1 + 接受token/草稿步；
    #   接受率 = 接受token / 草稿token（vLLM 另报 spec_decode_num_draft_tokens_total），
    #   max = 每步最大接受长度 = K+1（K = draft_tokens/drafts）。
    specs = []
    sd = g("vllm:spec_decode_num_drafts_total")
    sa = g("vllm:spec_decode_num_accepted_tokens_total")
    dt = g("vllm:spec_decode_num_draft_tokens_total")
    if sd and sa is not None:
        k = (dt / sd) if dt else 3.0
        rate = (sa / dt) if dt else (sa / sd) / max(k, 1.0)
        specs.append({"label": "MTP", "len": round(1 + sa / sd, 2),
                      "rate": round(rate, 4), "max": int(round(k)) + 1})
    if specs:
        eng["specs"] = specs
    # 口径 chips
    meta = []
    if base:
        meta.append({"label": "模型", "value": base, "unit": ""})
    meta.append({"label": "ctx", "value": round(ctx / 1024), "unit": "k"})
    if specs:
        meta.append({"label": "投机", "value": "+".join(s["label"] for s in specs), "unit": ""})
    if quant:
        meta.append({"label": "量化", "value": quant, "unit": ""})
    eng["meta"] = meta
    return eng


# ----------------------------- 适配器注册表（新引擎家族在这里加一条） -----------------------------
# 格式：{"id": <家族名，hosts.json 的 engine 字段用它>, "urls": <urls(port) 函数>, "apply": <apply(raw)>}
# 同家族不同端口 = hosts.json 改 port；新家族 = 上面三步（见文件头维护手册）再来这里注册。
ADAPTERS = [
    {"id": "tensorfold", "urls": _tf_urls, "apply": _tf_apply},
    {"id": "vllm", "urls": _vllm_urls, "apply": _vllm_apply},
]


def _by_id(engine_id):
    for a in ADAPTERS:
        if a["id"] == (engine_id or ACTIVE):
            return a
    return None


def source_urls(engine_id=None, port=None):
    """指定适配器需要远端抓取的 URL 列表。

    engine_id = 引擎家族 id；port = 该机引擎端口（hosts.json 每机一个；
    None 时用家族默认端口——仅兼容旧调用）。"""
    a = _by_id(engine_id)
    if not a:
        return []
    if "urls" in a:
        return list(a["urls"](port))
    return list(a["sources"])          # 旧式静态 sources 兜底


def apply(raw, engine_id=None, ctx_hint=None):
    """raw = {url: base64 文本} → 统一契约 eng 字典（或 None）。engine_id = 引擎家族 id。
    ctx_hint = hosts.json[].ctx，给不报 context_length 的引擎兜底（vLLM 用 max_model_len，忽略它）。"""
    a = _by_id(engine_id)
    if not a:
        return None
    return a["apply"](raw or {}, ctx_hint=ctx_hint)
