/* ═══════════════════════════════════════════════════════════════
   ▍数据入口：clock_server.py 的 /metrics（与 dashboard 同构）
     · loadClockConfig：config.json 的 clock 节点 → 表盘行为参数
     · pickMetrics：从 get_metrics() 里挑出本表需要的字段
     · markFreshness：引擎 idle 判定（run<=0 且工作计数器一段时间不变 → 无新数据）
   ═══════════════════════════════════════════════════════════════ */
import { S, num } from './state.js';

/* 表盘行为参数来自 config.json 的 clock 节点；服务不可用/字段缺失就用内置默认。 */
export async function loadClockConfig(){
  try{
    const r = await fetch('/config', { cache:'no-store' });
    if (!r.ok) return;
    const c = (await r.json()).clock || {};
    const pos = v => Number.isFinite(Number(v)) && Number(v) > 0;
    if (pos(c.decode_max)) S.DECODE_MAX = Number(c.decode_max);
    if (pos(c.ttft_max)) S.TTFT_MAX = Number(c.ttft_max);
    if (pos(c.e2e_max)) S.E2E_MAX = Number(c.e2e_max);
    if (pos(c.power_max)) S.POWER_MAX = Number(c.power_max);
    if (pos(c.decay_seconds)) S.DECAY_SECONDS = Number(c.decay_seconds);
    if (pos(c.idle_ms)) S.IDLE_MS = Number(c.idle_ms);
  }catch(_){}
}

// 从 get_metrics() 里挑出本表需要的字段
export function pickMetrics(m){
  const meta = (m && m.hosts_meta) || [];
  const hosts = (m && m.hosts) || {};
  let eng = {}, gpu = null, mem = null, temp = null, power = null;
  meta.forEach(h => {
    const mm = hosts[h.id] || {}, L = mm.latest || {};
    if (h.engine !== 'none' && mm.connected && L.eng && L.eng.ok) eng = L.eng;
    const u = num(L.util); if (u != null) gpu = (gpu == null) ? u : Math.max(gpu, u);
    const mt = num(L.mem_total), mu = num(L.mem_used);
    if (mt) { const f = mu / mt * 100; mem = (mem == null) ? f : Math.max(mem, f); }
    const t = num(L.temp); if (t != null) temp = (temp == null) ? t : Math.max(temp, t);
    const p = num(L.power); if (p != null) power = (power == null) ? p : Math.max(power, p);
  });
  return { eng, gpu, mem, temp, power, gen: num(eng.gen) };
}

export function markFreshness(d){
  const e = d && d.eng;
  if (!e || !e.ok){
    d.stale = true;
    return d;
  }
  const run = num(e.run) || 0;
  const sig = [e.gen, e.prompt, e.done, e.rounds, e.ttft_count, e.lat_count].join('|');
  const now = Date.now();
  if (run > 0 || sig !== S.lastWorkSig){
    S.lastWorkSig = sig;
    S.lastWorkAt = now;
  }
  /* run=0 且 1.2s 内没有任何工作计数变化 → 没有新数据，开始回落 */
  d.stale = run <= 0 && (now - S.lastWorkAt) > S.IDLE_MS;
  return d;
}
