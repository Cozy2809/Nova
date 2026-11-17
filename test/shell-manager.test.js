'use strict';
// Prueba de humo del gestor del shell con un Electron simulado: crea/destruye ventanas, valida orígenes y reacciona a monitores.
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');
const { createPrefsStore } = require('../electron/desktop/shell/prefsStore');
const { createNotices } = require('../electron/desktop/shell/notices');
const { createShellManager } = require('../electron/desktop/shell/manager');
const DEFAULTS = require('../src/desktop/prefs.defaults.json');

function world() {
  const wins = []; const sent = [];
  class Win extends EventEmitter {
    constructor(o) { super(); this.o = o; this.b = { x: o.x, y: o.y, width: o.width, height: o.height }; this.vis = false; this.destroyed = false; this.webContents = Object.assign(new EventEmitter(), { send: (ch, d) => sent.push([ch, d]), once() {}, getURL: () => 'x' }); wins.push(this); }
    isDestroyed() { return this.destroyed; } isVisible() { return this.vis; } showInactive() { this.vis = true; } show() { this.vis = true; } hide() { this.vis = false; } destroy() { this.destroyed = true; this.emit('closed'); }
    setAlwaysOnTop() {} setIgnoreMouseEvents() {} getBounds() { return this.b; } setBounds(b) { this.b = { ...b }; } loadURL() {} loadFile() {} moveTop() { this.top = true; } focus() {} isFocused() { return false; } setOverlayIcon() {}
    static fromWebContents() { return null; } static getAllWindows() { return wins.filter((w) => !w.destroyed); }
  }
  const displays = [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, size: { width: 1920, height: 1080 } }, { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 1024 }, workArea: { x: 1920, y: 0, width: 1280, height: 1024 }, size: { width: 1280, height: 1024 } }];
  const screen = Object.assign(new EventEmitter(), { getAllDisplays: () => displays, getPrimaryDisplay: () => displays[0], getDisplayMatching: () => displays[0], getCursorScreenPoint: () => ({ x: 0, y: 0 }) });
  const handlers = {}; const ipcMain = { handle: (c, f) => { handlers[c] = f; } };
  const electron = { BrowserWindow: Win, screen, Menu: { buildFromTemplate: () => ({ popup() {} }) }, Notification: Object.assign(class { show() {} on() {} }, { isSupported: () => true }), app: { getPath: () => '/tmp', quit() {}, isPackaged: false, setUserTasks() {} }, nativeTheme: new EventEmitter(), systemPreferences: new EventEmitter(), globalShortcut: { register: () => true, unregister() {}, unregisterAll() {} }, nativeImage: { createFromBuffer: () => ({}) }, shell: {} };
  electron.nativeTheme.shouldUseDarkColors = true; electron.systemPreferences.getAccentColor = () => '0078d4ff';
  let v = ''; const store = createPrefsStore({ read: () => v, write: (x) => { v = x; }, defaults: DEFAULTS });
  const notices = createNotices({ emit: (e) => m.onNotice(e) });
  const watchState = { available: true, fullscreen: false, quiet: false, away: false, windows: [] }; const wsubs = [];
  const watch = { start() { this.started = true; }, stop() { this.started = false; }, state: () => watchState, onChange: (f) => wsubs.push(f), running: () => true };
  const main = new Win({ x: 0, y: 0, width: 100, height: 100 }); main.vis = true;
  const m = createShellManager({ electron, store, notices, watch, getCore: () => ({ services: { system: {} }, agent: { run: async () => ({ state: 'succeeded' }) } }), getMain: () => main, appPath: '/app', isDev: false, dialog: {}, mem: {} });
  return { wins, sent, handlers, screen, displays, store, notices, m, main, watchState, wsubs, watch, ipcMain, Win };
}
const ev = (w, sender) => ({ sender: sender || w.main.webContents, senderFrame: { parent: null } });
const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
const asWin = () => Object.defineProperty(process, 'platform', { value: 'win32' });
const restore = () => Object.defineProperty(process, 'platform', realPlatform);

