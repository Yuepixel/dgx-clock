"""只读 HTTP：/（界面）、/ui/*（前端模块）、/metrics、/themes、/config。"""

from __future__ import annotations

import json
import logging
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

_log = logging.getLogger("dgxclock.server")

_MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
}


class Api:
    """与 dashboard 的 Api.get_metrics() 同构。"""

    def __init__(self, states, hosts):
        self.states = states
        self.hosts = hosts

    def get_metrics(self):
        return {
            "hosts_meta": [{"id": h["id"], "label": h["label"],
                            "engine": h.get("engine") or "none"} for h in self.hosts],
            "hosts": {h["id"]: self.states[h["id"]].snapshot() for h in self.hosts},
        }


def make_handler(api: Api, ui_file: Path, themes_file: Path, clock_cfg: dict):
    """ui_file 是单文件回退页；同目录的 ui/ 若存在则作为模块化真源优先。"""
    ui_root = (ui_file.parent / "ui").resolve()

    class Handler(BaseHTTPRequestHandler):
        server_version = "DGXClock/2.1"
        protocol_version = "HTTP/1.1"

        def _send(self, code, ctype, body):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def _send_file(self, path: Path):
            try:
                body = path.read_bytes()          # 每次读盘：改界面不用重启服务
            except OSError as e:
                self._send(500, "text/plain; charset=utf-8", str(e).encode("utf-8"))
                return
            ctype = _MIME.get(path.suffix.lower(), "application/octet-stream")
            self._send(200, ctype, body)

        def _index(self) -> Path:
            """优先模块化入口 ui/index.html，没有就回退单文件 ui.html。"""
            idx = ui_root / "index.html"
            return idx if idx.is_file() else ui_file

        def do_GET(self):  # noqa: N802
            path = self.path.split("?", 1)[0]
            if path in ("/", "/index.html"):
                self._send_file(self._index())
                return
            if path == "/ui.html":
                self._send_file(ui_file)
                return
            if path.startswith("/ui/"):
                rel = path[len("/ui/"):]
                if not rel or rel.endswith("/"):
                    rel += "index.html"
                target = (ui_root / rel).resolve()
                if ui_root in target.parents and target.is_file():
                    self._send_file(target)
                else:
                    self._send(404, "text/plain; charset=utf-8", b"not found")
                return
            if path == "/themes":
                try:
                    body = themes_file.read_bytes()  # 每次读盘：改配色后重开窗口即可
                except OSError:
                    self._send(404, "application/json; charset=utf-8",
                               b'{"ok":false,"error":"themes.json missing"}')
                    return
                self._send(200, "application/json; charset=utf-8", body)
                return
            if path == "/config":
                payload = {"clock": clock_cfg.get("clock") or {},
                           "window": clock_cfg.get("window") or {},
                           "version": clock_cfg.get("version", 1)}
                self._send(200, "application/json; charset=utf-8",
                           json.dumps(payload, ensure_ascii=False).encode("utf-8"))
                return
            if path == "/metrics":
                try:
                    body = json.dumps(api.get_metrics(), ensure_ascii=False).encode("utf-8")
                except Exception as e:  # noqa: BLE001
                    _log.exception("get_metrics failed")
                    self._send(500, "application/json; charset=utf-8",
                               json.dumps({"ok": False, "error": str(e)}).encode("utf-8"))
                    return
                self._send(200, "application/json; charset=utf-8", body)
                return
            self._send(404, "text/plain; charset=utf-8", b"not found")

        def log_message(self, fmt, *args):  # noqa: A003
            pass                                # 每秒一帧，别刷屏

    return Handler


class MetricsServer:
    def __init__(self, api: Api, ui_file: Path, themes_file: Path, clock_cfg: dict,
                 host: str = "127.0.0.1", port: int = 0):
        self.httpd = ThreadingHTTPServer(
            (host, port), make_handler(api, ui_file, themes_file, clock_cfg))
        self.httpd.daemon_threads = True
        self.port = self.httpd.server_address[1]
        self.thread = None

    def start(self):
        import threading
        self.thread = threading.Thread(target=self.httpd.serve_forever,
                                       kwargs={"poll_interval": 0.2}, daemon=True)
        self.thread.start()
        return self

    def stop(self):
        try:
            self.httpd.shutdown()
            self.httpd.server_close()
        except Exception:  # noqa: BLE001
            pass
