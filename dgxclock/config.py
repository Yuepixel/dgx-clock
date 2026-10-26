"""config.json 加载：默认值 + 深合并 + 路径展开。"""

from __future__ import annotations

import json
import os
from pathlib import Path

DEFAULTS = {
    "ssh": {"exe": "ssh", "key": "~/.ssh/id_ed25519"},
    "hosts": [],
    "clock": {
        "poll_seconds": 1.5,
        "decode_max": 120,
        "ttft_max": 5000,
        "e2e_max": 30000,
        "power_max": 200,
        "decay_seconds": 2.2,
        "idle_ms": 1200,
    },
    "window": {
        "width": 380,
        "height": 424,
        "min_width": 300,
        "min_height": 330,
        "always_on_top": True,
    },
    "themes": {"file": "themes.json"},
}


def _merge(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        elif v is not None:
            out[k] = v
    return out


def expand_path(value: str) -> str:
    """展开 ~ / %VAR% / $VAR；为空返回原值。"""
    if not isinstance(value, str) or not value:
        return value
    v = os.path.expandvars(os.path.expanduser(value))
    return v


def load_config(path: Path | None = None) -> dict:
    """读盘失败不致命：记在 _load_error，用默认值继续（窗口能起来比配置严格重要）。"""
    path = Path(path) if path else None
    cfg = json.loads(json.dumps(DEFAULTS))  # deep copy
    if path is not None:
        try:
            raw = json.loads(path.read_text("utf-8"))
            if isinstance(raw, dict):
                cfg = _merge(cfg, raw)
        except FileNotFoundError:
            cfg["_load_error"] = f"config.json not found: {path}"
        except Exception as e:  # noqa: BLE001
            cfg["_load_error"] = f"config.json 读取失败: {e}"

    cfg["_path"] = str(path) if path else ""
    ssh = cfg.get("ssh") or {}
    ssh["exe"] = expand_path(str(ssh.get("exe") or "ssh"))
    ssh["key"] = expand_path(str(ssh.get("key") or ""))
    cfg["ssh"] = ssh

    hosts = cfg.get("hosts")
    if not isinstance(hosts, list):
        hosts = []
    cfg["hosts"] = [h for h in hosts if isinstance(h, dict) and h.get("id")]
    return cfg


def themes_path(cfg: dict) -> Path:
    """themes.json 相对 config.json 所在目录解析。"""
    name = ((cfg.get("themes") or {}).get("file") or "themes.json")
    base = Path(cfg.get("_path") or "").parent
    if not base.is_dir():
        base = Path.cwd()
    return (base / name).resolve()
