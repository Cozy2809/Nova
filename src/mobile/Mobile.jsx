import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAI } from '../hooks/useAI.js';
import AudioOrb from '../components/AudioOrb.jsx';
import Mascot from '../components/Mascot.jsx';
import { getToken, setToken, clearToken, ping, answerApproval } from './shim.js';
import { speak, stopSpeaking, listen, cancelListen, canListen, canSpeak, listVoices, getVoiceName, setVoiceName } from './voice.js';
import { callMe } from '../utils/callme.js';

const setState = (s) => window.dispatchEvent(new CustomEvent('jarvis-state', { detail: s }));
const HUE = { idle: 192, listening: 168, thinking: 262, speaking: 205, muted: 350 };
const CHIPS = [
  { l: 'Pendientes', t: '¿Qué tengo pendiente?' }, { l: 'Captura PC', t: 'Toma una captura de pantalla' },
  { l: 'Busca archivo', f: 'busca el archivo ' }, { l: 'Redacta .txt', f: 'redacta  en un .txt', at: 8 },
  { l: 'Pausa', t: 'Pausa la música' }, { l: 'Volumen +', t: 'Sube el volumen' }, { l: 'Abre Spotify', t: 'Abre Spotify' }
];

function Login({ onDone, error }) {
  const [v, setV] = useState('');
  return (<div className="m-login"><div className="nova-logo big" /><h1 className="nova-title">NOVA</h1>
    <p className="m-sub">Escribe el código que aparece en la app del PC (panel MÓVIL).</p>
    <input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder="código de acceso" autoCapitalize="off" autoCorrect="off" spellCheck="false" onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { setToken(v); onDone(); } }} />
    {error && <div className="m-err">{error}</div>}
    <button className="btn big" disabled={!v.trim()} onClick={() => { setToken(v); onDone(); }}>ENTRAR</button></div>);
}

