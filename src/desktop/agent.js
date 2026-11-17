// Cliente de Nova Agent para la interfaz. Solo habla con window.jarvis.agent (preload) — nunca con Node ni con PowerShell.
import { useSyncExternalStore, useEffect, useRef, useState, useCallback } from 'react';

const api = () => (typeof window !== 'undefined' ? window.jarvis?.agent : undefined);
export const agentAvailable = () => !!api();

/** Ejecuta una herramienta y devuelve su resultado, o lanza un Error con el motivo real (con .code y .action). */
export async function run(tool, args = {}) {
  if (!api()) throw Object.assign(new Error('El motor de herramientas no está disponible'), { code: 'UNAVAILABLE' });
  const r = await api().run(tool, args);
  if (r.error) throw new Error(r.error);
  const a = r.action;
  if (a.state !== 'succeeded') throw Object.assign(new Error(a.error?.message || (a.state === 'cancelled' ? 'Cancelada' : 'No se pudo completar')), { code: a.error?.code, action: a });
  return a.result;
}
export const msgOf = (e) => (e && e.message) || String(e || 'Error desconocido');

// ---- Almacén de eventos (confirmaciones pendientes y actividad reciente) ----
let state = { confirms: [], feed: [] };
const subs = new Set();
const FINAL = new Set(['succeeded', 'failed', 'cancelled']);
const emit = () => subs.forEach((f) => f());
let started = false;
export function startAgentEvents() {
  if (started || !api()) return; started = true;
  api().onEvent(({ type, action }) => {
    const feed = [action, ...state.feed.filter((a) => a.id !== action.id)].slice(0, 40);
    let confirms = state.confirms.filter((a) => a.id !== action.id);
    if (action.state === 'awaiting_confirmation') confirms = [...confirms, action];
    state = { feed, confirms }; emit();
  });
}
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const useAgentStore = () => useSyncExternalStore(subscribe, () => state);
export const answerConfirm = (id, a) => api()?.answer(id, a);
export const cancelAction = (id) => api()?.cancel(id);
export const isFinal = (a) => FINAL.has(a.state);

// ---- Sondeo con estados reales de carga y error ----
export function usePoll(fn, ms, { enabled = true, deps = [] } = {}) {
  const [s, setS] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn); fnRef.current = fn;
  const reload = useCallback(async () => {
    try { const data = await fnRef.current(); setS({ data, error: null, loading: false }); }
    catch (e) { setS((p) => ({ data: p.data, error: msgOf(e), loading: false })); }
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    let on = true, t;
    const tick = async () => { if (!on) return; if (!document.hidden) await reload(); if (on && ms) t = setTimeout(tick, ms); };
    setS((p) => ({ ...p, loading: true })); tick();
    return () => { on = false; clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ms, ...deps]);
  return { ...s, reload };
}
