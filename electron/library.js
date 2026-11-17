// Biblioteca de Nova: una carpeta donde dejas PDF, Word (.docx) y texto para que Nova los use como contexto.
// Carpeta por defecto: Documentos\Nova\Biblioteca (cámbiala con NOVA_LIBRARY en .env). Todo se lee en local.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFile } = require('child_process');

const EXTS = new Set(['.txt', '.md', '.csv', '.json', '.log', '.docx', '.pdf']);
const MAX_BYTES = 25 * 1024 * 1024, MAX_FILES = 300;
const STOP = new Set('de la el los las un una unos unas y o u en que se es por con para al del lo su sus mi mis tu tus me te le les como mas pero si no ya muy sobre entre este esta estos estas ese esa eso esto aqui alli hay ser son fue era he ha han sin sus nos cual cuales quien quienes donde cuando cuanto cuantos cuanta cuantas dime dame cuentame explica explicame resume resumeme habla hablame segun puedes podrias quiero necesito sirven sirve sirvan hace hacen funciona funcionan tal hola gracias'.split(' '));
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const tokens = (s) => norm(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 2 && !STOP.has(w));

let app = null; try { app = require('electron').app; } catch {}
const dir = () => process.env.NOVA_LIBRARY || (app ? path.join(app.getPath('documents'), 'Nova', 'Biblioteca') : path.join(process.cwd(), 'Biblioteca'));
function ensureDir() { try { fs.mkdirSync(dir(), { recursive: true }); const readme = path.join(dir(), 'LEEME.txt'); if (!fs.existsSync(readme) && !fs.readdirSync(dir()).length) fs.writeFileSync(readme, 'Biblioteca de Nova\r\n\r\nDeja aquí tus PDF, documentos de Word (.docx) y archivos de texto (.txt, .md).\r\nNova los leerá cuando necesite contexto: pregúntale «según mis documentos…», «resume el documento X» o «qué documentos tengo».\r\n', 'utf8'); } catch {} return dir(); }

