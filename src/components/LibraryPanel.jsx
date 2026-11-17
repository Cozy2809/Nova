import React, { useEffect, useState } from 'react';
import { nv } from '../utils/nova.js';
// Biblioteca: carpeta de PDF/Word/texto que Nova lee cuando necesita contexto
export default function LibraryPanel() {
  const [i, setI] = useState(null); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const load = async () => { const r = await nv('lib:info'); if (!r.error) setI(r); };
  useEffect(() => { load(); }, []);
  const refresh = async () => { setBusy(true); const r = await nv('lib:refresh'); setBusy(false); if (!r.error) setI(r); };
  const openDir = async () => { const r = await nv('lib:open'); setMsg(r.error ? r.error : ''); };
  if (i === null) return null;
  return (<div className="panel shrink-0">
    <div className="flex justify-between items-center"><h3>BIBLIOTECA</h3><span className="text-xs opacity-70">{i.count} {i.count === 1 ? 'documento' : 'documentos'}</span></div>
    <div className="text-xs opacity-70 mt-1">Deja aquí tus PDF, Word o texto y Nova los usará como contexto.</div>
    <div className="flex gap-2 flex-wrap mt-2"><button className="btn" onClick={openDir}>📂 ABRIR CARPETA</button><button className="btn" onClick={refresh} disabled={busy}>{busy ? 'LEYENDO…' : '↻'}</button>{i.count > 0 && <button className="btn" onClick={() => setOpen(!open)}>{open ? 'OCULTAR' : 'VER'}</button>}</div>
    {msg && <div className="text-xs text-hud-red mt-1">{msg}</div>}
    {i.pdfMissing && <div className="text-xs mt-2" style={{ color: '#ffd98a' }}>Para leer PDF falta pypdf: <span className="mono">venv\Scripts\python.exe -m pip install pypdf</span></div>}
    {open && <div className="mt-2 max-h-40 overflow-y-auto">{i.files.map((f) => <div className="lib-file" key={f.name} title={f.error || f.name}><b>{f.name}</b><span className="opacity-60">{f.error ? '⚠' : f.kind}</span></div>)}</div>}
  </div>);
}
