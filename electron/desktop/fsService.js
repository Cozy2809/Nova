// Operaciones de archivos reales de Nova Desktop. Nunca sobrescriben. Todo pasa por fsGuard.
'use strict';
const fs = require('fs');
const path = require('path');
const { AgentError, ERR } = require('../agent/contract');
const { cleanName } = require('./fsGuard');

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const SKIP = new Set(['desktop.ini', 'thumbs.db', '$recycle.bin', 'node_modules']);
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'en', 'que', 'mi', 'mis']);
const exists = (p) => { try { fs.lstatSync(p); return true; } catch { return false; } };

function createFsService({ guard, trash, getPlaces }) {
  const fail = (code, msg) => { throw new AgentError(code, msg); };

  function list(dir) {
    const d = guard.safe(dir, { mustExist: true });
    let st; try { st = fs.statSync(d); } catch (e) { fail(ERR.EXEC, 'No se puede leer la carpeta: ' + e.message); }
    if (!st.isDirectory()) fail(ERR.VALIDATION, 'No es una carpeta');
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { fail(ERR.EXEC, 'No se puede leer la carpeta: ' + (e.code === 'EPERM' || e.code === 'EACCES' ? 'sin permiso' : e.message)); }
    const out = []; let truncated = false;
    for (const e of ents) {
      if (SKIP.has(e.name.toLowerCase())) continue;
      if (out.length >= 1000) { truncated = true; break; }
      const full = path.join(d, e.name); let size = 0, mtime = 0;
      try { const s = fs.statSync(full); size = s.size; mtime = s.mtimeMs; } catch { /* enlace roto o sin permiso: se muestra igualmente */ }
      out.push({ name: e.name, path: full, isDir: e.isDirectory(), size: e.isDirectory() ? null : size, mtime, ext: e.isDirectory() ? '' : path.extname(e.name).toLowerCase().slice(1), hidden: e.name.startsWith('.') });
    }
    const parent = guard.roots().some((r) => path.resolve(r).toLowerCase() === d.toLowerCase()) ? null : path.dirname(d);
    return { path: d, parent: parent && (() => { try { guard.safe(parent); return parent; } catch { return null; } })(), items: out, truncated };
  }

  function places() { return (getPlaces() || []).filter((p) => p.path && exists(p.path)); }

  // Búsqueda por nombre con recorrido acotado (alternativa cuando el índice de Windows no responde)
  function walkSearch({ query = '', folder, ext, kind, limit = 40, maxMs = 5000, maxScanned = 60000 }) {
    let tokens = norm(query).split(/\s+/).filter(Boolean); const kept = tokens.filter((x) => !STOP.has(x)); if (kept.length) tokens = kept;
    const wantExt = ext ? String(ext).toLowerCase().replace(/^\./, '') : '';
    if (!tokens.length && !wantExt) fail(ERR.VALIDATION, 'Escribe qué buscar o una extensión');
    const rs = folder ? [guard.safe(folder, { mustExist: true })] : guard.roots().filter(exists);
    const found = new Map(), queue = rs.map((r) => [r, 0]); const t0 = Date.now(); let scanned = 0, truncated = false;
    while (queue.length) {
      if (scanned >= maxScanned || Date.now() - t0 > maxMs) { truncated = true; break; }
      const [dir, depth] = queue.shift(); let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) {
        if (e.name.startsWith('.') || e.name.startsWith('$') || SKIP.has(e.name.toLowerCase())) continue;
        scanned++; const full = path.join(dir, e.name), n = norm(e.name), isDir = e.isDirectory();
        if (isDir && depth < 6 && !e.isSymbolicLink()) queue.push([full, depth + 1]);
        if ((kind === 'folder' && !isDir) || (kind === 'file' && isDir)) continue;
        if (wantExt && (isDir || path.extname(e.name).toLowerCase().slice(1) !== wantExt)) continue;
        if (tokens.every((t) => n.includes(t)) && !found.has(full.toLowerCase())) {
          try { const s = fs.statSync(full); found.set(full.toLowerCase(), { name: e.name, path: full, dir, isDir, size: isDir ? null : s.size, mtime: s.mtimeMs, score: n === tokens.join(' ') ? 3 : n.startsWith(tokens[0] || '') ? 2 : 1 }); } catch {}
        }
      }
    }
    const items = [...found.values()].sort((a, b) => b.score - a.score || b.mtime - a.mtime).slice(0, limit);
    return { items, scanned, truncated, source: 'walk' };
  }

  // Elementos a procesar: validados, existentes y sin duplicados
  function sources(paths) {
    const seen = new Set(), out = [];
    for (const p of paths) { const s = guard.safe(p, { mustExist: true }); if (guard.isRoot(s)) fail(ERR.NOT_ALLOWED_PATH, 'No se pueden mover, copiar ni borrar carpetas personales completas'); if (!seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); } }
    return out;
  }
  function plan(paths, toDir) {
    const dest = guard.safe(toDir, { mustExist: true });
    if (!fs.statSync(dest).isDirectory()) fail(ERR.VALIDATION, 'El destino no es una carpeta');
    const pairs = sources(paths).map((from) => ({ from, to: path.join(dest, path.basename(from)) }));
    const names = new Set();
    for (const p of pairs) {
      if (names.has(p.to.toLowerCase())) fail(ERR.VALIDATION, 'Dos elementos tienen el mismo nombre: ' + path.basename(p.from));
      names.add(p.to.toLowerCase());
      if (exists(p.to)) fail(ERR.VALIDATION, `Ya existe «${path.basename(p.to)}» en el destino. Nova no sobrescribe archivos.`);
      if (path.resolve(p.to).toLowerCase() === p.from.toLowerCase()) fail(ERR.VALIDATION, 'El origen y el destino son el mismo');
      if (fs.statSync(p.from).isDirectory() && guard.inside(dest, p.from)) fail(ERR.VALIDATION, `No se puede mover «${path.basename(p.from)}» dentro de sí misma`);
    }
    return pairs;
  }
  function copy(paths, toDir, signal) { const pairs = plan(paths, toDir); for (const p of pairs) { if (signal?.aborted) break; fs.cpSync(p.from, p.to, { recursive: true, errorOnExist: true, force: false }); } return pairs; }
  function move(paths, toDir, signal) {
    const pairs = plan(paths, toDir);
    for (const p of pairs) {
      if (signal?.aborted) break;
      try { fs.renameSync(p.from, p.to); }
      catch (e) { if (e.code !== 'EXDEV') throw e; fs.cpSync(p.from, p.to, { recursive: true, errorOnExist: true, force: false }); fs.rmSync(p.from, { recursive: true }); }
    }
    return pairs;
  }
  function rename(p, newName) {
    const from = sources([p])[0], name = cleanName(newName);
    if (!name) fail(ERR.VALIDATION, 'Nombre no válido');
    const to = path.join(path.dirname(from), name);
    if (exists(to) && to.toLowerCase() !== from.toLowerCase()) fail(ERR.VALIDATION, `Ya existe «${name}»`);
    fs.renameSync(from, to); return { from, to };
  }
  function mkdir(p) {
    const target = guard.safe(p); const name = cleanName(path.basename(target)); if (!name) fail(ERR.VALIDATION, 'Nombre de carpeta no válido');
    const dir = path.join(guard.safe(path.dirname(target), { mustExist: true }), name);
    if (exists(dir)) fail(ERR.VALIDATION, 'Ya existe: ' + dir);
    fs.mkdirSync(dir); return { path: dir };
  }
  async function trashItems(paths, signal) { const list = sources(paths); for (const p of list) { if (signal?.aborted) break; await trash(p); } return list; }

  function stat(p) { try { const s = fs.statSync(p); return { isDir: s.isDirectory(), size: s.isDirectory() ? null : s.size, mtime: s.mtimeMs }; } catch { return null; } }

  return { stat, list, places, walkSearch, plan, copy, move, rename, mkdir, trashItems, exists: (p) => exists(p) };
}
module.exports = { createFsService };
