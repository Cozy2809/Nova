import React, { useCallback, useEffect, useState } from 'react';
import { nv } from './useNative.js';

// Scrapling dentro de Nova: lee y extrae páginas web (HTTP + análisis). El chat y el agente usan las mismas herramientas.
export default function ScraplingCard() {
  const [st, setSt] = useState(null), [busy, setBusy] = useState(''), [msg, setMsg] = useState(''), [url, setUrl] = useState(''), [sel, setSel] = useState(''), [res, setRes] = useState(null);
  const refresh = useCallback(() => nv('scrapling-status').then((r) => r && !r.error && setSt(r)).catch(() => {}), []);
  useEffect(() => { refresh(); }, [refresh]);
  const install = async () => { setBusy('install'); setMsg(''); const r = await nv('scrapling-install').catch((e) => ({ error: e.message })); setBusy(''); setMsg(r.cancelled ? '' : r.error ? r.error : 'Scrapling instalado.'); refresh(); };
  const go = async (action) => { setBusy('run'); setMsg(''); setRes(null); const r = await nv('scrapling-run', { action, url, selector: sel, maxPages: 5 }).catch((e) => ({ error: e.message })); setBusy(''); if (r.error || r.ok === false) setMsg(r.error || 'No se pudo leer la página.'); else setRes(r); };
  if (!st) return null;
  const ready = st.installed && st.fetchers;
  const text = res ? (res.content || (res.items && res.items.join('\n')) || (res.pages && res.pages.map((p) => `# ${p.title || p.url}\n${p.error || p.content || ''}`).join('\n\n')) || '') : '';
  return <section className="nd-card"><b>Scrapling · leer páginas web</b>
    <small className="nv-hint">Nova puede descargar una página y extraer su texto en Markdown, o datos con selectores CSS. Solo HTTP/HTTPS a sitios públicos, respeta robots.txt y no usa navegadores ni evasión de protecciones. El texto web se trata como no confiable.</small>
    <small className="nv-hint">{!st.python ? (st.hint || 'No se encontró Python.') : ready ? `Instalado${st.version ? ' · versión ' + st.version : ''}.` : 'No instalado.'}</small>
    {!ready && st.python && <div className="nv-btnrow"><button type="button" className="nd-btn" disabled={!!busy} onClick={install}>{busy === 'install' ? 'Instalando…' : 'Instalar Scrapling'}</button></div>}
    {ready && <>
      <input className="nd-sel" style={{ width: '100%' }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ejemplo.com/pagina" aria-label="Dirección de la página" />
      <input className="nd-sel" style={{ width: '100%' }} value={sel} onChange={(e) => setSel(e.target.value)} placeholder="Selector CSS opcional, p. ej. .titulo" aria-label="Selector CSS opcional" />
      <div className="nv-btnrow"><button type="button" className="nd-btn" disabled={!!busy || !url} onClick={() => go('page')}>{busy === 'run' ? 'Leyendo…' : 'Leer página'}</button><button type="button" className="nd-btn" disabled={!!busy || !url} onClick={() => go('crawl')}>Leer sitio (hasta 5 páginas)</button></div>
    </>}
    {msg && <small className="nv-hint" role="status">{msg}</small>}
    {res && <pre className="nv-hint" style={{ maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0 }}>{text.slice(0, 3000)}{text.length > 3000 ? '\n…' : ''}</pre>}
  </section>;
}
