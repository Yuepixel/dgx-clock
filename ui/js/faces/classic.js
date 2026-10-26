/* ═══════════════════════════════════════════════════════════════
   ▍表盘 · 经典三眼（IWC 三眼日历表布局）
     · 大表盘刻度   = 实时 decode 速度（0–120 t/s，12 格每格 10）
     · 3 点位（日历位）= 并发窗：前两位当前并发 / 后两位上限（如 02 04）
     · 6 点位小表盘 = 内存占用 %
     · 9 点位小表盘 = 实时 TTFT 毫秒（0–5000）
     · 12 点位小表盘= GPU 利用率 %
   本模块只负责「怎么画」，数据/衰减由 main.js 统一算好放进 view。
   ═══════════════════════════════════════════════════════════════ */
import { S, CX, CY, R_SUB_POS, SUB_ANGLE, fmtInt } from '../state.js';
import {
  pt, dialDefs, mainDialStatic, subDial, dateWindow, mainNeedle, updateEngineLabel,
} from '../dial.js';

export const id = 'classic';
export const viewBox = '0 0 360 360';

export function defs(){
  return dialDefs();
}

export function staticSvg(){
  return mainDialStatic();
}

export function live(d, view){
  const run = view.run, lanes = view.lanes;
  const gpu = view.gpu, mem = view.mem, ttft = view.ttft;

  let s = '';
  s += subDial(pt(CX, CY, R_SUB_POS, SUB_ANGLE.gpu).x, pt(CX, CY, R_SUB_POS, SUB_ANGLE.gpu).y,
               { max:100, value:gpu, label:'GPU', fmt:v=>fmtInt(v), unit:'%', color:S.THEME.gpu });
  s += subDial(pt(CX, CY, R_SUB_POS, SUB_ANGLE.ttft).x, pt(CX, CY, R_SUB_POS, SUB_ANGLE.ttft).y,
               { max:S.TTFT_MAX, value:ttft, fracValue:view.shownTtft, id:'ttft', label:'TTFT',
                 fmt:v => (v == null) ? '--' : (v < 1000 ? Math.round(v) : (v/1000).toFixed(2)),
                 unit:(ttft != null && ttft >= 1000) ? 's' : 'ms',
                 color:S.THEME.ttft });
  s += subDial(pt(CX, CY, R_SUB_POS, SUB_ANGLE.mem).x, pt(CX, CY, R_SUB_POS, SUB_ANGLE.mem).y,
               { max:100, value:mem, label:'MEMORY', fmt:v=>fmtInt(v), unit:'%', color:S.THEME.mem });
  s += dateWindow(run, lanes);
  /* 指针必须最后画：3 点日期窗/DGX 标志在它下面，避免指针被遮住 */
  s += '<g id="live-needle">' + mainNeedle(view.shownDecode) + '</g>';
  return s;
}

/* 每秒数据层之外的动作：引擎名单独一层（呼吸动画不随每秒重绘重启）。 */
export function after(d, view){
  updateEngineLabel(d.engName || (d.eng && d.eng.model) || '', view.dataFresh && view.run > 0);
}
