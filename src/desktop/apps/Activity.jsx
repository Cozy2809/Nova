import React, { useState } from 'react';
import { useAgentStore, cancelAction, usePoll, isFinal, msgOf } from '../agent.js';

const ST = { pending: 'Pendiente', awaiting_confirmation: 'Esperando permiso', running: 'En curso', succeeded: 'Hecha', failed: 'Falló', cancelled: 'Cancelada' };
const col = { succeeded: 'nd-ok', failed: 'nd-err', cancelled: 'nd-mut' };
const time = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function Row({ a }) {
  return (<div className="nd-card" style={{ gap: 4 }}>
    <div className="nd-row"><b className="nd-grow">{a.summary || a.tool}</b><span className="nd-badge" data-k={a.risk}>{a.risk === 'high' ? 'Alto riesgo' : a.risk === 'confirm' ? 'Modifica' : 'Lectura'}</span><span className={col[a.state] || ''}>{ST[a.state] || a.state}</span></div>
    <div className="nd-mut" style={{ fontSize: 12 }}>{a.tool} · {a.origin === 'ui' ? 'desde el escritorio' : a.origin === 'ai' ? 'pedida por Nova' : a.origin} · {time(a.createdAt || a.t)}{a.verified === true ? ' · comprobada en el sistema' : ''}</div>
    {a.progress && !isFinal(a) && <div className="nd-prog"><i style={{ width: a.progress.pct + '%' }} /></div>}
    {a.error && <div className="nd-err" style={{ fontSize: 12.5 }}>{a.error.message}</div>}
    {!isFinal(a) && a.id && <div><button className="nd-btn" onClick={() => cancelAction(a.id)}>Cancelar</button></div>}
  </div>);
}

export default function Activity() {
  const [tab, setTab] = useState('now'); const { feed } = useAgentStore();
  const log = usePoll(async () => { const r = await window.jarvis.agent.audit(80); if (r.error) throw new Error(r.error); return r.entries; }, 0, { enabled: tab === 'log', deps: [tab] });
  return (<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div className="nd-tabs" role="tablist"><button role="tab" aria-selected={tab === 'now'} onClick={() => setTab('now')}>Esta sesión</button><button role="tab" aria-selected={tab === 'log'} onClick={() => setTab('log')}>Registro guardado</button></div>
    <div className="nd-pad" style={{ overflow: 'auto', flex: 1 }}>
      {tab === 'now' && (feed.length ? feed.map((a) => <Row key={a.id} a={a} />) : <div className="nd-empty">Todavía no hay acciones. Cuando uses Archivos, el Dock o la búsqueda, aparecerán aquí.</div>)}
      {tab === 'log' && (<>
        {log.loading && <div className="nd-empty"><span className="nd-spin" />Leyendo el registro…</div>}
        {log.error && <div className="nd-note err">{log.error}</div>}
        {log.data && !log.data.length && <div className="nd-empty">El registro está vacío.</div>}
        {log.data && log.data.map((e, i) => (<div key={i} className="nd-card" style={{ gap: 3 }}><div className="nd-row"><b className="nd-grow">{e.summary || e.tool}</b><span className={col[e.state] || ''}>{ST[e.state] || e.state}</span></div><div className="nd-mut" style={{ fontSize: 12 }}>{e.tool} · {new Date(e.t).toLocaleString('es-ES')} · {e.origin}{e.error ? ' · ' + e.error.message : ''}</div></div>))}
        <div className="nd-mut" style={{ fontSize: 12 }}>El registro no guarda el contenido de los archivos ni textos largos.</div></>)}
    </div></div>);
}
