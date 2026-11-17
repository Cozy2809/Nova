import React, { useEffect, useRef, useState } from 'react';
import { createMascot } from '../utils/mascotEngine.js';
// Mascota neón: saluda, mueve la boca cuando JARVIS habla, escucha, piensa, juega cuando hay inactividad y se duerme.
const W = 320, H = 150;
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'];
export default function Mascot() {
  const ref = useRef(null);
  const [on, setOn] = useState(true);
  useEffect(() => { window.jarvis.getSettings?.().then((s) => setOn(s.mascotOn !== 'false')).catch(() => {}); }, []);
  const toggle = () => { const v = !on; setOn(v); window.jarvis.setSettings?.({ mascotOn: v }); };
  useEffect(() => {
    if (!on) return;
    const cv = ref.current, ctx = cv.getContext('2d'), dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);
    const m = createMascot(ctx, W, H, { reduce: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
    let state = 'idle', tts = 0, mic = 0, active = false, last = performance.now(), acc = 0, raf;
    const offLvl = window.jarvis.onLevel?.((e) => { if (e.mode === 'tts') tts = e.v; else mic = e.v; }) || (() => {});
    const onState = (e) => { state = e.detail; if (state !== 'idle') active = true; };
    const act = () => { active = true; };
    window.addEventListener('jarvis-state', onState);
    EVENTS.forEach((ev) => window.addEventListener(ev, act, { passive: true }));
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (document.hidden) return; // sin dibujar con la ventana oculta
      acc += dt; if (acc < 1 / 30) return; // 30 fps: gasta poco
      m.tick(acc, { state, tts, mic, active }); acc = 0; active = false;
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); offLvl(); window.removeEventListener('jarvis-state', onState); EVENTS.forEach((ev) => window.removeEventListener(ev, act)); };
  }, [on]);
  return (<div className="panel">
    <div className="flex justify-between items-center mb-1">
      <span className="text-xs tracking-widest opacity-70">MASCOTA</span>
      <button className="btn text-xs" onClick={toggle} aria-pressed={on} title="Mostrar u ocultar la mascota">{on ? 'OCULTAR' : 'MOSTRAR'}</button></div>
    {on && <canvas ref={ref} role="img" aria-label="Mascota de JARVIS" style={{ width: '100%', height: 'auto', aspectRatio: `${W} / ${H}` }} />}</div>);
}
