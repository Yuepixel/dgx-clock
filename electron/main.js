'use strict';
/*
 * DGX CLOCK —— Electron 透明外壳
 *
 * 为什么换成 Electron：pywebview 6.x 的 WinForms 宿主无法把「窗体」做成
 * 逐像素透明（WebView2 只能把自身背景设为透明，透出的是 WinForms 的底色），
 * 这是 pywebview 上游公认的未解决问题。Electron 的 transparent 窗口在
 * Windows 上是成熟方案，且能保留自绘标题栏。
 *
 * 本进程只负责「窗口」：透明、无边框、置顶、缩放、记住位置。
 * 数据由 clock_server.py 起的 127.0.0.1 HTTP 服务提供，页面每秒 fetch /metrics。
 */

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

/* 由 dgxclock/app.py 传入：--url / --config / --state-dir。
   便携版 state 存在 exe 同目录，源码版仍在 %APPDATA%\\dgx-clock。 */
function argValue(name) {
  const p = process.argv.find((a) => a.startsWith(name + '='));
  return p ? p.slice(name.length + 1) : null;
}

const numOr = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

let CONF = {};
try {
  const cfgFile = argValue('--config');
  if (cfgFile) CONF = JSON.parse(fs.readFileSync(cfgFile, 'utf8')) || {};
} catch {
  CONF = {};
}
const WCFG = (CONF.window && typeof CONF.window === 'object') ? CONF.window : {};

const MIN_W = Math.max(200, Math.round(numOr(WCFG.min_width, 300)));
const MIN_H = Math.max(200, Math.round(numOr(WCFG.min_height, 330)));
const DEFAULT_W = Math.max(MIN_W, Math.round(numOr(WCFG.width, 380)));
const DEFAULT_H = Math.max(MIN_H, Math.round(numOr(WCFG.height, 424)));
const DEFAULT_TOP = WCFG.always_on_top !== false;

const APP_URL =
  (process.argv.find((a) => a.startsWith('--url=')) || '').slice('--url='.length) ||
  'http://127.0.0.1:8791/';

const STATE_DIR = argValue('--state-dir')
  ? path.resolve(argValue('--state-dir'))
  : path.join(process.env.APPDATA || __dirname, 'dgx-clock');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

let win = null;
let saveTimer = null;
/* 自定义缩放：记录按下时的窗口边界 */
let drag = null;

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!s || typeof s !== 'object') return {};
    /* 旧版 pywebview 的 state 里没有 shell 标记：几何尺寸作废（用户嫌大），
       只继承置顶偏好。 */
    if (s.shell !== 'electron') return { on_top: s.on_top !== false };
    return s;
  } catch {
    return {};
  }
}

const state = loadState();
/* 首次启动（没有 state.json）时用 config.json 的置顶偏好 */
if (state.on_top === undefined) state.on_top = DEFAULT_TOP;

/* 一次性状态迁移：DGX_STATE_SEED 指向旧 profile 的 state.json（只读），
   把测试窗口的主题/尺寸/置顶带进正常 profile；之后仍由本文件正常保存。
   日常启动不需要设置。 */
if (process.env.DGX_STATE_SEED) {
  try {
    const seed = JSON.parse(fs.readFileSync(process.env.DGX_STATE_SEED, 'utf8'));
    if (seed && typeof seed === 'object') Object.assign(state, seed, { shell: 'electron' });
  } catch {
    /* 种子文件坏了就按原 state 启动 */
  }
}

function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/* 位置是否还落在某块屏幕里（换分辨率/拔显示器后不要跑到屏幕外） */
function onScreen(x, y, w, h) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return (
      x + w > a.x + 40 &&
      x < a.x + a.width - 40 &&
      y + h > a.y + 40 &&
      y < a.y + a.height - 40
    );
  });
}

