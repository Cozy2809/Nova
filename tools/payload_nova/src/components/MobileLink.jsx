import React, { useEffect, useState } from 'react';
// Panel MÓVIL: muestra cómo conectar Nova desde el teléfono (web app por Tailscale) y el código de acceso.
export default function MobileLink() {
  const [i, setI] = useState(null); const [copied, setCopied] = useState(''); const [show, setShow] = useState(false);
  useEffect(() => {
    if (!window.jarvis.mobileInfo) return;
    let on = true; const load = () => window.jarvis.mobileInfo().then(r => on && setI(r)).catch(() => {});
    load(); const t = setInterval(() => { if (!document.hidden) load(); }, 8000); return () => { on = false; clearInterval(t); };
  }, []);
  if (!window.jarvis.mobileInfo) return null;
  const copy = async (text, k) => { try { await navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(''), 1800); } catch {} };
  const url = i?.urls?.[0];
  return (<div className="panel shrink-0">
    <div className="flex justify-between items-center mb-1"><h3>MÓVIL</h3><span className={'dot ' + (i?.enabled && !i?.error ? 'on' : 'off')} title={i?.enabled ? 'Servidor activo' : 'Desactivado'} /></div>
    {!i ? <div className="text-xs opacity-60">Cargando…</div>
      : !i.enabled ? <div className="text-xs opacity-70">Desactivado (NOVA_MOBILE=off en .env).</div>
      : (<div className="text-xs space-y-2">
        {i.error && <div className="text-hud-red">{i.error}</div>}
        {i.tailscale ? <div className="mono break-all opacity-80">{url}</div> : <div className="opacity-70">No detecto Tailscale. Instálalo en el PC y en el móvil (mismo usuario) y reinicia Nova.</div>}
        <div className="flex gap-2 flex-wrap">
          {url && <button className="btn" onClick={() => copy(`${url}/#t=${i.token}`, 'l')}>{copied === 'l' ? 'COPIADO' : 'COPIAR ENLACE'}</button>}
          <button className="btn" onClick={() => setShow(!show)}>{show ? 'OCULTAR CÓDIGO' : 'VER CÓDIGO'}</button></div>
        {show && <div className="mono code" onClick={() => copy(i.token, 'c')} title="Pulsa para copiar">{copied === 'c' ? 'copiado' : i.token}</div>}
        <div className="opacity-50">Para usar el micrófono en el móvil: <span className="mono">tailscale serve --bg {i.port}</span> y abre la dirección https. Detalles en LEEME-NOVA.md.</div></div>)}
  </div>);
}
