/* ═══════════════════════════════════════════════════════════════
   ▍表盘 · 数据卡（仿智能手表信息脸）
     顶部：DGX / 日期 / 大时间 / RUN|MAX
     中央：DECODE 曲线卡（0–decode_max，最近 60s，当前值 + 均值）
     两侧：左竖弧 POWER W / 右竖弧 TTFT
     下排：GPU 小环 / TOKENS·CTX 胶囊 / MEM 小环
     底部：温度弧（沿用三锚点语义色）+ 引擎名
   数据/回落由 main.js 统一算好放进 view，本模块只负责画。
   ═══════════════════════════════════════════════════════════════ */
import { S, clamp, num, fmtInt } from '../state.js';
import { pt, arc, dialDefs, updateEngineLabel } from '../dial.js';

export const id = 'card';
export const viewBox = '0 0 360 400';
const CCX = 180, CCY = 190;

const p2 = n => String(n).padStart(2, '0');
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
function clockTexts(){
  const d = new Date();
  return {
    time: p2(d.getHours()) + ':' + p2(d.getMinutes()),
    date: '周' + WEEK[d.getDay()] + ' ' + d.getDate(),
  };
}
function compact(n){
  n = Number(n);
  if (!Number.isFinite(n)) return '--';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}
/* 生成 tokens 暂时不在数据卡显示（位置让给并发柱状图），保留格式化工具备用。 */
function fmtTtft(v){
  v = Number(v);
  if (!Number.isFinite(v)) return '--';
  return v < 1000 ? Math.round(v) + 'ms' : (v / 1000).toFixed(2) + 's';
}

export function defs(){
  const cd = S.THEME.card || {};
  return dialDefs() +
    '<linearGradient id="cardFill" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + (cd.bg1 || 'rgba(20,28,40,.80)') + '"/>' +
      '<stop offset="100%" stop-color="' + (cd.bg2 || 'rgba(5,8,12,.74)') + '"/>' +
    '</linearGradient>' +
    /* 温度弧固定彩虹：左低（蓝）→ 右高（红），游标指示当前温度 */
    '<linearGradient id="tempRainbow" gradientUnits="userSpaceOnUse" x1="120" y1="322" x2="240" y2="322">' +
      '<stop offset="0%" stop-color="#2F7BFF"/>' +
      '<stop offset="20%" stop-color="#25D9FF"/>' +
      '<stop offset="40%" stop-color="#2BFF88"/>' +
      '<stop offset="60%" stop-color="#E8FF3E"/>' +
      '<stop offset="80%" stop-color="#FF8A1E"/>' +
      '<stop offset="100%" stop-color="#FF3B30"/>' +
    '</linearGradient>';
}

