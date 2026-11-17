// Intenciones locales (sin IA, así son exactas): temporizadores, notas, recuerdos, búsqueda web y abrir aplicaciones
import { APPS } from './apps.js';
const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const findApp = (rest) => { const r = norm(rest); return APPS.find(a => a.aliases.some(al => r === al || r.startsWith(al + ' '))); };
const W = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, 'dieciséis': 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22, 'veintidós': 22, veintitres: 23, 'veintitrés': 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, 'veintiséis': 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60 };
const COMP = /\b(veinte|treinta|cuarenta|cincuenta)\s+y\s+(un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/gi;

function parseDuration(s0) {
  const s = s0.replace(COMP, (_, a, b) => String(W[a.toLowerCase()] + W[b.toLowerCase()]));
  const nums = Object.keys(W).join('|');
  let m, ms, label;
  if ((m = s.match(/\bmedia\s+hora\b/i))) { ms = 30 * 60000; label = 'media hora'; }
  else if ((m = s.match(/\bun\s+cuarto\s+de\s+hora\b/i))) { ms = 15 * 60000; label = 'un cuarto de hora'; }
  else if ((m = s.match(new RegExp(`\\b(\\d+(?:[.,]\\d+)?|${nums})\\s+(segundos?|minutos?|horas?)\\b`, 'i')))) {
    const n = /^\d/.test(m[1]) ? parseFloat(m[1].replace(',', '.')) : W[m[1].toLowerCase()];
    const u = m[2][0].toLowerCase();
    ms = n * (u === 's' ? 1000 : u === 'm' ? 60000 : 3600000); label = `${m[1]} ${m[2]}`;
  } else return null;
  if (!(ms >= 1000 && ms <= 86400000)) return null;
  const before = s.slice(0, m.index), rest = s.slice(m.index + m[0].length);
  let note = rest.replace(/^[\s,]*(?:y\s+)?(?:de|para|que)\s+/i, '').replace(/^[\s,]+/, '').trim();
  if (!note) {
    const bm = before.match(/^(?:av[ií]sa(?:me)?|recu[eé]rdame|despi[eé]rtame)\s+(?:de\s+)?(?:que\s+)?(.*)$/i);
    note = bm ? bm[1].replace(/\s*(?:en|dentro de|de|para)\s*$/i, '').trim() : '';
  }
  return { ms, label, note };
}

export function parseIntent(text) {
  const s = text.trim().replace(/[¿?¡!]+/g, '').replace(/^(?:nova|jarvis)[,\s]+/i, '').replace(/[.\s]+$/, '');
  if (!s) return null;
  let m;
  if (/\b(cancela|quita|elimina|borra|det[eé]n|apaga)\b.*\b(temporizador(?:es)?|recordatorios?|alarmas?|cron[oó]metro)\b/i.test(s)) return { type: 'timer_cancel' };
  if (/\b(av[ií]sa(?:me)?|recu[eé]rdame|temporizador|cron[oó]metro|alarma|despi[eé]rtame)\b/i.test(s)) {
    const d = parseDuration(s);
    if (d) return { type: 'timer', ...d };
  }
  // Control de volumen y audio
  if (/\b(sube|subir|aumenta|aumentar|m[aá]s)\s+(?:el\s+)?volumen\b|\bvolumen\s+(?:m[aá]s\s+alto|arriba)\b/i.test(s)) return { type: 'volume_up' };
  if (/\b(baja|bajar|reduce|reducir|disminuye|disminuir|menos)\s+(?:el\s+)?volumen\b|\bvolumen\s+(?:m[aá]s\s+bajo|abajo)\b/i.test(s)) return { type: 'volume_down' };
  if (/\b(quita(?:r)?|desactiva(?:r)?)\s+(?:el\s+)?silencio\b/i.test(s) || /\b(desmutea(?:r)?|activa(?:r)?\s+(?:el\s+)?(?:sonido|audio)|restaura(?:r)?\s+(?:el\s+)?(?:sonido|audio|volumen))\b/i.test(s) || /^(?:desmutea|desmutear)$/i.test(s)) return { type: 'volume_unmute' };
  if (/\b(silencia(?:r)?|mutea(?:r)?)\s+(?:el\s+)?(?:equipo|sistema|audio|sonido|ordenador|pc)\b/i.test(s) || /^(?:silencia(?:r)?|mutea(?:r)?|silencio|mutear|pon(?:er)?\s+(?:en\s+)?silencio)$/i.test(s)) return { type: 'volume_mute' };

  // Control multimedia
  if (/\b(?:siguiente|pasar|pasa\s+(?:de|a\s+la)?|salta(?:r)?)\s+(?:canci[oó]n|pista|tema|m[uú]sica)\b/i.test(s) || /\b(?:canci[oó]n|pista|tema)\s+siguiente\b/i.test(s)) return { type: 'media_next' };
  if (/\b(?:anterior|previa)\s+(?:canci[oó]n|pista|tema)\b/i.test(s) || /\b(?:canci[oó]n|pista|tema)\s+(?:anterior|previa)\b/i.test(s) || /\b(?:volver|vuelve|retrocede)\s+(?:a\s+la\s+)?(?:canci[oó]n|pista|tema)\b/i.test(s)) return { type: 'media_prev' };
  if (/\b(pausa(?:r)?|det[eé]n|para)\s+(?:la\s+)?(?:m[uú]sica|reproducci[oó]n|canci[oó]n|audio)\b/i.test(s) || /^(?:pausa|pausar|play)$/i.test(s) || /\b(contin[uú]a|continua|reanuda(?:r)?|sigue\s+con)\s+(?:la\s+)?(?:m[uú]sica|reproducci[oó]n|canci[oó]n)\b/i.test(s) || /\b(reproduce|reproducir)\s+(?:la\s+)?(?:m[uú]sica|reproducci[oó]n|canci[oó]n)\b/i.test(s) || /\bdale\s+al\s+play\b/i.test(s)) return { type: 'media_play_pause' };

  // Captura de pantalla
  if (/\b(?:toma(?:r)?|haz|hacer|guarda(?:r)?|captura(?:r)?)\s+(?:un[a]?\s+)?(?:captura(?:\s+de\s+pantalla)?|pantallazo)\b/i.test(s) || /\b(?:captura(?:r)?|guarda(?:r)?)\s+(?:la\s+)?pantalla\b/i.test(s) || /^(?:captura(?:\s+de\s+pantalla)?|pantallazo)$/i.test(s)) return { type: 'screenshot' };
  if ((m = s.match(/^(abre|[aá]breme|abr[eé]me|ejecuta|inicia|lanza|arranca)\s+(?:(?:la|el|mi|mis|una|un)\s+)?(?:(?:aplicaci[oó]n|app|programa)\s+(?:de\s+)?)?(.+)$/i))) {
    const a = findApp(m[2]);
    if (a) return { type: 'open_app', id: a.id, label: a.label };
    if (/^[aá]?br/i.test(m[1]) && m[2].split(/\s+/).length <= 3 && !/notas|tareas|pendientes/i.test(m[2])) return { type: 'open_unknown', name: m[2] };
  }
  if ((m = s.match(/^(?:cierra|ci[eé]rrame|apaga|ap[aá]game|quita|qu[ií]tame|sal\s+de(?:l)?|termina|finaliza)\s+(?:(?:la|el|mi|mis|una|un)\s+)?(?:(?:aplicaci[oó]n|app|programa)\s+(?:de\s+)?)?(.+)$/i))) {
    const a = findApp(m[1]);
    if (a) return { type: 'close_app', id: a.id, label: a.label };
    if (m[1].split(/\s+/).length <= 3 && !/notas|tareas|pendientes|musica|reproduccion|silencio|temporizador/i.test(m[1])) return { type: 'close_unknown', name: m[1] };
  }
  if (/\b(olvida|borra)\b.*(todo lo que (?:sabes|recuerdas)|tus recuerdos|lo que te (?:dije|he dicho))/i.test(s)) return { type: 'fact_clear' };
  if (/\b(borra|elimina|vac[ií]a|limpia)\b.*\b(notas|tareas|pendientes)\b/i.test(s)) return { type: 'note_clear' };
  if ((m = s.match(/^recu[eé]rdame\s+que\s+(.+)$/i))) return { type: 'note_add', text: m[1] };
  if ((m = s.match(/^(?:anota|apunta)(?:\s+(?:esto|lo siguiente))?(?:\s+(?:en|a)\s+(?:mi|la|mis)\s+(?:lista|notas?|tareas?|pendientes?)(?:\s+de\s+(?:tareas|pendientes))?)?(?:\s+que)?[:,]?\s+(.+)$/i))) return { type: 'note_add', text: m[1] };
  if ((m = s.match(/^(?:a[ñn]ade|agrega)\s+(?:a\s+(?:mi|la|mis)\s+(?:lista|notas?|tareas?|pendientes?)(?:\s+de\s+(?:tareas|pendientes))?)[:,]?\s+(.+)$/i))) return { type: 'note_add', text: m[1] };
  if (/(qu[eé] tengo pendiente|\bmis (?:notas|tareas|pendientes)\b|lista de (?:tareas|pendientes|notas)|le[eé]me (?:mis )?(?:notas|tareas|pendientes)|qu[eé] (?:notas|tareas) tengo)/i.test(s)) return { type: 'note_list' };
  if ((m = s.match(/^recuerda\s+que\s+(.+)$/i))) return { type: 'fact_add', text: m[1] };
  if ((m = s.match(/^(?:\S+\s+){0,6}?(?:b[uú]sca(?:me)?|buscar|busques|investiga(?:r)?|investigues|averigua(?:r)?|averig[uü]es|googlea(?:r)?)\s+(?:en\s+(?:internet|la\s+web|google)\s+)?(?:sobre\s+|acerca\s+de\s+|informaci[oó]n\s+(?:de|sobre)\s+)?(.+)$/i))) return { type: 'search', query: m[1].replace(/[,.\s]*por favor$/i, '').trim() };
  if ((m = s.match(/^(?:dime\s+)?(?:las\s+)?(?:[uú]ltimas\s+)?noticias\s+(?:de|sobre)\s+(.+)$/i))) return { type: 'search', query: 'noticias ' + m[1] };
  return null;
}

// Divide el texto en frases completas a partir de 'from' (para hablar mientras el modelo escribe)
export function nextSentences(text, from, final, early = false) {
  const out = []; let i = from;
  const NORMAL = /[.!?…]+["')\]]*\s+|\n+/, EARLY = /[.!?…]+["')\]]*\s+|\n+|(?<=.{35}),\s+/;
  for (;;) {
    const m = text.slice(i).match(early && out.length === 0 ? EARLY : NORMAL); // 'early': la 1.ª frase puede cortarse en una coma

    if (!m) break;
    const end = i + m.index + m[0].length;
    const s = text.slice(i, end).trim(); if (s) out.push(s);
    i = end;
  }
  if (final) { const s = text.slice(i).trim(); if (s) out.push(s); i = text.length; }
  return [out, i];
}

// ¿Parece una pregunta de datos concretos (cifras, quién, cuándo...) que conviene comprobar en internet?
export function looksFactual(text) {
  const t = norm(text).replace(/[¿?¡!.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < 12) return false;
  if (/\b(mi|mis|tu|tus|te|me|usted|jarvis|nova|yo|tienes|eres|estas|puedes|sabes|haces|quieres)\b/.test(t)) return false;
  return /^(cuantos|cuantas|cuanto|cual es|cuales son|cual fue|quien|quienes|cuando|donde|que paso|que ha pasado|como quedo|a cuanto|en que ano|que pais|que equipo|que juego|que pelicula|ultimas noticias|noticias de|precio de|resultado del)\b/.test(t);
}
export const factQuery = (text) => text.replace(/[¿?¡!]/g, '').replace(/^((?:nova|jarvis)[,\s]+)?(por favor[,\s]*)?/i, '').trim();

