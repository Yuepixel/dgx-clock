"""向后兼容入口：旧启动方式仍可用（launch.vbs / pythonw clock_server.py）。

真正的实现已拆到 dgxclock/ 包，见 main.py 与 PLAN §13。
"""

import sys

from dgxclock.app import main

if __name__ == "__main__":
    sys.exit(main())
