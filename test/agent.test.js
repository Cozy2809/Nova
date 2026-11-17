// Pruebas del motor de Nova Agent (sin Electron, sin tocar archivos reales). Ejecutar: node --test test/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { createRegistry } = require('../electron/agent/registry');
const { createAgent } = require('../electron/agent/runner');
const { createAudit } = require('../electron/agent/audit');
const { validate } = require('../electron/agent/schema');
const { decide } = require('../electron/agent/permissions');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function setup(opts = {}) {
  const registry = createRegistry(); const calls = []; const events = [];
  registry.register({ name: 'test.low', title: 'Leer', risk: 'low', schema: { q: { type: 'string', required: true, max: 20 } }, summarize: (a) => 'Leer ' + a.q, execute: async (_c, a) => { calls.push(['low', a]); return { q: a.q }; } });
  registry.register({ name: 'test.write', title: 'Escribir', risk: 'confirm', schema: { name: { type: 'string', required: true } }, summarize: (a) => 'Escribir ' + a.name, consequences: (a) => ['Crea ' + a.name], execute: async (_c, a) => { calls.push(['write', a]); return { ok: true }; } });
  registry.register({ name: 'test.writeDry', title: 'Escribir con simulación', risk: 'confirm', schema: {}, summarize: () => 'Escribir (sim)', dryRun: async () => ({ simulated: true }), execute: async () => { calls.push(['writeDry']); return {}; } });
  registry.register({ name: 'test.danger', title: 'Borrar', risk: 'high', schema: { paths: { type: 'array', items: { type: 'path' }, required: true } }, summarize: (a) => 'Borrar ' + a.paths.length, impact: (a) => ({ count: a.paths.length }), execute: async (_c, a) => { calls.push(['danger', a]); return { n: a.paths.length }; } });
  registry.register({ name: 'test.move', title: 'Mover', risk: 'confirm', schema: { paths: { type: 'array', items: { type: 'path' }, required: true } }, summarize: () => 'Mover', impact: (a) => ({ count: a.paths.length }), execute: async () => ({}) });
  registry.register({ name: 'test.slow', title: 'Lento', risk: 'low', schema: {}, summarize: () => 'Lento', timeoutMs: opts.timeoutMs || 5000, execute: async (c) => { c.progress(10, 'empezando'); await new Promise((res, rej) => { const t = setTimeout(res, 3000); c.signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('abortado')); }); }); return 1; } });
  registry.register({ name: 'test.liar', title: 'Miente', risk: 'low', schema: {}, summarize: () => 'Miente', execute: async () => ({ ok: true }), verify: async () => ({ ok: false, message: 'el archivo no existe' }) });
  registry.register({ name: 'test.aiconfirm', title: 'Abrir', risk: 'low', aiRisk: 'confirm', schema: {}, summarize: () => 'Abrir', execute: async () => 1 });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nova-audit-')), 'audit.jsonl');
  const audit = createAudit(file);
  const agent = createAgent({ registry, audit, emit: (e) => events.push(e), settings: () => opts.settings || {}, env: opts.env || {}, confirmTimeoutMs: opts.confirmTimeoutMs || 2000 });
  return { agent, registry, calls, events, audit, file };
}
const waitState = async (agent, id, state) => { for (let i = 0; i < 100; i++) { if (agent.get(id)?.state === state) return; await sleep(5); } throw new Error('no llegó a ' + state + ' (está en ' + agent.get(id)?.state + ')'); };

test('esquema: rechaza claves desconocidas, tipos y longitudes', () => {
  assert.equal(validate({ a: { type: 'string', required: true } }, {}).ok, false);
  assert.equal(validate({ a: { type: 'string' } }, { a: 'x', b: 1 }).ok, false);
  assert.equal(validate({ a: { type: 'integer', min: 1, max: 5 } }, { a: 9 }).ok, false);
  assert.equal(validate({ a: { type: 'string' } }, { a: 'x\0y' }).ok, false);
  assert.equal(validate({ a: { type: 'enum', values: ['x', 'y'] } }, { a: 'z' }).ok, false);
  assert.deepEqual(validate({ a: { type: 'integer', default: 3 } }, {}).value, { a: 3 });
});

test('riesgo bajo pedido por la IA: se ejecuta sin confirmación y queda auditado', async () => {
  const { agent, calls, file } = setup();
  const r = await agent.run({ tool: 'test.low', args: { q: 'hola' }, origin: 'ai' });
  assert.equal(r.state, 'succeeded'); assert.deepEqual(r.result, { q: 'hola' }); assert.equal(calls.length, 1);
  assert.match(fs.readFileSync(file, 'utf8'), /"tool":"test.low".*"state":"succeeded"/);
});

