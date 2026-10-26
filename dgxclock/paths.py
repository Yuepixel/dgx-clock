"""路径解析：源码运行 vs PyInstaller 打包运行。"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def app_dir() -> Path:
    """应用根目录。

    源码：项目根（dgxclock 的上一级）。
    打包：exe 所在目录（config.json / themes.json / ui.html / electron 都在这里）。
    """
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def resource_dir() -> Path:
    """只读资源目录（PyInstaller 的 _internal；源码模式同 app_dir）。"""
    meipass = getattr(sys, "_MEIPASS", None)
    return Path(meipass) if meipass else app_dir()


def state_dir() -> Path:
    """窗口状态与日志。

    便携版（frozen）：exe 同目录，整包可搬走。
    源码：%APPDATA%\\dgx-clock（沿用旧版，已有主题/几何不丢）。
    """
    if is_frozen():
        return app_dir()
    base = os.environ.get("APPDATA") or str(app_dir())
    return Path(base) / "dgx-clock"


def default_config_path() -> Path:
    """优先可编辑的 config.json（exe 同目录 / 项目根），否则退化到包内默认。"""
    for p in (app_dir() / "config.json", resource_dir() / "config.json"):
        if p.is_file():
            return p
    return app_dir() / "config.json"