/* 二次贝塞尔取点（温度弧 M120 322 Q180 344 240 322） */
function bezier(p0, p1, p2, t){
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function tempRange(){
  const t = (S.CFG && S.CFG.temperature) || {};
  const lo = Number(t.arcMin), hi = Number(t.arcMax);
  return { lo: Number.isFinite(lo) ? lo : 30, hi: Number.isFinite(hi) && hi > lo ? hi : 90 };
}

/* 数据卡取色：优先主题的 card 专用色，缺省退回品牌/角色色（旧配色兼容） */
const C = (k, fallback) => (S.THEME.card && S.THEME.card[k]) || fallback || S.THEME.brand;

export function staticSvg(){
  let s = '';
  // 表壳 / 盘面（与经典脸同一套材质，只是中心下移、内容不同）
  s += '<circle cx="' + CCX + '" cy="' + CCY + '" r="' + (163 + 1) + '" fill="#05070a" filter="url(#caseShadow)"/>';
  s += '<circle cx="' + CCX + '" cy="' + CCY + '" r="163" fill="' + S.THEME.face[2] + '"/>';
  s += '<circle cx="' + CCX + '" cy="' + CCY + '" r="154" fill="url(#dialFace)"/>';
  s += '<circle cx="' + CCX + '" cy="' + CCY + '" r="154" fill="#8899aa" opacity=".055" filter="url(#grain)"/>';
  s += '<circle cx="' + CCX + '" cy="' + CCY + '" r="154" fill="url(#dialSheen)" opacity=".65"/>';
  s += '<circle cx="' + CCX + '" cy="' + CCY + '" r="154" fill="url(#dialGloss)"/>';
  s += '<circle cx="' + CCX + '" cy="' + CCY + '" r="154" fill="url(#vignette)"/>';

  // 表圈
  s += '<circle cx="' + CCX + '" cy="' + CCY + '" r="159.2" fill="none" stroke="url(#bezelMetal)" stroke-width="7.4"/>';
  s += '<circle cx="' + CCX + '" cy="' + CCY + '" r="163" fill="none" stroke="rgba(0,0,0,.92)" stroke-width="1"/>';
  s += '<circle cx="' + CCX + '" cy="' + CCY + '" r="161.3" fill="none" stroke="url(#rimLight)" stroke-width="1.05"/>';
  s += '<circle cx="' + CCX + '" cy="' + CCY + '" r="156.2" fill="none" stroke="rgba(0,0,0,.78)" stroke-width="1.5"/>';
  s += '<circle cx="' + CCX + '" cy="' + CCY + '" r="155.1" fill="none" stroke="rgba(210,225,240,.16)" stroke-width=".6"/>';

  // 细分钟刻度（60 格，不写数字，给内容让位）
  const cd = S.THEME.card || {};
  const tick = cd.tick || 'rgba(190,205,222,.42)';
  const tickDim = cd.tickDim || 'rgba(150,165,182,.22)';
  for (let i = 0; i < 60; i++){
    const deg = i * 6, maj = (i % 5 === 0);
    const p1 = pt(CCX, CCY, 152.2, deg), p2 = pt(CCX, CCY, 152.2 - (maj ? 6.2 : 3.4), deg);
    s += '<line x1="' + p1.x.toFixed(2) + '" y1="' + p1.y.toFixed(2) +
         '" x2="' + p2.x.toFixed(2) + '" y2="' + p2.y.toFixed(2) +
         '" stroke="' + (maj ? tick : tickDim) +
         '" stroke-width="' + (maj ? 1.4 : .9) + '" stroke-linecap="round"/>';
  }

  // 顶部：DGX 居中，日期/时间缩小放右上（并发窗移到卡下方）
  s += '<text class="cdbrand" x="' + CCX + '" y="70" text-anchor="middle">DGX</text>';

  // 左上小环（E2E 端到端延迟）——整体离表圈留空隙
  s += '<circle cx="90" cy="94" r="14" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="3"/>';
  s += '<text class="cdringlbl" x="90" y="86" text-anchor="middle">E2E</text>';

  // 中央曲线卡（收窄 + 压矮）
  s += '<rect class="cdcard" x="80" y="112" width="200" height="112" rx="14" fill="url(#cardFill)"/>';
  s += '<text class="cdlbl" x="94" y="130">DECODE</text>';
  s += '<text class="cdaxis" x="272" y="176" text-anchor="start">' + S.DECODE_MAX + '</text>';
  s += '<text class="cdaxis" x="272" y="214" text-anchor="start">0</text>';
  s += '<text class="cdtimeaxis" x="94" y="222">-60s</text>';
  s += '<text class="cdtimeaxis" x="266" y="222" text-anchor="end">now</text>';

  // 两侧竖弧（沿表圈内侧，留 10 单位空隙）
  s += '<path d="' + arc(CCX, CCY, 144, 250, 290) + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="4.2" stroke-linecap="round"/>';
  s += '<path d="' + arc(CCX, CCY, 144, 70, 110) + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="4.2" stroke-linecap="round"/>';

  // 下排：左右小环底轨 + 中间并发柱状窗
  s += '<circle cx="82" cy="276" r="17" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="3.4"/>';
  s += '<circle cx="278" cy="276" r="17" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="3.4"/>';
  s += '<rect class="cdpill" x="120" y="234" width="120" height="52" rx="12"/>';
  s += '<text class="cdpilllbl" x="128" y="246">RUN</text>';
  for (let i = 0; i < 4; i++){
    s += '<rect x="' + (142 + i * 22) + '" y="270" width="10" height="8" rx="2.5" fill="rgba(255,255,255,.14)"/>';
  }

  // 温度弧（固定彩虹；游标在 after 里平滑滑动）
  s += '<path id="card-temp" class="cdtemp" d="M 120 322 Q 180 344 240 322" stroke="url(#tempRainbow)" opacity="0"/>';
  s += '<g id="card-temp-dot" opacity="0" transform="translate(120 322)" ' +
       'style="transition:opacity .3s ease">' +
       '<circle class="cdtempdot" r="3.8"/></g>';
  s += '<text class="cdtempval" id="card-temp-v" x="180" y="316" text-anchor="middle" opacity="0">--</text>';

  return s;
}

export function live(d, view){
  const hist = (S.hist.decode || []).slice(-60);
  const dec = num(view.decode);
  const decTxt = dec == null ? '--' : (Math.round(dec * 10) / 10).toFixed(1);
  const avg = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : null;

  let s = '';
  const t = clockTexts();
  s += '<text class="cddate" x="252" y="76" text-anchor="end">' + t.date + '</text>';
  s += '<text class="cdtime" x="252" y="96" text-anchor="end">' + t.time + '</text>';

  const run = Math.round(view.run || 0), lanes = Math.round(view.lanes || 4);

  s += '<text class="cdval" x="94" y="158">' + decTxt + '</text>';
  s += '<text class="cdunit" x="94" y="168">t/s</text>';
  s += '<text class="cdavg" x="266" y="130" text-anchor="end">AVG ' + (avg == null ? '--' : avg.toFixed(1)) + '</text>';

  // 曲线：固定 60 槽，从右往左排；不足 60 点时靠右显示
  const x0 = 94, x1 = 266, y0 = 172, y1 = 214;
  if (hist.length){
    const step = (x1 - x0) / 59;
    const off = 60 - hist.length;
    const pts = hist.map((v, i) => {
      const x = x0 + (i + off) * step;
      const y = y1 - clamp((Number(v) || 0) / S.DECODE_MAX, 0, 1) * (y1 - y0);
      return [x, y];
    });
    let line = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
    s += '<path class="cdarea" d="' + line + ' L' + x1.toFixed(1) + ' ' + y1 + ' L' + x0.toFixed(1) + ' ' + y1 + ' Z"/>';
    s += '<path class="cdline" d="' + line + '"/>';
    const lp = pts[pts.length - 1];
    s += '<circle cx="' + lp[0].toFixed(1) + '" cy="' + lp[1].toFixed(1) + '" r="2" fill="' + C('line') + '"/>';
  } else {
    s += '<line x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '" class="cdline" opacity=".35"/>';
  }

  // 两侧真弧：左 POWER 从下往上，右 TTFT 从下往上
  const pFrac = clamp((num(view.power) || 0) / S.POWER_MAX, 0, 1);
  const tFrac = clamp((num(view.ttft) || 0) / S.TTFT_MAX, 0, 1);
  s += '<path id="card-pwr-bar" d="' + arc(CCX, CCY, 144, 250, 250 + pFrac * 40) +
       '" fill="none" stroke="' + C('power', S.THEME.gpu.ring) + '" stroke-width="4.2" stroke-linecap="round"/>';
  s += '<path id="card-ttft-bar" d="' + arc(CCX, CCY, 144, 110 - tFrac * 40, 110) +
       '" fill="none" stroke="' + C('ttft', S.THEME.ttft.ring) + '" stroke-width="4.2" stroke-linecap="round"/>';
  s += '<text class="cdbarrot" x="58" y="186" text-anchor="middle">POWER</text>';
  s += '<text class="cdbarval" x="58" y="194" text-anchor="middle">' +
       (view.power == null ? '--' : Math.round(view.power) + 'W') + '</text>';
  s += '<text class="cdbarrot" x="302" y="186" text-anchor="middle">TTFT</text>';
  s += '<text class="cdbarval" x="302" y="194" text-anchor="middle">' + fmtTtft(view.ttft) + '</text>';

  // 左上小环：E2E 端到端
  const e2e = num(view.e2e);
  const eFrac = clamp((e2e || 0) / S.E2E_MAX, 0, 1);
  if (eFrac > 0.004){
    s += '<path d="' + arc(90, 94, 14, 0, eFrac * 300) + '" fill="none" stroke="' + C('e2e') +
         '" stroke-width="3" stroke-linecap="round"/>';
  }
  s += '<text class="cdringval" x="90" y="97" text-anchor="middle">' + fmtE2e(e2e) + '</text>';

  // 下排小环
  s += miniRing(82, 276, 'GPU', view.gpu, '%', C('gpu', S.THEME.gpu.ring));
  s += miniRing(278, 276, 'MEM', view.mem, '%', C('mem', S.THEME.mem.ring));

  // 并发柱状窗：4 格细柱，点亮数量 = run（上限 4），颜色随负载绿→红
  s += '<text class="cdpillval" x="232" y="246" text-anchor="end">' + run + '/' + lanes + '</text>';
  const barColor = loadColor(run, lanes);
  for (let i = 0; i < 4; i++){
    const on = i < Math.min(run, 4);
    s += '<rect x="' + (142 + i * 22) + '" y="' + (on ? 254 : 270) + '" width="10" height="' +
         (on ? 24 : 8) + '" rx="2.5" fill="' + (on ? barColor : 'rgba(255,255,255,.14)') + '"/>';
  }

  // 温度游标：沿固定彩虹弧按 30–90°C（可配）滑动（在 after 里更新 transform）

  return s;
}

function fmtE2e(v){
  v = Number(v);
  if (!Number.isFinite(v)) return '--';
  return v < 10000 ? (v / 1000).toFixed(1) + 's' : Math.round(v / 1000) + 's';
}

/* 并发柱颜色：1 路绿 → 4 路红，中间按 (run-1)/(lanes-1) 连续过渡。
   只影响柱子本身，卡片/面板底色不动。 */
function loadColor(run, lanes){
  const n = Math.max(1, Math.round(lanes) || 4);
  const r = Math.min(Math.max(Math.round(run) || 1, 1), n);
  const t = n <= 1 ? 1 : (r - 1) / (n - 1);
  const hue = 140 * (1 - t);             // 140° 绿 → 0° 红
  return 'hsl(' + hue.toFixed(0) + ' 100% 58%)';
}

function miniRing(cx, cy, label, val, unit, color){
  const v = num(val);
  const frac = clamp((v || 0) / 100, 0, 1);
  let s = '';
  if (frac > 0.004){
    s += '<path d="' + arc(cx, cy, 17, 0, frac * 300) + '" fill="none" stroke="' + color +
         '" stroke-width="3.4" stroke-linecap="round"/>';
  }
  s += '<text class="cdringlbl" x="' + cx + '" y="' + (cy - 8) + '" text-anchor="middle">' + label + '</text>';
  s += '<text class="cdringval" x="' + cx + '" y="' + (cy + 3) + '" text-anchor="middle">' +
       (v == null ? '--' : fmtInt(v)) + '</text>';
  s += '<text class="cdringlbl" x="' + cx + '" y="' + (cy + 10) + '" text-anchor="middle">' + unit + '</text>';
  return s;
}

/* 沿二次贝塞尔弧把游标从 fromT 动画到 toT（游标入场/温度变化共用） */
function animateDot(dot, fromT, toT, dur){
  if (dot.__raf) cancelAnimationFrame(dot.__raf);
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);          // easeOutCubic
    const tt = fromT + (toT - fromT) * e;
    const p = bezier({ x: 120, y: 322 }, { x: 180, y: 344 }, { x: 240, y: 322 }, tt);
    dot.setAttribute('transform', 'translate(' + p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ')');
    dot.__t = tt;
    if (k < 1) dot.__raf = requestAnimationFrame(step);
    else { dot.__t = toT; dot.__raf = 0; }
  };
  dot.__raf = requestAnimationFrame(step);
}

