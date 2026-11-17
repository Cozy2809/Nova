// Órdenes sobre la biblioteca de documentos de Nova (carpeta con PDF, Word y texto).
import { nv } from './nova.js';
const strip = (s) => String(s).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
async function askModel(messages) { const r = await window.jarvis.chat(Date.now(), messages); if (!r || r.error) throw new Error(r?.error || 'Sin respuesta del modelo'); return strip(r.text); }
const PFX = '^(?:por favor[,\\s]+)?(?:(?:nova|jarvis)[,\\s]+)?';
export function parseLibIntent(t) {
  const s = String(t).trim().replace(/[.!?¿¡]+$/g, ''); let m;
  if (new RegExp(PFX + '(?:qu[eé]|cu[aá]les)\\s+(?:documentos|archivos|pdfs?|apuntes)\\s+(?:tengo|hay)(?:\\s+en\\s+(?:la\\s+)?(?:biblioteca|carpeta de nova|carpeta de documentos))?$', 'i').test(s) || new RegExp(PFX + '(?:qu[eé]|cu[aá]nto)\\s+hay\\s+en\\s+(?:la\\s+)?biblioteca$', 'i').test(s)) return { type: 'lib_list' };
  if (new RegExp(PFX + '(?:abre|[aá]breme|mu[eé]strame)\\s+(?:la\\s+)?(?:carpeta\\s+de\\s+(?:la\\s+)?)?(?:biblioteca|documentos de nova|carpeta de nova)$', 'i').test(s)) return { type: 'lib_open' };
  if ((m = s.match(new RegExp(PFX + '(res[uú]me|res[uú]meme|resumen\\s+de|lee|l[eé]eme)\\s+(?:el\\s+|la\\s+|los\\s+|las\\s+)?(?:documento|pdf|word|apuntes|texto de la biblioteca)s?\\s+(?:de\\s+|llamado\\s+|que se llama\\s+)?(.+)$', 'i')))) return { type: 'lib_read', query: m[2].trim(), summarize: /^res/i.test(m[1]) };
  if ((m = s.match(new RegExp(PFX + '(?:de qu[eé] (?:trata|va)|qu[eé] dice)\\s+(?:el\\s+|la\\s+)?(?:documento|pdf|word|apuntes)\\s+(.+)$', 'i')))) return { type: 'lib_read', query: m[1].trim(), summarize: true };
  return null;
}
export async function runLibIntent(i) {
  if (i.type === 'lib_open') { const r = await nv('lib:open'); return r.error ? `No he podido abrir la carpeta, Señor: ${r.error}.` : 'Abriendo la carpeta de su biblioteca, Señor.'; }
  if (i.type === 'lib_list') {
    const r = await nv('lib:info'); if (r.error) return `No puedo ver la biblioteca, Señor: ${r.error}.`;
    if (!r.count) return 'Su biblioteca está vacía, Señor. Deje PDF, Word o texto en la carpeta; ábrala con el botón de la biblioteca.';
    const names = r.files.slice(0, 8).map((f) => f.name.replace(/\.[^.]+$/, '')).join(', ');
    return `Tiene ${r.count} ${r.count === 1 ? 'documento' : 'documentos'} en la biblioteca, Señor: ${names}${r.count > 8 ? ' y otros más' : ''}.`;
  }
  if (i.type === 'lib_read') {
    const r = await nv('lib:read', { q: i.query });
    if (r.error) return r.names?.length ? `No encuentro ese documento, Señor. En la biblioteca tiene: ${r.names.slice(0, 6).map((n) => n.replace(/\.[^.]+$/, '')).join(', ')}.` : `${r.error}, Señor.${/pypdf/.test(r.error) ? ' Instale pypdf con: venv\\Scripts\\python.exe -m pip install pypdf' : ''}`;
    if (!i.summarize) return `«${r.name}»: ${r.text.slice(0, 700).replace(/\s+/g, ' ')}${r.total > 700 ? '… (hay más; pídame un resumen)' : ''}`;
    const text = await askModel([{ role: 'system', content: 'Resume en español, de forma clara y fiel, el documento que te dan: 4 a 6 frases en texto plano, sin listas ni markdown. No inventes nada que no esté en el texto.' }, { role: 'user', content: `Documento «${r.name}»:\n\n${r.text.slice(0, 6000)}\n\nResume el documento.` }]);
    return `Resumen de «${r.name}», Señor: ${text}${r.truncated ? ' (he leído solo el principio del documento)' : ''}`;
  }
  return null;
}
// Contexto automático: si la pregunta se parece a algo de tus documentos, se añade ese texto al mensaje del sistema
export async function libraryContext(text, settings = {}) {
  if (settings.libraryOn === 'false' || !window.jarvis?.nova || String(text).trim().length < 8) return '';
  try {
    const r = await nv('lib:search', { q: text, k: 3 }); if (r.error || !r.chunks?.length) return '';
    let out = '', used = 0;
    for (const c of r.chunks) { const piece = `[${c.file}] ${c.text.slice(0, 700)}\n`; if (used + piece.length > 1800) break; out += piece; used += piece.length; }
    return out ? ' Extractos de los documentos del Señor que pueden ser relevantes (úsalos solo si responden a la pregunta y menciona el nombre del documento; si no sirven, ignóralos):\n' + out : '';
  } catch { return ''; }
}
