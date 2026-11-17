// Control del PC con permisos. SOLO acciones de una lista cerrada, SOLO dentro de las carpetas personales
// (Escritorio, Documentos, Descargas, Imágenes, Vídeos, Música, OneDrive). Lo que modifica pide permiso con un diálogo nativo.
// No ejecuta comandos arbitrarios ni teclea en otras ventanas. Se apaga con PC_CONTROL=off en .env. Registro en userData/pc-actions.log
const { app, dialog, shell, BrowserWindow } = require('electron');
const { AsyncLocalStorage } = require('async_hooks');
const fs = require('fs');
const path = require('path');
const { typeLive } = require('./typeLive');
const { research } = require('./webResearch');

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const KNOWN = { escritorio: 'desktop', documentos: 'documents', descargas: 'downloads', imagenes: 'pictures', fotos: 'pictures', videos: 'videos', musica: 'music' };
const RISKY = new Set(['.exe', '.bat', '.cmd', '.com', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.msi', '.msp', '.scr', '.lnk', '.reg', '.dll', '.jar', '.hta', '.cpl', '.url']);
const READABLE = new Set(['.txt', '.md', '.csv', '.json', '.log', '.xml', '.html', '.htm', '.ini']);
const session = new Set();
const als = new AsyncLocalStorage(); // contexto de una orden remota (móvil): el permiso se pide en el móvil, no en el PC
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'en', 'que', 'mi', 'mis']);

function roots() {
  const r = [];
  for (const k of ['desktop', 'documents', 'downloads', 'pictures', 'videos', 'music']) { try { r.push(app.getPath(k)); } catch {} }
  if (process.env.OneDrive) r.push(process.env.OneDrive);
  return [...new Set(r.map((p) => path.resolve(p)))];
}
const inside = (p, base) => { const a = path.resolve(p).toLowerCase(), b = path.resolve(base).toLowerCase(); return a === b || a.startsWith(b + path.sep); };
// Ruta válida solo si (ella y su destino real, por si hay enlaces) está dentro de las carpetas personales
function safe(p) {
  const rp = path.resolve(String(p || ''));
  if (!roots().some((r) => inside(rp, r))) return null;
  try { if (fs.existsSync(rp)) { const real = fs.realpathSync(rp); if (!roots().some((r) => inside(real, r))) return null; } } catch { return null; }
  return rp;
}
function log(line) { try { fs.appendFileSync(path.join(app.getPath('userData'), 'pc-actions.log'), new Date().toISOString() + ' ' + line + '\n'); } catch {} }

async function ask(action, message, detail, { once = false } = {}) {
  const remote = als.getStore()?.asker;
  if (!remote && !once && session.has(action)) { log(`${action} PERMITIDO(sesion) ${message}`); return true; }
  let response;
  if (remote) response = await remote({ action, message, detail });
  else {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const buttons = once ? ['Denegar', 'Permitir'] : ['Denegar', 'Permitir una vez', 'Permitir en esta sesión'];
    response = (await dialog.showMessageBox(win, { type: 'question', title: 'NOVA pide permiso', message, detail, buttons, defaultId: 0, cancelId: 0, noLink: true })).response;
    if (response === 2) session.add(action);
  }
  log(`${action} ${response ? 'PERMITIDO' : 'DENEGADO'}${remote ? ' (móvil)' : ''} ${message}`);
  return response > 0;
}
const cleanName = (s, max = 80) => {
  let b = String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).replace(/[. ]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(b)) b += '_';
  return b;
};

function findFiles(query, folderKey, kind) {
  let tokens = norm(query).split(/\s+/).filter(Boolean); const kept = tokens.filter((x) => !STOP.has(x)); if (kept.length) tokens = kept;
  if (!tokens.length) return [];
  const key = folderKey ? norm(folderKey) : '';
  const rs = KNOWN[key] ? [app.getPath(KNOWN[key])] : roots();
  const found = new Map(); const queue = rs.map((r) => [r, 0]); const t0 = Date.now(); let scanned = 0;
  while (queue.length && scanned < 60000 && Date.now() - t0 < 5000) {
    const [dir, depth] = queue.shift(); let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (e.name.startsWith('.') || e.name.startsWith('$') || e.name === 'node_modules') continue;
      scanned++; const full = path.join(dir, e.name), n = norm(e.name), isDir = e.isDirectory();
      if ((kind === 'folder' && !isDir) || (kind === 'file' && isDir)) { if (isDir && depth < 6 && !e.isSymbolicLink()) queue.push([full, depth + 1]); continue; }
      if (tokens.every((t) => n.includes(t)) && !found.has(full.toLowerCase())) {
        try { const st = fs.statSync(full); found.set(full.toLowerCase(), { name: e.name, dir, path: full, isDir, size: st.size, mtime: st.mtimeMs, score: n === tokens.join(' ') ? 3 : n.startsWith(tokens[0]) ? 2 : 1 }); } catch {}
      }
      if (isDir && depth < 6 && !e.isSymbolicLink()) queue.push([full, depth + 1]);
    }
  }
  return [...found.values()].sort((a, b) => b.score - a.score || b.mtime - a.mtime).slice(0, 10);
}

