'use strict';
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const { EventEmitter } = require('events');
const { createPrefsStore, deepMerge, migrate } = require('../electron/desktop/shell/prefsStore');
const { createNotices } = require('../electron/desktop/shell/notices');
const G = require('../electron/desktop/shell/geometry');
const { circlePng } = require('../electron/desktop/shell/badge');
const { parseCommand, jumpTasks } = require('../electron/desktop/shell/cli');
const { parseLine, createShellWatch } = require('../electron/desktop/shell/shellWatch');
const { createAppIcons } = require('../electron/desktop/shell/appIcons');
const DEFAULTS = require('../src/desktop/prefs.defaults.json');

const disp = (id, b, w) => ({ id, bounds: b, workArea: w });
const mem = (init = '') => { let v = init; return { read: () => v, write: (x) => { v = x; }, raw: () => v }; };

test('preferencias: conserva posición y claves desconocidas (el fallo de la update 29)', () => {
  const m = mem(JSON.stringify({ nativeWidgets: { opacity: 50, window: { x: 1200, y: 40, displayId: '2' }, topbar: { on: true, displayId: '2' } } }));
  const s = createPrefsStore({ read: m.read, write: m.write, defaults: DEFAULTS });
  const p = s.get();
  assert.deepEqual(p.nativeWidgets.window, { x: 1200, y: 40, displayId: '2' });
  assert.equal(p.nativeWidgets.opacity, 50);
  s.patch({ nativeWidgets: { dockbar: { on: true } } });
  assert.equal(JSON.parse(m.raw()).nativeWidgets.window.x, 1200, 'un parche no borra lo que no toca');
});
test('preferencias: migra displayId a displays y sanea valores', () => {
  const p = migrate({ nativeWidgets: { topbar: { displayId: '7' }, dockbar: {} } });
  assert.deepEqual(p.nativeWidgets.topbar.displays, ['7']); assert.deepEqual(p.nativeWidgets.dockbar.displays, ['primary']);
  const s = createPrefsStore({ read: () => '', write: () => {}, defaults: DEFAULTS });
  const r = s.patch({ theme: 'rosa', nativeWidgets: { opacity: 999, topbar: { align: 'arriba', displays: [] } } });
  assert.equal(r.theme, 'dark'); assert.equal(r.nativeWidgets.opacity, 94); assert.equal(r.nativeWidgets.topbar.align, 'center'); assert.deepEqual(r.nativeWidgets.topbar.displays, ['primary']);
});
test('preferencias: rechaza contaminación de prototipos y parches enormes', () => {
  const s = createPrefsStore({ read: () => '', write: () => {}, defaults: DEFAULTS });
  s.patch(JSON.parse('{"__proto__":{"x":1},"shell":{"constructor":{"y":1}}}'));
  assert.equal({}.x, undefined); assert.equal(Object.prototype.y, undefined);
  assert.throws(() => s.patch({ junk: 'x'.repeat(70000) }));
  assert.deepEqual(deepMerge({ a: { b: 1 } }, { a: { c: 2 } }), { a: { b: 1, c: 2 } });
});
test('preferencias: notifica el cambio y restablece', () => {
  const seen = []; const m = mem();
  const s = createPrefsStore({ read: m.read, write: m.write, defaults: DEFAULTS, onChange: (p) => seen.push(p.theme) });
  s.patch({ theme: 'light' }); s.reset(); assert.deepEqual(seen, ['light', 'dark']);
});

test('avisos: historial, no leídos, duplicados agrupados y límite', () => {
  let t = 1000; const ev = []; const n = createNotices({ now: () => t, emit: (e) => ev.push(e.type), max: 3 });
  const a = n.push({ title: 'Hola', message: 'uno' }); assert.equal(n.unread(), 1);
  t += 1000; const b = n.push({ title: 'Hola', message: 'uno' }); assert.equal(b.repeated, true); assert.equal(n.list().items.length, 1); assert.equal(n.list().items[0].count, 2);
  t += 70000; n.push({ title: 'Hola', message: 'uno' }); assert.equal(n.list().items.length, 2, 'pasado el margen ya no se agrupa');
  n.push({ title: 'B', message: 'x', level: 'err' }); n.push({ title: 'C', message: 'y', level: 'rara' }); assert.equal(n.list().items.length, 3);
  assert.equal(n.list().items[0].level, 'info');
  n.markRead(n.list().items[0].id); assert.equal(n.unread(), 2); n.markRead('all'); assert.equal(n.unread(), 0);
  n.dismiss(n.list().items[0].id); assert.equal(n.list().items.length, 2); n.clear(); assert.equal(n.list().total, 0);
  assert.ok(ev.includes('added') && ev.includes('updated') && ev.includes('cleared'));
  assert.equal(a.read, false);
});
test('avisos: se persisten, se recuperan y toleran archivos dañados', async () => {
  const files = {}; const fsImpl = { readFileSync: (f) => { if (!(f in files)) throw new Error('no'); return files[f]; }, mkdirSync() {}, writeFileSync: (f, d) => { files[f] = d; }, renameSync: (a, b) => { files[b] = files[a]; delete files[a]; } };
  const n = createNotices({ file: '/x/n.json', fsImpl }); n.push({ title: 'Guardado', message: 'persistente' });
  await new Promise((r) => setTimeout(r, 600));
  const n2 = createNotices({ file: '/x/n.json', fsImpl }); assert.equal(n2.list().items[0].title, 'Guardado');
  files['/x/n.json'] = '{rota'; assert.equal(createNotices({ file: '/x/n.json', fsImpl }).list().total, 0);
  assert.equal(n.push({}), null);
});
test('avisos: recorta textos largos', () => { const n = createNotices(); const r = n.push({ title: 't'.repeat(500), message: 'm'.repeat(900) }); assert.equal(r.title.length, 80); assert.equal(r.message.length, 240); });

