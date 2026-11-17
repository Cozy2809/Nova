import React, { useEffect, useState } from 'react';
import { nv, onNv } from '../utils/nova.js';
const DEF = { provider: 'ollama', model: 'qwen2.5:3b', ollamaUrl: 'http://localhost:11434', voiceSpeed: '1', voiceVolume: '1', voiceEffect: '35', autoSearch: 'true', callMe: '', tone: 'equilibrada', length: 'normal', personaText: '', ntfyTopic: '', ntfyAuto: 'false', temperature: '0.5', libraryOn: 'true', perfMode: 'auto', voiceModel: '', cameraMode: 'app' };
const RECOMMENDED = [['qwen2.5:3b', 'Nova Lite · uso reducido de memoria'], ['qwen3:4b', 'Nova · equilibrio recomendado'], ['qwen3:8b', 'Nova Premium · requiere más memoria']];
const KEYS = Object.keys(DEF);
export default function Settings({ onClose, onStartSetup }) {
  const [tab, setTab] = useState('ia'); const [s, setS] = useState(DEF); const [note, setNote] = useState('');
  const [models, setModels] = useState([]); const [pull, setPull] = useState({}); const [voices, setVoices] = useState({ installed: [], catalog: [] }); const [dl, setDl] = useState({});
  const [login, setLogin] = useState(null); const [top, setTop] = useState(null); const [topBusy, setTopBusy] = useState(false);
  useEffect(() => { window.jarvis.getSettings().then((r) => setS((p) => ({ ...p, ...r }))); }, []);
  const loadModels = async () => { const r = await nv('ollama:models'); setModels(r.models || []); if (r.error) setNote(r.error); };
  const loadVoices = async () => { const r = await nv('voice:list'); if (!r.error) { setVoices(r); setS((p) => ({ ...p, voiceModel: p.voiceModel || r.current })); } };
  useEffect(() => { loadModels(); loadVoices(); nv('login:get').then((r) => setLogin(r.on ?? null)); const a = onNv('pull', (d) => setPull((p) => ({ ...p, [d.name]: d }))); const b = onNv('voice-dl', (d) => setDl((p) => ({ ...p, [d.id]: d }))); return () => { a(); b(); }; }, []);
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  const save = async () => { const o = {}; for (const k of KEYS) if (s[k] !== undefined) o[k] = s[k]; await window.jarvis.setSettings(o); window.dispatchEvent(new Event('nova-settings')); setNote('Guardado'); setTimeout(() => setNote(''), 1800); };
  const resetDefaults = async () => { const defaults = { ...DEF, ntfyTopic: s.ntfyTopic || '', ntfyAuto: s.ntfyAuto || 'false', personaText: s.personaText || '' }; await window.jarvis.setSettings(defaults); setS((p) => ({ ...p, ...defaults })); window.dispatchEvent(new Event('nova-settings')); setNote('Valores predeterminados restaurados; se conservaron el TXT personal y la configuración ntfy.'); };
  const T = (k, label, ph, hint) => (<label className="fld"><span className="lbl">{label}</span><input type="text" value={s[k] || ''} placeholder={ph} onChange={(e) => set(k, e.target.value)} />{hint && <div className="hint">{hint}</div>}</label>);
  const SEL = (k, label, opts, hint) => (<label className="fld"><span className="lbl">{label}</span><select value={s[k]} onChange={(e) => set(k, e.target.value)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>{hint && <div className="hint">{hint}</div>}</label>);
  const R = (k, label, min, max, step, fmt) => (<label className="fld"><span className="lbl">{label}: {fmt(parseFloat(s[k]))}</span><input type="range" min={min} max={max} step={step} value={s[k]} onChange={(e) => set(k, e.target.value)} className="block w-full accent-cyan-400" /></label>);
  const CHK = (k, text) => (<label className="flex items-start gap-2 mb-3 text-sm"><input type="checkbox" className="mt-1 accent-cyan-400" checked={s[k] !== 'false'} onChange={(e) => set(k, String(e.target.checked))} /><span>{text}</span></label>);
  const doPull = async (name) => { setPull((p) => ({ ...p, [name]: { pct: 0, status: 'iniciando…' } })); const r = await nv('ollama:pull', { name }); if (r.error) setPull((p) => ({ ...p, [name]: { error: r.error } })); else { loadModels(); set('model', name); } };
  const doDl = async (id) => { setDl((p) => ({ ...p, [id]: { pct: 0 } })); const r = await nv('voice:download', { id }); if (r.error) setDl((p) => ({ ...p, [id]: { error: r.error } })); else { await loadVoices(); set('voiceModel', r.file); } };
  const doTop = async () => { setTopBusy(true); setTop(await nv('perf:top')); setTopBusy(false); };
  const names = models.map((m) => m.name); const modelOpts = [...new Set([s.model, ...names])].filter(Boolean);
  return (<div className="panel max-w-xl mx-auto"><div className="flex justify-between items-center"><h3>AJUSTES</h3><span className="text-xs" style={{ color: 'var(--ac)' }}>{note}</span></div>
    <div className="tabs">{[['ia', 'IA'], ['voz', 'VOZ'], ['aspecto', 'ASPECTO'], ['sistema', 'SISTEMA']].map(([k, l]) => <button key={k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}</div>

    {tab === 'ia' && <>
      {T('callMe', 'Cómo quieres que te llame', 'Señor', 'Se aplica al mostrar y al hablar. Déjalo vacío para «Señor».')}
      {SEL('tone', 'Personalidad', [['sobria', 'Sobria y elegante'], ['equilibrada', 'Equilibrada (recomendada)'], ['juguetona', 'Juguetona']])}
      {SEL('length', 'Longitud de las respuestas', [['corta', 'Cortas'], ['normal', 'Normales'], ['detallada', 'Detalladas']])}
      <label className="fld"><span className="lbl">Personalización desde TXT (máximo 4.000 caracteres)</span><textarea value={s.personaText || ''} maxLength={4000} rows={4} onChange={(e) => set('personaText', e.target.value)} placeholder="Preferencias personales: idioma, temas, tono…" /></label>
      <button className="btn" onClick={() => nv('persona:open')}>ABRIR nova-personalizacion.txt</button>
      {T('ntfyTopic', 'Tema ntfy (aviso al móvil)', 'Tema único difícil de adivinar', 'ntfy.sh es un servicio público: el tema no es cifrado ni confidencial; no envíes información sensible.')}
      {CHK('ntfyAuto', 'Permitir que los recordatorios de Nova envíen avisos automáticos por ntfy.')}
      {R('temperature', 'Creatividad (bajo = más exacta)', 0.1, 1, 0.05, (v) => v.toFixed(2))}
      <label className="fld"><span className="lbl">Modelo de IA (Ollama)</span><select value={s.model} onChange={(e) => set('model', e.target.value)}>{modelOpts.map((m) => <option key={m} value={m}>{m}{names.includes(m) ? '' : ' (no descargado)'}</option>)}</select></label>
      <div className="fld"><span className="lbl">Descargar un modelo más listo</span>
        {RECOMMENDED.map(([n, d]) => { const p = pull[n], have = names.includes(n); return (<div key={n} className="flex items-center gap-2 mb-1"><button className="btn" disabled={have || (p && !p.error && !p.done)} onClick={() => doPull(n)}>{have ? '✓ ' + n : 'DESCARGAR ' + n}</button><span className="hint" style={{ margin: 0 }}>{p?.error ? <span className="text-hud-red">{p.error}</span> : p && !p.done ? `${p.status || ''} ${p.pct ?? ''}${p.pct != null ? '%' : ''}` : d}</span></div>); })}
        <div className="hint">Con una GPU de 4 GB, los modelos de 4B caben justos. Si va lento, vuelve a qwen2.5:3b.</div></div>
      {T('ollamaUrl', 'Endpoint de Ollama', 'http://localhost:11434')}
      {CHK('autoSearch', 'Buscar en internet automáticamente en preguntas de datos (cuántos, quién, cuándo…). Gasta tu crédito de Brave.')}
      {CHK('libraryOn', 'Usar mi biblioteca de documentos como contexto cuando la pregunta se parezca a algo de ellos.')}
    </>}

    {tab === 'voz' && <>
      <label className="fld"><span className="lbl">Voz de Nova (Piper)</span><select value={s.voiceModel} onChange={(e) => set('voiceModel', e.target.value)}>{voices.installed.map((v) => <option key={v.file} value={v.file}>{v.label}</option>)}</select></label>
      <div className="fld"><span className="lbl">Descargar más voces en español</span>
        {voices.catalog.filter((c) => !c.installed).map((c) => { const d = dl[c.id]; return (<div key={c.id} className="flex items-center gap-2 mb-1"><button className="btn" disabled={d && !d.error && !d.done} onClick={() => doDl(c.id)}>DESCARGAR</button><span className="hint" style={{ margin: 0 }}>{c.label}{d && !d.error && !d.done ? ` · ${d.pct}%` : ''}{d?.error && <span className="text-hud-red"> · {d.error}</span>}</span></div>); })}
        {voices.catalog.every((c) => c.installed) && <div className="hint">Ya tienes todas las voces de la lista.</div>}
        <div className="hint">La voz de tu móvil es la del propio Android y no se puede copiar al PC; en el móvil puedes elegirla en su menú ⋯.</div></div>
      {R('voiceSpeed', 'Velocidad', 0.7, 1.4, 0.05, (v) => v.toFixed(2) + 'x')}
      {R('voiceVolume', 'Volumen', 0.4, 1.5, 0.05, (v) => Math.round(v * 100) + '%')}
      {R('voiceEffect', 'Efecto de voz (grave, pausado y eco)', 0, 100, 5, (v) => (v === 0 ? 'apagado' : v + '%'))}
      <button className="btn" onClick={async () => { await save(); window.jarvis.say('Así suena mi voz, Señor. Aquí estoy para lo que necesite.'); }}>▶ PROBAR VOZ</button>
    </>}

    {tab === 'aspecto' && <>
      {SEL('perfMode', 'Rendimiento', [['auto', 'Automático (baja los fps si no tienes el foco)'], ['ahorro', 'Ahorro (sin mascota ni fondo animado)'], ['normal', 'Máxima fluidez']], 'Si notas el PC justo mientras juegas o grabas, usa Ahorro.')}
      <div className="hint">Más opciones de ventana (isla, widget, pantalla completa) en el menú VENTANA de arriba.</div>
    </>}

    {tab === 'sistema' && <>
      <label className="flex items-start gap-2 mb-3 text-sm"><input type="checkbox" className="mt-1 accent-cyan-400" checked={!!login} disabled={login === null} onChange={async (e) => { const r = await nv('login:set', { on: e.target.checked }); setLogin(r.on ?? !!e.target.checked); }} /><span>Abrir Nova al iniciar Windows</span></label>
      {SEL('cameraMode', 'Al hacer una foto', [['app', 'Abrir la app Cámara de Windows y pulsar el disparador'], ['interna', 'Capturar directamente con la cámara (sin abrir la app)']], 'Siempre te pide permiso antes.')}
      <div className="fld"><span className="lbl">Carpetas</span><div className="flex gap-2 flex-wrap">{[['library', '📚 Biblioteca'], ['photos', '📷 Fotos'], ['data', '🗂 Datos y registros'], ['voices', '🔊 Voces'], ['project', '⚙ Proyecto']].map(([k, l]) => <button key={k} className="btn" onClick={() => nv('path:open', { kind: k })}>{l}</button>)}</div></div>
      <div className="fld"><span className="lbl">¿Qué gasta mi CPU y mi RAM?</span><button className="btn" onClick={doTop} disabled={topBusy}>{topBusy ? 'MIDIENDO…' : 'ANALIZAR'}</button>
        {top?.error && <div className="hint text-hud-red">{top.error}</div>}
        {top?.cpu && <div className="mt-2"><div className="hint">Procesos que más CPU usan ahora (% del total):</div>{top.cpu.map((p) => <div key={p.name}><div className="perf-row"><span>{p.name}</span><span className="mono">{p.cpu}%</span></div><div className="pbar"><i style={{ width: Math.min(100, p.cpu * 2) + '%' }} /></div></div>)}
          <div className="hint mt-2">Procesos que más RAM usan:</div>{top.ram.map((p) => <div key={p.name} className="perf-row"><span>{p.name}</span><span className="mono">{p.mb} MB</span></div>)}</div>}</div>
    </>}

    <div className="flex gap-2 mt-3 flex-wrap"><button className="btn pill-on" onClick={save}>GUARDAR</button><button className="btn" onClick={async () => { await save(); onClose(); }}>GUARDAR Y CERRAR</button><button className="btn" onClick={onClose}>CERRAR</button><button className="btn" onClick={resetDefaults}>DEJAR PREDETERMINADO</button><button className="btn" onClick={async () => { await save(); onStartSetup?.(); }}>CONFIGURACIÓN INICIAL</button></div></div>);
}
