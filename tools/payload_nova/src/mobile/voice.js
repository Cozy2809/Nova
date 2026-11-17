// Voz del móvil: usa las voces del propio teléfono (síntesis y reconocimiento del navegador). El micrófono exige HTTPS (ver LEEME).
import { emitLevel } from './shim.js';
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = () => !!SR && window.isSecureContext;
export const canSpeak = () => 'speechSynthesis' in window;
let voice = null, pending = 0, pulse = null, rec = null;
const pickVoice = () => {
  const es = (speechSynthesis.getVoices() || []).filter((v) => /^es/i.test(v.lang));
  voice = es.find((v) => /female|mujer|paulina|helena|laura|monica|sabina|elena|google espa/i.test(v.name)) || es.find((v) => /es[-_]ES/i.test(v.lang)) || es[0] || null;
};
if (canSpeak()) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
const fire = (on) => window.dispatchEvent(new CustomEvent('nova-speaking', { detail: on }));
function startPulse(mode) { stopPulse(); let p = 0; pulse = setInterval(() => { p += 0.5; emitLevel({ mode, v: Math.max(0, 0.28 + 0.38 * Math.sin(p) * Math.sin(p * 0.37 + 1) + Math.random() * 0.25) }); }, 70); }
function stopPulse() { if (pulse) clearInterval(pulse); pulse = null; emitLevel({ mode: 'tts', v: 0 }); emitLevel({ mode: 'mic', v: 0 }); }
export function speak(text) {
  if (!canSpeak() || !text) return;
  const u = new SpeechSynthesisUtterance(String(text)); u.lang = voice?.lang || 'es-ES'; if (voice) u.voice = voice; u.rate = 1.02; u.pitch = 1.08;
  u.onstart = () => { fire(true); startPulse('tts'); };
  const end = () => { pending = Math.max(0, pending - 1); if (!pending) { stopPulse(); fire(false); } };
  u.onend = end; u.onerror = end; pending++; speechSynthesis.speak(u);
}
export function stopSpeaking() { if (canSpeak()) speechSynthesis.cancel(); pending = 0; stopPulse(); fire(false); }
export function listen() {
  return new Promise((resolve) => {
    if (!canListen()) return resolve({ error: 'El micrófono necesita HTTPS (mira el LEEME: tailscale serve) o un navegador compatible.' });
    let text = '', fin = false; rec = new SR(); rec.lang = 'es-ES'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    const done = (r) => { if (fin) return; fin = true; stopPulse(); rec = null; resolve(r); };
    rec.onaudiostart = () => startPulse('mic');
    rec.onresult = (e) => { text = Array.from(e.results).map((r) => r[0].transcript).join(' '); };
    rec.onerror = (e) => done(e.error === 'no-speech' || e.error === 'aborted' ? { text: '' } : { error: e.error === 'not-allowed' ? 'Permiso de micrófono denegado' : 'Error de voz: ' + e.error });
    rec.onend = () => done({ text: text.trim() });
    try { rec.start(); } catch (e) { done({ error: 'No se pudo iniciar el micrófono' }); }
  });
}
export const cancelListen = () => { try { rec?.abort(); } catch {} };
