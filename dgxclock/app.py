"""启动顺序：config.json → 采集线程 → 只读 HTTP → Electron 窗口。"""

from __future__ import annotations

import argparse
import ctypes
import logging
import os
import subprocess
import sys
import threading
from pathlib import Path

from . import __version__, config as C
from .paths import app_dir, default_config_path, resource_dir, state_dir
from .server import Api, MetricsServer

_log = logging.getLogger("dgxclock")


def _setup_log(sd: Path) -> None:
    try:
        sd.mkdir(parents=True, exist_ok=True)
        logging.basicConfig(
            filename=str(sd / "clock.log"),
            level=logging.INFO,
            format="%(asctime)s %(levelname)s %(message)s",
            encoding="utf-8",
        )
    except Exception:  # noqa: BLE001
        pass


def message_box(text, title="DGX CLOCK"):
    try:
        ctypes.windll.user32.MessageBoxW(0, str(text), title, 0x10)
    except Exception:  # noqa: BLE001
        pass


def _ui_file() -> Path:
    for p in (app_dir() / "ui.html", resource_dir() / "ui.html"):
        if p.is_file():
            return p
    return app_dir() / "ui.html"


def _themes_file(cfg: dict) -> Path:
    p = C.themes_path(cfg)
    if p.is_file():
        return p
    for cand in (app_dir() / "themes.json", resource_dir() / "themes.json"):
        if cand.is_file():
            return cand
    return p


def _electron_paths() -> tuple[Path, Path]:
    """返回 (应用目录, electron.exe)。源码与便携版共用一套目录布局。"""
    edir = app_dir() / "electron"
    exe = edir / "electron.exe"
    if not exe.is_file():
        exe = edir / "node_modules" / "electron" / "dist" / "electron.exe"
    return edir, exe


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="dgx-clock", add_help=True)
    ap.add_argument("--config", help="config.json 路径（默认 exe 同目录 / 项目根）")
    ap.add_argument("--no-window", action="store_true", help="只起采集与 HTTP（调试/测试）")
    ap.add_argument("--port", type=int, default=0, help="固定端口，默认由系统分配")
    args, extra = ap.parse_known_args(argv)   # 其余参数原样转给 Electron（调试用）

    cfg_path = Path(args.config).resolve() if args.config else default_config_path()
    cfg = C.load_config(cfg_path)
    sd = state_dir()
    _setup_log(sd)
    _log.info("DGX CLOCK %s | config=%s | state=%s", __version__, cfg_path, sd)
    if cfg.get("_load_error"):
        _log.warning("%s", cfg["_load_error"])

    if not cfg["hosts"]:
        message_box(f"config.json 里没有可用主机：\n{cfg_path}\n\n"
                    "至少配置一台 hosts（id/host/engine）。")
        return 1

    from .dashboard import load as load_dashboard
    GM = load_dashboard(cfg)

    states = {h["id"]: GM.MetricsState() for h in cfg["hosts"]}
    collectors = []
    for h in cfg["hosts"]:
        c = GM.Collector(states[h["id"]], h)
        c.start()
        collectors.append(c)
    _log.info("collectors started: %s", [h["id"] for h in cfg["hosts"]])

    api = Api(states, cfg["hosts"])
    server = MetricsServer(api, _ui_file(), _themes_file(cfg), cfg, port=args.port).start()
    url = f"http://127.0.0.1:{server.port}/"
    _log.info("metrics server: %s", url)

    proc = None
    try:
        if args.no_window:
            if sys.stdout:
                print(url, flush=True)
            _log.info("no-window mode; Ctrl+C to stop")
            threading.Event().wait()
        else:
            edir, exe = _electron_paths()
            if not exe.is_file():
                message_box(
                    "找不到 Electron 运行时：\n"
                    f"{exe}\n\n"
                    "源码运行请先在 electron 目录执行 npm install；\n"
                    "便携版应自带 electron 目录。")
                return 1
            env = dict(os.environ)
            # 本机全局设了 1，会让 electron.exe 变成 node 解释器
            env.pop("ELECTRON_RUN_AS_NODE", None)
            proc = subprocess.Popen(
                [str(exe), str(edir), f"--url={url}",
                 f"--config={cfg_path}", f"--state-dir={sd}", *extra],
                cwd=str(edir), env=env)
            _log.info("electron pid=%s", proc.pid)
            proc.wait()
            _log.info("electron exited rc=%s", proc.returncode)
    except KeyboardInterrupt:
        _log.info("interrupted")
    except Exception as e:  # noqa: BLE001
        _log.exception("electron failed")
        message_box(f"启动 Electron 窗口失败：\n{e}")
        return 1
    finally:
        if proc is not None and proc.poll() is None:
            try:
                proc.terminate()
            except Exception:  # noqa: BLE001
                pass
        server.stop()
        for c in collectors:
            try:
                c.stop()
            except Exception:  # noqa: BLE001
                pass
        _log.info("cleanup done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
