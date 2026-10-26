/* ═══════════════════════════════════════════════════════════════
   ▍回落状态机：没有数据时 decode / TTFT 从最后一次有效值缓缓回零，
   并用 requestAnimationFrame 逐帧重绘指针 / TTFT 进度环。
   ═══════════════════════════════════════════════════════════════ */
import { S, CX, CY, R_SUB, R_SUB_POS, SUB_ANGLE, clamp, num } from './state.js';
import { mainNeedle, subNeedle, pt, arc } from './dial.js';

export function ensureAnim(){
  if (!S.animRaf){ S.animTs = 0; S.animRaf = requestAnimationFrame(stepAnim); }
}

export function startDecay(key){
  const st = S.decay[key];
  if (st.active || st.shown <= 0) return;
  st.active = true;
  st.rate = st.shown / S.DECAY_SECONDS;
  ensureAnim();
}

export function decayed(key, raw, max){
  const st = S.decay[key];
  if (raw != null){
    st.shown = (max != null) ? clamp(raw, 0, max) : raw;
    st.active = false;         // 有新数据立刻接管，不做回弹
    return raw;
  }
  startDecay(key);
  return st.shown;
}

export function stepAnim(ts){
  S.animRaf = 0;
  const dt = S.animTs ? Math.min(0.05, (ts - S.animTs) / 1000) : 0.016;
  S.animTs = ts;
  let active = false;
  for (const key of ['decode', 'ttft']){
    const st = S.decay[key];
    if (!st.active) continue;
    st.shown = Math.max(0, st.shown - st.rate * dt);
    if (st.shown <= 0.001){ st.shown = 0; st.active = false; }
    else active = true;
  }
  updateNeedleVisuals();
  if (active) S.animRaf = requestAnimationFrame(stepAnim);
  else S.animTs = 0;
}

export function updateNeedleVisuals(){
  const nd = document.getElementById('live-needle');
  if (nd) nd.innerHTML = mainNeedle(S.decay.decode.shown);
  updateTtftVisual(S.decay.ttft.shown);
}

export function updateTtftVisual(shown){
  const p = pt(CX, CY, R_SUB_POS, SUB_ANGLE.ttft);
  const frac = clamp((num(shown) || 0) / S.TTFT_MAX, 0, 1);
  const arcEl = document.getElementById('ttft-arc');
  if (arcEl){
    arcEl.setAttribute('d', arc(p.x, p.y, R_SUB - 4.4, 0, frac * 300));
    arcEl.setAttribute('opacity', frac > 0.004 ? '1' : '0');
  }
  const tipEl = document.getElementById('ttft-tip');
  if (tipEl){
    const tip = pt(p.x, p.y, R_SUB - 4.4, frac * 300);
    tipEl.setAttribute('cx', tip.x.toFixed(2));
    tipEl.setAttribute('cy', tip.y.toFixed(2));
    tipEl.setAttribute('opacity', frac > 0.004 ? '1' : '0');
  }
  const nd = document.getElementById('ttft-needle');
  if (nd) nd.innerHTML = subNeedle(p.x, p.y, frac * 300, R_SUB);
}
