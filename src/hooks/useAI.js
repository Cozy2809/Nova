import { parseExtraIntent, runExtraIntent } from '../utils/intents_extra.js';
import { looksLikePcCommand, pcAgent } from '../utils/pcAgent.js';
import { useRef, useState, useCallback, useEffect } from 'react';
import { TOOL_PROMPT, stripTools } from '../utils/toolParser.js';
import { personaPrompt } from '../utils/persona.js';
import { libraryContext } from '../utils/libTasks.js';
import { quickAnswer } from '../utils/quickCommands.js';
import { parseIntent, nextSentences, looksFactual, factQuery } from '../utils/intents.js';

const timers = new Set(); // temporizadores activos (solo duran mientras NOVA está abierto)
const clean = (arr) => arr.filter(m => m.role !== 'call').map(({ role, content }) => ({ role, content })); // 'call' = lo oído en el modo Discord (solo UI)
const plain = (s = '') => s.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').trim();

// Hook de chat. 'speak' lee en voz alta cada frase según se genera.
export function useAI(speak = () => {}) {
  const [messages, setMessages] = useState([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const msgsRef = useRef([]); const idRef = useRef(0); const pastRef = useRef([]); const settingsRef = useRef({}); const libRef = useRef('');
  const speakRef = useRef(speak); speakRef.current = speak;
  const set = (arr) => { const prev = msgsRef.current; const st = arr.map((m, i) => (m.ts ? m : { ...m, ts: (prev[i] && prev[i].role === m.role && prev[i].ts) || Date.now() })); msgsRef.current = st; setMessages(st); };
  const push = useCallback((role, content) => set([...msgsRef.current, { role, content }]), []);

  // Últimos mensajes guardados (memoria de conversaciones anteriores), filtrando basura antigua
  const loadPast = useCallback(async () => {
    try {
      const rows = await window.jarvis.memHistory();
      pastRef.current = rows
        .filter(r => r.content.length < 400 && !r.content.includes('<tool>') && !r.content.startsWith('TOOL_RESULT') && !/<\/?think>|\bthe user\b/i.test(r.content))
        .slice(-16).map(r => ({ role: r.role, content: r.content }));
    } catch { pastRef.current = []; }
  }, []);
  useEffect(() => {
    loadPast();
    const onClear = () => { pastRef.current = []; set([]); };
    window.addEventListener('jarvis-clear', onClear);
    return () => window.removeEventListener('jarvis-clear', onClear);
  }, [loadPast]);

  const buildSys = async () => {
    let facts = []; try { facts = await window.jarvis.itemList('fact'); } catch {}
    const f = facts.length ? ' Datos que el Señor te pidió recordar (dichos por él en primera persona): ' + facts.map(x => x.text).join('; ') + '.' : '';
    return { role: 'system', content: personaPrompt(settingsRef.current) + ' Fecha y hora actual: ' + new Date().toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' }) + '. Recuerdas las conversaciones anteriores con el Señor, que aparecen antes de la actual.' + f + libRef.current };
  };

  // Respuesta del modelo en streaming; habla cada frase en cuanto está completa
  const stream = async (msgs, base, sources) => {
    const id = ++idRef.current; let acc = '', from = 0; const t0 = Date.now();
    const off = window.jarvis.onChunk((c) => {
      if (c.id !== id) return; acc += c.text;
      const vis = stripTools(acc); set([...base, { role: 'assistant', content: vis }]);
      const [ss, ni] = nextSentences(vis, from, false, from === 0); from = ni; ss.forEach(s => speakRef.current(s));
    });
    const r = await window.jarvis.chat(id, msgs); off();
    if (r.error) { setError(r.error); set(base); return; }
    const final = stripTools(r.text);
    nextSentences(final, from, true)[0].forEach(s => speakRef.current(s));
    set([...base, { role: 'assistant', content: final, sources }]);
    window.jarvis.memAdd('assistant', final);
    // Ventana oculta/minimizada y respuesta larga: aviso al móvil
    if (document.hidden && (Date.now() - t0 > 6000 || final.length > 250)) window.jarvis.notify({ title: 'NOVA respondió', message: final, priority: 3, tags: ['speech_balloon'], auto: true });
  };

  const runIntent = async (i) => {
    switch (i.type) {
      case 'timer': {
        const id = setTimeout(() => {
          timers.delete(id);
          const msg = `Señor, ha transcurrido ${i.label}.` + (i.note ? ` Recordatorio: ${i.note}.` : '');
          set([...msgsRef.current, { role: 'assistant', content: msg }]); speakRef.current(msg);
          try { new Notification('NOVA', { body: msg }); } catch {}
          window.jarvis.notify({ title: 'NOVA — Temporizador', message: msg, priority: 4, tags: ['alarm_clock'], auto: true });
        }, i.ms);
        timers.add(id);
        return `Temporizador de ${i.label} en marcha, Señor.` + (i.note ? ` Le recordaré: ${i.note}.` : '');
      }
      case 'timer_cancel': { const n = timers.size; timers.forEach(clearTimeout); timers.clear(); return n ? 'Temporizadores cancelados, Señor.' : 'No hay ningún temporizador activo, Señor.'; }
      case 'open_app': {
        const r = await window.jarvis.openApp(i.id);
        return r.error ? `${r.error}, Señor.` : (r.via === 'fallback' ? `No encuentro ${i.label} instalado, Señor. Lo abro en el navegador.` : `Abriendo ${i.label}, Señor.`);
      }
      case 'open_unknown': return `No tengo «${i.name}» en mi lista de aplicaciones, Señor.`;
      case 'close_app': {
        const r = await window.jarvis.closeApp(i.id);
        if (r?.error) return `${r.error}, Señor.`;
        if (r?.closed === false) return `${r.label} no parece estar en ejecución, Señor.`;
        return `${r.label} cerrado, Señor.`;
      }
      case 'close_unknown': return `No sé cómo cerrar «${i.name}», Señor.`;
      case 'volume_up': {
        const r = await window.jarvis.mediaCmd('vol_up');
        return r?.error ? `${r.error}, Señor.` : 'Volumen subido, Señor.';
      }
      case 'volume_down': {
        const r = await window.jarvis.mediaCmd('vol_down');
        return r?.error ? `${r.error}, Señor.` : 'Volumen bajado, Señor.';
      }
      case 'volume_mute': {
        const r = await window.jarvis.mediaCmd('mute');
        return r?.error ? `${r.error}, Señor.` : 'Audio silenciado, Señor.';
      }
      case 'volume_unmute': {
        const r = await window.jarvis.mediaCmd('unmute');
        return r?.error ? `${r.error}, Señor.` : 'Silencio desactivado, Señor.';
      }
      case 'media_play_pause': {
        const r = await window.jarvis.mediaCmd('play_pause');
        return r?.error ? `${r.error}, Señor.` : 'Listo, Señor.';
      }
      case 'media_next': {
        const r = await window.jarvis.mediaCmd('next');
        return r?.error ? `${r.error}, Señor.` : 'Pasando a la siguiente pista, Señor.';
      }
      case 'media_prev': {
        const r = await window.jarvis.mediaCmd('prev');
        return r?.error ? `${r.error}, Señor.` : 'Volviendo a la pista anterior, Señor.';
      }
      case 'screenshot': {
        const r = await window.jarvis.screenshot();
        return r?.error ? `${r.error}, Señor.` : 'Captura guardada en su carpeta de Imágenes, Señor.';
      }
      case 'note_add': await window.jarvis.itemAdd('note', i.text); return `Anotado, Señor: ${i.text}.`;
      case 'note_list': {
        const n = await window.jarvis.itemList('note');
        if (!n.length) return 'No tiene nada pendiente, Señor.';
        return `Tiene ${n.length} ${n.length === 1 ? 'nota' : 'notas'}. ` + n.map((x, k) => `${k + 1}, ${x.text}.`).join(' ');
      }
      case 'note_clear': await window.jarvis.itemClear('note'); return 'Notas borradas, Señor.';
      case 'fact_add': await window.jarvis.itemAdd('fact', i.text); return 'Entendido, Señor. Lo recordaré.';
      case 'fact_clear': await window.jarvis.itemClear('fact'); return 'He olvidado lo que me pidió recordar, Señor.';
    }
    return null;
  };

  const ask = useCallback(async (text) => {
    setError('');
    try { settingsRef.current = await window.jarvis.getSettings(); } catch {}
    libRef.current = await libraryContext(text, settingsRef.current);
    const base = [...msgsRef.current, { role: 'user', content: text }];
    window.jarvis.memAdd('user', text);
    const reply = (content, sources) => { if (content == null || String(content).trim() === '') content = 'Entendido, Señor.'; set([...base, { role: 'assistant', content, sources }]); window.jarvis.memAdd('assistant', content); speakRef.current(content); };
    // Intenciones extra: aviso al móvil (A1), WhatsApp (C2), modo Discord (B2)
    const extra = parseExtraIntent(text);
    if (extra) {
      try { reply(await runExtraIntent(extra, { lastAssistant: () => ([...msgsRef.current].reverse().find(m => m.role === 'assistant' && m.content) || {}).content || '' })); }
      catch (e) { setError(String(e.message || e)); set(base); }
      return;
    }
    // Agente del PC: una orden libre sobre archivos/PC que las frases fijas no entienden la traduce el modelo a una accion de la lista cerrada
    if (!parseIntent(text) && looksLikePcCommand(text)) {
      setBusy(true); let ag = null; try { ag = await pcAgent(text); } catch {} finally { setBusy(false); }
      if (ag) { try { reply(await runExtraIntent(ag)); } catch (e) { setError(String(e.message || e)); set(base); } return; }
    }
    const intent = parseIntent(text);
    let autoFailed = false;
    try {
      if (intent && intent.type !== 'search') { reply(await runIntent(intent)); return; }
      if (!intent) { const q = quickAnswer(text); if (q) { reply(q); return; } }
      // Búsqueda: explícita ("busca...", "investiga...") o automática en preguntas de datos concretos
      let search = intent?.type === 'search' ? { query: intent.query, auto: false } : null;
      if (!search && looksFactual(text)) {
        let st = {}; try { st = await window.jarvis.getSettings(); } catch {}
        if (st.autoSearch !== 'false') search = { query: factQuery(text), auto: true };
      }
      setBusy(true); set([...base, { role: 'assistant', content: '' }]);
      const sys = await buildSys();
      if (search) {
        speakRef.current('Un momento, Señor, lo compruebo en internet.');
        const r = await window.jarvis.tool('search', { query: search.query });
        if (!r.error && r.result?.length) {
          const ctx = r.result.map((x, k) => `${k + 1}. ${plain(x.title)}: ${plain(x.description)}`).join('\n');
          await stream([sys, { role: 'user', content: `Pregunta del Señor: ${text}\n\nResultados de búsqueda web:\n${ctx}\n\nResponde en español, en dos o tres frases, usando solo estos datos. Si los resultados discrepan, menciona la diferencia. Si no bastan, dilo con elegancia.` }], base, r.result.slice(0, 3).map(x => x.url));
          return;
        }
        if (!search.auto) {
          reply(r.error ? (/BRAVE/.test(r.error) ? 'Para buscar en internet necesito su clave de Brave, Señor. Añádala en el archivo .env y reinicie.' : 'La búsqueda ha fallado, Señor.') : 'No he encontrado resultados, Señor.');
          return;
        }
        autoFailed = true; // búsqueda automática fallida: responde el modelo, avisándole de que no pudo verificar
      }
      const sys2 = autoFailed ? { ...sys, content: sys.content + ' No has podido verificar este dato en internet; si no estás seguro de una cifra o un hecho reciente, dilo con claridad en lugar de inventarlo.' } : sys;
      await stream([sys2, ...pastRef.current, ...clean(base)], base);
    } catch (e) { setError(String(e.message || e)); set(base); }
    finally { setBusy(false); }
  }, []);
  return { messages, busy, error, ask, push };
}


