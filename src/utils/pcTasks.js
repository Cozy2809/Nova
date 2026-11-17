// Órdenes de control del PC: buscar archivos, abrirlos, leerlos, redactar documentos .txt en el Escritorio, crear carpetas y mover a la Papelera.
// Todo pasa por window.jarvis.pc (proceso main), que valida las rutas y pide permiso nativo cuando algo se modifica.
const FOLDERS = 'escritorio|documentos|descargas|im[aá]genes|fotos|v[ií]deos|m[uú]sica';
const TAIL = new RegExp(`\\s+en\\s+(?:mi\\s+|mis\\s+|el\\s+|la\\s+|los\\s+)?(${FOLDERS})$`, 'i');
const clean = (q) => String(q).replace(/^["'«“]+|["'»”]+$/g, '').replace(/[,.\s]*por favor$/i, '').trim();
const folderOf = (m) => (m ? m.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : undefined);
const STOPS = /^(?:(?:de|del|la|el|los|las|un|una|que se llama|llamad[oa]s?|con nombre|de nombre)\s+)+/i;
const split = (q, strip = true) => { const m = q.match(TAIL); const f = (x) => { const c = clean(x); return strip ? c.replace(STOPS, '').trim() : c; }; return m ? { query: f(q.slice(0, m.index)), folder: folderOf(m[1]) } : { query: f(q), folder: undefined }; };
const KIND = (w) => (/carpeta/i.test(w) ? 'folder' : 'file');

export function parsePcIntent(s) {
  let m;
  if ((m = s.match(new RegExp(`^abre\\s+(?:mi\\s+|mis\\s+|el\\s+|la\\s+)?(?:carpeta\\s+(?:de\\s+)?)?(${FOLDERS})$`, 'i')))) return { type: 'pc_folder', where: folderOf(m[1]) };
  if ((m = s.match(/^(?:redacta(?:me)?|escribe(?:me)?|crea(?:me)?|genera(?:me)?|prepara(?:me)?|haz(?:me)?)\s+(.+?)\s+en\s+(?:un\s+|el\s+)?(?:archivo\s+(?:de\s+texto\s+)?|documento\s+(?:de\s+texto\s+)?)?(?:\.?txt|punto txt|bloc de notas|notepad|archivo de texto|documento de texto)(?:\s+y\s+(?:gu[aá]rdalo|guarda|d[eé]jalo)\b.*)?$/i))) return { type: 'pc_write', topic: clean(m[1]) };
  if ((m = s.match(new RegExp(`^crea(?:me)?\\s+(?:una\\s+)?carpeta\\s+(?:llamada\\s+|que se llame\\s+|con nombre\\s+)?(.+)$`, 'i')))) { const r = split(m[1], false); return { type: 'pc_mkdir', name: r.query, where: r.folder }; }
  if ((m = s.match(/^(?:borra|elimina|quita|manda a la papelera)\s+(?:el|la|mi)\s+(archivo|fichero|documento|carpeta)\s+(?:llamad[oa]\s+)?(.+)$/i))) { const r = split(m[2]); return { type: 'pc_trash', query: r.query, folder: r.folder, kind: KIND(m[1]) }; }
  if ((m = s.match(/^(?:lee|l[eé]eme|resume|res[uú]meme)\s+(?:el|la|mi)\s+(archivo|fichero|documento|texto)\s+(?:llamad[oa]\s+)?(.+)$/i))) { const r = split(m[2]); return { type: 'pc_read', query: r.query, folder: r.folder, summarize: /^res/i.test(s) }; }
  if ((m = s.match(/^(?:abre|[aá]breme)\s+(?:el|la|mi)\s+(archivo|fichero|documento|carpeta)\s+(?:llamad[oa]\s+)?(.+)$/i))) { const r = split(m[2]); return { type: 'pc_open', query: r.query, folder: r.folder, kind: KIND(m[1]) }; }
  if ((m = s.match(/^(?:busca|b[uú]scame|encuentra|encu[eé]ntrame|localiza|d[oó]nde est[aá])\s+(?:(?:el|la|los|las|un|una|mi|mis)\s+)?(archivo|fichero|documento|carpeta|foto|imagen|pdf|v[ií]deo|canci[oó]n)s?\s+(?:que se llama\s+|llamad[oa]s?\s+|con nombre\s+|de nombre\s+)?(.+)$/i))) { const r = split(m[2]); return { type: 'pc_find', query: r.query, folder: r.folder, kind: KIND(m[1]) }; }
  if ((m = s.match(/^busca\s+(.+?)\s+en\s+(?:el\s+)?explorador(?:\s+de\s+archivos)?$/i))) { const r = split(m[1]); return { type: 'pc_find', query: r.query, folder: r.folder, kind: undefined }; }
  if (/^(?:busca|b[uú]scame|encuentra|encu[eé]ntrame|localiza)\s+(?:(?:este|ese|aquel|un|el|mi)\s+)?(?:archivo|fichero|documento|carpeta|foto|imagen|pdf|v[ií]deo|canci[oó]n)s?$/i.test(s)) return { type: 'pc_ask_name' };
  if ((m = s.match(/^(?:busca|b[uú]scame|encuentra|encu[eé]ntrame|localiza)\s+(.+\.[A-Za-z0-9]{2,5})(\s+en\s+.+)?$/i))) { const r = split(m[1] + (m[2] || '')); return { type: 'pc_find', query: r.query, folder: r.folder, kind: 'file' }; }
  return null;
}

const notice = (t) => window.dispatchEvent(new CustomEvent('jarvis-notice', { detail: t }));
const stripThink = (t) => String(t).replace(/^[\s\S]*?<\/think>/, '').replace(/<think>[\s\S]*$/, '').replace(/[*_#`]/g, '').trim();
async function askModel(messages) { const r = await window.jarvis.chat(Date.now(), messages); if (r.error) throw new Error(r.error); return stripThink(r.text); }
const folderName = (p) => String(p).split(/[\\/]/).filter(Boolean).pop();
const plain = (s = '') => String(s).replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();

async function best(i) {
  const r = await window.jarvis.pc('find', { query: i.query, folder: i.folder, kind: i.kind });
  if (r.error) return { error: r.error };
  return { list: r.result || [] };
}

export async function runPcIntent(i) {
  if (!window.jarvis?.pc) return 'El control del PC no está instalado todavía, Señor. Ejecute tools\\instalar_control_pc.py.';
  const pc = (a, args) => window.jarvis.pc(a, args);
  switch (i.type) {
    case 'pc_croc_cancel': {
      const r = await pc('croc_cancel', {});
      return r.error ? `No hay una transferencia Croc activa, Señor.` : `He detenido la transferencia Croc, Señor.`;
    }
    case 'pc_croc_send': {
      const b = await best({ query: i.query, kind: 'file' });
      if (b.error) return `${b.error}, Señor.`;
      if (!b.list.length) return `No encuentro «${i.query}» en sus carpetas personales, Señor.`;
      if (b.list.length > 1) return `He encontrado varios archivos parecidos: ${b.list.slice(0, 5).map((x) => x.name).join(', ')}. Dígame cuál quiere enviar por Croc, Señor.`;
      const file = b.list[0];
      const r = await pc('croc_send', { path: file.path });
      if (r.denied) return `Entendido, Señor. No he enviado «${file.name}».`;
      if (r.error) return `No he podido iniciar Croc para «${file.name}»: ${r.error}.`;
      notice(`Croc está preparado para enviar ${file.name}. Código: ${r.code}`);
      return `Croc está enviando «${file.name}». La clave para el otro ordenador es ${r.code}. Compártala solo con quien debe recibirlo. Diga «cancela la transferencia Croc» para detenerla.`;
    }
    case 'pc_ask_name': return '¿Cómo se llama, Señor? Dígame, por ejemplo: busca el archivo informe en descargas.';
    case 'pc_folder': { const r = await pc('open_folder', { name: i.where }); return r.error ? `No he podido abrir esa carpeta, Señor.` : `Abriendo ${i.where}, Señor.`; }
    case 'pc_find': {
      const b = await best(i); if (b.error) return b.error + ', Señor.';
      if (!b.list.length) return `No he encontrado nada llamado «${i.query}» en sus carpetas personales, Señor.`;
      notice(b.list.slice(0, 6).map((x, k) => `${k + 1}. ${x.name} [${folderName(x.dir)}]`).join('  ·  '));
      await pc('reveal', { path: b.list[0].path });
      return `He encontrado ${b.list.length} ${b.list.length === 1 ? 'resultado' : 'resultados'} para «${i.query}», Señor. El primero es «${b.list[0].name}» y lo he mostrado en el Explorador.`;
    }
    case 'pc_open': {
      const b = await best(i); if (b.error) return b.error + ', Señor.';
      if (!b.list.length) return `No encuentro «${i.query}» en sus carpetas personales, Señor.`;
      const r = await pc('open', { path: b.list[0].path });
      if (r.denied) return 'Entendido, Señor: no lo abro.'; if (r.error) return `No he podido abrirlo, Señor: ${r.error}.`;
      return `Abriendo «${b.list[0].name}», Señor.`;
    }
    case 'pc_read': {
      const b = await best({ ...i, kind: 'file' }); if (b.error) return b.error + ', Señor.';
      if (!b.list.length) return `No encuentro «${i.query}» en sus carpetas personales, Señor.`;
      const r = await pc('read', { path: b.list[0].path }); if (r.error) return `${r.error}, Señor.`;
      if (!i.summarize) { notice(r.text.slice(0, 1500) + (r.text.length > 1500 ? '…' : '')); return `Le muestro el contenido de «${r.name}», Señor.`; }
      notice(`Resumiendo «${r.name}»…`);
      const sum = await askModel([{ role: 'system', content: 'Resume el texto del usuario en español en 3 a 5 frases claras. Sin listas ni formato.' }, { role: 'user', content: r.text.slice(0, 12000) }]);
      return sum || 'No he podido resumirlo, Señor.';
    }
    case 'pc_trash': {
      const b = await best(i); if (b.error) return b.error + ', Señor.';
      if (!b.list.length) return `No encuentro «${i.query}» en sus carpetas personales, Señor.`;
      const r = await pc('trash', { path: b.list[0].path });
      if (r.denied) return 'Entendido, Señor: no lo borro.'; if (r.error) return `No he podido moverlo a la Papelera, Señor: ${r.error}.`;
      return `Movido a la Papelera «${b.list[0].name}», Señor. Puede recuperarlo desde ahí.`;
    }
    case 'pc_mkdir': {
      const r = await pc('mkdir', { name: i.name, where: i.where });
      if (r.denied) return 'Entendido, Señor: no la creo.'; if (r.error) return `No he podido crear la carpeta, Señor: ${r.error}.`;
      return `Carpeta «${i.name}» creada, Señor.`;
    }
    case 'pc_write': {
      notice(`Investigando «${i.topic}» en internet…`);
      let ctx = '', pages = [], n = 0;
      const rs = await pc('research', { topic: i.topic });
      if (!rs.error && rs.pages?.length) {
        pages = rs.pages; n = pages.length; ctx = pages.map((p, k) => `[${k + 1}] ${plain(p.title)}\n${p.text}`).join('\n\n');
        const hosts = pages.map((p) => { try { return new URL(p.url).hostname.replace(/^www\./, ''); } catch { return ''; } }).filter(Boolean).join(', ');
        notice(`He leído ${n} ${n === 1 ? 'página' : 'páginas'} (${hosts}). Redactando…`);
      } else if (!rs.error && rs.snippets?.length) {
        n = rs.snippets.length; ctx = rs.snippets.map((x, k) => `${k + 1}. ${plain(x.title)}: ${plain(x.description)}`).join('\n');
        notice('No he podido abrir las páginas; redacto con los resúmenes de la búsqueda…');
      } else notice('No he podido investigar en internet; redacto con lo que sé…');
      const text = await askModel([
        { role: 'system', content: 'Eres un redactor en español. Escribe un texto claro, ordenado y fiel a las fuentes, de 450 a 700 palabras: un título en la primera línea y después párrafos separados por una línea en blanco. Sin markdown, sin listas con viñetas y sin asteriscos. Usa SOLO datos que aparezcan en las fuentes: si no dan una fecha o una cifra, no la inventes. No menciones las fuentes ni pongas números entre corchetes en el texto.' },
        { role: 'user', content: `Tema: ${i.topic}\n\n${n ? 'Fuentes (pueden ser incompletas):\n' + ctx : 'No hay fuentes.'}\n\nRedacta el texto.` }]);
      if (text.length < 80) return 'No he conseguido redactar el texto, Señor. Inténtelo de nuevo.';
      const first = text.split('\n').map((l) => l.trim()).find(Boolean) || '';
      const title = first.length <= 80 && !/[.:]$/.test(first) ? first : i.topic.charAt(0).toUpperCase() + i.topic.slice(1);
      const src = pages.map((p) => '- ' + p.url).join('\n');
      notice('Voy a escribirlo en el Bloc de notas. Cuando acepte el permiso, no toque el teclado ni el ratón hasta que termine.');
      const r = await pc('write_text', { title, content: text + (src ? '\n\nFuentes consultadas:\n' + src : ''), ext: 'txt', open: true, live: true });
      if (r.denied) return 'Entendido, Señor: no he guardado nada.'; if (r.error) return `No he podido guardarlo, Señor: ${r.error}.`;
      const fuentes = pages.length ? ` Al final he añadido las ${pages.length} fuentes que consulté.` : (n ? '' : ' No pude investigar en internet, así que revíselo.');
      if (r.live) return `Listo, Señor. Lo he escrito en el Bloc de notas y guardado como «${r.name}» en su Escritorio (${r.words} palabras).${fuentes}`;
      if (r.reason === 'E3' || r.reason === 'E4') return `Se interrumpió la escritura en directo, Señor, así que he guardado el documento completo como «${r.name}» en su Escritorio.${fuentes}`;
      return `Listo, Señor. He escrito «${r.name}», de ${r.words} palabras, en su Escritorio.${fuentes}`;
    }
  }
  return null;
}
