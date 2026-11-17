// Almacén único de preferencias de Nova Desktop (proceso principal).
// Todas las ventanas (principal, panel, barra, dock) leen y escriben a través de él: no hay copias que se pisen.
// Se guarda en la misma clave `desk.prefs` de la tabla `settings` que ya usaban las updates anteriores.
'use strict';
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const clone = (o) => JSON.parse(JSON.stringify(o));

/** Mezcla profunda: objetos se fusionan (incluidas claves desconocidas), arreglos y valores simples se reemplazan. */
function deepMerge(base, over) {
  if (!isObj(over)) return base;
  const out = isObj(base) ? { ...base } : {};
  for (const k of Object.keys(over)) {
    if (BAD.has(k) || over[k] === undefined) continue;
    out[k] = isObj(over[k]) && isObj(out[k]) ? deepMerge(out[k], over[k]) : (isObj(over[k]) ? deepMerge({}, over[k]) : over[k]);
  }
  return out;
}

const ENUM = {
  'nativeWidgets.size': ['compact', 'normal', 'wide'], 'nativeWidgets.side': ['left', 'right'],
  'nativeWidgets.topbar.align': ['left', 'center', 'right'], 'nativeWidgets.topbar.width': ['compact', 'full'],
  'nativeWidgets.dockbar.size': ['compact', 'normal'], 'shell.startMode': ['window', 'background'],
  'shell.toasts': ['auto', 'topbar', 'windows'], theme: ['dark', 'light', 'system'], accent: ['nova', 'fixed', 'system'],
};
const get = (o, path) => path.split('.').reduce((t, k) => (t == null ? t : t[k]), o);
const set = (o, path, v) => { const ks = path.split('.'); let t = o; for (const k of ks.slice(0, -1)) { if (!isObj(t[k])) return; t = t[k]; } t[ks[ks.length - 1]] = v; };
const displaysOk = (a) => (Array.isArray(a) ? a.map((x) => String(x).slice(0, 40)).slice(0, 8) : null);

/** Corrige valores fuera de rango para que el proceso principal nunca reciba basura. */
function sanitize(p, defaults) {
  for (const [path, allowed] of Object.entries(ENUM)) { if (!allowed.includes(get(p, path))) set(p, path, get(defaults, path)); }
  const nw = p.nativeWidgets;
  if (nw) {
    nw.opacity = Math.max(30, Math.min(94, Number(nw.opacity) || 62));
    for (const b of ['topbar', 'dockbar']) { if (!nw[b]) continue; const d = displaysOk(nw[b].displays); nw[b].displays = d && d.length ? d : ['primary']; }
    if (!Array.isArray(nw.items)) nw.items = defaults.nativeWidgets.items.slice();
    nw.items = [...new Set(nw.items.map(String))].slice(0, 20);
  }
  return p;
}

/** Preferencias antiguas (v2) → v3. No borra nada: solo añade lo que falte. */
function migrate(saved) {
  const s = isObj(saved) ? saved : {};
  const nw = s.nativeWidgets;
  if (isObj(nw)) {
    for (const b of ['topbar', 'dockbar']) {
      if (isObj(nw[b]) && !Array.isArray(nw[b].displays)) nw[b].displays = [nw[b].displayId ? String(nw[b].displayId) : 'primary'];
    }
  }
  s.v = 3;
  return s;
}

function createPrefsStore({ read, write, defaults, onChange = () => {} }) {
  let cache = null, at = 0;
  const load = () => {
    let saved = {};
    try { const raw = read(); if (raw) saved = JSON.parse(raw); } catch { saved = {}; }
    cache = sanitize(deepMerge(clone(defaults), migrate(saved)), defaults); at = Date.now();
    return cache;
  };
  const persist = () => { try { write(JSON.stringify(cache)); } catch { /* sin base de datos: se mantiene en memoria */ } };
  return {
    // Lectura con caché de 1,5 s: otros módulos (p. ej. el asistente inicial) escriben `desk.prefs` directamente
    get() { return clone(cache && Date.now() - at < 1500 ? cache : load()); },
    patch(delta) {
      if (!isObj(delta) || JSON.stringify(delta).length > 65536) throw new Error('Cambio de preferencias no válido');
      cache = sanitize(deepMerge(load(), delta), defaults); at = Date.now(); persist(); const out = clone(cache); onChange(out, delta); return out;
    },
    reset() { cache = clone(defaults); try { write(''); } catch {} const out = clone(cache); onChange(out, null); return out; },
    reload: () => clone(load()),
  };
}
module.exports = { createPrefsStore, deepMerge, sanitize, migrate };