export function after(d, view){
  updateEngineLabel(d.engName || (d.eng && d.eng.model) || '', view.dataFresh && view.run > 0,
                    { y: 306, size: 17, maxWidth: 200 });

  const t = num(view.temp);
  const el = document.getElementById('card-temp');
  const tv = document.getElementById('card-temp-v');
  const dot = document.getElementById('card-temp-dot');
  const on = Number.isFinite(t);
  if (el) el.style.opacity = on ? '1' : '0';
  if (dot){
    if (on){
      const r = tempRange();
      const tt = clamp((t - r.lo) / (r.hi - r.lo), 0, 1);
      dot.style.opacity = '1';
      if (dot.dataset.ready !== '1'){
        /* 首次：从彩虹弧最左端（低温端）沿弧滑入 */
        dot.dataset.ready = '1';
        dot.__t = 0;
        animateDot(dot, 0, tt, 700);
      } else if (dot.__t == null || Math.abs(dot.__t - tt) > 0.002){
        animateDot(dot, dot.__t == null ? 0 : dot.__t, tt, 500);
      }
    } else {
      if (dot.__raf){ cancelAnimationFrame(dot.__raf); dot.__raf = 0; }
      dot.style.opacity = '0';
      dot.dataset.ready = '';
      dot.__t = null;
    }
  }
  if (tv){
    if (on){ tv.textContent = Math.round(t) + '°C'; tv.style.opacity = '1'; }
    else tv.style.opacity = '0';
  }
}
