import React, { useEffect, useRef, useState } from 'react';
// Diálogo propio de texto/confirmación (en el renderer sandbox no existen prompt() ni confirm()).
export default function AskDialog({ req, onDone }) {
  const [v, setV] = useState(req?.value || ''); const ref = useRef(null);
  useEffect(() => { setV(req?.value || ''); setTimeout(() => ref.current?.select?.(), 30); }, [req]);
  if (!req) return null;
  const ok = () => onDone(req.input === false ? true : v.trim() || null);
  return (<div className="nd-modal" role="dialog" aria-modal="true" onKeyDown={(e) => { if (e.key === 'Escape') onDone(null); }}>
    <div className="nd-dlg"><h3>{req.title}</h3>{req.message && <div className="nd-mut">{req.message}</div>}
      {req.input !== false && <input ref={ref} className="nd-in" style={{ height: 34 }} value={v} aria-label={req.label || req.title} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ok(); }} />}
      <div className="nd-row" style={{ justifyContent: 'flex-end' }}><button className="nd-btn" onClick={() => onDone(null)}>Cancelar</button><button className={'nd-btn ' + (req.danger ? 'danger' : 'pri')} onClick={ok} disabled={req.input !== false && !v.trim()}>{req.okText || 'Aceptar'}</button></div></div></div>);
}
