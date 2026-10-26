"""把 DGX CLOCK 打成 Windows 便携包（可整目录拷到办公机，双击 exe 运行）。

产物：
  dist/DGX CLOCK/
    DGX CLOCK.exe        ← 双击启动（PyInstaller windowed，无控制台）
    _internal/           ← Python 运行时 + dgxclock 包 + 采集链（勿改）
    electron/            ← Electron 运行时 + 本窗口外壳
    config.json          ← 主机 / SSH / 表盘参数（可改）
    themes.json          ← 配色 / 表盘清单 / 温度环（可改）
    ui.html              ← 单文件回退页（只含经典表盘）
    ui/                  ← 模块化界面：经典表盘 + 表盘切换
    state.json           ← 首次运行后生成：位置/尺寸/置顶/表盘/配色

用法：
  python build_portable.py            # 生成 dist/DGX CLOCK
  python build_portable.py --zip      # 额外打 zip（较慢，Electron 约数百 MB）
  python build_portable.py --clean    # 先删 build/ 与 dist/DGX CLOCK
  python build_portable.py --out-root dist/next --zip
                                      # 产到 dist/next/DGX CLOCK（便携版运行中、
                                      # exe 被占用时用；不动原目录）
"""

from __future__ import annotations

import argparse
import datetime
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# 采集链：优先本仓库 vendored dashboard/，否则用同级 ../dashboard（开发布局）
DASHBOARD = ROOT / "dashboard"
if not (DASHBOARD / "gb10_monitor.py").is_file():
    DASHBOARD = ROOT.parent / "dashboard"
DIST = ROOT / "dist"
BUILD = ROOT / "build"
APP_NAME = "DGX CLOCK"

EDITABLE = ("config.json", "themes.json", "ui.html")
EDITABLE_DIRS = ("ui",)
ELECTRON_APP = ("main.js", "preload.js", "package.json")


def run(cmd, **kw):
    print("+", " ".join(str(c) for c in cmd))
    subprocess.run([str(c) for c in cmd], check=True, **kw)


def check_inputs():
    missing = [p.name for p in (ROOT / "main.py", ROOT / "ui.html", ROOT / "themes.json",
                                ROOT / "config.json") if not p.is_file()]
    if missing:
        raise SystemExit("缺少文件：" + "、".join(missing))
    if not (ROOT / "ui" / "index.html").is_file():
        raise SystemExit("缺少模块化界面：ui/index.html")
    if not (DASHBOARD / "gb10_monitor.py").is_file():
        raise SystemExit(f"找不到采集链：{DASHBOARD / 'gb10_monitor.py'}")
    elec = ROOT / "electron" / "node_modules" / "electron" / "dist" / "electron.exe"
    if not elec.is_file():
        raise SystemExit(f"找不到 Electron 运行时：{elec}\n先 cd electron && npm install")


def build_pyinstaller(out):
    sep = ";" if os.name == "nt" else ":"
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm", "--clean", "--onedir", "--windowed",
        "--name", APP_NAME,
        "--distpath", str(out.parent),
        "--paths", str(DASHBOARD),
        "--hidden-import", "gb10_monitor",
        "--hidden-import", "engine_adapters",
        "--exclude-module", "webview",
        "--exclude-module", "webview.window",
        "--add-data", f"{ROOT / 'ui.html'}{sep}.",
        "--add-data", f"{ROOT / 'themes.json'}{sep}.",
        "--add-data", f"{ROOT / 'config.json'}{sep}.",
        "--add-data", f"{ROOT / 'ui'}{sep}ui",
        str(ROOT / "main.py"),
    ]
    run(cmd, cwd=str(ROOT))


def copy_electron(out):
    dst = out / "electron"
    dst.mkdir(parents=True, exist_ok=True)
    # 运行时（electron.exe / dll / resources / locales …）
    src = ROOT / "electron" / "node_modules" / "electron" / "dist"
    shutil.copytree(src, dst, dirs_exist_ok=True)
    # 本窗口外壳，覆盖运行时里同名的 default 应用文件
    for name in ELECTRON_APP:
        shutil.copy2(ROOT / "electron" / name, dst / name)


def copy_editable(out):
    for name in EDITABLE:
        shutil.copy2(ROOT / name, out / name)
    # 模块化界面（可整体替换；ui.html 仍作为回退）
    for name in EDITABLE_DIRS:
        src = ROOT / name
        if src.is_dir():
            shutil.copytree(src, out / name, dirs_exist_ok=True)


def make_zip(out):
    stamp = datetime.date.today().strftime("%Y%m%d")
    zpath = out.parent / f"{APP_NAME.replace(' ', '-')}-portable-{stamp}.zip"
    print("+ zip", zpath)
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in sorted(out.rglob("*")):
            z.write(p, p.relative_to(out.parent))
    return zpath


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", action="store_true", help="额外生成 zip")
    ap.add_argument("--clean", action="store_true", help="先清理 build/ 与产物目录")
    ap.add_argument("--out-root", default=str(DIST),
                    help="产物根目录（默认 dist；便携版运行中可指到 dist/next）")
    args = ap.parse_args()

    out = Path(args.out_root).resolve() / APP_NAME
    check_inputs()
    if args.clean:
        for p in (BUILD, out):
            if p.exists():
                print("+ rm", p)
                shutil.rmtree(p)

    build_pyinstaller(out)
    if not (out / f"{APP_NAME}.exe").is_file():
        raise SystemExit(f"PyInstaller 产物缺失：{out / (APP_NAME + '.exe')}")

    copy_electron(out)
    copy_editable(out)

    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"\nOK -> {out}")
    print(f"     {size / 1024 / 1024:.0f} MB")
    if args.zip:
        zp = make_zip(out)
        print(f"ZIP -> {zp} ({zp.stat().st_size / 1024 / 1024:.0f} MB)")


if __name__ == "__main__":
    main()
