"""DGX CLOCK 入口。

源码：pythonw main.py   （或双击 launch.vbs）
调试：python main.py --no-window   → 只起采集与 HTTP，打印地址
"""

import sys

from dgxclock.app import main

if __name__ == "__main__":
    sys.exit(main())
