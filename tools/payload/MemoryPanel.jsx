import React, { useEffect, useState } from 'react';
export default function MemoryPanel() {
  const [q, setQ] = useState(''); const [rows, setRows] = useState([]); const [sure, setSure] = useState(false);
  const load = async () => setRows(q ? await window.jarvis.memSearch(q) : (await window.jarvis.memHistory()).reverse());
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 3000); return () => clearInterval(t); }, [q]);
  // Confirmación en dos pasos dentro de la app (sin diálogo nativo, que quita el foco del teclado en Electron)
  const clear = async () => {
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 3000); return; }
    await window.jarvis.memClear(); window.dispatchEvent(new Event('jarvis-clear')); setSure(false); load();
  };
  return (<div className="panel h-64 shrink-0 flex flex-col">
    <div className="flex justify-between items-center"><h3 className="tracking-widest">MEMORIA</h3>
      <button className="btn text-xs" onClick={clear}>{sure ? '¿SEGURO? PULSA OTRA VEZ' : 'BORRAR'}</button></div>
    <input className="bg-transparent border border-hud-dim px-2 my-1 outline-none" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en memoria" />
    <div className="flex-1 min-h-0 overflow-y-auto text-xs space-y-1 pr-1">{rows.map(r => <div key={r.id}><span className="opacity-60">{new Date(r.ts).toLocaleTimeString()} {r.role}: </span>{r.content.slice(0, 120)}</div>)}</div></div>);
}
