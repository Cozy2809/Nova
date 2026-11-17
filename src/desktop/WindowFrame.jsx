import React, { useRef } from 'react';
import Icon from './Icon.jsx';

// Ventana interna: arrastrar por la cabecera (con ajuste a los bordes), redimensionar por la esquina, minimizar, maximizar, cerrar.
export default function WindowFrame({ w, active, area, dispatch, onSnapPreview, children }) {
  const drag = useRef(null);
  const start = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return; dispatch({ type: 'focus', id: w.id });
    const o = { dx: e.clientX - (w.max ? area.w / 2 : w.x), dy: e.clientY - (w.max ? 18 : w.y), moved: false };
    drag.current = o; e.currentTarget.setPointerCapture(e.pointerId);
  };
  const edge = (x, y) => (y < 6 ? 'top' : x < 6 ? 'left' : x > area.w - 6 ? 'right' : null);
  const move = (e) => {
    const o = drag.current; if (!o) return; const r = e.currentTarget.closest('.nd-area').getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
    o.moved = true; dispatch({ type: 'move', id: w.id, x: Math.round(Math.min(area.w - 80, Math.max(-w.w + 120, x - o.dx))), y: Math.round(Math.min(area.h - 36, Math.max(0, y - o.dy))) });
    onSnapPreview(edge(x, y));
  };
  const end = (e) => {
    const o = drag.current; drag.current = null; if (!o) return; const r = e.currentTarget.closest('.nd-area').getBoundingClientRect(); const side = edge(e.clientX - r.left, e.clientY - r.top);
    onSnapPreview(null); if (o.moved && side) dispatch({ type: 'snap', id: w.id, side, area });
  };
  const rs = useRef(null);
  const rsDown = (e) => { e.stopPropagation(); rs.current = { x: e.clientX, y: e.clientY, w: w.w, h: w.h }; e.currentTarget.setPointerCapture(e.pointerId); dispatch({ type: 'focus', id: w.id }); };
  const rsMove = (e) => { const o = rs.current; if (!o) return; dispatch({ type: 'resize', id: w.id, x: w.x, y: w.y, w: Math.min(area.w - w.x, o.w + e.clientX - o.x), h: Math.min(area.h - w.y, o.h + e.clientY - o.y) }); };
  const style = w.max ? { left: 0, top: 0, width: area.w, height: area.h, zIndex: w.z } : { left: w.x, top: w.y, width: w.w, height: w.h, zIndex: w.z };
  return (<section className="nd-win" style={{ ...style, display: w.min ? 'none' : 'flex' }} data-active={active ? 1 : 0} data-max={w.max ? 1 : 0} aria-label={w.title} onPointerDown={() => !active && dispatch({ type: 'focus', id: w.id })}>
    <div className="nd-wh" onPointerDown={start} onPointerMove={move} onPointerUp={end} onDoubleClick={() => dispatch({ type: 'toggleMax', id: w.id })}>
      <span className="t">{w.title}</span>
      <button className="nd-wbtn" aria-label="Minimizar ventana" onClick={() => dispatch({ type: 'minimize', id: w.id })}><Icon n="min" s={14} /></button>
      <button className="nd-wbtn" aria-label={w.max ? 'Restaurar ventana' : 'Maximizar ventana'} onClick={() => dispatch({ type: 'toggleMax', id: w.id })}><Icon n={w.max ? 'restore' : 'max'} s={13} /></button>
      <button className="nd-wbtn x" aria-label="Cerrar ventana" onClick={() => dispatch({ type: 'close', id: w.id })}><Icon n="close" s={14} /></button>
    </div>
    <div className="nd-wb">{children}</div>
    {!w.max && <div className="nd-rs" onPointerDown={rsDown} onPointerMove={rsMove} onPointerUp={() => { rs.current = null; }} aria-hidden="true" />}
  </section>);
}