function Chat({ onLogout }) {
  const [voiceOn, setVoiceOn] = useState(() => { try { return localStorage.getItem('nova-voice') !== 'off'; } catch { return true; } });
  const voiceRef = useRef(voiceOn); voiceRef.current = voiceOn;
  const [convo, setConvo] = useState(false); const convoRef = useRef(false); convoRef.current = convo;
  const [speaking, setSpeaking] = useState(false); const [listening, setListening] = useState(false);
  const [input, setInput] = useState(''); const [err, setErr] = useState(''); const [menu, setMenu] = useState(false);
  const [stats, setStats] = useState({}); const [approvals, setApprovals] = useState([]); const [inflight, setInflight] = useState(false);
  const [size, setSize] = useState(Math.min(250, Math.round(innerWidth * 0.66)));
  const say = useCallback((s) => { if ((voiceRef.current || convoRef.current) && s) speak(callMe(s)); }, []);
  const [voices, setVoices] = useState(listVoices()); const [vname, setVname] = useState(getVoiceName());
  useEffect(() => { const t = setTimeout(() => setVoices(listVoices()), 800); return () => clearTimeout(t); }, [menu]);
  const { messages, busy, error, ask, push } = useAI(say);
  const end = useRef(null); const inputRef = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages]);
  useEffect(() => { const f = () => setSize(Math.min(250, Math.round(innerWidth * 0.66))); addEventListener('resize', f); return () => removeEventListener('resize', f); }, []);
  useEffect(() => { const f = (e) => push('assistant', String(e.detail || '')); window.addEventListener('jarvis-notice', f); return () => window.removeEventListener('jarvis-notice', f); }, []);
  useEffect(() => { const f = (e) => setSpeaking(!!e.detail); window.addEventListener('nova-speaking', f); return () => window.removeEventListener('nova-speaking', f); }, []);
  useEffect(() => { const f = (e) => setApprovals((a) => [...a.filter((x) => x.id !== e.detail.id), e.detail]); window.addEventListener('nova-approval', f); return () => window.removeEventListener('nova-approval', f); }, []);
  useEffect(() => window.jarvis.onStats(setStats), []);
  useEffect(() => { push('assistant', 'Hola, Señor. Soy Nova, desde su móvil. Estoy conectada a su PC: puedo buscar archivos, redactar documentos, abrir aplicaciones y consultar sus notas.'); }, []);
  const st = listening ? 'listening' : speaking ? 'speaking' : (busy || inflight) ? 'thinking' : 'idle';
  useEffect(() => { setState(st); document.documentElement.style.setProperty('--h', HUE[st]); }, [st]);

  const send = (t) => { const x = String(t || '').trim(); if (!x || busy) return; if (speaking) stopSpeaking(); setInput(''); ask(x); };
  const mic = async () => {
    if (listening || busy) return; if (speaking) stopSpeaking();
    setListening(true); setErr(''); const r = await listen(); setListening(false);
    if (r.error) setErr(r.error); else if (r.text) send(r.text); else setErr('No he oído nada, Señor.');
  };
  // Conversación continua: escucha → responde → vuelve a escuchar
  useEffect(() => {
    if (!convo || busy || inflight || speaking || listening) return;
    const t = setTimeout(async () => {
      if (!convoRef.current) return;
      setListening(true); const r = await listen(); setListening(false);
      if (!convoRef.current) return;
      if (r.error) { setErr(r.error); setConvo(false); return; }
      if (r.text) { setInflight(true); try { await ask(r.text); } finally { setInflight(false); } }
    }, 600);
    return () => clearTimeout(t);
  }, [convo, busy, inflight, speaking, listening]);
  const toggleConvo = () => { if (convo) { setConvo(false); cancelListen(); stopSpeaking(); } else { setErr(''); setConvo(true); } };
  const toggleVoice = () => { const v = !voiceOn; setVoiceOn(v); try { localStorage.setItem('nova-voice', v ? 'on' : 'off'); } catch {} if (!v) stopSpeaking(); };
  const answer = async (a, r) => { setApprovals((x) => x.filter((y) => y.id !== a.id)); await answerApproval(a.id, r); };
  const chip = (c) => { if (c.t) send(c.t); else { setInput(c.f); setTimeout(() => { const el = inputRef.current; if (el) { el.focus(); const p = c.at ?? c.f.length; el.setSelectionRange(p, p); } }, 30); } };

  return (<div className="m-root" data-state={st}><div className="nova-bg" aria-hidden="true" />
    <header className="m-head"><div className="nova-logo" /><b className="m-name">NOVA</b>
      <span className="m-stats">{stats.cpu != null ? `CPU ${stats.cpu}% · RAM ${stats.ram}%` : 'conectada al PC'}</span>
      <button className="wbtn" onClick={() => setMenu(!menu)} aria-label="Menú">⋯</button>
      {menu && <div className="menu" onClick={(e) => { if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'OPTION') setMenu(false); }}>
        <button onClick={toggleVoice}>Voz de Nova: {voiceOn ? 'activada' : 'desactivada'}</button>
        {voices.length > 0 && <label style={{ padding: '6px 12px', fontSize: '.72rem' }}>Voz del móvil<select value={vname} onChange={(e) => { setVname(e.target.value); setVoiceName(e.target.value); speak('Así suena esta voz, Señor.'); }}><option value="">Automática</option>{voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}</select></label>}
        <button onClick={() => { clearToken(); onLogout(); }}>Cambiar código / salir</button></div>}</header>
    <div className="m-orb"><AudioOrb size={size} big /></div>
    <div className="m-mascot"><Mascot /></div>
    <div className="m-chat" aria-live="polite">
      {messages.map((m, i) => (<div key={i} className={'msg ' + (m.role === 'user' ? 'msg-user' : m.role === 'call' ? 'msg-call' : 'msg-nova')}><div className="msg-who">{m.role === 'user' ? 'TÚ' : 'NOVA'}{m.ts && <span className="msg-time"> · {new Date(m.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>}</div>{m.role === 'user' ? m.content : callMe(m.content)}{m.sources?.length > 0 && <div className="msg-src">Fuentes: {m.sources.join(' · ')}</div>}</div>))}
      {busy && <div className="animate-pulse opacity-70 text-sm">▌ pensando…</div>}
      {(error || err) && <div className="m-err">⚠ {error || err}</div>}
      <div ref={end} /></div>
    <div className="m-chips">{CHIPS.map((c) => <button key={c.l} className="chip" onClick={() => chip(c)}>{c.l}</button>)}</div>
    {!canListen() && <div className="m-hint">{window.isSecureContext ? 'Este navegador no permite hablar por voz: usa Chrome.' : 'Para hablarme necesito HTTPS. En el PC: panel MÓVIL → ACTIVAR HTTPS, y abre aquí la dirección https://…'}</div>}
    <div className="m-bar">
      <button className={'mic' + (listening ? ' on' : '')} onClick={mic} disabled={busy || convo || !canListen()} aria-label="Hablar" title={canListen() ? 'Hablar' : 'El micrófono necesita HTTPS (ver LEEME)'}>{listening ? '●' : '🎤'}</button>
      <input ref={inputRef} className="input flex-1" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escribe una orden…" enterKeyHint="send" onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(input); }} aria-label="Mensaje" />
      <button className="btn" onClick={() => send(input)} disabled={busy}>➤</button>
      {canListen() && <button className={'btn' + (convo ? ' pill-on' : '')} onClick={toggleConvo} title="Conversación continua">{convo ? '⏹' : '🗣️'}</button>}
      {speaking && <button className="btn" onClick={stopSpeaking}>■</button>}</div>
    {approvals[0] && <div className="m-modal" role="dialog" aria-modal="true"><div className="m-card"><div className="msg-who">NOVA PIDE PERMISO</div>
      <p className="m-ask">{approvals[0].message}</p>{approvals[0].detail && <pre className="m-detail">{approvals[0].detail}</pre>}
      <div className="m-btns"><button className="btn big" onClick={() => answer(approvals[0], 0)}>Denegar</button><button className="btn big pill-on" onClick={() => answer(approvals[0], 1)}>Permitir</button></div></div></div>}
  </div>);
}

export default function Mobile() {
  const [state, setStateV] = useState('boot'); const [error, setError] = useState('');
  const check = useCallback(async () => {
    setStateV('boot'); setError('');
    const m = location.hash.match(/t=([A-Za-z0-9_-]+)/); if (m) { setToken(m[1]); history.replaceState(null, '', location.pathname); }
    if (!getToken()) return setStateV('login');
    const r = await ping(); if (r.ok) setStateV('ok'); else { setError(r.error || ''); setStateV(/c[oó]digo/i.test(r.error || '') ? 'login' : 'offline'); }
  }, []);
  useEffect(() => { check(); const f = () => { setError('Código incorrecto'); setStateV('login'); }; window.addEventListener('nova-auth', f); return () => window.removeEventListener('nova-auth', f); }, []);
  if (state === 'boot') return <div className="m-login"><div className="nova-logo big" /><p className="m-sub">Conectando con tu PC…</p></div>;
  if (state === 'login') return <Login onDone={check} error={error} />;
  if (state === 'offline') return <div className="m-login"><div className="nova-logo big" /><h1 className="nova-title">NOVA</h1><div className="m-err">{error}</div><button className="btn big" onClick={check}>REINTENTAR</button></div>;
  return <Chat onLogout={() => setStateV('login')} />;
}
