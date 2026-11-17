import React, { useEffect, useRef, useState } from 'react';
import { useAI } from '../../hooks/useAI.js';
import { callMe } from '../../utils/callme.js';

export default function AssistantChat({ speakOn = true }) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const end = useRef(null);
  const { messages, busy, error, ask, push } = useAI((line) => {
    if (speakOn && line) window.jarvis.say(callMe(line));
  });
  useEffect(() => { push('assistant', 'Hola. Ya puedes hablar conmigo desde el escritorio.'); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    const f = (e) => push('assistant', String(e.detail || ''));
    window.addEventListener('jarvis-notice', f);
    return () => window.removeEventListener('jarvis-notice', f);
  }, [push]);
  useEffect(() => {
    const key = (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'm') { e.preventDefault(); listen(); }
      else if (e.key === 'Escape') window.jarvis.stop();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
  const send = (e) => {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    setText('');
    ask(message);
  };
  const listen = async () => {
    if (busy || listening) return;
    setListening(true); setVoiceError('');
    try {
      const result = await window.jarvis.listen();
      if (result?.error) setVoiceError(result.error);
      else if (result?.text?.trim()) ask(result.text.trim());
      else setVoiceError('No he oído nada. Inténtalo de nuevo.');
    } catch (e) { setVoiceError(e?.message || 'No se pudo iniciar el micrófono.'); }
    finally { setListening(false); }
  };

  return <section className="nd-chat" aria-label="Chat con Nova">
    <div className="nd-chat-log" aria-live="polite">
      {messages.map((m, i) => <article key={m.ts || i} className={'nd-chat-msg ' + (m.role === 'user' ? 'user' : m.role === 'call' ? 'call' : 'nova')}>
        <div className="nd-chat-who">{m.role === 'user' ? 'TÚ' : m.role === 'call' ? 'LLAMADA' : 'NOVA'}</div>
        <div className="nd-chat-text">{m.content}</div>
        {m.sources?.length > 0 && <small>Fuentes: {m.sources.join(' · ')}</small>}
      </article>)}
      {busy && <div className="nd-chat-status">Nova está pensando…</div>}
      {(error || voiceError) && <div className="nd-chat-error" role="alert">{error || voiceError}</div>}
      <div ref={end} />
    </div>
    <form className="nd-chat-form" onSubmit={send}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe a Nova…" aria-label="Mensaje para Nova" disabled={busy} />
      <button type="button" onClick={listen} disabled={busy || listening} title="Ctrl+M">{listening ? 'Escuchando…' : '🎤'}</button>
      <button type="submit" disabled={busy || !text.trim()}>Enviar</button>
    </form>
  </section>;
}
