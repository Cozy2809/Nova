import React, { useEffect, useState } from 'react';
import { nv, onNv } from '../utils/nova.js';

const PROFILES = {
  lite: { title: 'Nova Lite', model: 'qwen2.5:3b', perf: 'ahorro', detail: 'Para equipos modestos. Menor uso de memoria; las respuestas pueden tardar algo más.' },
  standard: { title: 'Nova', model: 'qwen3:4b', perf: 'auto', detail: 'Equilibrio recomendado para la mayoría de PCs.' },
  premium: { title: 'Nova Premium', model: 'qwen3:8b', perf: 'normal', detail: 'Modelo más capaz; requiere más memoria y espacio de descarga.' },
};
const profileForModel = (m) => m?.startsWith('qwen3:8b') ? 'premium' : m?.startsWith('qwen3:4b') ? 'standard' : m?.startsWith('qwen2.5:3b') ? 'lite' : '';
export default function InitialSetup({ onDone }) {
  const [step, setStep] = useState(0); const [form, setForm] = useState({ profile: 'auto', model: PROFILES.standard.model, callMe: '', tone: 'equilibrada', length: 'normal', personaText: '', voiceOn: true, startInDesktop: false, libraryOn: true, ntfyTopic: '', ntfyAuto: false });
  const [hardware, setHardware] = useState(null); const [models, setModels] = useState([]); const [loading, setLoading] = useState(true); const [pull, setPull] = useState(null); const [error, setError] = useState(''); const [mobile, setMobile] = useState(null);
  const recommended = hardware?.recommended || 'standard';
  const chosen = form.profile === 'auto' ? recommended : form.profile;
  const modelInstalled = models.some((m) => m.name === form.model || m.name.startsWith(form.model + ':'));
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  useEffect(() => {
    let live = true;
    Promise.all([window.jarvis.getSettings().catch(() => ({})), nv('setup:hardware'), nv('ollama:models'), window.jarvis.mobileInfo?.().catch(() => null)])
      .then(([s, h, m, mob]) => {
        if (!live) return;
        const existing = profileForModel(s.model); const desk = (() => { try { return JSON.parse(s['desk.prefs'] || '{}'); } catch { return {}; } })();
        const selectedProfile = existing || h.recommended || 'standard';
        setForm((f) => ({ ...f, profile: existing || 'auto', model: s.model || PROFILES[selectedProfile].model, callMe: s.callMe || '', tone: s.tone || 'equilibrada', length: s.length || 'normal', personaText: s.personaText || '', voiceOn: s.voiceOn !== 'false', startInDesktop: !!desk.startInDesktop, libraryOn: s.libraryOn !== 'false', ntfyTopic: s.ntfyTopic || '', ntfyAuto: s.ntfyAuto === 'true' }));
        setHardware(h && !h.error ? h : null); setModels(m?.models || []); setMobile(mob);
      }).catch((e) => { if (live) setError(e.message || 'No pude leer el estado del equipo.'); })
      .finally(() => { if (live) setLoading(false); });
    const stop = window.jarvis.onNova?.('pull', (d) => setPull(d));
    return () => { live = false; stop?.(); };
  }, []);
  const setProfile = (p) => { const resolved = p === 'auto' ? recommended : p; update('profile', p); update('model', PROFILES[resolved].model); };
  const download = async () => { setError(''); const name = form.model; setPull({ name, status: 'Conectando con Ollama…', pct: 0 }); const r = await nv('ollama:pull', { name }); if (r.error) { setPull({ name, error: r.error }); setError(r.error); } else setModels((m) => [...m.filter((x) => x.name !== name), { name }]); };
  const save = async () => {
    setError('');
    try {
      const previous = await window.jarvis.getSettings(); let desk = {}; try { desk = JSON.parse(previous['desk.prefs'] || '{}'); } catch {}
      desk = { ...desk, startInDesktop: form.startInDesktop };
      await window.jarvis.setSettings({ provider: 'ollama', model: form.model, novaProfile: chosen, perfMode: PROFILES[chosen].perf, callMe: form.callMe.trim().slice(0, 40), tone: form.tone, length: form.length, personaText: form.personaText.slice(0, 4000), voiceOn: String(form.voiceOn), libraryOn: String(form.libraryOn), ntfyTopic: form.ntfyTopic.trim().slice(0, 64), ntfyAuto: String(form.ntfyAuto), 'desk.prefs': JSON.stringify(desk), setupComplete: 'true' });
      window.dispatchEvent(new Event('nova-settings')); setStep(2);
    } catch (e) { setError(e.message || 'No se pudo guardar la configuración.'); }
  };
  const close = async () => { try { await window.jarvis.setSettings({ setupComplete: 'true' }); window.dispatchEvent(new Event('nova-settings')); } catch {} onDone(form.startInDesktop); };
  const openPersonalization = async () => { const r = await nv('persona:open'); if (r?.error) setError(r.error); };
  const topicGenerate = () => { const bytes = crypto.getRandomValues(new Uint8Array(16)); update('ntfyTopic', 'nova-' + [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('')); };

  return <div className="nova-setup-shade" role="dialog" aria-modal="true" aria-labelledby="nova-setup-title">
    <section className="nova-setup-card">
      <div className="nova-setup-brand">N O V A <span>Configuración inicial</span></div>
      {step === 0 && <>
        <h2 id="nova-setup-title">Elige la versión para tu PC</h2><p>Nova usa Ollama en este equipo. La detección recomienda un modelo por memoria y procesadores; tú decides qué instalar.</p>
        {loading ? <p>Analizando el equipo y comprobando Ollama…</p> : <div className="nova-setup-grid">
          <button className={form.profile === 'lite' ? 'selected' : ''} onClick={() => setProfile('lite')}><b>Nova Lite</b><small>{PROFILES.lite.detail}<br />Modelo: {PROFILES.lite.model}</small></button>
          <button className={form.profile === 'standard' ? 'selected' : ''} onClick={() => setProfile('standard')}><b>Nova</b><small>{PROFILES.standard.detail}<br />Modelo: {PROFILES.standard.model}</small></button>
          <button className={form.profile === 'premium' ? 'selected' : ''} onClick={() => setProfile('premium')}><b>Nova Premium</b><small>{PROFILES.premium.detail}<br />Modelo: {PROFILES.premium.model}</small></button>
          <button className={form.profile === 'auto' ? 'selected' : ''} onClick={() => setProfile('auto')}><b>Analizar mi PC</b><small>Recomendación: {PROFILES[recommended].title}. {hardware ? `${hardware.ramGB} GB RAM · ${hardware.cores} procesadores lógicos` : 'No se pudo medir; usaré Nova.'}<br />Puedes cambiar la recomendación cuando quieras.</small></button>
        </div>}
        <div className="nova-setup-note">{models.length ? `Ollama detectado · ${modelInstalled ? 'modelo elegido instalado' : 'el modelo elegido aún no está instalado'}` : 'Si Ollama todavía no está instalado o iniciado, puedes configurarlo después en Ajustes.'}</div>
        {!modelInstalled && <button className="nova-setup-secondary" onClick={download} disabled={loading || !!(pull && pull.status && !pull.done && !pull.error)}>{pull?.status && !pull.done ? `Descargando ${pull.pct != null ? pull.pct + '%' : ''} · ${pull.status}` : `Descargar ${form.model} ahora`}</button>}
      </>}
      {step === 1 && <>
        <h2 id="nova-setup-title">Personaliza a Nova</h2><p>Estos ajustes son locales y editables. Puedes cambiarlos más adelante.</p>
        <label>¿Cómo quieres que te llame?<input value={form.callMe} maxLength={40} placeholder="Por ejemplo: Alex" onChange={(e) => update('callMe', e.target.value)} /></label>
        <label>Personalidad<select value={form.tone} onChange={(e) => update('tone', e.target.value)}><option value="sobria">Sobria y elegante</option><option value="equilibrada">Equilibrada</option><option value="juguetona">Juguetona</option></select></label>
        <label>Longitud de respuestas<select value={form.length} onChange={(e) => update('length', e.target.value)}><option value="corta">Cortas</option><option value="normal">Normales</option><option value="detallada">Detalladas</option></select></label>
        <label className="nova-setup-check"><input type="checkbox" checked={form.voiceOn} onChange={(e) => update('voiceOn', e.target.checked)} /> Activar la voz de Nova</label>
        <label className="nova-setup-check"><input type="checkbox" checked={form.startInDesktop} onChange={(e) => update('startInDesktop', e.target.checked)} /> Abrir Nova en modo Escritorio al iniciar</label>
        <label className="nova-setup-check"><input type="checkbox" checked={form.libraryOn} onChange={(e) => update('libraryOn', e.target.checked)} /> Usar la biblioteca de documentos como contexto (opcional)</label>
        <label>Tema ntfy para avisos al móvil (opcional)<div className="nova-setup-inline"><input value={form.ntfyTopic} maxLength={64} placeholder="Genera un tema único difícil de adivinar" onChange={(e) => update('ntfyTopic', e.target.value)} /><button onClick={topicGenerate}>Generar</button></div></label>
        <label className="nova-setup-check"><input type="checkbox" checked={form.ntfyAuto} onChange={(e) => update('ntfyAuto', e.target.checked)} /> Permitir avisos automáticos de ntfy</label>
        <div className="nova-setup-note">En el móvil instala ntfy y suscríbete al mismo tema. ntfy.sh es público: el nombre aleatorio reduce adivinanzas, pero no es cifrado ni confidencial. Para abrir Nova desde fuera de casa usa Tailscale.</div>
        <label>Instrucciones personales (se aplican al comportamiento de Nova)<textarea value={form.personaText} maxLength={4000} rows={3} placeholder="Opcional: preferencias de tono, temas, idioma…" onChange={(e) => update('personaText', e.target.value)} /></label>
        <button className="nova-setup-secondary" onClick={openPersonalization}>Abrir el TXT de personalización</button>
      </>}
      {step === 2 && <>
        <h2 id="nova-setup-title">Un recorrido rápido (puedes omitirlo)</h2>
        <div className="nova-setup-tutorial"><article><b>1. Hablar y personalizar</b><p>Usa el chat o el micrófono. En Ajustes puedes editar la personalidad, la voz y el modelo.</p></article><article><b>2. Nova Desktop</b><p>Abre Escritorio desde la cabecera. El dock, las ventanas y sus controles tienen ajustes propios; “Dejar escritorio predeterminado” restaura el diseño.</p></article><article><b>3. Modos de ventana y escucha</b><p>El menú Ventana cambia la presentación (flotante, pantalla completa o segundo plano). El menú Modos activa escucha del audio de escritorio o reacción a música; revísalos antes de usarlos.</p></article><article><b>4. ntfy: avisos al móvil</b><p>Instala ntfy en el teléfono, crea/suscríbete al tema indicado y habilita avisos en Nova. Los temas ntfy.sh son públicos; no pongas información sensible en los avisos.</p><p>Tema de esta instalación: <code>{form.ntfyTopic || 'sin configurar'}</code></p></article><article><b>5. Tailscale: usar Nova desde el teléfono</b><p>Instala Tailscale en el PC y el móvil, inicia sesión con la misma cuenta y deja Nova abierta. Abre el panel Móvil y sigue “Activar HTTPS” para el micrófono.</p><p>El acceso queda dentro de tu red Tailscale; no configures redirección de puertos del router.</p></article></div>
        {mobile?.error && <div className="nova-setup-note">Móvil: {mobile.error}</div>}
      </>}
      {error && <div className="nova-setup-error" role="alert">{error}</div>}
      <footer>
        {step === 0 && <button onClick={() => setStep(1)} disabled={loading}>Siguiente</button>}
        {step === 1 && <><button className="secondary" onClick={() => setStep(0)}>Atrás</button><button onClick={save}>Guardar y ver tutorial</button></>}
        {step === 2 && <><button className="secondary" onClick={close}>Omitir tutorial</button><button onClick={close}>Terminar</button></>}
      </footer>
    </section>
  </div>;
}
