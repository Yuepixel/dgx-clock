/* ═══════════════════════════════════════════════════════════════
   ▍状态中枢：所有跨模块共享的可变值只在此处的 S 上读写。
   ES module 的 import 绑定是只读的，直接给导入的 let 赋值会报错，
   所以原来 ui.html 里的全局 let 全部搬进 S。
   ═══════════════════════════════════════════════════════════════ */
export const S = {
  THEME: null,                 // 由 theme.js 载入内置 dgx（THEME_DEFAULT）
  CFG: null,
  CYCLE: [],                   // 旧配色轮换顺序（ui.html 回退页用；模块界面改用 FACE_ORDER）
  FACE: null,                  // 当前表盘 {id, layout, theme, name, short}
  FACES: {},                   // id → 表盘定义
  FACE_ORDER: [],              // 表盘轮换顺序（themes.json 的 faces 数组顺序）
  lastData: {},
  lastDotOk: true,
  /* 引擎 idle 判定：run<=0 且工作计数器一段时间不变 → 视为没有新数据 */
  lastWorkSig: '',
  lastWorkAt: 0,
  IDLE_MS: 1200,

  DECODE_MAX: 120,             // 大表盘满格 t/s（config.json → clock.decode_max）
  TTFT_MAX: 5000,              // 9 点位满格 ms（config.json → clock.ttft_max）
  E2E_MAX: 30000,              // 数据卡左上小环满格 ms（config.json → clock.e2e_max）
  POWER_MAX: 200,              // 数据卡功耗弧满格 W（config.json → clock.power_max）
  hist: { decode: [] },        // 数据卡曲线：最近 60 个 decode 采样（每秒）
  histAt: 0,

  /* ---- 无数据回落：decode / TTFT 从最后一次有效值用 2.2s 线性回到 0 ---- */
  DECAY_SECONDS: 2.2,
  decay: {
    decode: { shown: 0, active: false, rate: 0 },
    ttft: { shown: 0, active: false, rate: 0 },
  },
  animRaf: 0,
  animTs: 0,

  render: () => {},            // main.js 启动时挂 renderClock，供 theme.js 回调
};

export const SZ = 360, CX = 180, CY = 180;
export const R_OUT = 163;           // 表圈最外缘
export const R_FACE = 154;          // 盘面半径
export const R_MAIN = 146;          // 大刻度外缘
export const R_NUM = 130;           // 大刻度数字半径
export const R_SUB = 30;            // 小表盘半径
export const R_SUB_POS = 82;        // 小表盘圆心到大表盘圆心的距离
export const SUB_ANGLE = { gpu: 0, mem: 180, ttft: 270 };   // GPU 12点 / 内存 6点 / TTFT 9点
export const DATE_ANGLE = 90;                               // 并发窗 3点

/* 纯函数小工具（无状态，供各模块共用） */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const num = v => (v == null || v === '' || !isFinite(Number(v))) ? null : Number(v);
export const fmtInt = n => (n == null) ? '--' : Math.round(n).toLocaleString('en-US');