test('geometría: detecta la barra de tareas en cualquier borde y cuando está oculta', () => {
  const b = { x: 0, y: 0, width: 1920, height: 1080 };
  assert.deepEqual(G.detectTaskbar(disp(1, b, { x: 0, y: 0, width: 1920, height: 1040 })), { edge: 'bottom', size: 40 });
  assert.equal(G.detectTaskbar(disp(1, b, { x: 0, y: 48, width: 1920, height: 1032 })).edge, 'top');
  assert.equal(G.detectTaskbar(disp(1, b, { x: 62, y: 0, width: 1858, height: 1080 })).edge, 'left');
  assert.equal(G.detectTaskbar(disp(1, b, { x: 0, y: 0, width: 1860, height: 1080 })).edge, 'right');
  assert.equal(G.detectTaskbar(disp(1, b, b)).edge, 'none');
});
test('geometría: dock centrado sobre la barra, dentro del área de trabajo y en monitores desplazados', () => {
  const d = disp(2, { x: 1920, y: -200, width: 2560, height: 1440 }, { x: 1920, y: -200, width: 2560, height: 1400 });
  const r = G.dockBounds(d, { width: 600, height: 76 }); assert.equal(r.x, 1920 + (2560 - 600) / 2); assert.equal(r.y + r.height + 6, -200 + 1400);
  assert.equal(G.dockBounds(d, { width: 99999 }).width, 2560 - 24, 'nunca más ancho que la pantalla');
});
test('geometría: barra superior compacta no tapa botones de ventana; "todo el ancho" es opcional', () => {
  const d = disp(1, { x: 0, y: 0, width: 1920, height: 1080 }, { x: 0, y: 0, width: 1920, height: 1040 });
  const c = G.topbarBounds(d, { width: 600, align: 'center' }); assert.equal(c.x, 660); assert.ok(c.x + c.width < 1920 - 150);
  assert.equal(G.topbarBounds(d, { width: 600, align: 'left' }).x, 8); assert.equal(G.topbarBounds(d, { width: 600, align: 'right' }).x, 1920 - 600 - 8);
  assert.equal(G.topbarBounds(d, { mode: 'full', width: 10 }).width, 1920);
});
test('geometría: panel respeta posición guardada y se mantiene dentro de la pantalla', () => {
  const d = disp(1, { x: 0, y: 0, width: 1920, height: 1080 }, { x: 0, y: 0, width: 1920, height: 1040 });
  assert.equal(G.panelBounds(d, { side: 'right', size: 'normal' }).x, 1920 - 318 - 12);
  const b = G.panelBounds(d, { side: 'right', size: 'wide', saved: { x: 5000, y: 5000 } }); assert.ok(b.x + b.width <= 1920); assert.ok(b.y < 1040);
});
test('geometría: elección de pantallas con respaldo a la principal', () => {
  const all = [disp(1, {}, {}), disp(2, {}, {})];
  assert.deepEqual(G.pickDisplays(all, 1, ['primary']).map((d) => d.id), [1]);
  assert.deepEqual(G.pickDisplays(all, 1, ['2', 'primary']).map((d) => d.id), [2, 1]);
  assert.deepEqual(G.pickDisplays(all, 1, ['9']).map((d) => d.id), [1], 'monitor desconectado → principal');
  const z = G.revealZone('topbar', disp(1, { x: 0, y: 0, width: 1920, height: 1080 }, {}), { x: 600, y: 0, width: 700, height: 50 }); assert.equal(z.height, 3);
  assert.ok(G.inRect({ x: 610, y: 1 }, z));
});