// ---------- Lectura de .docx (ZIP + XML) sin dependencias ----------
function zipEntry(buf, wanted) {
  let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('ZIP no válido');
  let off = buf.readUInt32LE(e + 16); const n = buf.readUInt16LE(e + 10);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20), nl = buf.readUInt16LE(off + 28), xl = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32), lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nl);
    if (name === wanted) {
      const ds = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28), raw = buf.subarray(ds, ds + csize);
      return method === 0 ? raw : zlib.inflateRawSync(raw);
    }
    off += 46 + nl + xl + cl;
  }
  throw new Error('Entrada no encontrada');
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unent = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&(amp|lt|gt|quot|apos);/g, (_, n) => ENT[n]);
function docxText(file) {
  const xml = zipEntry(fs.readFileSync(file), 'word/document.xml').toString('utf8');
  return unent(xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<w:br[^>]*\/>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- PDF (vía Python + pypdf) ----------
const pyBin = () => { const p = path.join(__dirname, '..', 'venv', 'Scripts', 'python.exe'); return process.env.PYTHON || (fs.existsSync(p) ? p : 'python'); };
let pdfMissing = false;
function pdfText(file) {
  return new Promise((resolve, reject) => {
    execFile(pyBin(), [path.join(__dirname, 'library_pdf.py'), file], { windowsHide: true, timeout: 90000, maxBuffer: 40 * 1024 * 1024, encoding: 'utf8' }, (err, so) => {
      if (err) return reject(new Error('No pude ejecutar Python para leer el PDF'));
      let r; try { r = JSON.parse(so); } catch { return reject(new Error('Respuesta de PDF no válida')); }
      if (r.error === 'nopypdf') { pdfMissing = true; return reject(new Error('Falta pypdf (pip install pypdf)')); }
      if (r.error) return reject(new Error(r.error));
      resolve(String(r.text || ''));
    });
  });
}

// ---------- Índice ----------
const cache = new Map(); // ruta -> { sig, text, chunks, error }
function walk(d, depth, out) {
  let items; try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const it of items) {
    if (out.length >= MAX_FILES) return; if (it.name.startsWith('.') || it.name.startsWith('~$')) continue;
    const p = path.join(d, it.name);
    if (it.isDirectory()) { if (depth < 3) walk(p, depth + 1, out); continue; }
    const ext = path.extname(it.name).toLowerCase(); if (!EXTS.has(ext) || it.name.toLowerCase() === 'leeme.txt') continue;
    try { const st = fs.statSync(p); if (st.size <= MAX_BYTES) out.push({ path: p, name: path.relative(dir(), p), ext, size: st.size, mtime: st.mtimeMs }); } catch {}
  }
}
const files = () => { const o = []; ensureDir(); walk(dir(), 0, o); return o; };
function chunkify(text, name) {
  const paras = text.split(/\n{2,}|\r\n\r\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean); const out = []; let cur = '';
  for (const p of paras) { if ((cur + ' ' + p).length > 900 && cur) { out.push(cur); cur = p.length > 900 ? p.slice(-300) : p; } else cur = cur ? cur + ' ' + p : p; while (cur.length > 1400) { out.push(cur.slice(0, 900)); cur = cur.slice(800); } }
  if (cur) out.push(cur);
  return out.map((t) => ({ file: name, text: t, tk: new Set(tokens(t)) }));
}
async function load(f) {
  const sig = f.size + ':' + f.mtime, c = cache.get(f.path);
  if (c && c.sig === sig) return c;
  const e = { sig, text: '', chunks: [], error: '' };
  try {
    e.text = f.ext === '.docx' ? docxText(f.path) : f.ext === '.pdf' ? await pdfText(f.path) : fs.readFileSync(f.path, 'utf8').replace(/^\uFEFF/, '');
    e.chunks = chunkify(e.text, f.name); if (!e.text.trim()) e.error = 'Sin texto (¿PDF escaneado?)';
  } catch (er) { e.error = er.message; }
  cache.set(f.path, e); return e;
}
let indexing = null;
function refresh() { if (!indexing) indexing = (async () => { for (const f of files()) await load(f); })().finally(() => { indexing = null; }); return indexing; }

async function search(query, k = 3) {
  const q = [...new Set(tokens(query))]; if (!q.length) return { chunks: [] };
  await Promise.race([refresh(), new Promise((r) => setTimeout(r, 2500))]); // si aún está indexando, usa lo ya leído
  const all = []; for (const f of files()) { const c = cache.get(f.path); if (c) all.push(...c.chunks); }
  if (!all.length) return { chunks: [] };
  const df = {}; for (const ch of all) for (const t of q) if (ch.tk.has(t)) df[t] = (df[t] || 0) + 1;
  const need = Math.min(2, q.length), scored = [];
  for (const ch of all) {
    let s = 0, hit = 0; for (const t of q) if (ch.tk.has(t)) { hit++; s += Math.log(1 + all.length / df[t]); }
    if (hit >= need) scored.push({ file: ch.file, text: ch.text, score: Math.round(s * 100) / 100 });
  }
  scored.sort((a, b) => b.score - a.score);
  return { chunks: scored.slice(0, k) };
}
async function read(nameQuery, max = 9000) {
  const q = tokens(nameQuery), fs_ = files(); if (!fs_.length) return { error: 'La biblioteca está vacía' };
  let best = null, bs = 0;
  for (const f of fs_) { const n = norm(f.name); let s = 0; for (const t of q) if (n.includes(t)) s++; if (n.includes(norm(nameQuery).trim())) s += 3; if (s > bs) { bs = s; best = f; } }
  if (!best) return { error: 'No encuentro ese documento en la biblioteca', names: fs_.map((f) => f.name).slice(0, 12) };
  const e = await load(best); if (e.error && !e.text) return { error: e.error, name: best.name };
  return { name: best.name, text: e.text.slice(0, max), total: e.text.length, truncated: e.text.length > max };
}
function info() {
  const fl = files();
  return { dir: dir(), count: fl.length, files: fl.slice(0, 40).map((f) => ({ name: f.name, kind: f.ext.slice(1), size: f.size, error: cache.get(f.path)?.error || '' })), pdfMissing };
}
const openDir = async () => { const { shell } = require('electron'); ensureDir(); const r = await shell.openPath(dir()); return r ? { error: r } : { ok: true, dir: dir() }; };
module.exports = { info, search, read, refresh, openDir, ensureDir, dir, docxText, tokens };
