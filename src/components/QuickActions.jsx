import React, { useState } from 'react';
import { APPS } from '../utils/apps.js';
// Botones de acceso rápido: abren aplicaciones de una lista fija
export default function QuickActions() {
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState('');
  const open = async (a) => {
    setBusy(a.id); setMsg({ t: `Abriendo ${a.label}…` });
    const r = await window.jarvis.openApp(a.id); setBusy('');
    setMsg(r.error ? { t: r.error, err: true } : { t: r.via === 'fallback' ? `${a.label} no está instalado; abierto en el navegador` : `${a.label} abierto` });
    setTimeout(() => setMsg(null), 4000);
  };
  return (<div className="panel">
    <h3 className="mb-2 tracking-widest text-sm">ACCESO RÁPIDO</h3>
    <div className="grid grid-cols-2 gap-2">{APPS.map(a => (
      <button key={a.id} className="btn text-xs text-left truncate" disabled={busy === a.id} onClick={() => open(a)} title={`Abrir ${a.label}`} aria-label={`Abrir ${a.label}`}>{a.label}</button>))}</div>
    <div className={`text-xs mt-2 h-4 ${msg?.err ? 'text-hud-red' : 'opacity-70'}`} role="status">{msg?.t}</div></div>);
}
