// Pruebas de la integración de Scrapling: seguridad de red, servicio, registro de herramientas y puente Python (con un Scrapling falso, sin red).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { EventEmitter } = require('events');
const { spawnSync } = require('child_process');
const { isPrivateIp, parseHttpUrl, assertPublicUrl } = require('../electron/integrations/netSafety');
const { createScrapling, scraplingTools, UNTRUSTED } = require('../electron/integrations/scrapling');
const { register, isOwnPage } = require('../electron/integrations');

test('red: rangos internos y reservados bloqueados, públicos permitidos', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.5.5', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '2002:7f00:1::1', '64:ff9b::1', '2001:db8::1']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) assert.equal(isPrivateIp(ip), false, ip);
});
test('red: URL válidas e inválidas', () => {
  for (const u of ['', 'ftp://a.com', 'file:///c:/x', 'javascript:alert(1)', 'http://u:p@a.com', 'http://a.com:22', 'a.com', 'x'.repeat(2100)]) assert.throws(() => parseHttpUrl(u), u.slice(0, 20));
  assert.equal(parseHttpUrl('https://a.com/x#frag').href, 'https://a.com/x'); parseHttpUrl('http://a.com:8080/');
});
test('red: resuelve el nombre y rechaza si ALGUNA dirección es interna', async () => {
  await assert.rejects(assertPublicUrl('http://x.test/', async () => [{ address: '93.184.216.34' }, { address: '10.0.0.2' }]), /interna/);
  await assert.rejects(assertPublicUrl('http://localhost/'), /red local/);
  await assert.rejects(assertPublicUrl('http://[::1]/'), /interna/);
  await assert.rejects(assertPublicUrl('http://169.254.169.254/'), /interna/);
  assert.equal((await assertPublicUrl('https://x.test/', async () => [{ address: '93.184.216.34' }])).hostname, 'x.test');
});

