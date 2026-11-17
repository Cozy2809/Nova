import React, { useEffect, useRef, useState } from 'react';
import { createOrb } from '../utils/orbEngine.js';
// Orbe de audio futurista. Usa el volumen global (micrófono o voz de Nova), no un espectro FFT real.
const LABELS = { idle: 'EN ESPERA', listening: 'ESCUCHANDO', thinking: 'PENSANDO', speaking: 'HABLANDO', muted: 'MICRÓFONO SILENCIADO' };
export default function AudioOrb({ size = 200, big = false }) {
  const ref = useRef(null);
  const [label, setLabel] = useState('idle');
  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext('2d'), dpr = window.devicePixelRatio || 1;
    cv.width = size * dpr; cv.height = size * dpr; ctx.scale(dpr, dpr);
    const orb = createOrb(ctx, size, { reduce: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
    let state = 'idle', target = 0, last = performance.now(), raf;
    const offLevel = window.jarvis.onLevel?.((m) => { target = m.v; }) || (() => {});
    const onState = (e) => { state = e.detail; setLabel(state); if (state === 'idle' || state === 'thinking' || state === 'muted') target = 0; };
    window.addEventListener('jarvis-state', onState);
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) { last = now; return; } // sin dibujar si la ventana está oculta
      if (state === 'idle' && target < 0.02 && now - last < 33) return; // en espera: 30 fps, gasta menos CPU
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      orb.frame(dt, state, target);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); offLevel(); window.removeEventListener('jarvis-state', onState); };
  }, [size]);
  return (<div className="orb-wrap text-center">
    <canvas ref={ref} style={{ width: size, height: size }} className="mx-auto" aria-hidden="true" />
    <div className={'orb-label' + (big ? ' orb-label-big' : '')} role="status">{LABELS[label] || LABELS.idle}</div></div>);
}