test('insignia: PNG válido con las dimensiones pedidas', () => {
  const png = circlePng(32, [255, 93, 122]); assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 32); assert.equal(png.readUInt32BE(20), 32);
  const idat = png.indexOf('IDAT'); const len = png.readUInt32BE(idat - 4); const raw = zlib.inflateSync(png.subarray(idat + 4, idat + 4 + len)); assert.equal(raw.length, (32 * 4 + 1) * 32);
  const mid = 16 * (32 * 4 + 1) + 1 + 16 * 4; assert.equal(raw[mid + 3], 255, 'centro opaco'); assert.equal(raw[1 + 3], 0, 'esquina transparente');
});
test('línea de comandos: solo órdenes de la lista cerrada', () => {
  assert.equal(parseCommand(['electron.exe', '.', '--nova=talk']), 'talk'); assert.equal(parseCommand(['--nova=format']), null); assert.equal(parseCommand(['--nova=talk;calc']), null); assert.equal(parseCommand([]), null);
  const t = jumpTasks({ execPath: 'C:\\e\\electron.exe', appPath: 'C:\\Mi Carpeta\\jarvis', isPackaged: false, icon: 'i.ico' });
  assert.equal(t.length, 4); assert.ok(t[0].arguments.startsWith('"C:\\Mi Carpeta\\jarvis" --nova='));
  assert.equal(jumpTasks({ execPath: 'n.exe', appPath: 'x', isPackaged: true, icon: '' })[0].arguments, '--nova=talk');
});

test('vigilante: interpreta pantalla completa, no molestar y ventanas', () => {
  const s = parseLine(JSON.stringify({ t: 'state', quns: 3, cover: false, abh: true, fg: 10, w: [{ pid: 10, n: 'chrome', t: 'Pestaña', p: 'C:\\c.exe', m: false }, { pid: 99, n: 'nova', t: 'propia' }, { pid: 5, n: 'TextInputHost', t: 'x' }, { pid: 6, n: 'notepad', t: '' }] }), 99);
  assert.equal(s.fullscreen, true); assert.equal(s.taskbarAutoHide, true); assert.equal(s.windows.length, 1); assert.equal(s.windows[0].active, true);
  assert.equal(parseLine('{"t":"state","quns":6}').quiet, true); assert.equal(parseLine('{"t":"state","quns":5,"cover":true}').fullscreen, true);
  assert.equal(parseLine('{"t":"state","quns":5}').fullscreen, false); assert.equal(parseLine('basura'), null); assert.equal(parseLine('{"t":"otro"}'), null);
});
test('vigilante: arranca, emite cambios, reintenta con límite y se apaga', async () => {
  const procs = []; const spawn = () => { const p = new EventEmitter(); p.stdout = new EventEmitter(); p.kill = () => { p.killed = true; }; procs.push(p); return p; };
  const w = createShellWatch({ spawn, platform: 'win32', setTimer: (f) => { f(); return 0; }, clearTimer() {} }); const seen = [];
  w.onChange((s) => seen.push(s.fullscreen)); w.start({ windows: true }); assert.equal(procs.length, 1);
  procs[0].stdout.emit('data', Buffer.from('{"t":"state","quns":3}\n{"t":"state"')); procs[0].stdout.emit('data', Buffer.from(',"quns":5}\n'));
  assert.deepEqual(seen, [true, false]); assert.equal(w.state().available, true);
  procs[0].emit('exit'); assert.equal(procs.length, 2, 'reintento'); procs[1].emit('exit'); procs[2].emit('exit'); procs[3].emit('exit'); assert.equal(procs.length, 4, 'máximo 3 reintentos'); assert.equal(w.state().available, false);
  w.stop();
  const none = createShellWatch({ spawn: () => { throw new Error('no'); }, platform: 'linux' }); none.start(); assert.equal(none.running(), false);
});
test('iconos: resuelve por nombre del menú Inicio y cachea', async () => {
  const fsImpl = { readdirSync: (d) => (d === '/ini' ? [{ name: 'Google Chrome.lnk', isDirectory: () => false }, { name: 'Sub', isDirectory: () => true }] : [{ name: 'Visual Studio Code.lnk', isDirectory: () => false }]), existsSync: (p) => p === 'C:\\chrome.exe' };
  let calls = 0; const ic = createAppIcons({ getFileIcon: async () => { calls++; return { toDataURL: () => 'data:image/png;base64,AAA', isEmpty: () => false }; }, readShortcut: (p) => (p.includes('Chrome') ? { target: 'C:\\chrome.exe' } : {}), dirs: ['/ini'], fsImpl });
  assert.equal(ic.pathForApp('google  chrome'), 'C:\\chrome.exe'); assert.ok(ic.pathForApp('Visual Studio Code').endsWith('Visual Studio Code.lnk')); assert.equal(ic.pathForApp('Inexistente'), null);
  assert.equal(await ic.dataUrl('C:\\chrome.exe'), 'data:image/png;base64,AAA'); await ic.dataUrl('C:\\chrome.exe'); assert.equal(calls, 1); assert.equal(await ic.dataUrl(null), null);
});
