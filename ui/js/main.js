/* ═══════════════════════════════════════════════════════════════
   ▍DGX CLOCK 入口：按当前表盘（S.FACE）派发到对应布局模块
    · 布局模块：ui/js/faces/*.js（staticSvg / live / after）
    · 数据契约：GET /metrics 与 gb10_monitor.py 的 get_metrics() 完全一致
    · 配色 / 表盘清单：themes.json（faces 数组是表盘轮换唯一真源）
   ═══════════════════════════════════════════════════════════════ */
import { S, num } from './state.js';
import * as classic from './faces/classic.js';
import * as card from './faces/card.js';
import { decayed, startDecay } from './decay.js';
import { updateTempRing } from './temp.js';
import { loadClockConfig, pickMetrics, markFreshness } from './metrics.js';
import { applyFace, applyTheme, setDot, initFaces, initFaceButton, cycleFace } from './theme.js';
import { tickClock, initShell } from './shell.js';

/* 布局注册表：新增表盘 = faces/ 下一个模块 + 这里一行。 */
const LAYOUTS = {
  [classic.id]: classic,
  [card.id]: card,
};

function currentLayout(){
  const id = S.FACE && S.FACE.layout;
  return LAYOUTS[id] || classic;
}

function ensureStatic(svg, L){
  const key = L.id + ':' + (S.FACE ? S.FACE.id : '');
  if (svg.dataset.built === key) return;
  svg.setAttribute('viewBox', L.viewBox || '0 0 360 360');
  svg.innerHTML = (L.defs ? L.defs() : '') +
    '<g id="dial-static">' + L.staticSvg() + '</g>' +
    '<g id="dial-name"></g>' +
    '<g id="dial-live"></g>';
  svg.dataset.built = key;
}

export function renderClock(d){
  const svg = document.getElementById('clock');
  if (!svg) return;
  const L = currentLayout();
  ensureStatic(svg, L);

  d = d || {};
  S.lastData = d;
  const E = d.eng || {};
  const dataFresh = !d.stale;
  const run = num(E.run), lanes = num(E.lanes) || 4;
  const gpu = num(d.gpu), mem = num(d.mem);
  const decode = dataFresh ? num(E.live) : null;
  const ttft = dataFresh ? num(E.ttft_ms) : null;
  /* 没有新数据时，指针从最后一次位置回落；有数据则立即跟随。 */
  const view = {
    dataFresh, run, lanes, gpu, mem, decode, ttft,
    power: num(d.power), gen: num(d.gen), temp: num(d.temp), e2e: num(E.e2e_ms),
    shownDecode: decayed('decode', decode, S.DECODE_MAX),
    shownTtft: decayed('ttft', ttft, S.TTFT_MAX),
  };
  pushHistory(view.shownDecode);

  svg.querySelector('#dial-live').innerHTML = L.live(d, view);
  if (L.after) L.after(d, view);
  updateTempRing(num(d.temp));
}

/* 数据卡曲线：每秒最多一个采样，保留最近 60 个；切表盘不重复灌点。 */
function pushHistory(v){
  const now = Date.now();
  if (now - S.histAt < 850) return;
  S.histAt = now;
  const a = S.hist.decode;
  a.push(Number.isFinite(Number(v)) ? Number(v) : 0);
  if (a.length > 60) a.splice(0, a.length - 60);
}

export async function refresh(){
  try{
    const r = await fetch('/metrics', { cache:'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const m = await r.json();
    renderClock(markFreshness(pickMetrics(m)));
    setDot(true);
  }catch(_){
    /* 连本地服务都拿不到：点亮断线灯，同时让 decode / TTFT 缓缓回零 */
    setDot(false);
    startDecay('decode');
    startDecay('ttft');
  }
}

/* theme.js 的重绘通过这个回调，避免 theme → main 的循环 import */
S.render = renderClock;

// ---- 启动 ----
renderClock({});          // 先画静态盘面，避免开窗白闪
tickClock();
setInterval(tickClock, 1000);

if (window.dgx) initShell();
initFaceButton();
initFaces();
loadClockConfig();
if (location.protocol === 'http:' || location.protocol === 'https:'){
  refresh();
  setInterval(refresh, 1000);
}

// 设计稿/截图/测试脚本直接调用
window.renderClock = renderClock;
window.pickMetrics = pickMetrics;
window.applyTheme = applyTheme;
window.applyFace = applyFace;
window.cycleFace = cycleFace;
/* 预览/截图用：一次灌入 60 点历史，立即重绘（生产环境不需要调用） */
window.seedHistory = arr => {
  S.hist.decode = (Array.isArray(arr) ? arr : []).slice(-60);
  S.histAt = Date.now();
  renderClock(S.lastData || {});
};