test('lecturas de bajo riesgo desde la interfaz: no se auditan ni inundan la actividad; los fallos sí (una vez cada 5 min)', async () => {
  const { agent, registry, events, audit } = setup();
  registry.register({ name: 'test.flaky', title: 'Falla', risk: 'low', schema: {}, summarize: () => 'Falla', execute: async () => { throw new Error('PowerShell bloqueado'); } });
  const r = await agent.run({ tool: 'test.low', args: { q: 'x' } }); assert.equal(r.state, 'succeeded');
  assert.equal(events.length, 0); assert.equal(audit.tail().length, 0);
  await agent.run({ tool: 'test.flaky', args: {} }); const n1 = audit.tail().length; assert.equal(n1, 1);
  await agent.run({ tool: 'test.flaky', args: {} }); assert.equal(audit.tail().length, 1); // repetido: silenciado
  assert.ok(events.some((e) => e.type === 'result' && e.action.state === 'failed'));
});

test('validación: parámetros inválidos → failed VALIDATION y la herramienta no se ejecuta', async () => {
  const { agent, calls } = setup();
  const r = await agent.run({ tool: 'test.low', args: { q: 'x'.repeat(50) } });
  assert.equal(r.state, 'failed'); assert.equal(r.error.code, 'VALIDATION'); assert.equal(calls.length, 0);
  assert.equal((await agent.run({ tool: 'no.existe', args: {} })).error.code, 'UNKNOWN_TOOL');
});

test('confirmación: no se ejecuta hasta que el usuario permite; se muestran resumen y consecuencias', async () => {
  const { agent, calls } = setup();
  const { action, done } = agent.submit({ tool: 'test.write', args: { name: 'a.txt' } });
  await waitState(agent, action.id, 'awaiting_confirmation');
  assert.equal(calls.length, 0);
  const a = agent.get(action.id);
  assert.equal(a.confirmation.level, 'confirm'); assert.deepEqual(a.confirmation.consequences, ['Crea a.txt']);
  assert.equal(agent.answer(action.id, { allow: true }).ok, true);
  const r = await done; assert.equal(r.state, 'succeeded'); assert.equal(calls.length, 1);
});

test('confirmación denegada → cancelled DENIED, sin ejecutar', async () => {
  const { agent, calls } = setup();
  const { action, done } = agent.submit({ tool: 'test.write', args: { name: 'a.txt' } });
  await waitState(agent, action.id, 'awaiting_confirmation'); agent.answer(action.id, { allow: false });
  const r = await done; assert.equal(r.state, 'cancelled'); assert.equal(r.error.code, 'DENIED'); assert.equal(calls.length, 0);
});

test('alto riesgo: sin ack explícito se cancela aunque el usuario "permita"', async () => {
  const { agent, calls } = setup();
  const s1 = agent.submit({ tool: 'test.danger', args: { paths: ['a'] } });
  await waitState(agent, s1.action.id, 'awaiting_confirmation');
  assert.equal(agent.get(s1.action.id).confirmation.level, 'strong');
  agent.answer(s1.action.id, { allow: true });
  assert.equal((await s1.done).state, 'cancelled'); assert.equal(calls.length, 0);
  const s2 = agent.submit({ tool: 'test.danger', args: { paths: ['a'] } });
  await waitState(agent, s2.action.id, 'awaiting_confirmation'); agent.answer(s2.action.id, { allow: true, ack: true });
  assert.equal((await s2.done).state, 'succeeded');
});

test('cambio masivo: confirm sube a confirmación fuerte a partir de 10 elementos', async () => {
  const { agent } = setup();
  const few = agent.submit({ tool: 'test.move', args: { paths: ['a', 'b'] } }); await waitState(agent, few.action.id, 'awaiting_confirmation');
  assert.equal(agent.get(few.action.id).confirmation.level, 'confirm'); agent.cancel(few.action.id); await few.done;
  const many = agent.submit({ tool: 'test.move', args: { paths: Array.from({ length: 10 }, (_, i) => 'f' + i) } }); await waitState(agent, many.action.id, 'awaiting_confirmation');
  assert.equal(agent.get(many.action.id).confirmation.level, 'strong'); agent.cancel(many.action.id); await many.done;
});

test('permiso de sesión: solo para la interfaz y contenido fiable; la IA y el contenido externo siempre confirman', async () => {
  const { agent } = setup();
  const s = agent.submit({ tool: 'test.write', args: { name: 'a' } }); await waitState(agent, s.action.id, 'awaiting_confirmation');
  agent.answer(s.action.id, { allow: true, session: true }); await s.done;
  assert.equal((await agent.run({ tool: 'test.write', args: { name: 'b' } })).state, 'succeeded'); // sin preguntar
  const ai = agent.submit({ tool: 'test.write', args: { name: 'c' }, origin: 'ai' }); await waitState(agent, ai.action.id, 'awaiting_confirmation'); agent.cancel(ai.action.id); await ai.done;
  const un = agent.submit({ tool: 'test.write', args: { name: 'd' }, untrusted: true }); await waitState(agent, un.action.id, 'awaiting_confirmation'); agent.cancel(un.action.id); await un.done;
});

