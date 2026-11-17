import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAI } from '../hooks/useAI.js';
import AudioOrb from './AudioOrb.jsx';
// Avisa al orbe del estado actual (idle | listening | thinking | speaking | muted)
const setState = (s) => { window.dispatchEvent(new CustomEvent('jarvis-state', { detail: s })); };
export default function ChatCore({ speakOn }) {
  const speakOnRef = useRef(speakOn); speakOnRef.current = speakOn;
  const [convo, setConvo] = useState(false); const [muted, setMuted] = useState(false);
  const convoRef = useRef(false); convoRef.current = convo;
  const mutedRef = useRef(false); mutedRef.current = muted;
  const [pendingSay, setPendingSay] = useState(false); // hay frases enviadas a la voz que aún no han terminado
  // En modo conversación siempre habla, aunque VOZ esté en OFF
  const speak = useCallback((s) => { if ((speakOnRef.current || convoRef.current) && s) { setPendingSay(true); window.jarvis.say(s); } }, []);
  const { messages, busy, error, ask, push } = useAI(speak);
  const [input, setInput] = useState(''); const [listening, setListening] = useState(false); const [voiceErr, setVoiceErr] = useState('');
  const [speaking, setSpeaking] = useState(false); const [inflight, setInflight] = useState(false);
  const end = useRef(null); const inputRef = useRef(null); const micRef = useRef(null); const speakingRef = useRef(false); speakingRef.current = speaking;
  const talking = speaking || pendingSay;

  useEffect(() => { end.current?.scrollIntoView(); }, [messages]);
  useEffect(() => { setState(convo && muted ? 'muted' : speaking ? 'speaking' : (busy || inflight) ? 'thinking' : listening ? 'listening' : 'idle'); }, [convo, muted, busy, inflight, speaking, listening]);
  useEffect(() => { window.jarvis.convoState?.(convo); }, [convo]);
  // Eventos del servicio de voz: empieza/termina de hablar y errores
  useEffect(() => window.jarvis.onVoiceEvent?.((m) => {
    if (m.event === 'speech') { if (m.state === 'start') setSpeaking(true); else { setSpeaking(false); setPendingSay(false); } }
    else if (m.event === 'error') { setVoiceErr(m.message); setPendingSay(false); }
    else if (m.event === 'heard') push('call', m.text); // modo Discord: lo que suena en el equipo
  }), []);
  const startConvo = () => { setMuted(false); setVoiceErr(''); setConvo(true); };
  const endConvo = () => { setConvo(false); window.jarvis.cancelListen?.(); window.jarvis.stop(); };
  const toggleMute = () => { const m = !muted; setMuted(m); if (m) window.jarvis.cancelListen?.(); };
  // Órdenes desde el icono de la bandeja
  useEffect(() => window.jarvis.onCommand?.((c) => { if (c === 'convo-on') startConvo(); else if (c === 'convo-off') endConvo(); }), []);

  // Saludo según la hora, al abrir la app
  useEffect(() => { (async () => {
    const h = new Date().getHours(); const sal = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
    let n = 0; try { n = (await window.jarvis.itemList('note')).length; } catch {}
    const hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const msg = `${sal}, Señor. Son las ${hora}.` + (n ? ` Tiene ${n} ${n === 1 ? 'nota pendiente' : 'notas pendientes'}.` : '') + ' Aquí, siempre disponible para lo que necesite.';
    push('assistant', msg); speak(msg);
  })(); }, []);
  useEffect(() => { const f = () => inputRef.current?.focus(); window.addEventListener('focus', f); f(); return () => window.removeEventListener('focus', f); }, []);

  // Bucle del modo conversación: escucha -> responde -> espera a que termine de hablar -> vuelve a escuchar
  useEffect(() => {
    if (!convo || muted || busy || inflight || talking || listening) return;
    const t = setTimeout(async () => {
      if (!convoRef.current || mutedRef.current) return;
      setListening(true); setVoiceErr('');
      const r = await window.jarvis.listen();
      setListening(false);
      if (!convoRef.current || mutedRef.current) return;
      if (r.error) { setVoiceErr(r.error); setConvo(false); return; }
      if (r.text) { setInflight(true); try { await ask(r.text); } finally { setInflight(false); } }
    }, 700); // pausa para no captar la cola de la voz de Jarvis
    return () => clearTimeout(t);
  }, [convo, muted, busy, inflight, talking, listening]);

  const stop = () => window.jarvis.stop();
  const send = (t) => { if (!t.trim() || busy) return; if (speakingRef.current) stop(); setInput(''); ask(t); };
  const mic = async () => {
    if (listening || busy || convoRef.current) return;
    if (speakingRef.current) await stop();
    setListening(true); setVoiceErr('');
    const r = await window.jarvis.listen(); setListening(false);
    if (r.error) setVoiceErr(r.error);
    else if (r.text) send(r.text);
    else setVoiceErr('No he oído nada, Señor. Inténtelo de nuevo.');
  };
  micRef.current = mic;
  // Atajos: Ctrl+M hablar, Esc callar a Jarvis
  useEffect(() => {
    const k = (e) => { if (e.ctrlKey && e.key.toLowerCase() === 'm') { e.preventDefault(); micRef.current(); } else if (e.key === 'Escape') window.jarvis.stop(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []);

  return (<>
    <div className="panel flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2 pr-2" aria-live="polite">
        {messages.map((m, i) => (<div key={i} className={m.role === 'user' ? 'text-white' : m.role === 'call' ? 'text-yellow-300 text-sm' : 'text-hud-cyan'}>
          <b>{m.role === 'user' ? '> TÚ: ' : m.role === 'call' ? 'LLAMADA: ' : 'JARVIS: '}</b>{m.content}
          {m.sources?.length > 0 && <div className="text-xs opacity-60 break-all">Fuentes: {m.sources.join(' · ')}</div>}</div>))}
        {busy && <div className="animate-pulse">▌ procesando…</div>}
        {(error || voiceErr) && <div className="text-hud-red">⚠ {error || voiceErr}</div>}
        <div ref={end} />
      </div>
      <div className="flex gap-2 mt-2">
        <input ref={inputRef} className="flex-1 bg-transparent border border-hud-dim px-2 py-1 outline-none focus:border-hud-cyan" value={input} placeholder="Escribe o pulsa el micro (Ctrl+M)…"
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(input); }} aria-label="Mensaje" />
        {speaking && <button className="btn" onClick={stop} title="Esc">■ CALLAR</button>}
        <button className="btn" onClick={startConvo} title="Conversación continua por voz">CONVERSAR</button>
        <button className="btn" onClick={mic} disabled={listening || busy} title="Ctrl+M">{listening ? '● escuchando' : '🎤'}</button>
        <button className="btn" onClick={() => send(input)} disabled={busy}>ENVIAR</button>
      </div>
    </div>
    {convo && (
      <div className="fixed inset-0 z-50 hud-root bg-hud-bg flex flex-col items-center justify-center gap-8" role="dialog" aria-label="Modo conversación">
        <AudioOrb size={340} big />
        <div className="h-6 text-hud-red text-sm text-center px-6">{voiceErr}</div>
        <div className="flex gap-4">
          <button className="btn px-6 py-2" onClick={toggleMute}>{muted ? 'ACTIVAR MICRÓFONO' : 'SILENCIAR MICRÓFONO'}</button>
          <button className="btn px-6 py-2" onClick={endConvo}>SALIR</button>
        </div>
      </div>)}
  </>);
}
