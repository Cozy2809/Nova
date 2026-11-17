// Agente del PC: cuando una orden sobre archivos/PC no encaja con las frases fijas, el modelo la traduce a UNA acción de una lista
// cerrada (buscar, abrir, leer, resumir, redactar, crear carpeta, papelera, abrir carpeta). El modelo NUNCA ejecuta nada: la acción
// resultante pasa por los mismos permisos y validaciones de rutas que las frases fijas.
const VERB = /^(?:por favor[,\s]+)?(?:(?:nova|jarvis)[,\s]+)?(?:(?:quiero|necesito|puedes|podr[ií]as|me gustar[ií]a)\s+(?:que\s+)?)?(?:busca(?:r|s|me)?|b[uú]scame|busques|encuentra|encu[eé]ntrame|encuentres|localiza|ens[eé][ñn]ame|mu[eé]strame|abre|[aá]breme|abrir|abras|lee|l[eé]eme|leer|leas|resume|res[uú]meme|resumir|resumas|redacta|redactar|redactes|escribe|escr[ií]beme|escribir|escribas|crea|cr[eé]ame|crear|crees|genera|prepara|haz|hazme|guarda|borra|borrar|borres|elimina|eliminar|elimines|quita|manda|pasa|ponme|(?:dime\s+)?d[oó]nde\s+(?:est[aá]n?|dej[eé]|guard[eé]|qued[oó]|puse|tengo))/i;
const TOPIC = /\b(archivo|archivos|fichero|ficheros|carpeta|carpetas|documento|documentos|escritorio|descargas|im[aá]genes|fotos?|v[ií]deos?|ordenador|pc|bloc de notas|notepad|explorador|txt|pdf|word|excel|canci[oó]n|m[uú]sica)\b/i;
export const looksLikePcCommand = (t) => { const s = String(t || '').trim(); return s.length >= 6 && s.length <= 220 && VERB.test(s) && TOPIC.test(s); };

const PROMPT = `Eres el intérprete de órdenes de un asistente de ordenador. Convierte la orden del usuario en UN objeto JSON y nada más.
Formato: {"accion":"buscar|abrir|leer|resumir|redactar|crear_carpeta|papelera|abrir_carpeta|ninguna","consulta":"","carpeta":"","tema":"","nombre":""}
- buscar: localizar un archivo o carpeta. "consulta" = nombre o parte del nombre; "carpeta" solo si la dice (escritorio, documentos, descargas, imagenes, videos, musica).
- abrir: abrir un archivo. leer: mostrar su texto. resumir: resumir su texto. En los tres, "consulta" = nombre del archivo.
- redactar: escribir un documento de texto sobre un tema. "tema" = el tema.
- crear_carpeta: "nombre" = nombre de la carpeta; "carpeta" = dónde, si lo dice.
- papelera: mandar un archivo a la papelera; "consulta" = nombre.
- abrir_carpeta: abrir una carpeta personal; "carpeta" = cuál.
- ninguna: si la orden no trata de archivos ni del ordenador, o falta información imprescindible.
Ejemplos:
"ponme el pdf del contrato de alquiler" -> {"accion":"abrir","consulta":"contrato alquiler"}
"dónde dejé las fotos del viaje a Roma" -> {"accion":"buscar","consulta":"roma"}
"escríbeme algo sobre los volcanes en un bloc de notas" -> {"accion":"redactar","tema":"los volcanes"}
"hazme una carpeta para las facturas en documentos" -> {"accion":"crear_carpeta","nombre":"facturas","carpeta":"documentos"}
"cuéntame un chiste" -> {"accion":"ninguna"}
Responde solo con el JSON.`;

const FOLDERS = new Set(['escritorio', 'documentos', 'descargas', 'imagenes', 'videos', 'musica']);
const str = (v, n = 120) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);
const folder = (v) => { const f = str(v, 30).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(?:el|la|los|las|mi|mis)\s+/, ''); return FOLDERS.has(f) ? f : f === 'fotos' ? 'imagenes' : undefined; };

// Valida lo que dijo el modelo y lo convierte en una intención de pcTasks (o null)
export function toIntent(o) {
  if (!o || typeof o !== 'object') return null;
  const a = str(o.accion, 20).toLowerCase(), q = str(o.consulta), f = folder(o.carpeta);
  switch (a) {
    case 'buscar': return q ? { type: 'pc_find', query: q, folder: f, kind: undefined } : { type: 'pc_ask_name' };
    case 'abrir': return q ? { type: 'pc_open', query: q, folder: f, kind: undefined } : { type: 'pc_ask_name' };
    case 'leer': return q ? { type: 'pc_read', query: q, folder: f, summarize: false } : { type: 'pc_ask_name' };
    case 'resumir': return q ? { type: 'pc_read', query: q, folder: f, summarize: true } : { type: 'pc_ask_name' };
    case 'redactar': { const t = str(o.tema || q, 160); return t.length >= 3 ? { type: 'pc_write', topic: t } : null; }
    case 'crear_carpeta': { const n = str(o.nombre || q, 60); return n ? { type: 'pc_mkdir', name: n, where: f } : null; }
    case 'papelera': return q ? { type: 'pc_trash', query: q, folder: f, kind: undefined } : { type: 'pc_ask_name' };
    case 'abrir_carpeta': return f ? { type: 'pc_folder', where: f } : null;
    default: return null;
  }
}
export function parseJson(text) {
  const m = String(text || '').replace(/```(?:json)?/gi, '').match(/\{[\s\S]*?\}/);
  if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; }
}
export async function pcAgent(text) {
  if (!window.jarvis?.chat) return null;
  const run = window.jarvis.chat(Date.now(), [{ role: 'system', content: PROMPT }, { role: 'user', content: String(text).slice(0, 220) }]);
  const r = await Promise.race([run, new Promise((res) => setTimeout(() => res({ error: 'timeout' }), 25000))]);
  if (!r || r.error) return null;
  return toIntent(parseJson(String(r.text).replace(/<think>[\s\S]*?<\/think>/g, '')));
}
