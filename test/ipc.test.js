// Pruebas del IPC del agente con un ipcMain simulado: remitentes autorizados y origen de la acción.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { createCore } = require('../electron/desktop');
const { registerAgentIpc } = require('../electron/agent/ipc');

function setup() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nova-ipc-'))); fs.writeFileSync(path.join(base, 'a.txt'), 'x');
  const events = []; const core = createCore({ shell: { openPath: async () => '' }, execFile() {}, getRoots: () => [base], platform: 'linux', emit: (e) => events.push(e) });
  const handlers = new Map(); const ipcMain = { handle: (ch, fn) => handlers.set(ch, fn) };
  const main = { webContents: {}, isDestroyed: () => false }; const widgets = { webContents: {} };
  registerAgentIpc({ ipcMain, getWin: () => main, agent: core.agent, registry: core.registry, audit: core.audit, isTrustedSender: (s) => s === main.webContents || s === widgets.webContents });
  const call = (ch, d, sender = main.webContents) => handlers.get(ch)({ sender }, d);
  return { base, call, core, events, widgets };
}
const until = async (f) => { for (let i = 0; i < 200; i++) { const v = f(); if (v) return v; await new Promise((r) => setTimeout(r, 5)); } throw new Error('timeout'); };

test('IPC: rechaza mensajes que no vienen de la ventana principal', async () => {
  const { call, base } = setup(); const r = await call('agent:run', { tool: 'fs.list', args: { path: base } }, {}); assert.equal(r.error, 'Origen no permitido');
});
test('IPC: la interfaz no puede elegir origen; agent:run siempre es "ui"', async () => {
  const { call, base } = setup(); const r = await call('agent:run', { tool: 'fs.open', args: { path: path.join(base, 'a.txt') }, origin: 'ai', untrusted: false });
  assert.equal(r.action.origin, 'ui'); assert.equal(r.action.state, 'succeeded'); // fs.open es de riesgo bajo para la interfaz
});
test('IPC: la ventana local de widgets puede consultar herramientas como UI, un renderer ajeno sigue bloqueado', async () => {
  const { call, base, widgets } = setup();
  const own = await call('agent:run', { tool: 'fs.list', args: { path: base }, origin: 'ai' }, widgets.webContents);
  assert.equal(own.action.state, 'succeeded'); assert.equal(own.action.origin, 'ui');
  const foreign = await call('agent:run', { tool: 'fs.list', args: { path: base } }, {});
  assert.equal(foreign.error, 'Origen no permitido');
});
test('IPC agent:ai: origen "ai" → abrir un archivo exige confirmación; contenido no fiable también para lecturas', async () => {
  const { call, base, core } = setup();
  const s = await call('agent:ai', { tool: 'fs.open', args: { path: path.join(base, 'a.txt') }, wait: false });
  const a = await until(() => { const x = core.agent.get(s.id); return x.state === 'awaiting_confirmation' && x; }); assert.equal(a.origin, 'ai');
  await call('agent:cancel', { id: s.id });
  const u = await call('agent:ai', { tool: 'fs.list', args: { path: base }, untrusted: true, wait: false });
  const b = await until(() => { const x = core.agent.get(u.id); return x.state === 'awaiting_confirmation' && x; }); assert.equal(b.confirmation.level, 'confirm'); await call('agent:cancel', { id: u.id });
});
test('IPC: valida identificadores y herramientas', async () => {
  const { call } = setup();
  assert.ok((await call('agent:cancel', { id: '../../x' })).error); assert.ok((await call('agent:answer', { id: 'nope' })).error); assert.ok((await call('agent:run', { tool: '' })).error);
  const unk = await call('agent:run', { tool: 'no.existe', args: {} }); assert.equal(unk.action.error.code, 'UNKNOWN_TOOL');
});
test('IPC: el listado de herramientas no expone funciones ni rutas internas', async () => {
  const { call } = setup(); const r = await call('agent:tools', {}); assert.ok(r.tools.length >= 20); assert.ok(r.tools.every((t) => typeof t.execute === 'undefined' && t.schema));
  assert.doesNotMatch(JSON.stringify(r), /function|\.js"/);
});
