import React, { useEffect, useRef, useState } from 'react';
import { nv } from '../utils/nova.js';
// Insignia «escuchando música» (esquina inferior derecha) y vista previa de la última foto
export default function Overlays() {
  const [m, setM] = useState({ playing: false, label: '' }); const [photo, setPhoto] = useState(null); const timer = useRef(0);
  useEffect(() => {
    const a = (e) => setM(e.detail || {});
    const b = (e) => { setPhoto(e.detail); clearTimeout(timer.current); timer.current = setTimeout(() => setPhoto(null), 14000); };
    window.addEventListener('nova-music', a); window.addEventListener('nova-photo', b);
    return () => { window.removeEventListener('nova-music', a); window.removeEventListener('nova-photo', b); clearTimeout(timer.current); };
  }, []);
  return (<>
    {m.playing && <div className="chip-music" role="status"><span className="eqbars"><i /><i /><i /><i /></span><span className="truncate">{m.label ? '♪ ' + m.label : '♪ Escuchando música'}</span></div>}
    {photo && <div className="photo-toast panel">
      {photo.thumb && <img src={photo.thumb} alt="Foto hecha por Nova" />}
      <div className="flex gap-2 mt-2"><button className="btn" onClick={() => nv('file:open', { path: photo.path })}>ABRIR</button><button className="btn" onClick={() => nv('file:open', { path: photo.path, reveal: true })}>CARPETA</button><button className="btn" onClick={() => setPhoto(null)}>✕</button></div></div>}
  </>);
}
