// Preferencias de Nova Desktop. El proceso principal es el único dueño: aquí hay una copia que se sincroniza con él.
// Cada cambio viaja como un parche (solo lo que cambió) y todas las ventanas reciben el resultado; así ya no se pisan entre sí
// ni se pierden la posición, el monitor o los datos que guarda el proceso principal.
import { useSyncExternalStore } from 'react';
import DEFAULTS from './prefs.defaults.json';

export { DEFAULTS };
const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
// Mezcla profunda que conserva claves desconocidas (posiciones guardadas, etc.); arreglos y valores simples se reemplazan
export const merge = (base, over) => { if (!isObj(over)) return base; const o = isObj(base) ? { ...base } : {}; for (const k of Object.keys(over)) { if (BAD.has(k) || over[k] === undefined) continue; o[k] = isObj(over[k]) && isObj(o[k]) ? merge(o[k], over[k]) : (isObj(over[k]) ? merge({}, over[k]) : over[k]); } return o; };
// Diferencia mínima entre dos estados: lo que hay que enviar al proceso principal
export const diff = (a, b) => { if (!isObj(a) || !isObj(b)) return JSON.stringify(a) === JSON.stringify(b) ? undefined : b; const out = {}; for (const k of Object.keys(b)) { const d = isObj(b[k]) && isObj(a?.[k]) ? diff(a[k], b[k]) : (JSON.stringify(a?.[k]) === JSON.stringify(b[k]) ? undefined : b[k]); if (d !== undefined && !(isObj(d) && !Object.keys(d).length)) out[k] = d; } return Object.keys(out).length ? out : undefined; };

let prefs = clone(DEFAULTS), loaded = false, timer = null, pending = null, inflight = 0, listening = false;
const subs = new Set(); const emit = () => subs.forEach((f) => f());
export const prefsLoaded = () => loaded;
const api = () => (typeof window !== 'undefined' ? window.jarvis : undefined);

function listen() {
  if (listening || !api()?.onNova) return; listening = true;
  // Cambios hechos en otra ventana (o por el proceso principal). Mientras haya cambios propios sin enviar, se esperan.
  api().onNova('prefs', (p) => { if (timer || inflight) return; prefs = merge(clone(DEFAULTS), p); emit(); });
}

export async function loadPrefs() {
  listen();
  try { const r = await api().nova('prefs-get'); if (r && !r.error) prefs = merge(clone(DEFAULTS), r); }
  catch { prefs = clone(DEFAULTS); }
  loaded = true; emit(); return prefs;
}
function flush() {
  timer = null; const patch = pending; pending = null; if (!patch) return;
  inflight++;
  api().nova('prefs-patch', { patch }).then((r) => { if (r && !r.error && !timer && !pending) { prefs = merge(clone(DEFAULTS), r); emit(); } }).catch(() => {}).finally(() => { inflight--; });
}
export function setPrefs(patch) {
  const next = merge(prefs, typeof patch === 'function' ? patch(prefs) : patch); const d = diff(prefs, next); if (!d) return;
  prefs = next; emit(); pending = merge(pending || {}, d);
  clearTimeout(timer); timer = setTimeout(flush, 120);
}
export function resetPrefs() { prefs = clone(DEFAULTS); pending = null; clearTimeout(timer); timer = null; emit(); try { api().nova('prefs-reset'); } catch {} }
export const usePrefs = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => prefs);
// Cambios anidados cómodos
export const setDeep = (path, value) => setPrefs((p) => { const o = clone(p); let t = o; const ks = path.split('.'); ks.slice(0, -1).forEach((k) => { if (!isObj(t[k])) t[k] = {}; t = t[k]; }); t[ks[ks.length - 1]] = value; return o; });
