// Gestor del shell nativo de Nova sobre Windows: panel de widgets, dock y barra superior como capas propias de Electron.
// No sustituye ni modifica el shell de Windows: son ventanas transparentes que reaccionan a monitores, pantalla completa y foco.
'use strict';
const path = require('path');
const G = require('./geometry');
const bus = require('./noticeBus');
const { circlePng } = require('./badge');
const { jumpTasks } = require('./cli');

const DOCK_H = 76, BAR_H = 50;
const HOTKEY = 'CommandOrControl+Alt+N';

function createShellManager({ electron, store, notices, watch, getCore, getMain, appPath, isDev, dialog, mem, flowEnv = async () => ({}), mediaKey = async () => ({ error: 'No disponible' }), cloud = null }) {
  const { BrowserWindow, screen, Menu, Notification, app, nativeTheme, systemPreferences, globalShortcut, nativeImage, shell } = electron;
  const isWin = process.platform === 'win32';
  let panel = null, flow = null, lastCursor = null, calm = false, pollTimer = null, hotkeyOn = false, reconcileTimer = null, locationAllowed = false;
  const docks = new Map(), bars = new Map(), sizes = new WeakMap(), auto = new WeakMap(), subs = new Set(), hideTimers = new WeakMap();
  const prefs = () => store.get();
  const alive = (w) => !!w && !w.isDestroyed();
  const barWins = () => [...docks.values(), ...bars.values()].filter(alive);
  const shellWins = () => [panel, ...barWins()].filter(alive);
  const main = () => { const m = getMain(); return alive(m) ? m : null; };
  const contents = () => [main(), ...shellWins()].filter(Boolean).map((w) => w.webContents);
  const broadcast = (ch, data) => { for (const wc of contents()) { try { wc.send(ch, data); } catch {} } };
  const changed = () => subs.forEach((f) => { try { f(); } catch {} });
  const displayOf = (win) => screen.getAllDisplays().find((d) => String(d.id) === String(win.__displayId)) || screen.getDisplayMatching(win.getBounds());

  // ---------- Origen de los mensajes IPC: solo páginas propias (marco principal), nunca el iframe del mapa ----------
  const ownSender = (sender) => { const m = main(); return (m && sender === m.webContents) || shellWins().some((w) => w.webContents === sender) || (alive(flow) && sender === flow.webContents); };
  const own = (e) => !(e.senderFrame && e.senderFrame.parent) && ownSender(e.sender);
  const admin = (e) => own(e) && (e.sender === main()?.webContents || e.sender === panel?.webContents);

  // ---------- Ventanas ----------
  const webPrefs = () => ({ preload: path.join(__dirname, '..', '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true });
  const common = () => ({ frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, skipTaskbar: true, show: false, fullscreenable: false, webPreferences: webPrefs() });
  const load = (win, mode, extra = {}) => {
    const q = new URLSearchParams({ mode, ...extra }).toString();
    if (isDev) win.loadURL('http://localhost:5173/widgets.html?' + q); else win.loadFile(path.join(appPath, 'dist', 'widgets.html'), { query: { mode, ...extra } });
  };

  function createPanel() {
    if (alive(panel)) return panel;
    if (!isWin) throw new Error('Los widgets de escritorio están disponibles en Windows');
    const nw = prefs().nativeWidgets, all = screen.getAllDisplays();
    const d = all.find((x) => String(x.id) === String(nw.window?.displayId || nw.displayId)) || screen.getPrimaryDisplay();
    const b = G.panelBounds(d, { side: nw.side, size: nw.size, saved: nw.window });
    panel = new BrowserWindow({ ...common(), ...b, resizable: true, movable: true, minimizable: false, maximizable: false });
    panel.__displayId = d.id;
    panel.setIgnoreMouseEvents(true, { forward: true });
    let t; panel.on('moved', () => { clearTimeout(t); t = setTimeout(() => { if (!alive(panel)) return; const bb = panel.getBounds(), dd = screen.getDisplayMatching(bb); panel.__displayId = dd.id; try { store.patch({ nativeWidgets: { displayId: String(dd.id), window: { ...bb, displayId: String(dd.id) } } }); } catch {} }, 350); });
    panel.on('show', changed); panel.on('hide', changed); panel.on('closed', () => { panel = null; changed(); });
    load(panel, 'panel');
    return panel;
  }
  function showPanel(raise = true) {
    const w = createPanel();
    if (!w.isVisible()) w.showInactive();
    if (raise) { w.moveTop(); } // showInactive no cambia el orden de apilamiento de una ventana que ya estaba visible
    try { store.patch({ nativeWidgets: { visible: true } }); } catch {}
    changed(); return w;
  }
  function hidePanel() { if (alive(panel)) panel.hide(); try { store.patch({ nativeWidgets: { visible: false } }); } catch {} changed(); }
  function togglePanel() {
    if (!alive(panel) || !panel.isVisible()) { showPanel(true); return true; }
    if (!panel.isFocused()) { panel.moveTop(); panel.focus(); return true; } // visible pero tapado: se trae al frente
    hidePanel(); return false;
  }

  function createBar(kind, display) {
    const w0 = kind === 'dock' ? 480 : 520;
    const b = kind === 'dock' ? G.dockBounds(display, { width: w0, height: DOCK_H }) : G.topbarBounds(display, { width: w0, height: BAR_H });
    const win = new BrowserWindow({ ...common(), ...b, resizable: false, movable: false, minimizable: false, maximizable: false, focusable: false, alwaysOnTop: true });
    win.__displayId = display.id; win.__kind = kind;
    win.setAlwaysOnTop(true, 'floating');
    win.on('closed', () => { (kind === 'dock' ? docks : bars).delete(String(display.id)); changed(); });
    load(win, kind, { display: String(display.id) });
    win.webContents.once('did-finish-load', () => applyVisibility());
    return win;
  }
  function place() {
    const cfgT = prefs().nativeWidgets.topbar;
    for (const [kind, map] of [['dock', docks], ['topbar', bars]]) {
      for (const [id, win] of map) {
        if (!alive(win)) continue; const d = screen.getAllDisplays().find((x) => String(x.id) === id); if (!d) continue;
        const width = sizes.get(win) || (kind === 'dock' ? 480 : 520);
        const b = kind === 'dock' ? G.dockBounds(d, { width, height: DOCK_H }) : G.topbarBounds(d, { width, align: cfgT.align, mode: cfgT.width, height: BAR_H });
        const cur = win.getBounds(); if (cur.x !== b.x || cur.y !== b.y || cur.width !== b.width || cur.height !== b.height) win.setBounds(b);
      }
    }
  }
  function reconcile() {
    const p = prefs(), all = screen.getAllDisplays(), primary = screen.getPrimaryDisplay().id;
    for (const [kind, map, cfg] of [['dock', docks, p.nativeWidgets.dockbar], ['topbar', bars, p.nativeWidgets.topbar]]) {
      const wanted = isWin && cfg.on ? G.pickDisplays(all, primary, cfg.displays) : [], ids = new Set(wanted.map((d) => String(d.id)));
      for (const [id, w] of [...map]) if (!ids.has(id) || !alive(w)) { try { if (alive(w)) w.destroy(); } catch {} map.delete(id); }
      for (const d of wanted) if (!map.has(String(d.id))) map.set(String(d.id), createBar(kind, d));
    }
    place();
    if (alive(panel)) { const d = displayOf(panel), nw = p.nativeWidgets; if (d) panel.setBounds(G.panelBounds(d, { side: nw.side, size: nw.size, saved: panel.getBounds() })); }
    syncWatch(); syncPoll(); applyVisibility(); updateBadge(); syncHotkey(); changed();
  }
  const scheduleReconcile = () => { clearTimeout(reconcileTimer); reconcileTimer = setTimeout(() => { try { reconcile(); } catch {} }, 250); };

  // ---------- Visibilidad: pantalla completa, modo calma y ocultación automática ----------
  const cfgOf = (win) => (win.__kind === 'dock' ? prefs().nativeWidgets.dockbar : prefs().nativeWidgets.topbar);
  function desired(win) {
    if (calm) return false;
    const ws = watch.state();
    if (prefs().shell.hideOnFullscreen && (ws.fullscreen || ws.away)) return false;
    return cfgOf(win).autoHide ? !!auto.get(win)?.revealed : true;
  }
  function applyVisibility() {
    for (const win of barWins()) {
      const want = desired(win), vis = win.isVisible();
      if (want && !vis) { clearTimeout(hideTimers.get(win)); try { win.webContents.send('nova:shell-visibility', { visible: true }); } catch {} win.showInactive(); }
      else if (!want && vis) { try { win.webContents.send('nova:shell-visibility', { visible: false }); } catch {} clearTimeout(hideTimers.get(win)); hideTimers.set(win, setTimeout(() => { if (alive(win) && !desired(win)) win.hide(); }, 180)); }
    }
    changed();
  }
  function syncWatch() {
    const p = prefs(), any = docks.size + bars.size > 0;
    const needWindows = (docks.size > 0 && p.nativeWidgets.dockbar.showRunning) || (bars.size > 0 && p.nativeWidgets.topbar.showActive);
    if (isWin && any && (p.shell.hideOnFullscreen || needWindows || p.shell.respectQuiet)) watch.start({ windows: needWindows }); else watch.stop();
  }
  // Sondeo del cursor para ocultar/mostrar dock y barra: rápido (100 ms) solo mientras hay una transición o algo visible,
  // y lento (300 ms) en reposo; no se sondea en modo calma ni con pantalla completa.
  const needPoll = () => barWins().some((w) => cfgOf(w).autoHide);
  function schedulePoll(ms) { clearTimeout(pollTimer); pollTimer = setTimeout(() => { pollTimer = null; let busy = false; try { busy = tick(); } catch {} if (needPoll()) schedulePoll(busy ? 100 : 300); }, ms); if (pollTimer.unref) pollTimer.unref(); }
  function syncPoll() { if (needPoll() && !pollTimer) schedulePoll(300); else if (!needPoll() && pollTimer) { clearTimeout(pollTimer); pollTimer = null; } }
  function tick() {
    if (calm) return false;
    const cur = screen.getCursorScreenPoint(), t = Date.now(); let any = false, busy = false;
    for (const win of barWins()) {
      if (!cfgOf(win).autoHide) continue;
      const d = displayOf(win), b = win.getBounds(), zone = G.revealZone(win.__kind, d, b), inside = G.inRect(cur, b, 6), inZone = G.inRect(cur, zone);
      const s = auto.get(win) || { revealed: false, enter: 0, leave: 0 }; auto.set(win, s);
      if (!s.revealed) { if (inZone) { s.enter = s.enter || t; busy = true; if (t - s.enter >= (win.__kind === 'dock' ? 250 : 150)) { s.revealed = true; s.leave = 0; any = true; } } else s.enter = 0; }
      else { busy = true; if (inside || inZone) s.leave = 0; else { s.leave = s.leave || t; if (t - s.leave > 700) { s.revealed = false; s.enter = 0; any = true; } } }
    }
    lastCursor = cur;
    if (any) applyVisibility();
    return busy;
  }
  function setCalm(on) { calm = on === undefined ? !calm : !!on; applyVisibility(); push({ title: calm ? 'Modo calma activado' : 'Modo calma desactivado', message: calm ? 'El dock y la barra de Nova están ocultos. Pulsa Ctrl+Alt+N para volver.' : 'Nova vuelve a mostrar su dock y su barra.', source: 'shell', silent: true }); return calm; }
  function syncHotkey() {
    if (!globalShortcut || !isWin) return; const want = prefs().shell.hotkey && (docks.size + bars.size > 0);
    if (want && !hotkeyOn) { try { hotkeyOn = globalShortcut.register(HOTKEY, () => setCalm()); } catch { hotkeyOn = false; } }
    else if (!want && hotkeyOn) { try { globalShortcut.unregister(HOTKEY); } catch {} hotkeyOn = false; }
  }

  // ---------- Avisos ----------
  const notifyListView = () => ({ ...notices.list(40) });
  function route(entry) {
    const p = prefs(), sh = p.shell, ws = watch.state();
    if (!p.nativeWidgets.notifications) return 'none';
    if (entry.priority < 5 && ((sh.hideOnFullscreen && (ws.fullscreen || ws.away)) || (sh.respectQuiet && ws.quiet && entry.level !== 'err'))) return 'none';
    const topbarUp = [...bars.values()].some((w) => alive(w) && w.isVisible());
    if (sh.toasts === 'topbar') return topbarUp ? 'topbar' : 'none';
    if (sh.toasts === 'windows') return 'windows';
    return topbarUp ? 'topbar' : 'windows';
  }
  function push(p) {
    const r = notices.push(p); if (!r) return null;
    if (!r.repeated && !p.silent) {
      const where = route(r);
      if (where === 'topbar') broadcast('nova:toast', r);
      else if (where === 'windows' && Notification && Notification.isSupported()) { try { const n = new Notification({ title: r.title, body: r.message, silent: r.priority < 4 }); n.on('click', () => showPanel(true)); n.show(); } catch {} }
      broadcast('nova:notification', r);
    }
    return r;
  }
  const onNotice = (ev) => { broadcast('nova:notices', { ...notifyListView(), event: ev.type }); updateBadge(); };
  let lastBadge = -1;
  function updateBadge() {
    const m = main(); if (!isWin || !m) return; const n = prefs().shell.taskbarBadge ? notices.unread() : 0; if (n === lastBadge) return; lastBadge = n;
    try { m.setOverlayIcon(n ? nativeImage.createFromBuffer(circlePng(32, [255, 93, 122])) : null, n ? `${n} avisos sin leer` : ''); } catch {}
  }

  // ---------- Acciones de Nova ----------
  function showMain() { const m = main(); if (!m) return; if (m.isMinimized()) m.restore(); m.show(); m.focus(); }
  function handleCommand(cmd) {
    if (!cmd) return;
    if (cmd === 'talk') { const m = main(); if (m) { showMain(); m.webContents.send('app:cmd', 'convo-on'); } }
    else if (cmd === 'widgets') togglePanel();
    else if (cmd === 'assistant') showMain();
    else if (cmd === 'calm') setCalm();
    else if (cmd === 'flow') openFlow();
    else if (cmd === 'dock') { if (!prefs().nativeWidgets.dockbar.on) { store.patch({ nativeWidgets: { dockbar: { on: true } } }); reconcile(); } else { for (const w of docks.values()) { const s = auto.get(w) || {}; s.revealed = true; s.leave = Date.now(); auto.set(w, s); } calm = false; applyVisibility(); } }
  }
  const sysCall = (fn) => { try { return Promise.resolve(fn(getCore().services.system)); } catch (e) { return Promise.reject(e); } };
  const fail = (title, e) => { const message = (e && e.message) || String(e); push({ title, message, level: 'warn', source: 'shell' }); return { error: message }; };

  async function launchPin(key) {
    const pin = prefs().dock.pins.find((x) => (x.appId || x.path) === key);
    if (!pin) return { error: 'Ese acceso ya no está en el dock' };
    const req = pin.type === 'app' ? { tool: 'apps.launch', args: { appId: pin.appId } } : { tool: 'fs.open', args: { path: pin.path } };
    const a = await getCore().agent.run({ ...req, origin: 'ui', untrusted: false });
    if (a.state !== 'succeeded') return fail('No se pudo abrir «' + pin.name + '»', a.error);
    return { ok: true };
  }
  function pinMenu(sender, pin) {
    const items = [{ label: 'Abrir', click: () => launchPin(pin.appId || pin.path) }, { type: 'separator' },
      { label: 'Quitar del dock', click: () => { store.patch({ dock: { pins: prefs().dock.pins.filter((x) => (x.appId || x.path) !== (pin.appId || pin.path)) } }); } }];
    Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(sender) });
  }
  function windowMenu(sender, w) {
    const run = (action) => () => sysCall((s) => s.windowAction(w.pid, action)).catch((e) => fail('No se pudo gestionar la ventana', e));
    Menu.buildFromTemplate([{ label: 'Mostrar', click: run('focus') }, { label: 'Minimizar', click: run('minimize') }, { label: 'Maximizar', click: run('maximize') }, { label: 'Restaurar', click: run('restore') }, { type: 'separator' }, { label: 'Cerrar ventana (la aplicación puede pedir guardar)', click: run('close') }]).popup({ window: BrowserWindow.fromWebContents(sender) });
  }
  function dockMenu(sender) {
    Menu.buildFromTemplate([{ label: 'Abrir Nova', click: showMain }, { label: 'Widgets', click: togglePanel }, { label: 'Mapa de Nova (3D)', click: openFlow }, { label: calm ? 'Salir del modo calma' : 'Modo calma (Ctrl+Alt+N)', click: () => setCalm() }, { type: 'separator' },
      { label: 'Ocultar este dock', click: () => { store.patch({ nativeWidgets: { dockbar: { on: false } } }); reconcile(); } }, { label: 'Salir de Nova', click: () => app.quit() }]).popup({ window: BrowserWindow.fromWebContents(sender) });
  }

  // ---------- Mapa de flujo 3D ----------
  function openFlow() {
    if (alive(flow)) { if (flow.isMinimized()) flow.restore(); flow.show(); flow.focus(); return flow; }
    flow = new BrowserWindow({ width: 1180, height: 780, minWidth: 720, minHeight: 480, title: 'Mapa de Nova', backgroundColor: '#060914', autoHideMenuBar: true, show: false, webPreferences: webPrefs() });
    try { flow.setMenuBarVisibility(false); flow.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); } catch {}
    flow.once('ready-to-show', () => { if (alive(flow)) flow.show(); });
    flow.on('closed', () => { flow = null; });
    load(flow, 'flow');
    return flow;
  }
  const withTimeout = (p, ms, fallback) => Promise.race([Promise.resolve(p).catch(() => fallback), new Promise((r) => { const t = setTimeout(() => r(fallback), ms); if (t.unref) t.unref(); })]);
  async function buildFlow() {
    const { buildGraph } = require('../flowGraph'); const { normalizeMedia } = require('../mediaCache');
    const env = await withTimeout(flowEnv(), 5000, {}); const ws = watch.state();
    let media = null; try { media = normalizeMedia(await withTimeout(sysCall((s) => s.mediaStatus()), 3000, null)); } catch {}
    const apps = await withTimeout(sysCall((s) => s.startApps()), 3000, null);
    const linerInstalled = Array.isArray(apps) ? apps.some((a) => /liner/i.test(a.name)) : null;
    return buildGraph({ ...env, prefs: prefs(), windows: ws.windows || [], shellActive: isShellActive(), linerInstalled, linerPlaying: !!(media && media.liner && media.current && media.current.playing), cloud: cloud ? await withTimeout(cloud.status(), 3000, {}) : null });
  }
  const MEDIA_KEYS = new Set(['play_pause', 'next', 'prev']);

  function createStartShortcut() {
    const dir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'), link = path.join(dir, 'Nova.lnk');
    require('fs').mkdirSync(dir, { recursive: true });
    // Sin empaquetar, Electron necesita la carpeta del proyecto como argumento; appUserModelId agrupa el acceso fijado con la ventana en ejecución.
    const ok = shell.writeShortcutLink(link, 'create', { target: process.execPath, args: app.isPackaged ? '' : `"${appPath}"`, cwd: appPath, description: 'Abrir Nova', icon: path.join(appPath, 'assets', 'nova.ico'), appUserModelId: 'Nova' });
    return ok ? { ok: true, path: link } : { error: 'Windows no pudo crear el acceso directo' };
  }

  // ---------- Tema del sistema ----------
  const sysTheme = () => { let accent = ''; try { const a = systemPreferences.getAccentColor(); if (a) accent = '#' + String(a).slice(0, 6); } catch {} return { dark: !!nativeTheme.shouldUseDarkColors, accent, contrast: !!nativeTheme.shouldUseHighContrastColors }; };

  // ---------- IPC ----------
  function registerIpc(ipcMain) {
    const h = (name, fn, guard = own) => ipcMain.handle('nova:' + name, async (e, d) => { if (!guard(e)) return { error: 'Origen no permitido' }; try { return await fn(d || {}, e); } catch (err) { return { error: err.message || String(err) }; } });
    h('prefs-get', () => prefs());
    h('prefs-patch', (d) => store.patch(d.patch));
    h('prefs-reset', () => { const r = store.reset(); reconcile(); return r; }, admin);
    h('notices-get', () => notifyListView());
    h('notices-read', (d) => notices.markRead(String(d.id || 'all')));
    h('notices-dismiss', (d) => notices.dismiss(String(d.id || '')));
    h('notices-clear', () => notices.clear(), admin);
    h('system-theme', () => sysTheme());
    h('windows-list', async () => { const st = watch.state(); if (st.available && st.windows.length) return { windows: st.windows }; return { windows: (await sysCall((s) => s.windows())).slice(0, 24) }; });
    h('window-action', async (d) => { const pid = Math.trunc(Number(d.pid)); const known = (watch.state().windows.length ? watch.state().windows : await sysCall((s) => s.windows())); if (!known.some((w) => w.pid === pid)) return { error: 'Esa ventana ya no existe' }; try { await sysCall((s) => s.windowAction(pid, String(d.action))); return { ok: true }; } catch (e) { return fail('No se pudo gestionar la ventana', e); } });
    h('shell-action', async (d) => { try { await sysCall((s) => s.shellAction(String(d.action))); return { ok: true }; } catch (e) { return fail('No se pudo usar esa función de Windows', e); } });
    h('launch-pin', (d) => launchPin(String(d.key || '')));
    h('shell-menu', (d, e) => {
      if (d.kind === 'pin') { const pin = prefs().dock.pins.find((x) => (x.appId || x.path) === String(d.key)); if (pin) pinMenu(e.sender, pin); }
      else if (d.kind === 'window') { const w = watch.state().windows.find((x) => x.pid === Math.trunc(Number(d.pid))); if (w) windowMenu(e.sender, w); }
      else dockMenu(e.sender);
      return { ok: true };
    });
    h('bar-size', (d, e) => { const win = barWins().find((w) => w.webContents === e.sender); if (!win) return { error: 'Origen no permitido' }; const wdt = Math.max(120, Math.min(2400, Math.round(Number(d.width) || 0))); if (sizes.get(win) !== wdt) { sizes.set(win, wdt); place(); } return { ok: true }; });
    h('icon', async (d) => {
      let p = null; const ic = appIcons();
      if (d.kind === 'pin') { const pin = prefs().dock.pins.find((x) => (x.appId || x.path) === String(d.key)); if (pin) p = pin.type === 'app' ? ic.pathForApp(pin.name) : pin.path; }
      else if (d.kind === 'window') { const w = watch.state().windows.find((x) => x.pid === Math.trunc(Number(d.pid))); if (w && w.path && !/applicationframehost\.exe$/i.test(w.path)) p = w.path; }
      return { icon: await ic.dataUrl(p) };
    });
    // Música: una consulta compartida y en caché (ver mediaCache.js); los botones usan las teclas multimedia del sistema
    h('media-get', async (d) => { const { normalizeMedia } = require('../mediaCache'); return normalizeMedia(await sysCall((s) => s.mediaStatus({ force: d.force === true }))); });
    h('media-key', async (d) => { const a = String(d.action || ''); if (!MEDIA_KEYS.has(a)) return { error: 'Acción no permitida' }; const r = await mediaKey(a); setTimeout(() => { try { getCore().services.system.mediaStatus({ force: true }).catch(() => {}); } catch {} }, 700); return r && r.error ? r : { ok: true }; });
    h('liner-open', async () => { try { const apps = await sysCall((s) => s.startApps()); const a = apps.find((x) => /liner/i.test(x.name)); if (!a) return { error: 'Liner no está instalado. Instálalo desde su página oficial y vuelve a probar.' }; await sysCall((s) => s.launchApp(a.appId)); return { ok: true, name: a.name }; } catch (e) { return fail('No se pudo abrir Liner', e); } });
    // Mapa de flujo
    h('flow-graph', () => buildFlow());
    h('flow-open', () => { openFlow(); return { ok: true }; }, admin);
    // Modelo en la nube (Inkling 2 Small): solo desde el panel/ajustes de Nova y con consentimiento explícito
    h('cloud-status', () => (cloud ? cloud.status() : { error: 'No disponible' }), admin);
    h('cloud-register', () => (cloud ? cloud.register() : { error: 'No disponible' }), admin);
    h('cloud-signin', () => (cloud ? cloud.signin() : { error: 'No disponible' }), admin);
    h('cloud-test', () => (cloud ? cloud.test() : { error: 'No disponible' }), admin);
    h('cloud-enable', async (d) => {
      if (!cloud) return { error: 'No disponible' };
      if (d.on !== true) return cloud.setEnabled(false);
      const r = await dialog.showMessageBox(main() || undefined, { type: 'warning', title: 'Activar modelo en la nube', message: 'Inkling 2 Small funciona en Ollama Cloud, no en tu PC.', detail: 'Al activarlo, tus mensajes (y los archivos que adjuntes) se enviarán a Ollama Cloud para generar la respuesta. Ollama indica que no retiene los datos ni los usa para entrenar, pero Nova deja de ser 100 % local con este modelo. Puede tener límites o coste según tu plan de Ollama. Puedes desactivarlo cuando quieras; si falla, Nova vuelve al modelo local.', buttons: ['Cancelar', 'Activar'], defaultId: 0, cancelId: 0, noLink: true });
      if (r.response !== 1) return { cancelled: true, enabled: false };
      return cloud.setEnabled(true);
    }, admin);
    h('shell-status', () => ({ calm, watch: { running: watch.running(), ...watch.state() }, dock: [...docks.keys()], topbar: [...bars.keys()], panel: alive(panel) && panel.isVisible(), hotkey: hotkeyOn ? HOTKEY : '' }), admin);

    // Canal histórico del preload (desktopWidgets): se conservan todas las acciones de la update 29 y se añaden las nuevas.
    ipcMain.handle('desktop:widgets', async (e, request = {}) => {
      const d = typeof request === 'string' ? { action: request } : (request || {}), action = d.action || 'toggle';
      if (!own(e)) return { error: 'Origen no permitido' };
      const needAdmin = ['topbar', 'dock', 'shortcut', 'discord', 'layout', 'quit'];
      if (needAdmin.includes(action) && !admin(e)) return { error: 'Origen no permitido' };
      const m = main();
      switch (action) {
        case 'displays': return { displays: screen.getAllDisplays().map((x, i) => ({ id: String(x.id), label: `Pantalla ${i + 1} · ${x.size.width}×${x.size.height}`, primary: x.id === screen.getPrimaryDisplay().id })) };
        case 'state': { if (e.sender !== m?.webContents) return { error: 'Origen no permitido' }; for (const w of shellWins()) { try { w.webContents.send('nova:app-state', d.state || 'idle'); } catch {} } try { require('../../discordPresence').setState(d.state || 'idle'); } catch {} return { ok: true }; }
        case 'talk': handleCommand('talk'); return { ok: true };
        case 'open-nova': showMain(); return { ok: true };
        case 'location-consent': { const r = await dialog.showMessageBox({ type: 'question', title: 'Ubicación para el mapa de Nova', message: '¿Permites que Nova consulte tu ubicación aproximada para mostrarla en OpenStreetMap?', detail: 'La ubicación se consulta solo al pulsar este botón. Las coordenadas se cargan desde OpenStreetMap para mostrar el mapa. Puedes denegarlo.', buttons: ['Ahora no', 'Permitir'], defaultId: 0, cancelId: 0, noLink: true }); locationAllowed = r.response === 1; global.__novaLocationAllowed = locationAllowed; return { allowed: locationAllowed }; }
        case 'topbar': case 'dock': { const key = action === 'dock' ? 'dockbar' : 'topbar'; const delta = { on: d.on !== false }; if (d.displays) delta.displays = d.displays; store.patch({ nativeWidgets: { [key]: delta } }); reconcile(); return { on: delta.on }; }
        case 'dock-show': handleCommand('dock'); return { visible: true };
        case 'shortcut': { const r = await dialog.showMessageBox(m || undefined, { type: 'question', title: 'Acceso rápido de Nova', message: 'Crear un acceso de Nova en el menú Inicio para poder anclarlo a la barra de tareas.', buttons: ['Cancelar', 'Crear acceso'], defaultId: 0, cancelId: 0 }); if (r.response !== 1) return { cancelled: true }; return createStartShortcut(); }
        case 'discord': { const presence = require('../../discordPresence'); const s = mem.getSettings(); const appId = String(d.appId || s.discordAppId || '').trim(); if (d.enabled === true && !/^\d{5,25}$/.test(appId)) return { error: 'Introduce un Application ID numérico válido de Discord.' }; presence.configure({ enabled: d.enabled === true, appId, state: 'idle' }); mem.setSettings({ discordPresence: d.enabled === true ? 'true' : 'false', discordAppId: appId }); return { ok: true, active: d.enabled === true }; }
        case 'hide': hidePanel(); if (m && !m.isVisible() && !isShellActive()) app.quit(); return { visible: false };
        case 'show': showPanel(true); return { visible: true };
        case 'layout': {
          const side = d.side === 'left' ? 'left' : d.side === 'right' ? 'right' : null, size = ['compact', 'normal', 'wide'].includes(d.size) ? d.size : null; if (!side || !size) return { error: 'Diseño no válido' };
          const disp = screen.getAllDisplays().find((x) => String(x.id) === String(d.displayId)) || (alive(panel) ? screen.getDisplayMatching(panel.getBounds()) : screen.getPrimaryDisplay());
          const saved = Number.isFinite(d.x) && Number.isFinite(d.y) ? { x: d.x, y: d.y } : null, b = G.panelBounds(disp, { side, size, saved });
          const w = createPanel(); w.__displayId = disp.id; w.setBounds(b);
          store.patch({ nativeWidgets: { displayId: String(disp.id), side, size, window: { ...b, displayId: String(disp.id) } } }); return { visible: w.isVisible() };
        }
        case 'quit': app.quit(); return { ok: true };
        case 'toggle': default: if (action !== 'toggle') return { error: 'Acción no válida' }; return { visible: togglePanel() };
      }
    });
    ipcMain.handle('desktop:widgets-input', (e, ignore) => { if (!own(e)) return { error: 'Origen no permitido' }; const w = shellWins().find((x) => x.webContents === e.sender); if (w && w === panel) w.setIgnoreMouseEvents(ignore === true, { forward: true }); return { ok: true }; });
  }

  let icons = null; const appIcons = () => icons || (icons = require('./appIcons').createAppIcons({ getFileIcon: (p) => app.getFileIcon(p, { size: 'large' }), readShortcut: (p) => shell.readShortcutLink(p), dirs: [path.join(process.env.ProgramData || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'), path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')] }));

  function isShellActive() { return (alive(panel) && panel.isVisible()) || docks.size > 0 || bars.size > 0; }

  function init(ipcMain) {
    bus.setHandler(push);
    registerIpc(ipcMain);
    for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, scheduleReconcile);
    nativeTheme.on('updated', () => broadcast('nova:system-theme', sysTheme()));
    try { systemPreferences.on('accent-color-changed', () => broadcast('nova:system-theme', sysTheme())); } catch {}
    watch.onChange(() => { applyVisibility(); broadcast('nova:shell-state', { fullscreen: watch.state().fullscreen, quiet: watch.state().quiet, windows: watch.state().windows }); });
    if (isWin) { try { app.setUserTasks(jumpTasks({ execPath: process.execPath, appPath, isPackaged: app.isPackaged, icon: path.join(appPath, 'assets', 'nova.ico') })); } catch {} }
    // Restauración al arrancar: lo que estaba activo vuelve a aparecer (el panel también, que antes se perdía)
    setTimeout(() => { try { if (isWin) { reconcile(); if (prefs().nativeWidgets.visible) showPanel(false); } } catch {} }, 1500);
  }
  function dispose() { clearTimeout(pollTimer); try { if (alive(flow)) flow.destroy(); } catch {} clearTimeout(reconcileTimer); try { watch.stop(); } catch {} try { globalShortcut.unregisterAll(); } catch {} }

  return { onNotice, init, dispose, handleCommand, isShellActive, trusted: ownSender, push, setStats: (m) => { for (const w of shellWins()) { try { w.webContents.send('stats', m); } catch {} } }, agentEvent(ev) {
    for (const w of [main(), panel]) { try { if (alive(w)) w.webContents.send('agent:event', ev); } catch {} }
    const a = ev && ev.action; const m = main();
    if (a && a.state === 'awaiting_confirmation' && m && !m.isVisible()) { showMain(); push({ title: 'Nova necesita tu confirmación', message: a.summary || a.tool || 'Hay una acción pendiente', level: 'warn', source: 'agente', priority: 4 }); }
  }, onChange: (f) => { subs.add(f); return () => subs.delete(f); }, reconcile, panelVisible: () => alive(panel) && panel.isVisible() };
}
module.exports = { createShellManager, HOTKEY };