test('origen IA: aiRisk sube el riesgo; contenido no fiable desactiva la ejecución automática', async () => {
  const { agent } = setup();
  assert.equal((await agent.run({ tool: 'test.aiconfirm', args: {} })).state, 'succeeded'); // UI: bajo
  const ai = agent.submit({ tool: 'test.aiconfirm', args: {}, origin: 'ai' }); await waitState(agent, ai.action.id, 'awaiting_confirmation'); agent.cancel(ai.action.id); await ai.done;
  const un = agent.submit({ tool: 'test.low', args: { q: 'x' }, untrusted: true }); await waitState(agent, un.action.id, 'awaiting_confirmation'); agent.cancel(un.action.id); await un.done;
});

test('interruptor global: con PC_CONTROL=off solo se permite riesgo bajo', async () => {
  const { agent, calls } = setup({ env: { PC_CONTROL: 'off' } });
  assert.equal((await agent.run({ tool: 'test.low', args: { q: 'x' } })).state, 'succeeded');
  const r = await agent.run({ tool: 'test.write', args: { name: 'a' } });
  assert.equal(r.state, 'failed'); assert.equal(r.error.code, 'POLICY_BLOCKED'); assert.equal(calls.filter((c) => c[0] === 'write').length, 0);
});

test('ajuste agent.lowRiskAuto=false: incluso lo de riesgo bajo pide confirmación', async () => {
  const { agent } = setup({ settings: { 'agent.lowRiskAuto': 'false' } });
  const s = agent.submit({ tool: 'test.low', args: { q: 'x' } }); await waitState(agent, s.action.id, 'awaiting_confirmation'); agent.cancel(s.action.id); await s.done;
});

test('cancelación durante la ejecución y progreso emitido', async () => {
  const { agent, events } = setup();
  const s = agent.submit({ tool: 'test.slow', args: {}, origin: 'ai' }); await waitState(agent, s.action.id, 'running'); await sleep(20);
  assert.equal(agent.cancel(s.action.id).ok, true);
  const r = await s.done; assert.equal(r.state, 'cancelled');
  assert.ok(events.some((e) => e.type === 'progress' && e.action.progress.pct === 10));
});

test('tiempo agotado → failed TIMEOUT', async () => {
  const { agent } = setup({ timeoutMs: 50 });
  const r = await agent.run({ tool: 'test.slow', args: {} }); assert.equal(r.state, 'failed'); assert.equal(r.error.code, 'TIMEOUT');
});

test('confirmación sin respuesta → cancelled TIMEOUT', async () => {
  const { agent, calls } = setup({ confirmTimeoutMs: 40 });
  const r = await agent.run({ tool: 'test.write', args: { name: 'a' } }); assert.equal(r.state, 'cancelled'); assert.equal(r.error.code, 'TIMEOUT'); assert.equal(calls.length, 0);
});

test('verificación: si el efecto no es real, no se declara éxito', async () => {
  const { agent } = setup();
  const r = await agent.run({ tool: 'test.liar', args: {} }); assert.equal(r.state, 'failed'); assert.equal(r.error.code, 'VERIFY_FAILED'); assert.equal(r.verified, false);
});

test('dryRun: lo que modifica y no declara simulación solo devuelve el plan; con simulación la usa; nunca llama a execute', async () => {
  const { agent, calls } = setup();
  const a = await agent.run({ tool: 'test.write', args: { name: 'a' }, dryRun: true });
  assert.equal(a.state, 'succeeded'); assert.equal(a.result.planned, true);
  const b = await agent.run({ tool: 'test.writeDry', args: {}, dryRun: true }); assert.deepEqual(b.result, { simulated: true });
  assert.equal(calls.length, 0);
});

test('auditoría: no guarda contenidos largos ni campos sensibles', async () => {
  const { audit, file } = setup();
  audit.write({ tool: 'x', args: { content: 'secreto'.repeat(100), name: 'n'.repeat(500) } });
  const line = JSON.parse(fs.readFileSync(file, 'utf8').trim());
  assert.match(line.args.content, /^\[omitido/); assert.ok(line.args.name.length < 260);
});

test('answer() sin confirmación pendiente no hace nada', async () => {
  const { agent } = setup(); const r = await agent.run({ tool: 'test.low', args: { q: 'x' } });
  assert.equal(agent.answer(r.id, { allow: true }).ok, false);
});

test('permissions.decide es determinista y explica el motivo', () => {
  const t = { name: 't', risk: 'high' };
  const d = decide(t, {}, { origin: 'ui', settings: {}, env: {} });
  assert.equal(d.level, 'strong'); assert.ok(d.reason.length > 5);
});
