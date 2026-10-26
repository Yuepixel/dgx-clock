"""复用 dashboard 采集链（单一真源：gb10_monitor.py + engine_adapters.py）。

为什么不复制代码：本窗口只用到 Collector / MetricsState / build_remote_cmd，
dashboard 仍是这些逻辑的唯一真源（PLAN §2）。便携版把这两个 .py 原样打进包里，
运行时注入一个空壳 `webview` 模块——dashboard 的窗口代码在本窗口里用不到，
也不需要办公机装 pywebview。
"""

from __future__ import annotations

import sys
import types
from pathlib import Path

from .paths import app_dir, resource_dir

_GM = None


def _install_webview_stub() -> None:
    """dashboard 顶部 `import webview` 只为它自己的面板窗口；这里给个空壳。"""
    if "webview" in sys.modules:
        return
    stub = types.ModuleType("webview")
    stub.windows = []
    sub = types.ModuleType("webview.window")

    class FixPoint:  # noqa: N801 - 模拟 pywebview 的枚举
        NORTH = 1
        SOUTH = 2
        EAST = 4
        WEST = 8

    sub.FixPoint = FixPoint
    stub.window = sub
    sys.modules["webview"] = stub
    sys.modules["webview.window"] = sub


def _dashboard_dir() -> Path | None:
    """按优先级找采集链目录：exe/项目旁的 dashboard/（便携可替换），再包内资源。"""
    for cand in (app_dir() / "dashboard", app_dir().parent / "dashboard",
                 resource_dir() / "dashboard"):
        if (cand / "gb10_monitor.py").is_file():
            return cand
    return None


def load(config: dict):
    """导入采集链并把 config.json 的值覆盖到它的模块级开关上。

    覆盖项（不修改 dashboard 源码）：
      HOSTS         主机清单（原为 dashboard/hosts.json）
      SSH_EXE/KEY   SSH 程序与私钥（原为固定路径）
      POLL_SECONDS  采样间隔（同时决定远端脚本 sleep）
    """
    global _GM
    if _GM is not None:
        return _GM

    _install_webview_stub()
    d = _dashboard_dir()
    if d is not None:
        sys.path.insert(0, str(d))

    import gb10_monitor as GM  # noqa: PLC0415 - 必须在上面的 stub/path 之后

    GM.HOSTS = config["hosts"]
    ssh = config.get("ssh") or {}
    if ssh.get("exe"):
        GM.SSH_EXE = str(ssh["exe"])
    if ssh.get("key"):
        GM.SSH_KEY = str(ssh["key"])
    try:
        GM.POLL_SECONDS = float((config.get("clock") or {}).get("poll_seconds") or 1.5)
    except (TypeError, ValueError):
        pass

    _GM = GM
    return GM
