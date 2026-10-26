/* ═══════════════════════════════════════════════════════════════
   ▍几何与静态 SVG：极坐标 / 表盘定义 / 表壳刻度 / 小表盘 / 并发窗 / 指针
   主题色一律读 S.THEME（本模块不 import theme.js，避免循环依赖）。
   ═══════════════════════════════════════════════════════════════ */
import {
  S, CX, CY, R_OUT, R_FACE, R_MAIN, R_NUM, R_SUB, R_SUB_POS, DATE_ANGLE,
  clamp, num, fmtInt,
} from './state.js';

// ---- 极坐标（角度：0=12点方向，顺时针）----
export function pt(cx, cy, r, deg){
  const a = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
export function arc(cx, cy, r, d0, d1){
  const p0 = pt(cx, cy, r, d0), p1 = pt(cx, cy, r, d1);
  const large = (d1 - d0) > 180 ? 1 : 0;
  return 'M' + p0.x.toFixed(2) + ' ' + p0.y.toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' +
         p1.x.toFixed(2) + ' ' + p1.y.toFixed(2);
}
export function poly(points){
  return 'M' + points.map(p => p.x.toFixed(2) + ' ' + p.y.toFixed(2)).join(' L') + ' Z';
}

// ---- 质感底层：太阳纹盘面 / 金属表圈 / 3D 刻度 ----
const SUNBURST = (() => {
  let lines = '';
  for (let i = 0; i < 720; i++){
    const deg = i * 0.5;
    const p1 = pt(CX, CY, 5, deg), p2 = pt(CX, CY, R_FACE - 1, deg);
    const shimmer = 0.04 + 0.13 * Math.abs(Math.sin((deg + 35) * Math.PI / 180));
    lines += '<line x1="' + p1.x.toFixed(1) + '" y1="' + p1.y.toFixed(1) +
             '" x2="' + p2.x.toFixed(1) + '" y2="' + p2.y.toFixed(1) +
             '" stroke="rgba(125,158,198,' + shimmer.toFixed(3) + ')" stroke-width=".42"/>';
  }
  return lines;
})();

export function dialDefs(){
  return '<defs>' +
    /* 盘面底色：深蓝黑，中心偏上略亮 */
    '<radialGradient id="dialFace" cx="50%" cy="44%" r="66%">' +
      '<stop offset="0%" stop-color="' + S.THEME.face[0] + '"/>' +
      '<stop offset="48%" stop-color="' + S.THEME.face[1] + '"/>' +
      '<stop offset="100%" stop-color="' + S.THEME.face[2] + '"/>' +
    '</radialGradient>' +
    /* 斜向金属光泽 */
    '<linearGradient id="dialGloss" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="rgba(255,255,255,.13)"/>' +
      '<stop offset="34%" stop-color="rgba(255,255,255,.02)"/>' +
      '<stop offset="63%" stop-color="rgba(0,0,0,.10)"/>' +
      '<stop offset="100%" stop-color="rgba(0,0,0,.34)"/>' +
    '</linearGradient>' +
    /* 中心柔光 */
    '<radialGradient id="dialSheen" cx="36%" cy="30%" r="56%">' +
      '<stop offset="0%" stop-color="rgba(150,185,230,.20)"/>' +
      '<stop offset="55%" stop-color="rgba(120,150,200,.04)"/>' +
      '<stop offset="100%" stop-color="rgba(0,0,0,0)"/>' +
    '</radialGradient>' +
    /* 边缘压暗 */
    '<radialGradient id="vignette" cx="50%" cy="50%" r="50%">' +
      '<stop offset="62%" stop-color="rgba(0,0,0,0)"/>' +
      '<stop offset="100%" stop-color="rgba(0,0,0,.42)"/>' +
    '</radialGradient>' +
    /* 表圈金属：左上亮 → 对角暗 → 右下反光（整环连续，无硬弧线） */
    '<linearGradient id="bezelMetal" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#c3cdda"/>' +
      '<stop offset="12%" stop-color="#7a8592"/>' +
      '<stop offset="38%" stop-color="#3b434d"/>' +
      '<stop offset="58%" stop-color="#262d35"/>' +
      '<stop offset="78%" stop-color="#454e59"/>' +
      '<stop offset="100%" stop-color="#9aa5b2"/>' +
    '</linearGradient>' +
    /* 外缘高光：只沿光照方向渐亮，不在左下留白线 */
    '<linearGradient id="rimLight" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="rgba(240,248,255,.72)"/>' +
      '<stop offset="18%" stop-color="rgba(240,248,255,.18)"/>' +
      '<stop offset="42%" stop-color="rgba(255,255,255,0)"/>' +
      '<stop offset="72%" stop-color="rgba(255,255,255,0)"/>' +
      '<stop offset="100%" stop-color="rgba(170,185,200,.22)"/>' +
    '</linearGradient>' +
    /* 刻度块亮面：整盘统一光照（userSpaceOnUse），上亮下暗 */
    '<linearGradient id="tickFace" gradientUnits="userSpaceOnUse" x1="48" y1="32" x2="316" y2="330">' +
      '<stop offset="0%" stop-color="#f2f7fd"/>' +
      '<stop offset="20%" stop-color="#c7d1dc"/>' +
      '<stop offset="48%" stop-color="#98a3af"/>' +
      '<stop offset="72%" stop-color="#68727d"/>' +
      '<stop offset="100%" stop-color="#414a55"/>' +
    '</linearGradient>' +
    '<linearGradient id="needleMetal" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0%" stop-color="#7d8794"/><stop offset="35%" stop-color="#f2f6fb"/>' +
      '<stop offset="65%" stop-color="#c2ccd8"/><stop offset="100%" stop-color="#5f6875"/>' +
    '</linearGradient>' +
    '<linearGradient id="blueSteel" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0%" stop-color="' + S.THEME.needle.dark + '"/><stop offset="45%" stop-color="' + S.THEME.needle.mid + '"/>' +
      '<stop offset="55%" stop-color="' + S.THEME.needle.mid + '"/><stop offset="100%" stop-color="' + S.THEME.needle.dark + '"/>' +
    '</linearGradient>' +
    /* 小表盘 */
    '<radialGradient id="subFace" cx="42%" cy="32%" r="72%">' +
      '<stop offset="0%" stop-color="' + S.THEME.subFace[0] + '"/>' +
      '<stop offset="55%" stop-color="' + S.THEME.subFace[1] + '"/>' +
      '<stop offset="100%" stop-color="' + S.THEME.subFace[2] + '"/>' +
    '</radialGradient>' +
    '<radialGradient id="subSheen" cx="36%" cy="28%" r="62%">' +
      '<stop offset="0%" stop-color="rgba(190,215,245,.11)"/>' +
      '<stop offset="55%" stop-color="rgba(160,190,230,.02)"/>' +
      '<stop offset="100%" stop-color="rgba(0,0,0,0)"/>' +
    '</radialGradient>' +
    '<radialGradient id="subVignette" cx="50%" cy="50%" r="50%">' +
      '<stop offset="55%" stop-color="rgba(0,0,0,0)"/>' +
      '<stop offset="100%" stop-color="rgba(0,0,0,.5)"/>' +
    '</radialGradient>' +
    '<linearGradient id="subBezel" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#aab5c2"/><stop offset="25%" stop-color="#5a636f"/>' +
      '<stop offset="55%" stop-color="#2b323a"/><stop offset="78%" stop-color="#4a535e"/>' +
      '<stop offset="100%" stop-color="#8d98a5"/>' +
    '</linearGradient>' +
    '<linearGradient id="dateBezel" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="rgba(150,164,180,.55)"/>' +
      '<stop offset="100%" stop-color="rgba(70,80,92,.4)"/>' +
    '</linearGradient>' +
    /* 滤镜 */
    '<filter id="caseShadow" x="-20%" y="-20%" width="140%" height="140%">' +
      '<feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#000" flood-opacity=".6"/>' +
    '</filter>' +
    '<filter id="subShadow" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feDropShadow dx="0" dy="2.2" stdDeviation="2.2" flood-color="#000" flood-opacity=".7"/>' +
    '</filter>' +
    '<filter id="ringGlow" x="-50%" y="-50%" width="200%" height="200%">' +
      '<feGaussianBlur stdDeviation="1.5" result="b"/>' +
      '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>' +
    '</filter>' +
    '<filter id="tempGlow" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feGaussianBlur stdDeviation="2.2" result="b"/>' +
      '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>' +
    '</filter>' +
    '<filter id="grain" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" result="n"/>' +
      '<feColorMatrix in="n" type="saturate" values="0" result="g"/>' +
      '<feComposite in="g" in2="SourceGraphic" operator="in"/>' +
    '</filter>' +
    '</defs>';
}

/* 环形路径（外圆 - 内圆，evenodd 挖空） */
export function ringPath(rOut, rIn){
  return 'M' + (CX - rOut) + ' ' + CY +
    ' a' + rOut + ' ' + rOut + ' 0 1 0 ' + (rOut * 2) + ' 0' +
    ' a' + rOut + ' ' + rOut + ' 0 1 0 ' + (-rOut * 2) + ' 0 Z' +
    ' M' + (CX - rIn) + ' ' + CY +
    ' a' + rIn + ' ' + rIn + ' 0 1 0 ' + (rIn * 2) + ' 0' +
    ' a' + rIn + ' ' + rIn + ' 0 1 0 ' + (-rIn * 2) + ' 0 Z';
}

export function tickQuad(deg, rOut, rIn, half){
  const aL = pt(CX, CY, rOut, deg - half);
  const aR = pt(CX, CY, rOut, deg + half);
  const bR = pt(CX, CY, rIn, deg + half);
  const bL = pt(CX, CY, rIn, deg - half);
  return [aL, aR, bR, bL];
}

const rgb = (c) => 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
const mixArr = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/* 大表盘静态层：表壳 / 盘面 / 表圈 / 60 格立体刻度 / 数字 */
export function mainDialStatic(){
  let s = '';
  // 表壳投影 + 实体底（防止半透明缝隙露出桌面）
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (R_OUT + 1) + '" fill="#05070a" filter="url(#caseShadow)"/>';
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R_OUT + '" fill="' + S.THEME.face[2] + '"/>';

  // 盘面 + 太阳纹 + 颗粒 + 光泽 + 边缘压暗
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R_FACE + '" fill="url(#dialFace)"/>';
  s += '<g opacity=".55">' + SUNBURST + '</g>';
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R_FACE + '" fill="#8899aa" opacity=".055" filter="url(#grain)"/>';
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R_FACE + '" fill="url(#dialSheen)" opacity=".65"/>';
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R_FACE + '" fill="url(#dialGloss)"/>';
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R_FACE + '" fill="url(#vignette)"/>';

  // 数字章环：轻微下沉的暗环，让刻度与数字"坐"在盘面里
  s += '<path d="' + ringPath(R_FACE - .2, 125) + '" fill="rgba(0,0,0,.17)"/>';
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="125" fill="none" stroke="rgba(0,0,0,.45)" stroke-width=".8"/>';
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="124.3" fill="none" stroke="rgba(255,255,255,.055)" stroke-width=".6"/>';

  // 表圈：实心金属环（描边层叠，接缝不会露出底色）
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="159.2" fill="none" stroke="url(#bezelMetal)" stroke-width="7.4"/>';
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="163" fill="none" stroke="rgba(0,0,0,.92)" stroke-width="1"/>';
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="161.3" fill="none" stroke="url(#rimLight)" stroke-width="1.05"/>';
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="156.2" fill="none" stroke="rgba(0,0,0,.78)" stroke-width="1.5"/>';
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="155.1" fill="none" stroke="rgba(210,225,240,.16)" stroke-width=".6"/>';

  // 60 格刻度：每格一条沿径向的金属渐变（底暗尖亮，再按全盘光照加权），
  // 配侧壁 + 双层投影 + 两端倒角，做出真正的凸起块感。
  let tickGrads = '';
  for (let i = 0; i < 60; i++){
    const deg = i * 6, maj = (i % 5 === 0);
    const rOut = R_MAIN;
    const rIn = R_MAIN - (maj ? 16 : 7.6);
    const half = maj ? 1.55 : .78;
    const face = tickQuad(deg, rOut, rIn, half);
    const lit = clamp(Math.cos((deg - 315) * Math.PI / 180), 0, 1);

    const base = mixArr([30, 36, 44], [118, 130, 144], 0.18 + 0.42 * lit);
    const tip = mixArr([100, 110, 122], [246, 250, 255], 0.10 + 0.85 * lit);
    const mid = mixArr(base, tip, 0.55);
    const gi = pt(CX, CY, rIn, deg), go = pt(CX, CY, rOut, deg);
    tickGrads += '<linearGradient id="tg' + i + '" gradientUnits="userSpaceOnUse" x1="' +
      gi.x.toFixed(1) + '" y1="' + gi.y.toFixed(1) + '" x2="' + go.x.toFixed(1) + '" y2="' + go.y.toFixed(1) + '">' +
      '<stop offset="0%" stop-color="' + rgb(base) + '"/>' +
      '<stop offset="55%" stop-color="' + rgb(mid) + '"/>' +
      '<stop offset="100%" stop-color="' + rgb(tip) + '"/>' +
      '</linearGradient>';

    // 柔影 + 硬影（往右下偏，光来自左上）
    s += '<path d="' + poly(face.map(p => ({ x: p.x + 2.2, y: p.y + 2.4 }))) +
         '" fill="rgba(0,0,0,.22)"/>';
    s += '<path d="' + poly(face.map(p => ({ x: p.x + 1.15, y: p.y + 1.25 }))) +
         '" fill="rgba(0,0,0,.40)"/>';
    // 侧壁（厚度）
    s += '<path d="' + poly(face.map(p => ({ x: p.x + .55, y: p.y + .6 }))) +
         '" fill="#20262d"/>';
    // 亮面
    s += '<path d="' + poly(face) + '" fill="url(#tg' + i + ')"/>';

    // 外端倒角（迎光面）
    const tipBevel = tickQuad(deg, rOut, rOut - 2.1, half * .98);
    s += '<path d="' + poly(tipBevel) + '" fill="rgba(255,255,255,' + (0.03 + 0.12 * lit).toFixed(3) + ')"/>';
    // 内端倒角（背光面）
    const baseBevel = tickQuad(deg, rIn + 1.9, rIn, half * .98);
    s += '<path d="' + poly(baseBevel) + '" fill="rgba(0,0,0,.32)"/>';

    // 两侧棱线：一侧受光、一侧背光
    const eHi1 = pt(CX, CY, rIn + 1.2, deg - half * .84);
    const eHi2 = pt(CX, CY, rOut - 1.2, deg - half * .84);
    const eLo1 = pt(CX, CY, rIn + 1.2, deg + half * .84);
    const eLo2 = pt(CX, CY, rOut - 1.2, deg + half * .84);
    s += '<line x1="' + eHi1.x.toFixed(2) + '" y1="' + eHi1.y.toFixed(2) +
         '" x2="' + eHi2.x.toFixed(2) + '" y2="' + eHi2.y.toFixed(2) +
         '" stroke="rgba(255,255,255,' + (0.06 + 0.12 * lit).toFixed(3) + ')" stroke-width=".5"/>';
    s += '<line x1="' + eLo1.x.toFixed(2) + '" y1="' + eLo1.y.toFixed(2) +
         '" x2="' + eLo2.x.toFixed(2) + '" y2="' + eLo2.y.toFixed(2) +
         '" stroke="rgba(0,0,0,.34)" stroke-width=".5"/>';

    // 大刻度的品牌色方块（跟随主题）
    if (maj){
      const d = pt(CX, CY, R_MAIN - 21.5, deg);
      s += '<rect x="' + (d.x - 1.15).toFixed(1) + '" y="' + (d.y - 1.15).toFixed(1) +
           '" width="2.3" height="2.3" rx=".55" fill="' + S.THEME.brand + '" opacity=".9"/>';
    }
  }
  s = '<defs>' + tickGrads + '</defs>' + s;

  // 12 个数字：单元素描边+亮面（paint-order），跳过 12 点（小表盘）与 3 点（日期窗）
  for (let i = 1; i <= 12; i++){
    if (i === 12 || i === 3) continue;
    const p = pt(CX, CY, R_NUM, i * 30);
    s += '<text class="hn" x="' + p.x.toFixed(1) + '" y="' + (p.y + 3.8).toFixed(1) +
         '" text-anchor="middle" style="paint-order:stroke;stroke:rgba(0,0,0,.85);stroke-width:2.4;stroke-linejoin:round">' +
         (i * 10) + '</text>';
  }
  // 温度外圈：外沿温度色 + 柔光（颜色由 renderClock 更新）
  s += '<circle id="temp-ring" cx="' + CX + '" cy="' + CY + '" r="' + (R_OUT + 2) +
       '" fill="none" stroke="rgba(0,0,0,0)" stroke-width="1.8" opacity="0" filter="url(#tempGlow)"' +
       ' style="transition:stroke .7s ease, opacity .3s ease"/>';

  return s;
}
export function subDial(cx, cy, opt){
  const { max, value, label, fmt, unit, color } = opt;
  const rr = R_SUB;
  const c = color || S.THEME.ttft;
  const col = c.ring, colVal = c.val || c.ring, colNum = c.num || c.ring;
  /* fracValue：指针/进度环用；value：数值文字用。TTFT 没数据时文字显示 --，
     但指针可以从最后一次位置缓缓回落。 */
  const fracSource = (opt.fracValue != null) ? opt.fracValue : value;
  const frac = clamp((num(fracSource) || 0) / max, 0, 1);
  let s = '';

  // 外圈投影 + 金属表圈（下沉的凹面）
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (rr + 1.6) + '" fill="#05070a" filter="url(#subShadow)"/>';
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (rr + 1.4) + '" fill="none" stroke="url(#subBezel)" stroke-width="2.4"/>';
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (rr + .4) + '" fill="none" stroke="rgba(0,0,0,.85)" stroke-width="1"/>';

  // 盘面
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rr + '" fill="url(#subFace)"/>';

  // 底纹：同心蜗纹（细密 + 每 5 圈一道稍亮的圈）
  let snail = '';
  for (let r = 3.2, k = 0; r < rr - 1.2; r += .82, k++){
    const strong = (k % 5 === 0);
    snail += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r.toFixed(2) + '" fill="none" stroke="rgba(' +
      (strong ? '205,225,248,.095' : '180,205,235,.042') + ')" stroke-width="' + (strong ? .5 : .38) + '"/>';
  }
  s += snail;
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rr + '" fill="#8899aa" opacity=".05" filter="url(#grain)"/>';
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rr + '" fill="url(#subSheen)"/>';
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rr + '" fill="url(#subVignette)"/>';
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (rr - .6) + '" fill="none" stroke="rgba(255,255,255,.06)" stroke-width=".7"/>';

  // 进度环底轨（300°，缺口朝右上）
  s += '<path d="' + arc(cx, cy, rr - 4.4, 0, 300) + '" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="3.8" stroke-linecap="round"/>';
  s += '<path d="' + arc(cx, cy, rr - 4.4, 0, 300) + '" fill="none" stroke="rgba(255,255,255,.075)" stroke-width="2.6" stroke-linecap="round"/>';
  // 进度环（带发光）：始终保留节点，没数据时由衰减动画把弧长收回去
  const idAttr = name => opt.id ? ' id="' + opt.id + '-' + name + '"' : '';
  const showRing = frac > 0.004;
  s += '<path' + idAttr('arc') + ' d="' + arc(cx, cy, rr - 4.4, 0, frac * 300) +
       '" fill="none" stroke="' + col + '" stroke-width="2.7" stroke-linecap="round"' +
       ' filter="url(#ringGlow)" opacity="' + (showRing ? 1 : 0) + '"/>';
  const tip = pt(cx, cy, rr - 4.4, frac * 300);
  s += '<circle' + idAttr('tip') + ' cx="' + tip.x.toFixed(2) + '" cy="' + tip.y.toFixed(2) +
       '" r="1.7" fill="' + col + '" filter="url(#ringGlow)" opacity="' + (showRing ? 1 : 0) + '"/>';

  // 12 格小刻度：带投影（跳过正下方 6 点，给单位文字让位）
  for (let i = 0; i < 12; i++){
    if (i === 6) continue;
    const deg = i * 30, maj = (i % 3 === 0);
    const p1 = pt(cx, cy, rr - 7.6, deg);
    const p2 = pt(cx, cy, rr - 7.6 - (maj ? 4.2 : 2.4), deg);
    s += '<line x1="' + (p1.x + .35).toFixed(2) + '" y1="' + (p1.y + .45).toFixed(2) +
         '" x2="' + (p2.x + .35).toFixed(2) + '" y2="' + (p2.y + .45).toFixed(2) +
         '" stroke="rgba(0,0,0,.65)" stroke-width="' + (maj ? 1.5 : 1) + '"/>';
    s += '<line x1="' + p1.x.toFixed(2) + '" y1="' + p1.y.toFixed(2) +
         '" x2="' + p2.x.toFixed(2) + '" y2="' + p2.y.toFixed(2) +
         '" stroke="' + (maj ? colNum : 'rgba(150,160,175,.38)') +
         '" stroke-width="' + (maj ? 1.3 : .75) + '"/>';
  }

  // 镂空柳叶针（TTFT 有 id 时由衰减动画逐帧重绘这一组）
  const ang = frac * 300;
  const needleSvg = subNeedle(cx, cy, ang, rr);
  s += opt.id ? '<g id="' + opt.id + '-needle">' + needleSvg + '</g>' : needleSvg;

  // 标签 / 数值 / 单位
  s += '<text class="sublabel" x="' + cx + '" y="' + (cy - 12.5) + '" text-anchor="middle">' + label + '</text>';
  s += '<text class="subval" x="' + cx + '" y="' + (cy + 12) + '" text-anchor="middle" style="fill:' + colVal + '">' +
       (fmt ? fmt(value) : fmtInt(value)) + '</text>';
  s += '<text class="subunit" x="' + cx + '" y="' + (cy + 22.5) + '" text-anchor="middle">' + unit + '</text>';
  return s;
}

/* 小表盘柳叶针（只有针和轴心，便于逐帧替换） */
export function subNeedle(cx, cy, ang, rr){
  const tipP = pt(cx, cy, rr - 10.5, ang);
  const midP = pt(cx, cy, rr - 16, ang - 3.4);
  const midQ = pt(cx, cy, rr - 16, ang + 3.4);
  const tailP = pt(cx, cy, -5, ang);
  const body = [tipP, midQ, tailP, midP];
  let s = '';
  s += '<g transform="translate(.8 .9)" opacity=".55"><path d="' + poly(body) + '" fill="#000"/></g>';
  s += '<path d="' + poly(body) + '" fill="#e4ebf3" stroke="#8d97a3" stroke-width=".4" stroke-linejoin="round"/>';
  const h1 = pt(cx, cy, rr - 14.5, ang), h2 = pt(cx, cy, 3.2, ang);
  s += '<line x1="' + h1.x.toFixed(2) + '" y1="' + h1.y.toFixed(2) + '" x2="' + h2.x.toFixed(2) +
       '" y2="' + h2.y.toFixed(2) + '" stroke="#0c0f14" stroke-width="1.05"/>';
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="2.2" fill="#e4ebf3" stroke="#5c646e" stroke-width=".5"/>';
  s += '<circle cx="' + cx + '" cy="' + cy + '" r=".8" fill="#ffffff"/>';
  return s;
}

// ---- 3 点位：DGX 标志 + 双格并发窗 ----
export function dateWindow(run, lanes){
  const p = pt(CX, CY, R_SUB_POS, DATE_ANGLE);
  const x = p.x, y = p.y;
  const cur = String(Math.round(run || 0)).padStart(2, '0');
  const lim = String(Math.round(lanes || 4)).padStart(2, '0');
  let s = '';

  s += '<text class="dgxmark" x="' + x + '" y="' + (y - 27) + '" text-anchor="middle">DGX</text>';

  // 日历窗：外框 + 内凹阴影 + 底部反光
  s += '<rect x="' + (x - 30) + '" y="' + (y - 16) + '" width="60" height="32" rx="5" fill="rgba(6,8,11,.94)" stroke="url(#dateBezel)" stroke-width="1"/>';
  s += '<rect x="' + (x - 29) + '" y="' + (y - 15) + '" width="58" height="30" rx="4" fill="none" stroke="rgba(0,0,0,.9)" stroke-width="1"/>';
  s += '<line x1="' + (x - 28.5) + '" y1="' + (y - 14.5) + '" x2="' + (x + 28.5) + '" y2="' + (y - 14.5) + '" stroke="rgba(255,255,255,.07)" stroke-width=".7"/>';
  s += '<line x1="' + x + '" y1="' + (y - 14) + '" x2="' + x + '" y2="' + (y + 14) + '" stroke="rgba(140,152,168,.45)" stroke-width=".8"/>';
  s += '<text class="datenum" x="' + (x - 14) + '" y="' + (y + 1) + '" text-anchor="middle">' + cur + '</text>';
  s += '<text class="datenum" x="' + (x + 14) + '" y="' + (y + 1) + '" text-anchor="middle" style="fill:#9aa3ad">' + lim + '</text>';
  s += '<text class="datelbl" x="' + x + '" y="' + (y + 12) + '" text-anchor="middle">RUN | MAX</text>';

  return s;
}

/* 引擎名：中轴下方一行，单独一层（不随每秒 #dial-live 重绘重建，呼吸动画不中断）。
   引擎工作 → 呼吸亮起；空闲/断连 → 暗底色不闪。
   opts: {x, y, size, maxWidth} 供不同表盘定位（经典脸默认 y=225 / 19px）。 */
export function updateEngineLabel(name, active, opts){
  const g = document.getElementById('dial-name');
  if (!g) return;
  const txt = String(name || '').trim();
  opts = opts || {};
  const x = (opts.x != null) ? opts.x : CX;
  const y = (opts.y != null) ? opts.y : 225;
  const size = Number(opts.size) || 19;
  const maxW = Number(opts.maxWidth) || 260;
  const key = txt + '|' + x + '|' + y + '|' + size;
  if (g.dataset.key !== key){
    g.dataset.key = key;
    g.innerHTML = txt
      ? '<text class="engname" id="eng-name" x="' + x + '" y="' + y +
        '" text-anchor="middle" style="font-size:' + size + 'px">' + esc(txt) + '</text>'
      : '';
    const el = document.getElementById('eng-name');
    if (el){
      try{
        const len = el.getComputedTextLength();
        if (len > maxW) el.style.fontSize = (size * maxW / len).toFixed(2) + 'px';
      }catch(_){}
    }
  }
  const el = document.getElementById('eng-name');
  if (el) el.classList.toggle('on', !!active);
}

export function esc(t){
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ---- 主指针：蓝钢针，压在小表盘与 3 点日期窗之上（最上层） ----
export function mainNeedle(value){
  const frac = clamp((num(value) || 0) / S.DECODE_MAX, 0, 1);
  const deg = frac * 360;
  const tip = pt(CX, CY, R_MAIN - 10, deg);
  const half = 2.8;
  const bL = pt(CX, CY, -18, deg - half);
  const bR = pt(CX, CY, -18, deg + half);
  const wL = pt(CX, CY, 30, deg - half * 1.15);
  const wR = pt(CX, CY, 30, deg + half * 1.15);
  const body = [tip, wR, bR, bL, wL];
  let s = '';
  s += '<g transform="translate(1.4 1.5)" opacity=".55"><path d="' + poly(body) + '" fill="#000"/></g>';
  s += '<path d="' + poly(body) + '" fill="url(#blueSteel)" stroke="' + S.THEME.needle.edge + '" stroke-width=".5" stroke-linejoin="round"/>';
  const g1 = pt(CX, CY, R_MAIN - 14, deg - 1.2), g2 = pt(CX, CY, 26, deg - 1.2);
  s += '<line x1="' + g1.x.toFixed(1) + '" y1="' + g1.y.toFixed(1) + '" x2="' + g2.x.toFixed(1) +
       '" y2="' + g2.y.toFixed(1) + '" stroke="' + S.THEME.needle.glow + '" stroke-opacity=".55" stroke-width=".7"/>';
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="5" fill="' + S.THEME.needle.axis + '" stroke="' + S.THEME.needle.stroke + '" stroke-width="1"/>';
  s += '<circle cx="' + CX + '" cy="' + CY + '" r="1.6" fill="' + S.THEME.needle.tip + '"/>';
  return s;
}
