import React, { useState } from 'react';
import Icon from '../Icon.jsx';
import { useMedia } from '../media.js';
import { fmtDur } from '../util.js';

export default function Media() {
  const M = useMedia(true); const [err, setErr] = useState(''); const [vol, setVol] = useState(null);
  const run = async (p) => setErr(await p);
  const c = M.cur, d = M.d, playing = c?.status === 'Playing';
  if (M.loading && !d) return <div className="nd-empty"><span className="nd-spin" />Consultando la reproducción…</div>;
  return (<div className="nd-pad">
    {d?.mediaErr && <div className="nd-note err" role="alert">No se pudo leer la reproducción: {d.mediaErr}</div>}
    {!d?.mediaErr && !c && <div className="nd-note">No hay ninguna sesión multimedia activa. Abre Spotify, el navegador u otro reproductor y vuelve aquí.</div>}
    {c && (<div className="nd-card">
      <div style={{ fontSize: 17, fontWeight: 600 }}>{c.title || 'Sin título'}</div>
      <div className="nd-mut">{c.artist || 'Artista desconocido'}{c.album ? ' · ' + c.album : ''}</div>
      <div className="nd-mut" style={{ fontSize: 11.5 }}>{c.id}</div>
      {c.durationSec > 0 ? (<><div className="nd-prog" role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(c.durationSec)} aria-valuenow={Math.round(M.pos)}><i style={{ width: Math.min(100, (M.pos / c.durationSec) * 100) + '%' }} /></div>
        <div className="nd-row nd-mut" style={{ justifyContent: 'space-between', fontVariantNumeric: 'tabular-nums' }}><span>{fmtDur(M.pos)}</span><span>{fmtDur(c.durationSec)}</span></div></>) : <div className="nd-mut" style={{ fontSize: 12 }}>Esta aplicación no informa del progreso.</div>}
      <div className="nd-row" style={{ justifyContent: 'center' }}>
        <button className="nd-btn ico" aria-label="Canción anterior" disabled={!c.canPrev} onClick={() => run(M.act('prev'))}><Icon n="prev" s={18} /></button>
        <button className="nd-btn pri ico" style={{ width: 40, height: 40 }} aria-label={playing ? 'Pausar' : 'Reproducir'} disabled={playing ? !c.canPause : !c.canPlay} onClick={() => run(M.act('toggle'))}><Icon n={playing ? 'pause' : 'play'} s={20} /></button>
        <button className="nd-btn ico" aria-label="Siguiente canción" disabled={!c.canNext} onClick={() => run(M.act('next'))}><Icon n="next" s={18} /></button>
      </div></div>)}
    {d?.sessions?.length > 1 && <div className="nd-mut" style={{ fontSize: 12 }}>{d.sessions.length} sesiones activas; los controles actúan sobre la actual.</div>}
    <div className="nd-card">
      <div className="nd-row"><Icon n={d?.vol?.muted ? 'mute' : 'vol'} s={18} /><b className="nd-grow">Volumen</b>
        {d?.vol && <button className="nd-btn" onClick={() => run(M.mute(!d.vol.muted))}>{d.vol.muted ? 'Reactivar sonido' : 'Silenciar'}</button>}</div>
      {d?.vol ? (<div className="nd-row"><input type="range" min="0" max="100" className="nd-grow" aria-label="Volumen del sistema" value={vol ?? d.vol.level} onChange={(e) => setVol(Number(e.target.value))} onPointerUp={() => { const v = vol; setVol(null); if (v != null) run(M.setVol(v)); }} onKeyUp={() => { const v = vol; setVol(null); if (v != null) run(M.setVol(v)); }} /><span style={{ width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{vol ?? d.vol.level} %</span></div>)
        : <div className="nd-note warn">No se puede leer el volumen: {d?.volErr || 'sin datos'}</div>}
    </div>
    {err && <div className="nd-note err" role="alert">{err}</div>}
  </div>);
}
