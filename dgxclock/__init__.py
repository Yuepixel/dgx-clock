"""DGX CLOCK —— 采集服务 + 透明窗口（模块化包）。

模块划分：
  paths.py      路径解析（源码目录 / PyInstaller 资源目录 / 状态目录）
  config.py     config.json 加载与默认值
  dashboard.py  复用 dashboard 采集链（vendored，注入 webview 空壳）
  server.py     只读 HTTP：/metrics /themes /config /
  app.py        启动顺序：配置 → 采集线程 → HTTP → Electron
"""

__version__ = "2.0.0"