function saveNow() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getBounds();
    const data = {
      shell: 'electron',
      x: b.x,
      y: b.y,
      w: b.width,
      h: b.height,
      on_top: win.isAlwaysOnTop(),
      theme: state.theme || '',
      face: state.face || '',
    };
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(data), 'utf8');
  } catch {
    /* 存不下就算了，不能因为记位置把窗口搞挂 */
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

function createWindow() {
  const w = clamp(Math.round(num(state.w, DEFAULT_W)), MIN_W, 1600);
  const h = clamp(Math.round(num(state.h, DEFAULT_H)), MIN_H, 1600);

  let x;
  let y;
  if (Number.isFinite(Number(state.x)) && Number.isFinite(Number(state.y))) {
    const sx = Math.round(Number(state.x));
    const sy = Math.round(Number(state.y));
    if (onScreen(sx, sy, w, h)) {
      x = sx;
      y = sy;
    }
  }
  if (x === undefined) {
    /* 首次运行/换屏后没有有效位置：明确居中，别交给 Windows 的“上次位置” */
    const area = screen.getPrimaryDisplay().workArea;
    x = Math.round(area.x + (area.width - w) / 2);
    y = Math.round(area.y + (area.height - h) / 2);
  } else {
    /* 记住的位置贴边/部分出屏时，拉回当前显示器工作区 */
    const area = screen.getDisplayMatching({ x, y, width: w, height: h }).workArea;
    x = clamp(x, area.x, area.x + area.width - w);
    y = clamp(y, area.y, area.y + area.height - h);
  }

  win = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    minWidth: MIN_W,
    minHeight: MIN_H,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    thickFrame: false,
    roundedCorners: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: state.on_top !== false,
    show: false,
    title: 'DGX CLOCK',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.setAutoHideMenuBar(true);

  /* 页面只允许留在本地 metrics 服务里 */
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(APP_URL.split('/').slice(0, 3).join('/'))) e.preventDefault();
  });

  win.once('ready-to-show', () => {
    win.show();
    win.setAlwaysOnTop(state.on_top !== false);
    if (process.env.DGX_STATE_SEED) {
      saveNow();                       // 迁移后立刻落到正常 profile
      delete process.env.DGX_STATE_SEED;
    }
    if (process.env.DGX_DEBUG) {
      const d = screen.getPrimaryDisplay();
      console.log('[dgx] display', JSON.stringify(d.bounds), 'scale', d.scaleFactor,
                  'bounds', JSON.stringify(win.getBounds()),
                  'content', JSON.stringify(win.getContentBounds()));
    }
  });

  win.on('move', scheduleSave);
  win.on('resize', scheduleSave);
  win.on('close', saveNow);
  win.on('closed', () => {
    win = null;
  });

  win.loadURL(APP_URL);
}

/* ---------------- IPC：标题栏按钮 + 自定义缩放 ---------------- */
ipcMain.handle('win:close', () => {
  if (win && !win.isDestroyed()) win.close();
});

ipcMain.handle('win:set-top', (_e, flag) => {
  if (!win || win.isDestroyed()) return { ok: false, on_top: false };
  const on = Boolean(flag);
  win.setAlwaysOnTop(on);
  state.on_top = on;
  saveNow();
  return { ok: true, on_top: on };
});

ipcMain.handle('win:get-state', () => {
  if (!win || win.isDestroyed()) return { on_top: true, w: DEFAULT_W, h: DEFAULT_H, theme: state.theme || null, face: state.face || null };
  const b = win.getBounds();
  return { on_top: win.isAlwaysOnTop(), w: b.width, h: b.height, theme: state.theme || null, face: state.face || null };
});

/* 表盘切换：同时记下 face（布局）与 theme（配色），
   这样旧的 ui.html 回退页仍能用同一个配色打开。 */
ipcMain.handle('win:set-face', (_e, id, theme) => {
  state.face = (typeof id === 'string') ? id.slice(0, 40) : '';
  if (typeof theme === 'string' && theme) state.theme = theme.slice(0, 40);
  saveNow();
  return { ok: true, face: state.face, theme: state.theme };
});

ipcMain.handle('win:set-theme', (_e, id) => {
  state.theme = (typeof id === 'string') ? id.slice(0, 40) : '';
  saveNow();
  return { ok: true, theme: state.theme };
});

ipcMain.on('win:resize-start', (_e, dir) => {
  if (!win || win.isDestroyed()) return;
  drag = { dir: String(dir || ''), b: win.getBounds() };
});

ipcMain.on('win:resize-move', (_e, dx, dy) => {
  if (!win || win.isDestroyed() || !drag) return;
  const s = drag.b;
  const ddx = Math.round(num(dx, 0));
  const ddy = Math.round(num(dy, 0));
  const b = { x: s.x, y: s.y, width: s.width, height: s.height };

  if (drag.dir.includes('e')) b.width = clamp(s.width + ddx, MIN_W, 4000);
  if (drag.dir.includes('s')) b.height = clamp(s.height + ddy, MIN_H, 4000);
  if (drag.dir.includes('w')) {
    b.width = clamp(s.width - ddx, MIN_W, 4000);
    b.x = s.x + (s.width - b.width);
  }
  if (drag.dir.includes('n')) {
    b.height = clamp(s.height - ddy, MIN_H, 4000);
    b.y = s.y + (s.height - b.height);
  }
  win.setBounds(b, false);
});

ipcMain.on('win:resize-end', () => {
  drag = null;
  saveNow();
});

/* ---------------- 生命周期 ---------------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    saveNow();
    app.quit();
  });

  app.on('before-quit', saveNow);
}
