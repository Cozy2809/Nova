import React, { useCallback, useEffect, useState } from 'react';
import { nv } from './useNative.js';
import { Glyph } from './Glyph.jsx';

// Música del panel: una sola consulta compartida en el proceso principal (en caché unos segundos) y solo mientras el panel está visible.
// Funciona con cualquier reproductor que publique sesión multimedia en Windows (Spotify, navegador, Liner…).
export default function MusicCard() {
  const [m, setM] = useState(null), [msg, setMsg] = useState('');
  const load = useCallback(async (force) => { if (document.hidden) return; const r = await nv('media-get', { force: force === true }).catch(() => null); if (r && !r.error) setM(r); }, []);
  useEffect(() => {
    let on = true, t = null;
    const loop = () => { if (!on) return; load(); t = setTimeout(loop, 5000); };
    loop();
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { on = false; clearTimeout(t); document.removeEventListener('visibilitychange', vis); };
  }, [load]);
  const key = async (action) => { setMsg(''); const r = await nv('media-key', { action }).catch(() => null); if (r && r.error) setMsg(r.error); setTimeout(() => load(true), 900); };
  const openLiner = async () => { setMsg('Abriendo Liner…'); const r = await nv('liner-open').catch(() => null); setMsg(r && r.error ? r.error : 'Liner abierto. Si publica su reproducción, aparecerá aquí.'); setTimeout(() => load(true), 2500); };
  const cur = m && m.current;
  return <div className="nv-card nv-music">
    <h5><Glyph n="note" s={14} />Música{m && m.liner && <em className="nv-pill">Liner</em>}</h5>
    {cur && cur.title ? <div className="nv-track"><b title={cur.title}>{cur.title}</b><span>{[cur.artist, cur.album].filter(Boolean).join(' · ') || cur.app}</span>{cur.app && <small>{cur.app.replace(/\.exe$/i, '')}</small>}</div> : <div className="nd-mut">Nada suena ahora mismo.</div>}
    <div className="nv-media-btns">
      <button type="button" aria-label="Anterior" onClick={() => key('prev')}><Glyph n="prev" s={16} /></button>
      <button type="button" aria-label={cur && cur.playing ? 'Pausar' : 'Reproducir'} onClick={() => key('play_pause')}><Glyph n={cur && cur.playing ? 'pause' : 'play'} s={18} /></button>
      <button type="button" aria-label="Siguiente" onClick={() => key('next')}><Glyph n="next" s={16} /></button>
      <button type="button" className="nv-linkbtn" onClick={openLiner}>Abrir Liner</button>
    </div>
    {msg && <small className="nv-hint">{msg}</small>}
  </div>;
}
