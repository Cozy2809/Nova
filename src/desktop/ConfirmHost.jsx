import React, { useEffect, useState } from 'react';
import { useAgentStore, answerConfirm } from './agent.js';
import Icon from './Icon.jsx';

const RISK = { low: 'Riesgo bajo', confirm: 'Modifica algo', high: 'Alto riesgo' };
// Muestra la primera confirmación pendiente del agente. El proceso principal exige `ack` en las de nivel fuerte.
export default function ConfirmHost() {
  const { confirms } = useAgentStore(); const a = confirms[0];
  const [ack, setAck] = useState(false); const [sess, setSess] = useState(false);
  useEffect(() => { setAck(false); setSess(false); }, [a?.id]);
  useEffect(() => { if (!a) return undefined; const k = (e) => { if (e.key === 'Escape') answerConfirm(a.id, { allow: false }); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [a]);
  if (!a) return null;
  const c = a.confirmation || {}; const strong = c.level === 'strong';
  return (<div className="nd-modal" role="alertdialog" aria-modal="true" aria-labelledby="nd-cf-t">
    <div className="nd-dlg" data-lv={c.level}>
      <div className="nd-row"><Icon n={strong ? 'warn' : 'nova'} s={22} /><h3 id="nd-cf-t" className="nd-grow">{c.title || a.tool}</h3><span className="nd-badge" data-k={a.risk}>{RISK[a.risk] || a.risk}</span></div>
      <div>{c.summary || a.summary}</div>
      {c.consequences?.length > 0 && <ul>{c.consequences.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      <div className="nd-mut" style={{ fontSize: 12 }}>{c.reason}{a.origin !== 'ui' ? ' · Pedida por ' + (a.origin === 'ai' ? 'Nova (IA)' : 'el móvil') : ''}{confirms.length > 1 ? ` · ${confirms.length - 1} más en espera` : ''}</div>
      {strong && <label className="nd-chk"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>Entiendo lo que va a pasar y quiero continuar.</span></label>}
      {c.canRemember && <label className="nd-row nd-mut"><input type="checkbox" checked={sess} onChange={(e) => setSess(e.target.checked)} />Permitir esta acción durante esta sesión</label>}
      <div className="nd-row" style={{ justifyContent: 'flex-end' }}>
        <button className="nd-btn" autoFocus onClick={() => answerConfirm(a.id, { allow: false })}>Denegar</button>
        <button className={'nd-btn ' + (strong ? 'danger' : 'pri')} disabled={strong && !ack} onClick={() => answerConfirm(a.id, { allow: true, ack, session: sess })}>Permitir</button>
      </div>
    </div></div>);
}
