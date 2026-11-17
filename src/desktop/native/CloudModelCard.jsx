import React, { useCallback, useEffect, useState } from 'react';
import { nv } from './useNative.js';

const Switch = ({ on, set, label, disabled }) => <button type="button" role="switch" className="nd-sw" disabled={disabled} aria-checked={!!on} aria-label={label} onClick={() => set(!on)} />;

// Inkling 2 Small (Ollama Cloud). Opcional y con consentimiento: los mensajes salen del PC mientras esté activo.
export default function CloudModelCard() {
  const [s, setS] = useState(null), [busy, setBusy] = useState(''), [msg, setMsg] = useState(''), [tested, setTested] = useState(false);
  const refresh = useCallback(() => nv('cloud-status').then((r) => r && !r.error && setS(r)).catch(() => {}), []);
  useEffect(() => { refresh(); }, [refresh]);
  const run = async (name, ch, ok) => { setBusy(name); setMsg(''); const r = await nv(ch).catch((e) => ({ error: e.message })); setBusy(''); setMsg(r && (r.error || (r.ok === false && r.error)) ? (r.error || 'No se pudo completar') : ok); if (ch === 'cloud-test') setTested(!!(r && r.ok)); refresh(); };
  const toggle = async (on) => { const r = await nv('cloud-enable', { on }).catch((e) => ({ error: e.message })); if (r && r.error) setMsg(r.error); else if (r && r.cancelled) setMsg(''); else setMsg(on ? 'Activado. Las nuevas conversaciones usan Inkling 2 Small.' : 'Desactivado: Nova usa de nuevo el modelo local.'); refresh(); };
  if (!s) return null;
  return <section className="nd-card"><b>Modelo en la nube · Inkling 2 Small</b>
    <small className="nv-hint">Modelo de Thinking Machines en Ollama Cloud (<code>{s.model}</code>). Es opcional: con él activo los mensajes se envían a Ollama Cloud y Nova deja de ser 100 % local. Si falla, Nova vuelve al modelo local.</small>
    <div className="nd-sw-row"><span>Usar Inkling 2 Small<small className="nv-hint">{s.reachable ? (s.listed ? 'Modelo registrado en Ollama.' : 'Aún sin registrar: pulsa «Registrar modelo».') : 'Ollama no responde: ábrelo desde Inicio.'}</small></span><Switch on={s.enabled} label="Usar Inkling 2 Small" disabled={!s.reachable || (!s.enabled && !tested)} set={toggle} /></div>
    {!s.enabled && !tested && <small className="nv-hint">Para activarlo: 1) Iniciar sesión, 2) Registrar modelo, 3) Probar. El interruptor se habilita cuando la prueba sale bien.</small>}
    <div className="nv-btnrow">
      <button type="button" className="nd-btn" disabled={!!busy} onClick={() => run('signin', 'cloud-signin', 'Se abrió el inicio de sesión de Ollama en tu navegador. Cuando termines, pulsa «Probar».')}>Iniciar sesión</button>
      <button type="button" className="nd-btn" disabled={!!busy || !s.reachable} onClick={() => run('reg', 'cloud-register', 'Modelo registrado.')}>{busy === 'reg' ? 'Registrando…' : 'Registrar modelo'}</button>
      <button type="button" className="nd-btn" disabled={!!busy || !s.reachable} onClick={() => run('test', 'cloud-test', 'Prueba correcta: Inkling 2 Small responde.')}>{busy === 'test' ? 'Probando…' : 'Probar'}</button>
    </div>
    {msg && <small className="nv-hint" role="status">{msg}</small>}
  </section>;
}