test('gestor: activar barra y dock crea una ventana por pantalla elegida y las destruye al quitarlas', async () => {
  asWin(); try {
    const w = world(); w.m.init(w.ipcMain);
    await w.handlers['desktop:widgets'](ev(w), { action: 'topbar', on: true, displays: ['primary', '2'] });
    await w.handlers['desktop:widgets'](ev(w), { action: 'dock', on: true });
    const bars = w.wins.filter((x) => x.__kind === 'topbar' && !x.destroyed), docks = w.wins.filter((x) => x.__kind === 'dock' && !x.destroyed);
    assert.equal(bars.length, 2); assert.equal(docks.length, 1); assert.equal(docks[0].o.focusable, false, 'el dock no roba el foco');
    assert.equal(w.m.isShellActive(), true);
    await w.handlers['desktop:widgets'](ev(w), { action: 'topbar', on: true, displays: ['2'] });
    assert.equal(w.wins.filter((x) => x.__kind === 'topbar' && !x.destroyed).length, 1);
    w.m.dispose();
  } finally { restore(); }
});
test('gestor: orígenes no propios (iframe, otra página) no pueden usar el IPC', async () => {
  asWin(); try {
    const w = world(); w.m.init(w.ipcMain);
    const evil = { sender: new EventEmitter(), senderFrame: { parent: null } };
    assert.equal((await w.handlers['nova:prefs-get'](evil)).error, 'Origen no permitido');
    assert.equal((await w.handlers['desktop:widgets'](evil, { action: 'quit' })).error, 'Origen no permitido');
    const iframe = { sender: w.main.webContents, senderFrame: { parent: {} } };
    assert.equal((await w.handlers['nova:prefs-get'](iframe)).error, 'Origen no permitido');
    assert.ok(!(await w.handlers['nova:prefs-get'](ev(w))).error);
    assert.equal(w.m.trusted(w.main.webContents), true); assert.equal(w.m.trusted(evil.sender), false);
    w.m.dispose();
  } finally { restore(); }
});
test('gestor: el parche de preferencias se aplica, se difunde y la pantalla completa oculta dock y barra', async () => {
  asWin(); try {
    const w = world(); w.m.init(w.ipcMain);
    const r = await w.handlers['nova:prefs-patch'](ev(w), { patch: { shell: { toasts: 'topbar' } } }); assert.equal(r.shell.toasts, 'topbar');
    await w.handlers['desktop:widgets'](ev(w), { action: 'dock', on: true });
    const dock = w.wins.find((x) => x.__kind === 'dock'); w.m.reconcile(); assert.equal(dock.vis, true);
    w.watchState.fullscreen = true; w.wsubs.forEach((f) => f()); await new Promise((r2) => setTimeout(r2, 250)); assert.equal(dock.vis, false, 'oculto con pantalla completa');
    w.watchState.fullscreen = false; w.wsubs.forEach((f) => f()); assert.equal(dock.vis, true);
    w.m.handleCommand('calm'); await new Promise((r2) => setTimeout(r2, 250)); assert.equal(dock.vis, false, 'modo calma');
    w.m.dispose();
  } finally { restore(); }
});
test('gestor: al desconectar un monitor la barra pasa a la principal y el tamaño informado reajusta la ventana', async () => {
  asWin(); try {
    const w = world(); w.m.init(w.ipcMain);
    await w.handlers['desktop:widgets'](ev(w), { action: 'dock', on: true, displays: ['2'] });
    const dock = w.wins.find((x) => x.__kind === 'dock'); assert.equal(dock.__displayId, 2);
    w.displays.pop(); w.screen.emit('display-removed'); await new Promise((r2) => setTimeout(r2, 400));
    const now = w.wins.filter((x) => x.__kind === 'dock' && !x.destroyed); assert.equal(now.length, 1); assert.equal(now[0].__displayId, 1);
    const dw = now[0]; await w.handlers['nova:bar-size']({ sender: dw.webContents, senderFrame: { parent: null } }, { width: 700 }); assert.equal(dw.b.width, 700);
    w.m.dispose();
  } finally { restore(); }
});
test('gestor: los avisos llegan al historial y se encaminan según la barra; el botón de widgets trae el panel al frente', async () => {
  asWin(); try {
    const w = world(); w.m.init(w.ipcMain);
    w.m.push({ title: 'Hola', message: 'mundo' }); assert.equal(w.notices.list().unread, 1);
    assert.ok(w.sent.some(([c]) => c === 'nova:notices'), 'difusión del historial');
    await w.handlers['desktop:widgets'](ev(w), { action: 'topbar', on: true }); const bar = w.wins.find((x) => x.__kind === 'topbar'); bar.vis = true;
    w.sent.length = 0; w.m.push({ title: 'Otro', message: 'aviso' }); assert.ok(w.sent.some(([c]) => c === 'nova:toast'), 'toast en la barra');
    const t = await w.handlers['desktop:widgets'](ev(w), { action: 'toggle' }); assert.equal(t.visible, true);
    const panel = w.wins.find((x) => !x.__kind && x !== w.main); assert.equal(panel.top, true, 'se trae al frente');
    w.m.dispose();
  } finally { restore(); }
});
