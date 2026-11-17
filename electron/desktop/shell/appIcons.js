// Iconos reales para dock y accesos: se resuelven a partir de accesos del menú Inicio y de rutas ya conocidas por Nova.
'use strict';
const fs = require('fs');
const path = require('path');
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function createAppIcons({ getFileIcon, readShortcut, dirs, fsImpl = fs, now = Date.now, ttl = 10 * 60 * 1000, maxCache = 150 }) {
  let map = null, at = 0; const cache = new Map();
  function scan() {
    const m = new Map();
    const walk = (dir, depth) => { let ents = []; try { ents = fsImpl.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) { const full = path.join(dir, e.name); if (e.isDirectory()) { if (depth < 3) walk(full, depth + 1); } else if (e.name.toLowerCase().endsWith('.lnk')) { const k = norm(e.name.replace(/\.lnk$/i, '')); if (k && !m.has(k)) m.set(k, full); } } };
    for (const d of dirs) if (d) walk(d, 0);
    map = m; at = now(); return m;
  }
  /** Ruta de la que sacar el icono de una aplicación del menú Inicio, o null (se mostrará la inicial). */
  function pathForApp(name) {
    const m = map && now() - at < ttl ? map : scan(); const lnk = m.get(norm(name)); if (!lnk) return null;
    try { const t = readShortcut(lnk)?.target; if (t && fsImpl.existsSync(t)) return t; } catch {}
    return lnk;
  }
  async function dataUrl(p) {
    if (!p) return null; if (cache.has(p)) return cache.get(p);
    try { const img = await getFileIcon(p); const url = img.toDataURL(); if (!url || img.isEmpty?.()) return null; if (cache.size >= maxCache) cache.delete(cache.keys().next().value); cache.set(p, url); return url; } catch { return null; }
  }
  return { pathForApp, dataUrl, norm };
}
module.exports = { createAppIcons };
