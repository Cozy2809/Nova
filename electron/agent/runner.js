// Motor de ejecución de acciones: valida → decide permiso → (confirma) → ejecuta → verifica → audita.
// No conoce Electron: recibe el registro, la auditoría y un "confirmador" por inyección (así se prueba sin ventana).
'use strict';
const crypto = require('crypto');
const { STATE, FINAL, TRANSITIONS, ORIGIN, LEVEL, ERR, AgentError } = require('./contract');
const { validate } = require('./schema');
const { decide } = require('./permissions');

const CONFIRM_TIMEOUT_MS = 120000;
const MAX_KEPT = 200;

/**
 * @param {object} o
 * @param {object} o.registry
 * @param {object} o.audit  { write }
 * @param {(action)=>Promise<{allow:boolean, ack?:boolean, session?:boolean}>} o.confirm  pide la confirmación al usuario
 * @param {()=>object} [o.settings]  ajustes (clave→texto)
 * @param {object} [o.env]  variables de entorno relevantes (PC_CONTROL)
 * @param {object} [o.services]  servicios que reciben las herramientas en ctx.services
 * @param {(event)=>void} [o.emit]  difusión de eventos hacia la interfaz
 */
function createAgent({ registry, audit = { write() {} }, confirm, settings = () => ({}), env = process.env, services = {}, emit = () => {}, now = () => Date.now(), confirmTimeoutMs = CONFIRM_TIMEOUT_MS }) {
  const actions = new Map();      // id → registro interno { action, controller, waiter }
  const quietFails = new Map();
  const sessionGrants = new Set(); // herramientas permitidas "en esta sesión" (solo origen UI y contenido fiable)

  const snapshot = (a) => JSON.parse(JSON.stringify(a));
  // "quiet": lectura de riesgo bajo iniciada desde la interfaz (sondeos, listados, búsquedas). No se audita ni se anuncia salvo que falle.
  const fire = (type, a) => { if (actions.get(a.id)?.quiet) return; try { emit({ type, action: snapshot(a) }); } catch {} };
  const announce = (rec) => { if (!rec.announced) { rec.announced = true; fire('created', rec.action); } };
  const log = (a, event, msg) => { a.log.push({ t: now(), event, msg: String(msg || '').slice(0, 300) }); if (a.log.length > 100) a.log.shift(); };

  function setState(rec, next, extra = {}) {
    const a = rec.action;
    if (FINAL.has(a.state)) return false;
    if (rec.quiet && next === STATE.FAILED) {
      // Un fallo repetido de un sondeo (p. ej. PowerShell bloqueado) se registra una vez cada 5 minutos, no en cada consulta
      const key = a.tool + '|' + (extra.error && extra.error.code) + '|' + (extra.error && extra.error.message), last = quietFails.get(key);
      if (!last || now() - last > 300000) { quietFails.set(key, now()); rec.quiet = false; announce(rec); }
    }
    if (!TRANSITIONS[a.state].includes(next)) throw new Error(`Transición no válida ${a.state} → ${next}`);
    a.state = next; a.updatedAt = now(); Object.assign(a, extra); log(a, 'state', next);
    fire('state', a);
    if (FINAL.has(next)) {
      if (!rec.quiet) audit.write({ id: a.id, tool: a.tool, origin: a.origin, risk: a.risk, state: next, summary: a.summary, args: a.args, decision: a.decision, error: a.error, ms: a.updatedAt - a.createdAt, dryRun: a.dryRun || undefined, verified: a.verified });
      fire('result', a);
      if (actions.size > MAX_KEPT) { for (const [k, r] of actions) { if (FINAL.has(r.action.state)) { actions.delete(k); if (actions.size <= MAX_KEPT) break; } } }
    }
    return true;
  }
  const finishErr = (rec, code, message, state = STATE.FAILED) => setState(rec, state, { error: { code, message } });

  /**
   * Crea la acción. Devuelve { action, done } donde done se resuelve con la acción final.
   * Si los parámetros no son válidos, la acción queda `failed` al instante.
   */
  function submit({ tool: name, args, origin = ORIGIN.UI, untrusted = false, dryRun = false } = {}) {
    const id = crypto.randomUUID();
    const tool = registry.get(String(name));
    const action = { id, tool: String(name || ''), origin, untrusted: !!untrusted, dryRun: !!dryRun, args: {}, state: STATE.PENDING, risk: tool ? tool.risk : null, summary: '', confirmation: null, progress: null, result: null, error: null, verified: null, decision: null, createdAt: now(), updatedAt: now(), log: [] };
    const rec = { action, controller: new AbortController(), answer: null };
    actions.set(id, rec);
    const done = (async () => {
      if (!tool) { announce(rec); finishErr(rec, ERR.UNKNOWN_TOOL, 'Herramienta desconocida: ' + action.tool); return action; }
      const v = validate(tool.schema, args);
      if (!v.ok) { action.args = typeof args === 'object' && args ? args : {}; announce(rec); finishErr(rec, ERR.VALIDATION, v.errors.join('; ')); return action; }
      action.args = v.value;
      try { action.summary = String(tool.summarize(v.value)).slice(0, 400); } catch { action.summary = tool.title; }
      const d = decide(tool, v.value, { origin, untrusted, settings: settings(), env, sessionGrants });
      action.risk = d.risk; action.decision = { confirm: d.confirm, level: d.level, reason: d.reason };
      if (!d.allow) { announce(rec); finishErr(rec, ERR.POLICY_BLOCKED, d.reason); return action; }
      rec.quiet = origin === ORIGIN.UI && d.risk === 'low' && !d.confirm && !action.dryRun;
      if (!rec.quiet) announce(rec);

      if (action.dryRun && tool.risk !== 'low' && typeof tool.dryRun !== 'function') {
        // Seguridad por defecto: sin simulación declarada, una herramienta que modifica solo devuelve el plan.
        action.result = { planned: true, summary: action.summary }; setState(rec, STATE.RUNNING); setState(rec, STATE.SUCCEEDED); return action;
      }

      if (d.confirm && !action.dryRun) {
        action.confirmation = { required: true, level: d.level, title: tool.title, summary: action.summary, consequences: safeList(tool, v.value), reason: d.reason, canRemember: d.canRemember };
        setState(rec, STATE.AWAITING); fire('confirm', action);
        let ans;
        try { ans = await waitAnswer(rec); } catch (e) { return finalAfterWait(rec, e); }
        if (!ans || !ans.allow) { finishErr(rec, ERR.DENIED, 'Denegada por el usuario', STATE.CANCELLED); return action; }
        if (d.level === LEVEL.STRONG && ans.ack !== true) { finishErr(rec, ERR.DENIED, 'Falta la confirmación explícita de la acción de alto riesgo', STATE.CANCELLED); return action; }
        if (ans.session && d.canRemember) sessionGrants.add(tool.name);
      }
      if (rec.controller.signal.aborted) { finishErr(rec, ERR.CANCELLED, 'Cancelada', STATE.CANCELLED); return action; }

      setState(rec, STATE.RUNNING);
      const ctx = {
        signal: rec.controller.signal, origin, dryRun: action.dryRun, services,
        progress: (pct, message) => { action.progress = { pct: Math.max(0, Math.min(100, Math.round(Number(pct) || 0))), message: String(message || '').slice(0, 200) }; fire('progress', action); },
        log: (m) => log(action, 'tool', m),
      };
      let timer;
      try {
        const limit = tool.timeoutMs || 60000;
        const run = action.dryRun && typeof tool.dryRun === 'function' ? tool.dryRun(ctx, v.value) : tool.execute(ctx, v.value);
        const timeout = new Promise((_, rej) => { timer = setTimeout(() => { rej(new AgentError(ERR.TIMEOUT, `Tiempo agotado (${Math.round(limit / 1000)} s)`)); rec.controller.abort(); }, limit); });
        const aborted = new Promise((_, rej) => rec.controller.signal.addEventListener('abort', () => rej(new AgentError(ERR.CANCELLED, 'Cancelada')), { once: true }));
        const result = await Promise.race([run, timeout, aborted]);
        if (FINAL.has(action.state)) return action;
        if (!action.dryRun && typeof tool.verify === 'function') {
          let vr; try { vr = await tool.verify(ctx, v.value, result); } catch (e) { vr = { ok: false, message: e.message }; }
          const ok = vr === true || (vr && vr.ok === true);
          action.verified = ok;
          if (!ok) { action.result = result ?? null; finishErr(rec, ERR.VERIFY, (vr && vr.message) || 'No se pudo comprobar que la operación se realizó'); return action; }
        }
        action.result = result === undefined ? null : result;
        setState(rec, STATE.SUCCEEDED);
      } catch (e) {
        if (FINAL.has(action.state)) return action;
        const code = e instanceof AgentError ? e.code : ERR.EXEC;
        finishErr(rec, code, e.message || String(e), code === ERR.CANCELLED ? STATE.CANCELLED : STATE.FAILED);
      } finally { clearTimeout(timer); }
      return action;
    })();
    return { action, done: done.then(() => snapshot(action)) };
  }

  function safeList(tool, args) { try { return (tool.consequences ? tool.consequences(args) : []).map((s) => String(s).slice(0, 300)).slice(0, 8); } catch { return []; } }

  function waitAnswer(rec) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new AgentError(ERR.TIMEOUT, 'Sin respuesta del usuario')), confirmTimeoutMs);
      rec.answer = (ans) => { clearTimeout(t); rec.answer = null; resolve(ans); };
      rec.abortWait = () => { clearTimeout(t); rec.answer = null; reject(new AgentError(ERR.CANCELLED, 'Cancelada')); };
      // Confirmador por defecto (interfaz): se pregunta y la respuesta llega por answer(). Un confirmador remoto puede responder aquí.
      if (typeof confirm === 'function') Promise.resolve(confirm(snapshot(rec.action))).then((r) => { if (r && rec.answer) rec.answer(r); }).catch(() => {});
    });
  }
  function finalAfterWait(rec, e) {
    const code = e instanceof AgentError ? e.code : ERR.EXEC;
    finishErr(rec, code, e.message, code === ERR.TIMEOUT || code === ERR.CANCELLED ? STATE.CANCELLED : STATE.FAILED);
    return rec.action;
  }

  return {
    submit,
    /** Atajo: crea y espera el resultado. */
    run: (req) => submit(req).done,
    /** Respuesta del usuario a una confirmación pendiente. Solo se acepta si la acción está esperando. */
    answer(id, { allow, ack, session } = {}) {
      const rec = actions.get(id);
      if (!rec || rec.action.state !== STATE.AWAITING || !rec.answer) return { ok: false, error: 'No hay confirmación pendiente para esa acción' };
      rec.answer({ allow: allow === true, ack: ack === true, session: session === true }); return { ok: true };
    },
    cancel(id) {
      const rec = actions.get(id);
      if (!rec) return { ok: false, error: 'Acción desconocida' };
      const a = rec.action;
      if (FINAL.has(a.state)) return { ok: false, error: 'La acción ya terminó' };
      if (a.state === STATE.AWAITING) { rec.abortWait && rec.abortWait(); return { ok: true }; }
      const tool = registry.get(a.tool);
      if (a.state === STATE.RUNNING && tool && tool.cancellable === false) return { ok: false, error: 'Esta operación no se puede cancelar' };
      rec.controller.abort(); return { ok: true };
    },
    get: (id) => (actions.has(id) ? snapshot(actions.get(id).action) : null),
    list: (limit = 50) => [...actions.values()].map((r) => snapshot(r.action)).slice(-limit).reverse(),
    sessionGrants,
    clearSessionGrants: () => sessionGrants.clear(),
  };
}
module.exports = { createAgent, CONFIRM_TIMEOUT_MS };
