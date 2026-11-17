// Pruebas de la update 31: caché multimedia, modelo en la nube, mapa de flujo y orden de línea de comandos.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMediaCache, normalizeMedia } = require('../electron/desktop/mediaCache');
const cloud = require('../electron/desktop/cloudModel');
const { buildGraph } = require('../electron/desktop/flowGraph');
const { parseCommand } = require('../electron/desktop/shell/cli');

test('multimedia: consultas simultáneas comparten una sola ejecución y se reutiliza el resultado', async () => {
  let calls = 0, t = 0; const c = createMediaCache({ read: async () => { calls++; return { n: calls }; }, ttl: 4000, now: () => t });
  const [a, b, d] = await Promise.all([c.get(), c.get(), c.get()]);
  assert.equal(calls, 1); assert.equal(a.n, 1); assert.equal(b.n, 1); assert.equal(d.n, 1);
  t += 3000; assert.equal((await c.get()).n, 1, 'dentro del tiempo de vida no vuelve a consultar');
  t += 2000; assert.equal((await c.get()).n, 2, 'pasado el tiempo de vida consulta de nuevo');
  c.invalidate(); assert.equal((await c.get()).n, 3, 'tras un control se consulta otra vez');
  assert.equal((await c.get({ force: true })).n, 4);
});
test('multimedia: un fallo no deja la consulta bloqueada', async () => {
  let n = 0; const c = createMediaCache({ read: async () => { n++; if (n === 1) throw new Error('x'); return { ok: 1 }; } });
  await assert.rejects(c.get()); assert.equal((await c.get()).ok, 1);
});
test('multimedia: normaliza distintas formas de respuesta y detecta Liner', () => {
  const r = normalizeMedia({ sessions: [{ app: 'Spotify.exe', title: 'A', artist: 'B', status: 'Paused' }, { appId: 'Liner.exe', Title: 'C', playbackStatus: 'Playing' }] });
  assert.equal(r.sessions.length, 2); assert.equal(r.current.title, 'C'); assert.equal(r.current.playing, true); assert.equal(r.liner, true);
  assert.deepEqual(normalizeMedia(null).sessions, []); assert.equal(normalizeMedia({ title: 'Solo' }).current.title, 'Solo'); assert.equal(normalizeMedia([]).current, null);
});

test('nube: solo se aplica con Ollama y activado por el usuario', () => {
  assert.equal(cloud.override({ provider: 'ollama' }, {}).active, false);
  assert.equal(cloud.override({ 'cloud.inkling': 'true', provider: 'openai' }, {}).active, false);
  const o = cloud.override({ 'cloud.inkling': 'true' }, {}); assert.equal(o.active, true); assert.equal(o.settings.model, 'inkling-2-small:cloud');
});
test('nube: la variable de entorno se fija solo durante la llamada y se restaura', () => {
  const env = { OLLAMA_MODEL: 'qwen3:4b' }; const back = cloud.withEnv(cloud.MODEL, env); assert.equal(env.OLLAMA_MODEL, cloud.MODEL); back(); assert.equal(env.OLLAMA_MODEL, 'qwen3:4b');
  const e2 = {}; cloud.withEnv('m', e2)(); assert.equal('OLLAMA_MODEL' in e2, false);
});
test('nube: estado, prueba y errores comprensibles', async () => {
  const mk = (fetchImpl, extra = {}) => cloud.createCloud({ execFile: (c, a, o, cb) => cb(null, '', ''), spawn: () => ({ unref() {} }), fetchImpl, getSettings: () => extra, setSettings: (v) => Object.assign(extra, v) });
  const s1 = await mk(async () => ({ ok: true, json: async () => ({ models: [{ name: 'inkling-2-small:cloud' }] }) })).status(); assert.equal(s1.reachable, true); assert.equal(s1.listed, true);
  const s2 = await mk(async () => { throw new Error('down'); }).status(); assert.equal(s2.reachable, false);
  const t401 = await mk(async () => ({ ok: false, status: 401, text: async () => 'unauthorized' })).test(); assert.equal(t401.ok, false); assert.match(t401.error, /iniciar sesión/);
  const t404 = await mk(async () => ({ ok: false, status: 404, text: async () => 'not found' })).test(); assert.match(t404.error, /Registrar/);
  assert.equal((await mk(async () => ({ ok: true })).test()).ok, true);
  const store = {}; const c = mk(async () => ({}), store); c.setEnabled(true); assert.equal(cloud.enabled(store), true); c.setEnabled(false); assert.equal(cloud.enabled(store), false);
});
test('nube: ollama se invoca con argumentos fijos', async () => {
  const seen = []; const c = cloud.createCloud({ execFile: (cmd, args, o, cb) => { seen.push([cmd, args]); cb(null, '', ''); }, spawn: (cmd, args) => { seen.push([cmd, args]); return { unref() {} }; } });
  await c.register(); c.signin(); assert.deepEqual(seen, [['ollama', ['pull', 'inkling-2-small:cloud']], ['ollama', ['signin']]]);
});