function fakeEnv({ installed = true, bridgeOut = { ok: true, content: 'hola' }, confirmAnswer = true } = {}) {
  const log = { confirms: [], spawns: [] };
  const execFile = (cmd, args, o, cb) => cb(null, JSON.stringify(installed ? { installed: true, fetchers: true, version: '9' } : { installed: false }), '');
  const spawn = (cmd, args) => { const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); let body = ''; p.stdin = { end: (s) => { body = s; log.spawns.push(JSON.parse(s)); setImmediate(() => { p.stdout.emit('data', JSON.stringify(bridgeOut) + '\n'); p.emit('close', 0); }); } }; p.kill = () => {}; return p; };
  const sc = createScrapling({ appRoot: '/app', spawn, execFile, confirm: async (m) => { log.confirms.push(m); return confirmAnswer; }, exists: () => false, platform: 'linux', lookup: async () => [{ address: '93.184.216.34' }] });
  return { sc, log };
}
test('servicio: pide confirmación una vez por dominio y marca el contenido como no confiable', async () => {
  const { sc, log } = fakeEnv(); const a = await sc.run({ action: 'page', url: 'https://x.test/a' }); const b = await sc.run({ action: 'page', url: 'https://x.test/b' });
  assert.equal(a.ok, true); assert.equal(a.aviso, UNTRUSTED); assert.equal(b.ok, true); assert.equal(log.confirms.length, 1); assert.equal(log.spawns.length, 2);
  await sc.run({ action: 'page', url: 'https://y.test/' }); assert.equal(log.confirms.length, 2);
});
test('servicio: si el usuario cancela no se ejecuta nada', async () => {
  const { sc, log } = fakeEnv({ confirmAnswer: false }); const r = await sc.run({ url: 'https://x.test/' }); assert.equal(r.code, 'cancelled'); assert.equal(log.spawns.length, 0);
});
test('servicio: desde la interfaz no pregunta; las direcciones internas se rechazan antes de lanzar Python', async () => {
  const { sc, log } = fakeEnv(); assert.equal((await sc.run({ url: 'https://x.test/' }, { interactive: true })).ok, true); assert.equal(log.confirms.length, 0);
  const bad = await sc.run({ url: 'http://127.0.0.1:8080/' }, { interactive: true }); assert.equal(bad.code, 'refused'); assert.equal(log.spawns.length, 1);
});
test('servicio: sin Scrapling instalado devuelve un mensaje útil; límites de entrada', async () => {
  const { sc } = fakeEnv({ installed: false }); assert.equal((await sc.run({ url: 'https://x.test/' }, { interactive: true })).code, 'missing');
  const e2 = fakeEnv(); assert.equal((await e2.sc.run({ url: 'https://x.test/', selector: 'a'.repeat(201) }, { interactive: true })).code, 'refused');
  await e2.sc.run({ action: 'crawl', url: 'https://x.test/', max_pages: 99 }, { interactive: true }); assert.equal(e2.log.spawns[0].maxPages, 10);
  await e2.sc.run({ url: 'https://x.test/', ignore_robots: true }, { interactive: true }); assert.equal(e2.log.spawns[1].obeyRobots, false);
  await e2.sc.run({ url: 'https://x.test/', ignore_robots: true }); assert.equal(e2.log.spawns[2].obeyRobots, true, 'el agente nunca puede ignorar robots.txt');
});
test('servicio: instalar pide confirmación y usa argumentos fijos de pip', async () => {
  const calls = []; const mk = (ans) => createScrapling({ appRoot: '/app', spawn() {}, execFile: (c, a, o, cb) => { calls.push(a); cb(null, JSON.stringify({ installed: true, fetchers: true }), ''); }, confirm: async () => ans, exists: () => false, platform: 'linux' });
  assert.deepEqual(await mk(false).install(), { cancelled: true }); assert.equal(calls.length, 0);
  const r = await mk(true).install(); assert.equal(r.ok, true); assert.ok(calls[0].includes('pip') && calls[0].includes('install') && calls[0].includes('scrapling[fetchers]'));
});
test('registro: descubre la integración, no pisa herramientas existentes y protege los canales', async () => {
  const handlers = {}; const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } }; const tools = { scrape_page: 'propia' };
  register({ ipcMain, app: { getAppPath: () => '/app' }, tools, confirm: async () => false, execFile() {}, spawn() {} });
  assert.equal(tools.scrape_page, 'propia'); assert.equal(typeof tools.scrape_crawl, 'function');
  assert.deepEqual(Object.keys(handlers).sort(), ['nova:scrapling-install', 'nova:scrapling-run', 'nova:scrapling-status']);
  assert.deepEqual(await handlers['nova:scrapling-run']({ senderFrame: { url: 'https://evil.example/', parent: null } }, { url: 'https://x.test' }), { error: 'Origen no permitido' });
  assert.equal(isOwnPage({ senderFrame: { url: 'file:///C:/nova/dist/widgets.html', parent: null } }), true);
  assert.equal(isOwnPage({ senderFrame: { url: 'file:///C:/nova/dist/widgets.html', parent: {} } }), false);
  assert.equal(isOwnPage({ senderFrame: { url: 'http://localhost:5173/', parent: null } }), true); assert.equal(isOwnPage({}), false);
});
test('herramientas: nombres esperados', () => { assert.deepEqual(Object.keys(scraplingTools({ run() {} })), ['scrape_page', 'scrape_crawl']); });
test('puente Python (con Scrapling falso)', (t) => {
  const py = spawnSync(process.platform === 'win32' ? 'py' : 'python3', process.platform === 'win32' ? ['-3', path.join(__dirname, 'scrapling_bridge_test.py')] : [path.join(__dirname, 'scrapling_bridge_test.py')], { encoding: 'utf8' });
  if (py.error) return t.skip('Python no disponible'); assert.equal(py.status, 0, py.stderr);
});
