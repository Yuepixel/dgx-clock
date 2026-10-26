/* ═══════════════════════════════════════════════════════════════
   ▍窗口外壳：状态栏时钟 / 8 向拖拽缩放 / 标题栏按钮（Electron IPC）
   ═══════════════════════════════════════════════════════════════ */

export function tickClock(){
  const d = new Date();
  const p2 = n => String(n).padStart(2, '0');
  const el = document.getElementById('status');
  if (el) el.textContent = p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
}

// ---- 无边框窗口：8 向拖拽缩放（Electron IPC）----
export function initResize(){
  if (!window.dgx) return;
  document.querySelectorAll('.rz, .grip').forEach(el => {
    el.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      const dir = el.dataset.dir || 'se';
      window.dgx.resizeStart(dir);
      const sx = ev.screenX, sy = ev.screenY;
      let raf = 0, dx = 0, dy = 0, pending = false, started = false;
      const flush = () => { pending = false; window.dgx.resizeMove(dx, dy); };
      const onMove = e => {
        if (e.buttons === 0) return;              // 鼠标已松开（比如在窗外抬起）
        dx = e.screenX - sx;
        dy = e.screenY - sy;
        if (!started){
          if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;   // 3px 起步，避免误缩
          started = true;
        }
        if (!pending){ pending = true; raf = requestAnimationFrame(flush); }
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        window.removeEventListener('blur', onUp);
        if (raf) cancelAnimationFrame(raf);
        window.dgx.resizeEnd();
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
      window.addEventListener('blur', onUp);
      try{ el.setPointerCapture(ev.pointerId); }catch(_){}
    });
  });
}

// ---- 标题栏按钮 ----
export function initShell(){
  const pin = document.getElementById('btn-pin');
  const close = document.getElementById('btn-close');

  close.addEventListener('click', () => {
    if (window.dgx) window.dgx.close();
    else window.close();
  });

  (async () => {
    try{
      const st = await window.dgx.getState();
      pin.classList.toggle('off', !st.on_top);
    }catch(_){}
  })();

  pin.addEventListener('click', async () => {
    const next = pin.classList.contains('off');   // 当前 off → 点开后置顶
    try{
      const r = await window.dgx.setTop(next);
      pin.classList.toggle('off', !(r && r.on_top));
    }catch(_){}
  });

  initResize();
}