test('mapa: construye nodos y conexiones sin datos sensibles', () => {
  const fs = { existsSync: () => true, readdirSync: () => ['nova.db', 'nova-notices.json', '.env', 'otro.txt'] };
  const g = buildGraph({ fs, appRoot: 'C:\\Users\\TestUser\\Nova', userData: 'C:\\Users\\TestUser\\AppData\\Roaming\\jarvis-clone', roots: ['C:\\Users\\TestUser\\Documents', 'c:\\users\\TestUser\\documents'], places: [{ id: 'desktop', label: 'Escritorio', path: 'C:\\Users\\TestUser\\Desktop' }],
    tools: ['fs.read', 'fs.write', 'system.windows', 'apps.launch'], env: { braveKey: true, ntfyTopic: false, pcControl: true, model: 'qwen3:4b' }, ollama: { reachable: true, models: 2 }, cloud: { enabled: true },
    prefs: { dock: { pins: [{ type: 'app', name: 'Bloc de notas', appId: 'x' }, { type: 'folder', name: 'Tesis', path: 'C:\\Tesis' }] } }, windows: [{ name: 'chrome' }, { name: 'Chrome' }, { name: 'code' }], shellActive: true, linerInstalled: true, linerPlaying: true });
  const ids = new Set(g.nodes.map((n) => n.id)); assert.equal(ids.size, g.nodes.length, 'ids únicos');
  for (const l of g.links) { assert.ok(ids.has(l.s) && ids.has(l.t), 'extremos existentes'); }
  assert.ok(ids.has('nova') && ids.has('ollama') && ids.has('inkling') && ids.has('liner') && ids.has('tool:fs') && ids.has('file:nova.db'));
  assert.ok(!g.nodes.some((n) => /\.env/.test(n.label) || /otro\.txt/.test(n.label)), 'solo archivos conocidos');
  assert.equal(g.nodes.filter((n) => n.kind === 'folder' && n.label === 'Documents').length, 1, 'carpetas duplicadas se unen');
  assert.equal(g.nodes.filter((n) => n.id.startsWith('app:win:')).length, 2, 'ventanas duplicadas por nombre se unen');
  assert.equal(g.nodes.find((n) => n.id === 'inkling').status, 'on'); assert.equal(g.nodes.find((n) => n.id === 'ntfy').status, 'off'); assert.equal(g.nodes.find((n) => n.id === 'brave').status, 'on');
  assert.ok(g.nodes.every((n) => typeof n.degree === 'number'));
  assert.ok(!JSON.stringify(g).includes('secret'));
});
test('mapa: funciona con datos mínimos', () => { const g = buildGraph({}); assert.ok(g.nodes.length >= 10); assert.equal(g.nodes.find((n) => n.id === 'liner'), undefined); });
test('línea de comandos: acepta --nova=flow y rechaza lo desconocido', () => { assert.equal(parseCommand(['x', '--nova=flow']), 'flow'); assert.equal(parseCommand(['--nova=rm']), null); });
