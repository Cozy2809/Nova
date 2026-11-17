'use strict';
// Intenciones de aviso al móvil (sin LLM). Se evalúan en main antes de llegar a Ollama.

// Normaliza sin cambiar la longitud (cada carácter acentuado -> uno sin acento)
const MAP = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u' };
function norm(s) {
  return s.normalize('NFC').toLowerCase().replace(/[áéíóúüàèìòù]/g, (c) => MAP[c]);
}

const NUM = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, noventa: 90,
};
const NUM_WORDS = Object.keys(NUM).sort((a, b) => b.length - a.length).join('|');
const NUM_RE = `(\\d+(?:[.,]\\d+)?|(?:${NUM_WORDS})(?:\\s+y\\s+(?:${NUM_WORDS}))?)`;

function toNumber(s) {
  if (/^\d/.test(s)) return parseFloat(s.replace(',', '.'));
  return s.split(/\s+y\s+/).reduce((acc, w) => acc + (NUM[w] || 0), 0);
}

const UNIT = { s: 1000, m: 60000, h: 3600000 };
function unitOf(u) { return u.startsWith('h') ? 'h' : u.startsWith('m') ? 'm' : 's'; }

const DEVICE_RE = /\b(?:al|a mi|en el|en mi|del|de mi|por el|por|mi|el)\s+(?:movil|telefono|celular|mobil|smartphone|samsung)\b/;
const PUSH_WORD_RE = /\b(?:una?\s+)?(?:notificacion(?:es)?|push|ntfy)\b/;
const VERB_RE = /\b(?:mandame|manda|mande|enviame|envia|envie|notificame|notifica|avisame|avisa|pasame|pasa|escribeme|recuerdame|ponme|programa|programame)\b/;
const OBJ_RE = /\b(?:un|una|el|la)\s+(?:aviso|mensaje|recordatorio|notificacion|alerta|nota)\b/;
const REL_RE = new RegExp(`\\b(?:en|dentro de)\\s+${NUM_RE}\\s*(segundos?|segs?|minutos?|mins?|horas?|h)\\b`);
const HALF_RE = /\b(?:en|dentro de)\s+(media hora|un cuarto de hora|cuarto de hora|una hora y media)\b/;
const ABS_RE = /\ba las\s+(\d{1,2})(?:[:.h](\d{2}))?(?:\s+(?:y\s+(media|cuarto)))?(?:\s+de la\s+(manana|tarde|noche))?\b/;

function labelFor(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} segundo${s === 1 ? '' : 's'}`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minuto${m === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} hora${h === 1 ? '' : 's'}${r ? ` y ${r} minuto${r === 1 ? '' : 's'}` : ''}`;
}

// Devuelve {type:'push'|'push_timer'|'push_cancel'|'push_test', ...} o null
function parseNotifyIntent(text, now = new Date()) {
  if (typeof text !== 'string') return null;
  const orig = text.normalize('NFC').trim();
  if (!orig || orig.length > 300) return null; // los prompts de búsqueda son largos: no tocar
  const t = norm(orig);

  const device = DEVICE_RE.exec(t);
  const pushWord = PUSH_WORD_RE.exec(t);
  if (!device && !pushWord) return null;

  // Cancelar avisos programados
  if (/\b(?:cancela|anula|borra|quita|elimina)\b/.test(t) && /\b(?:avisos?|notificaciones?|recordatorios?|alertas?)\b/.test(t)) {
    return { type: 'push_cancel' };
  }
  // Prueba
  if (/\b(?:prueba|probar|test)\b/.test(t) && t.split(/\s+/).length <= 8) {
    return { type: 'push_test' };
  }

  const verb = VERB_RE.exec(t);
  if (!verb) return null;

  // Spans a eliminar del texto original para quedarse con el mensaje
  const cut = [];
  const mark = (m) => { if (m) cut.push([m.index, m.index + m[0].length]); };
  mark(verb); mark(device); mark(OBJ_RE.exec(t));
  if (pushWord && !device) mark(pushWord);

  let ms = null;
  const rel = REL_RE.exec(t);
  const half = HALF_RE.exec(t);
  const abs = ABS_RE.exec(t);
  if (rel) {
    ms = toNumber(rel[1]) * UNIT[unitOf(rel[2])]; mark(rel);
  } else if (half) {
    ms = { 'media hora': 30, 'un cuarto de hora': 15, 'cuarto de hora': 15, 'una hora y media': 90 }[half[1]] * 60000; mark(half);
  } else if (abs) {
    let h = parseInt(abs[1], 10);
    let min = abs[2] ? parseInt(abs[2], 10) : abs[3] === 'media' ? 30 : abs[3] === 'cuarto' ? 15 : 0;
    if ((abs[4] === 'tarde' || abs[4] === 'noche') && h < 12) h += 12;
    if (h > 23 || min > 59) return null;
    const at = new Date(now); at.setHours(h, min, 0, 0);
    // Sin "de la tarde": si la hora ya pasó y es <12, probar por la tarde; si no, mañana
    if (at <= now && !abs[4] && h < 12) at.setHours(h + 12);
    if (at <= now) at.setDate(at.getDate() + 1);
    ms = at - now; mark(abs);
  }

  let msg = [...orig].map((c, i) => (cut.some(([a, b]) => i >= a && i < b) ? ' ' : c)).join('');
  msg = msg.replace(/\s+/g, ' ')
    .replace(/^\s*(?:jarvis|nova)\b/i, '')
    .replace(/^[\s,.:;¡!¿?-]+/, '')
    .replace(/^(?:(?:que|diciendo|diciendole|con el (?:texto|mensaje)|de|para|y)\s+|:\s*)+/i, '')
    .replace(/[\s,.;:¡!¿?-]+$/, '')
    .trim();
  if (/^(?:jarvis|nova|por favor|porfa)$/i.test(msg)) msg = '';
  msg = msg.replace(/^(?:(?:jarvis|nova)[, ]+)/i, '').replace(/[, ]+(?:por favor|jarvis|nova)$/i, '');

  if (ms !== null) {
    if (!(ms >= 1000) || ms > 7 * 86400000) return null;
    return { type: 'push_timer', ms: Math.round(ms), label: labelFor(ms), message: msg };
  }
  return { type: 'push', message: msg };
}

module.exports = { parseNotifyIntent, labelFor, norm };
