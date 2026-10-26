/* ═══════════════════════════════════════════════════════════════
   ▍外观：表盘（faces）+ 配色库（themes）
    · themes.json 的 faces 数组是表盘轮换唯一真源：每档 = layout + theme
    · 点击标题栏胶囊按 faces 顺序轮换整套表盘（不再只换颜色）
    · 本模块不 import main.js —— 重绘走 S.render 回调（main.js 启动时挂上）
   ═══════════════════════════════════════════════════════════════ */
import { S } from './state.js';

export const THEME_DEFAULT = {
  id: 'dgx',
  name: 'DGX 原色',
  short: '原色',
  sub: '品牌绿 · 蓝钢 · 青绿',
  swatches: ['#232E40', '#76B900', '#5FA8F0', '#1FB894'],
  face: ['#232E40', '#151C28', '#090C12'],
  subFace: ['#1A2331', '#111823', '#070A0F'],
  title: '#22252A',
  brand: '#76B900',
  eng: '#B9D97A',
  gpu: { ring: '#76B900', val: '#8FD11A', num: 'rgba(143,209,26,.60)' },
  ttft: { ring: '#5FA8F0', val: '#8CC8FF', num: 'rgba(140,200,255,.55)' },
  mem: { ring: '#1FB894', val: '#45D6B0', num: 'rgba(69,214,176,.55)' },
  needle: {
    dark: '#0B2A6B', mid: '#3A7FE0', axis: '#1B4FA8',
    stroke: '#9CC0FF', glow: '#A0C8FF', tip: '#DBE9FF', edge: '#0A1A3D',
  },
  /* 数据卡专用色：不填则退回品牌色（旧三眼配色不受影响） */
  card: {
    bg1: 'rgba(20,28,40,.80)', bg2: 'rgba(5,8,12,.74)',
    edge: '#76B900', fg: '#FFFFFF', mut: '#8D99A7',
    line: '#76B900', area: 'rgba(118,185,0,.16)',
    panel: 'rgba(255,255,255,.055)', panelEdge: 'rgba(255,255,255,.10)',
    power: '#76B900', ttft: '#5FA8F0', gpu: '#76B900', mem: '#1FB894',
    e2e: '#76B900', run: '#76B900',
    tick: 'rgba(190,205,222,.55)', tickDim: 'rgba(150,165,182,.30)',
  },
};

/* 首帧/离线回退：内置 dgx 在模块载入时就位，保证 renderClock 首次调用有主题。 */
S.THEME = THEME_DEFAULT;

export function mergeTheme(base, t){
  t = t || {};
  const part = k => ({ ...(base[k] || {}), ...(t[k] || {}) });
  return {
    ...base, ...t,
    id: t.id || base.id,
    name: t.name || base.name,
    short: t.short || t.name || base.short || base.name,
    sub: t.sub || base.sub || '',
    swatches: Array.isArray(t.swatches) && t.swatches.length ? t.swatches : base.swatches,
    face: Array.isArray(t.face) && t.face.length === 3 ? t.face : base.face,
    subFace: Array.isArray(t.subFace) && t.subFace.length === 3 ? t.subFace : base.subFace,
    title: t.title || base.title,
    brand: t.brand || base.brand,
    eng: t.eng || base.eng,
    gpu: part('gpu'),
    ttft: part('ttft'),
    mem: part('mem'),
    needle: part('needle'),
    card: part('card'),
  };
}

/* ---------------- themes.json → 配色库 + 表盘列表 ---------------- */
export function normalizeConfig(raw){
  const cfg = (raw && typeof raw === 'object') ? raw : {};
  const src = (cfg.themes && typeof cfg.themes === 'object') ? cfg.themes : {};
  const themes = {};
  Object.keys(src).forEach(id => {
    themes[id] = mergeTheme(THEME_DEFAULT, { ...(src[id] || {}), id });
  });
  if (!themes.dgx) themes.dgx = THEME_DEFAULT;

  const ids = Object.keys(themes);
  const legacyDefault = (cfg.default && themes[cfg.default]) ? cfg.default : (themes.dgx ? 'dgx' : ids[0]);
  const cycle = Array.isArray(cfg.cycle) ? cfg.cycle.filter(id => themes[id]) : [];

  /* faces：显式定义优先；老版 themes.json 没有 faces 时，把 cycle 展开成经典表盘。 */
  const faces = {};
  const order = [];
  const addFace = (f) => {
    if (!f || typeof f !== 'object') return;
    const id = String(f.id || '').slice(0, 40);
    if (!id || faces[id]) return;
    const themeId = (f.theme && themes[f.theme]) ? f.theme : legacyDefault;
    const th = themes[themeId];
    faces[id] = {
      id,
      layout: String(f.layout || 'classic').slice(0, 24),
      theme: themeId,
      name: String(f.name || th.name || id),
      short: String(f.short || th.short || f.name || id).slice(0, 12),
    };
    order.push(id);
  };
  if (Array.isArray(cfg.faces)) cfg.faces.forEach(addFace);
  if (!order.length){
    (cycle.length ? cycle : ids).forEach(tid => {
      const th = themes[tid];
      addFace({
        id: 'classic-' + tid,
        layout: 'classic',
        theme: tid,
        name: '经典三眼 · ' + (th.name || tid),
        short: th.short || tid,
      });
    });
  }

  const defaultFace = (cfg.default_face && faces[cfg.default_face])
    ? cfg.default_face
    : order[0];

  return {
    default: legacyDefault,
    cycle: cycle.length ? cycle : ids,
    themes,
    temperature: (cfg.temperature && typeof cfg.temperature === 'object') ? cfg.temperature : null,
    faces,
    face_order: order,
    default_face: defaultFace,
  };
}