async function run(action, a = {}) {
  if (process.env.PC_CONTROL === 'off') return { error: 'El control del PC está desactivado (PC_CONTROL=off en .env).' };
  switch (action) {
    case 'find': return { ok: true, result: findFiles(a.query, a.folder, a.kind) };
    case 'reveal': { const p = safe(a.path); if (!p || !fs.existsSync(p)) return { error: 'Ruta no permitida o inexistente' }; shell.showItemInFolder(p); return { ok: true }; }
    case 'open_folder': { const k = KNOWN[norm(a.name || '')]; if (!k) return { error: 'Carpeta desconocida' }; const e = await shell.openPath(app.getPath(k)); return e ? { error: e } : { ok: true }; }
    case 'open': {
      const p = safe(a.path); if (!p || !fs.existsSync(p)) return { error: 'Ruta no permitida o inexistente' };
      if (RISKY.has(path.extname(p).toLowerCase())) return { error: 'Por seguridad no abro programas ni scripts con esta función' };
      if (!(await ask('open', `Abrir «${path.basename(p)}»`, p))) return { denied: true };
      const e = await shell.openPath(p); return e ? { error: e } : { ok: true };
    }
    case 'read': {
      const p = safe(a.path); if (!p || !fs.existsSync(p)) return { error: 'Ruta no permitida o inexistente' };
      if (!READABLE.has(path.extname(p).toLowerCase())) return { error: 'Solo leo archivos de texto (.txt, .md, .csv, .json, .log…)' };
      const st = fs.statSync(p); if (st.size > 150000) return { error: 'El archivo es demasiado grande (máximo 150 KB)' };
      return { ok: true, name: path.basename(p), text: fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '') };
    }
    case 'research': return research(a.topic); // solo lectura: busca y lee varias páginas públicas
    case 'write_text': {
      const text = String(a.content || '').replace(/\r\n/g, '\n').trim();
      if (text.length < 20) return { error: 'El texto está vacío' };
      if (text.length > 200000) return { error: 'El texto es demasiado largo' };
      const ext = a.ext === 'md' ? 'md' : 'txt', base = cleanName(a.title) || 'Documento de Nova', dir = app.getPath('desktop');
      let file = path.join(dir, `${base}.${ext}`), n = 2; while (fs.existsSync(file)) file = path.join(dir, `${base} (${n++}).${ext}`);
      const words = text.split(/\s+/).length;
      // En directo: abre el Bloc de notas, escribe a la vista y lo guarda (Windows; se apaga con PC_LIVE_TYPING=off)
      const live = a.live === true && process.platform === 'win32' && String(process.env.PC_LIVE_TYPING || 'on').toLowerCase() !== 'off';
      const msg = live ? `Abrir el Bloc de notas, escribir «${path.basename(file)}» (${words} palabras) y guardarlo en el Escritorio` : `Crear «${path.basename(file)}» en el Escritorio (${words} palabras)`;
      const det = 'Vista previa:\n\n' + text.slice(0, 350) + (text.length > 350 ? '…' : '') + (live ? '\n\nMientras escribe, no toque el teclado ni el ratón.' : '');
      if (!(await ask('write_text', msg, det))) return { denied: true };
      let liveOk = false, reason = '';
      if (live) { const r = await typeLive(file, text); liveOk = r.ok; reason = r.reason || ''; log(`write_text en directo: ${liveOk ? 'OK' : 'FALLO ' + reason}`); }
      if (!liveOk) {
        fs.writeFileSync(file, '\uFEFF' + text.replace(/\n/g, '\r\n'), 'utf8');
        if (a.open !== false && (!live || reason === 'E2' || reason === 'E9')) await shell.openPath(file);
      }
      return { ok: true, path: file, name: path.basename(file), words, live: liveOk, reason };
    }
    case 'mkdir': {
      const k = KNOWN[norm(a.where || 'escritorio')] || 'desktop', name = cleanName(a.name, 60); if (!name) return { error: 'Nombre de carpeta no válido' };
      const target = path.join(app.getPath(k), name); if (fs.existsSync(target)) return { error: 'Ya existe una carpeta con ese nombre' };
      if (!(await ask('mkdir', `Crear la carpeta «${name}»`, path.dirname(target)))) return { denied: true };
      fs.mkdirSync(target); return { ok: true, path: target };
    }
    case 'trash': {
      const p = safe(a.path); if (!p || !fs.existsSync(p)) return { error: 'Ruta no permitida o inexistente' };
      if (roots().some((r) => path.resolve(r).toLowerCase() === p.toLowerCase())) return { error: 'No muevo carpetas personales completas' };
      if (!(await ask('trash', `Mover a la Papelera «${path.basename(p)}»`, p + '\n\nSe podrá recuperar desde la Papelera de reciclaje.', { once: true }))) return { denied: true };
      await shell.trashItem(p); return { ok: true };
    }
    default: return { error: 'Acción no permitida' };
  }
}
// Orden desde el móvil: asker({action,message,detail}) debe devolver 0 (denegar) o 1 (permitir)
const runRemote = (action, args, asker) => als.run({ asker }, () => run(action, args));
module.exports = { run, runRemote, _safe: safe };
