/* ═══════════════════════════════════════════════════════════════
   ▍温度外圈：语义色，不参与主题配色（阈值/颜色在 themes.json 的 temperature 节点）
   ═══════════════════════════════════════════════════════════════ */
import { S, clamp } from './state.js';

export function mixHex(a, b, f){
  const A = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const B = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * f)).join(',') + ')';
}

/* 温度三锚点：
     warn（默认 55）以下 = 纯主题色；
     warn → warmAt（62）快速转暖（sqrt 缓入，刚过热区就明显）；
     warmAt → hot（80）暖色 → 砖红；
     hot 以上 = 砖红。
   阈值/颜色都在 themes.json 的 temperature 节点。 */
export function temperatureLimits(){
  const cfg = S.CFG && S.CFG.temperature;
  if (!cfg || cfg.enabled === false) return null;
  let warn = Number(cfg.warn), warmAt = Number(cfg.warmAt), hot = Number(cfg.hot);
  if (!Number.isFinite(warn)) warn = 55;
  if (!Number.isFinite(warmAt) || warmAt <= warn) warmAt = warn + 7;
  if (!Number.isFinite(hot) || hot <= warmAt) hot = warmAt + 18;
  return { cfg, warn, warmAt, hot };
}

export function temperatureColor(t){
  const lim = temperatureLimits();
  if (!lim) return null;
  const v = Number(t);
  if (!Number.isFinite(v)) return null;
  const cfg = lim.cfg;
  const isHex = s => /^#[0-9a-f]{6}$/i.test(String(s || ''));

  if (cfg.mode === 'fixed'){
    const stops = (Array.isArray(cfg.stops) ? cfg.stops : [])
      .map(s => ({ t: Number(s && s.t), c: String((s && s.color) || '') }))
      .filter(s => Number.isFinite(s.t) && isHex(s.c))
      .sort((a, b) => a.t - b.t);
    if (!stops.length) return null;
    if (v <= stops[0].t) return stops[0].c;
    for (let i = 1; i < stops.length; i++){
      const a = stops[i - 1], b = stops[i];
      if (v <= b.t) return mixHex(a.c, b.c, (v - a.t) / (b.t - a.t));
    }
    return stops[stops.length - 1].c;
  }

  const base = isHex(S.THEME.brand) ? S.THEME.brand : '#76B900';
  const warm = isHex(cfg.warmColor) ? cfg.warmColor : '#D98F4E';
  const hot  = isHex(cfg.hotColor) ? cfg.hotColor : '#C05B4D';
  if (v <= lim.warn) return base;
  if (v <= lim.warmAt){
    const f = Math.sqrt(clamp((v - lim.warn) / (lim.warmAt - lim.warn), 0, 1));
    return mixHex(base, warm, f);
  }
  if (v <= lim.hot){
    return mixHex(warm, hot, clamp((v - lim.warmAt) / (lim.hot - lim.warmAt), 0, 1));
  }
  return hot;
}

/* 0（不热）… 1（hot）：只用于环的粗细/亮度，颜色由 temperatureColor 决定。 */
export function temperatureHeat(t){
  const lim = temperatureLimits();
  if (!lim) return 0;
  const v = Number(t);
  if (!Number.isFinite(v)) return 0;
  return Math.sqrt(clamp((v - lim.warn) / (lim.hot - lim.warn), 0, 1));
}

export function updateTempRing(temp){
  const el = document.getElementById('temp-ring');
  if (!el) return;
  const color = temperatureColor(temp);
  if (!color){
    el.style.opacity = '0';
    return;
  }
  const cfg = S.CFG && S.CFG.temperature;
  const ring = (cfg && cfg.ring && typeof cfg.ring === 'object') ? cfg.ring : {};
  const width = Number(ring.width);
  const opacity = Number(ring.opacity);
  const w0 = Number.isFinite(width) ? clamp(width, .5, 4) : 1.6;
  const o0 = Number.isFinite(opacity) ? clamp(opacity, 0, 1) : .75;
  const heat = temperatureHeat(temp);      // 越热：环略变粗、变亮
  el.setAttribute('stroke-width', (w0 * (1 + 0.4 * heat)).toFixed(2));
  el.style.stroke = color;
  el.style.opacity = String(Math.min(1, o0 + (0.95 - o0) * heat));
}
