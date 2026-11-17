// Intenciones extra, independientes de intents.js: A1 aviso al móvil (ntfy), C2 WhatsApp, B2 modo Discord.
// useAI.js llama a parseExtraIntent(text) ANTES que a su parseIntent habitual.
import { parsePcIntent, runPcIntent } from './pcTasks.js';
import { parseLibIntent, runLibIntent } from './libTasks.js';
import { parseCamIntent, parseAppIntent, runAppIntent } from './appTasks.js';

export function parseExtraIntent(text) {
  const s = String(text).trim().replace(/[¿?¡!]+/g, '').replace(/^(?:nova|jarvis)[,\s]+/i, '').replace(/[.\s]+$/, '');
  if (!s) return null;
  let m;
  const cam = parseCamIntent(s); if (cam) return cam; // cámara (con permiso)
  const lib = parseLibIntent(s); if (lib) return lib; // biblioteca de documentos
  const pc = parsePcIntent(s); if (pc) return pc;
  // Envío con croc: solo se aceptan órdenes explícitas y un nombre de archivo.
  if ((m = s.match(/^(?:pasa|env[ií]a|manda|transfiere|comparte)\s+(?:(?:el|la|un|una)\s+)?(?:archivo\s+|fichero\s+)?(.+?)\s+(?:por|con)\s+croc$/i))) return { type: 'pc_croc_send', query: m[1].trim() };
  if (/^(?:cancela|det[eé]n|para)\s+(?:el\s+)?(?:env[ií]o|transferencia)\s+(?:de\s+)?croc$/i.test(s)) return { type: 'pc_croc_cancel' };
  const ap = parseAppIntent(s); if (ap) return ap; // abrir cualquier app por nombre aproximado // control del PC
  // Modo Discord (captura del audio de salida del equipo)
  if (/^(?:activa|enciende|inicia|pon)\s+(?:el\s+)?modo\s+discord$/i.test(s) || /^(?:escucha|esc[uú]chame)\s+(?:la\s+)?(?:llamada|discord)$/i.test(s)) return { type: 'loopback', on: true };
  if (/^(?:desactiva|apaga|det[eé]n|quita)\s+(?:el\s+)?modo\s+discord$/i.test(s) || /^(?:deja|para)\s+de\s+escuchar\s+(?:la\s+)?(?:llamada|discord)$/i.test(s)) return { type: 'loopback', on: false };
  // WhatsApp: "envía un WhatsApp a mamá diciendo que llego tarde", "dile a Pedro por WhatsApp que ..."
  if ((m = s.match(/^(?:env[ií]a(?:le)?|m[aá]nda(?:le)?|escribe(?:le)?)\s+(?:un\s+|el\s+)?(?:whats\s?app|wasap|guasap)\s+a\s+(.+?)\s+(?:diciendo(?:le)?(?:\s+que)?|con el mensaje|que (?:diga|dice)|:)\s*(.+)$/i))) return { type: 'whatsapp', contact: m[1].trim(), text: m[2].trim() };
  if ((m = s.match(/^dile\s+a\s+(.+?)\s+por\s+(?:whats\s?app|wasap|guasap)\s+(?:que\s+)?(.+)$/i))) return { type: 'whatsapp', contact: m[1].trim(), text: m[2].trim() };
  // Aviso al móvil (ntfy): "mándame esto al móvil", "envía al móvil que ...", "envía un aviso: ..."
  if (/^(?:m[aá]ndame|env[ií]ame|p[aá]same)\s+(?:esto|eso|la respuesta|lo anterior)\s+(?:al|a mi)\s+(?:m[oó]vil|tel[eé]fono|celular)(?:\s+por favor)?$/i.test(s)) return { type: 'notify_last' };
  if ((m = s.match(/^(?:env[ií]a|manda|m[aá]ndame|env[ií]ame)(?:\s+(?:un\s+)?(?:mensaje|aviso|notificaci[oó]n))?\s+(?:al|a mi)\s+(?:m[oó]vil|tel[eé]fono|celular)(?:\s+(?:que\s+diga|diciendo|con el mensaje|que)|\s*:)?\s*(.+)$/i))) return { type: 'notify_text', text: m[1].trim() };
  if ((m = s.match(/^(?:env[ií]a|manda|m[aá]ndame|env[ií]ame)\s+(?:un\s+)?(?:aviso|notificaci[oó]n)(?:\s+(?:que\s+diga|diciendo(?:\s+que)?)|\s*:)\s*(.+)$/i))) return { type: 'notify_text', text: m[1].trim() };
  return null;
}

// Ejecuta la intención y devuelve el texto que NOVA dice y muestra. lastAssistant() = última respuesta de NOVA.
export async function runExtraIntent(i, { lastAssistant = () => '' } = {}) {
  if (String(i.type).startsWith('cam_') || i.type === 'app_open') return runAppIntent(i);
  if (String(i.type).startsWith('lib_')) return runLibIntent(i);
  if (String(i.type).startsWith('pc_')) return runPcIntent(i);
  switch (i.type) {
    case 'notify_last': case 'notify_text': {
      const msg = i.type === 'notify_text' ? i.text : lastAssistant();
      if (!msg) return 'No tengo nada que enviar todavía, Señor.';
      const r = await window.jarvis.notify({ title: 'NOVA', message: msg, priority: 3, tags: ['robot'] });
      return (r?.error || r?.success === false) ? `No he podido enviarlo a su teléfono, Señor: ${r?.error || 'sin respuesta de ntfy'}.` : `Enviado, Señor: ntfy lo ha aceptado en el tema «${r?.topic || '?'}». Si no le llega, revise que la app ntfy del móvil esté suscrita a ese tema.`;
    }
    case 'whatsapp': {
      const r = await window.jarvis.whatsapp({ contact: i.contact, text: i.text });
      if (r?.error) return 'No he podido preparar el mensaje de WhatsApp, Señor.';
      const donde = r.via === 'web' ? 'en WhatsApp Web' : 'en WhatsApp';
      return r.matched ? `Mensaje para ${i.contact} preparado ${donde}, Señor. Pulse enviar para mandarlo.` : `No tengo el número de ${i.contact}, Señor. He abierto ${donde} con el mensaje para que elija el chat.`;
    }
    case 'loopback': {
      const r = await window.jarvis.toggleLoopback(i.on);
      if (r?.error) return `No he podido ${i.on ? 'activar' : 'desactivar'} el modo Discord, Señor.`;
      return r.on ? 'Modo Discord activado, Señor. Escucho el audio de su equipo.' : 'Modo Discord desactivado, Señor.';
    }
  }
  return null;
}