/* 只换配色（不换布局）；表盘切换走 applyFace。 */
function applyPalette(t){
  S.THEME = mergeTheme(THEME_DEFAULT, t || {});
  const cd = S.THEME.card || {};
  const root = document.documentElement.style;
  root.setProperty('--brand', S.THEME.brand);
  root.setProperty('--eng', S.THEME.eng);
  root.setProperty('--title', S.THEME.title);
  /* 数据卡文字/面板：默认值在 app.css :root，主题可覆盖 */
  root.setProperty('--card-bg1', cd.bg1);
  root.setProperty('--card-bg2', cd.bg2);
  root.setProperty('--card-edge', cd.edge || S.THEME.brand);
  root.setProperty('--card-fg', cd.fg);
  root.setProperty('--card-mut', cd.mut);
  root.setProperty('--card-line', cd.line || S.THEME.brand);
  root.setProperty('--card-area', cd.area);
  root.setProperty('--card-panel', cd.panel);
  root.setProperty('--card-panel-edge', cd.panelEdge);

  const svg = document.getElementById('clock');
  if (svg) svg.dataset.built = '';       // 盘面/表圈/刻度属于静态层，配色变了要重建
}

/* 兼容旧调用（设计稿/预览脚本直接给配色对象）。 */
export function applyTheme(t){
  applyPalette(t);
  S.render(S.lastData || {});
}

/* 切换到一整档表盘：配色 + 布局 + 胶囊名 + 持久化。 */
export async function applyFace(face, opts){
  if (!face) return;
  opts = opts || {};
  S.FACE = face;
  applyPalette(S.CFG && S.CFG.themes[face.theme]);
  S.render(S.lastData || {});

  const pill = document.getElementById('face-name');
  if (pill) pill.textContent = face.short || face.name || face.id;
  const btn = document.getElementById('face-btn');
  if (btn) btn.title = '点击切换表盘 · 当前：' + (face.name || face.id);
  setDot(S.lastDotOk);

  if (opts.save !== false && window.dgx && window.dgx.setFace){
    try{ await window.dgx.setFace(face.id, face.theme); }catch(_){}
  }
}

export async function loadFaces(){
  let raw = null;
  try{
    const r = await fetch('/themes', { cache:'no-store' });
    if (r.ok) raw = await r.json();
  }catch(_){}
  if (!raw || !raw.themes){
    /* 预览/文件模式：没有服务，只保留内置经典原色一张表盘（温度环也不显示） */
    S.CFG = normalizeConfig({
      default_face: 'classic-dgx',
      faces: [{ id:'classic-dgx', layout:'classic', theme:'dgx', name:'经典三眼 · 原色', short:'原色' }],
      themes: { dgx: THEME_DEFAULT },
    });
  }else{
    S.CFG = normalizeConfig(raw);
  }
  S.FACES = S.CFG.faces;
  S.FACE_ORDER = S.CFG.face_order.slice();
  S.CYCLE = S.CFG.cycle.slice();       // 只给 ui.html 回退页保留的旧字段
  return !!raw;
}

export async function initFaces(){
  await loadFaces();
  let saved = null;
  try{ if (window.dgx) saved = await window.dgx.getState(); }catch(_){}

  /* 旧 state 只有 theme：映射到同配色的经典表盘（一次迁移后写回 face）。 */
  let face = (saved && saved.face) ? S.FACES[saved.face] : null;
  if (!face && saved && saved.theme){
    face = S.FACE_ORDER.map(id => S.FACES[id]).find(f => f.theme === saved.theme) || null;
  }
  if (!face) face = S.FACES[S.CFG.default_face] || S.FACES[S.FACE_ORDER[0]];
  await applyFace(face, { save: !(saved && saved.face) });
}

export async function cycleFace(){
  if (!S.FACE_ORDER || S.FACE_ORDER.length < 2) return;
  const i = S.FACE_ORDER.indexOf(S.FACE && S.FACE.id);
  const nextId = S.FACE_ORDER[(i + 1) % S.FACE_ORDER.length];
  const next = S.FACES[nextId];
  if (next) await applyFace(next);
}

export function initFaceButton(){
  const btn = document.getElementById('face-btn');
  if (!btn) return;
  btn.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    cycleFace();
  });
}

export function setDot(ok){
  S.lastDotOk = Boolean(ok);
  const d = document.getElementById('dot');
  if (d) d.style.background = ok ? S.THEME.brand : '#c0272d';
}
