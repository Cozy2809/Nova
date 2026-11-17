import React, { useEffect, useState } from 'react';
// Historial de conversaciones: escondido por defecto (no consulta nada hasta que lo abres)
export default function MemoryPanel() {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('nova-mem-open') === '1'; } catch { return false; } });
  const [q, setQ] = useState(''); const [rows, setRows] = useState([]); const [sure, setSure] = useState(false);
  const load = async () => setRows(q ? await window.jarvis.memSearch(q) : (await window.jarvis.memHistory()).reverse().slice(0, 60));
  useEffect(() => { if (!open) return; load(); const t = setInterval(() => { if (!document.hidden) load(); }, 5000); return () => clearInterval(t); }, [q, open]);
  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem('nova-mem-open', v ? '1' : '0'); } catch {} };
  // Confirmación en dos pasos dentro de la app (sin diálogo nativo, que quita el foco del teclado en Electron)
  const clear = async () => {
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 3000); return; }
    await window.jarvis.memClear(); window.dispatchEvent(new Event('jarvis-clear')); setSure(false); load();
  };
  if (!open) return (<div className="panel shrink-0 flex justify-between items-center"><h3>HISTORIAL</h3><button className="btn text-xs" onClick={toggle}>MOSTRAR</button></div>);
  return (<div className="panel h-64 shrink-0 flex flex-col">
    <div className="flex justify-between items-center"><h3>HISTORIAL</h3><span className="flex gap-2"><button className="btn text-xs" onClick={clear}>{sure ? '¿SEGURO?' : 'BORRAR'}</button><button className="btn text-xs" onClick={toggle}>OCULTAR</button></span></div>
    <input className="input my-1 text-xs" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en el historial" />
    <div className="flex-1 min-h-0 overflow-y-auto text-xs space-y-1 pr-1">{rows.map((r) => <div key={r.id}><span className="opacity-60">{new Date(r.ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} {r.role}: </span>{String(r.content ?? '').slice(0, 120)}</div>)}</div></div>);
}
