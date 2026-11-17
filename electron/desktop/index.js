// Nova Desktop (proceso principal): ensambla servicios reales + herramientas del agente + IPC.
// createCore() no depende de Electron (se prueba con node --test); init() lo conecta a la app real.
'use strict';
const path = require('path');
const { createRegistry } = require('../agent/registry');
const { createAgent } = require('../agent/runner');
const { createAudit } = require('../agent/audit');
const { createFsGuard } = require('./fsGuard');
const { createFsService } = require('./fsService');
const { createSystem } = require('./system');

function createCore({ shell, execFile, getStats = () => null, getRoots, getPlaces = () => [], settings = () => ({}), env = process.env, emit = () => {}, auditFile = null, platform = process.platform, selfPid = process.pid, recentDir = null, os = require('os') }) {
  const guard = createFsGuard({ getRoots });
  const fsSvc = createFsService({ guard, trash: (p) => shell.trashItem(p), getPlaces });
  const system = createSystem({ execFile, platform, getStats, os, selfPid, shell, recentDir, guardSafe: (p) => guard.safe(p) });
  const registry = createRegistry();
  require('../agent/tools/fs').register(registry);
  require('../agent/tools/system').register(registry);
  const audit = createAudit(auditFile);
  const services = { fs: fsSvc, system, guard, shell };
  const agent = createAgent({ registry, audit, services, settings, env, emit });
  return { registry, agent, audit, services, guard };
}

let core = null, lastStats = null, mgr = null;
const setStats = (m) => { lastStats = m; try { mgr && mgr.setStats(m); } catch {} };

// Antes de crear la ventana principal: ¿hay que arrancar en segundo plano? ¿Llega una orden por línea de comandos?
function preflight({ mem, argv = process.argv }) {
  const { createPrefsStore } = require('./shell/prefsStore'); const { parseCommand } = require('./shell/cli');
  let startHidden = argv.includes('--nova-hidden'); const cmd = parseCommand(argv);
  try {
    const p = createPrefsStore({ read: () => mem.getSettings()['desk.prefs'], write: () => {}, defaults: require('../../src/desktop/prefs.defaults.json') }).get();
    if (p.shell.startMode === 'background' && (p.nativeWidgets.visible || p.nativeWidgets.dockbar.on || p.nativeWidgets.topbar.on)) startHidden = true;
  } catch {}
  return { startHidden: startHidden && cmd !== 'talk' && cmd !== 'assistant', cmd };
}

function init({ ipcMain, app, shell, getWin, mem, pcControl, execFile, BrowserWindow, dialog, mediaControl }) {
  const electron = require('electron');
  const { createPrefsStore } = require('./shell/prefsStore'); const { createNotices } = require('./shell/notices'); const { createShellWatch } = require('./shell/shellWatch'); const { createShellManager } = require('./shell/manager');
  const places = () => {
    const out = []; const add = (id, label, key) => { try { out.push({ id, label, path: app.getPath(key) }); } catch {} };
    add('desktop', 'Escritorio', 'desktop'); add('documents', 'Documentos', 'documents'); add('downloads', 'Descargas', 'downloads');
    add('pictures', 'Imágenes', 'pictures'); add('videos', 'Vídeos', 'videos'); add('music', 'Música', 'music');
    if (process.env.OneDrive) out.push({ id: 'onedrive', label: 'OneDrive', path: process.env.OneDrive });
    return out;
  };
  core = createCore({
    shell, execFile, getStats: () => lastStats, getRoots: () => pcControl._roots(), getPlaces: places,
    settings: () => mem.getSettings(), env: process.env, emit: (ev) => mgr && mgr.agentEvent(ev), auditFile: path.join(app.getPath('userData'), 'agent-audit.jsonl'),
  });
  const store = createPrefsStore({
    read: () => mem.getSettings()['desk.prefs'], write: (raw) => mem.setSettings({ 'desk.prefs': raw }), defaults: require('../../src/desktop/prefs.defaults.json'),
    // Todas las ventanas reciben el cambio: así dock, barra, panel y escritorio nunca muestran preferencias antiguas
    onChange: (p) => { for (const w of electron.BrowserWindow.getAllWindows()) { try { if (!w.isDestroyed()) w.webContents.send('nova:prefs', p); } catch {} } },
  });
  const notices = createNotices({ file: path.join(app.getPath('userData'), 'nova-notices.json'), emit: (ev) => mgr && mgr.onNotice(ev) });
  const watch = createShellWatch({ spawn: require('child_process').spawn, log: (...a) => console.log('[shell]', ...a) });
  const cloud = require('./cloudModel').createCloud({
    execFile, spawn: require('child_process').spawn, getUrl: () => process.env.OLLAMA_API_URL || 'http://localhost:11434',
    getSettings: () => mem.getSettings(), setSettings: (v) => mem.setSettings(v),
  });
  // Datos para el mapa de flujo: solo nombres y estados (nunca claves, temas de ntfy ni contenido)
  const flowEnv = async () => {
    const s = mem.getSettings(); let roots = [];
    try { const r = pcControl._roots(); roots = (Array.isArray(r) ? r : []).map((x) => (typeof x === 'string' ? x : x && x.path)).filter(Boolean); } catch {}
    let tools = []; try { tools = typeof core.registry.list === 'function' ? core.registry.list().map((t) => (typeof t === 'string' ? t : t && t.name)).filter(Boolean) : []; } catch {}
    let models = null, reachable = false; try { const st = await cloud.status(); reachable = st.reachable; } catch {}
    if (reachable) { try { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 2000); const r = await fetch((process.env.OLLAMA_API_URL || 'http://localhost:11434').replace(/\/+$/, '') + '/api/tags', { signal: ac.signal }); clearTimeout(t); const j = await r.json(); models = (j.models || []).filter((m) => !/:cloud$/.test(m.name || '')).length; } catch {} }
    return {
      appRoot: app.getAppPath(), userData: app.getPath('userData'), roots, places: places(), tools,
      env: { braveKey: !!process.env.BRAVE_SEARCH_API_KEY, ntfyTopic: !!(s.ntfyTopic || process.env.NTFY_TOPIC), pcControl: String(process.env.PC_CONTROL || 'on').toLowerCase() !== 'off', model: s.model || s.ollamaModel || process.env.OLLAMA_MODEL || '' },
      discordOn: s.discordPresence === 'true', mobileOn: true, ollama: { reachable, models },
    };
  };
  mgr = createShellManager({ electron, store, notices, watch, getCore: () => core, getMain: getWin, appPath: app.getAppPath(), isDev: process.env.ELECTRON_DEV === '1', dialog, mem, flowEnv, cloud, mediaKey: async (a) => (typeof mediaControl === 'function' ? mediaControl(a) : { error: 'No disponible' }) });
  try { electron.session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(permission === 'geolocation' && mgr.trusted(wc) && wc.getURL().includes('widgets') && locationAllowedFlag())); } catch {}
  mgr.init(ipcMain);
  try { const s = mem.getSettings(); require('../discordPresence').configure({ enabled: s.discordPresence === 'true', appId: s.discordAppId || '', state: 'idle' }); } catch {}
  require('../agent/ipc').registerAgentIpc({ ipcMain, getWin, agent: core.agent, registry: core.registry, audit: core.audit, isTrustedSender: (sender) => mgr.trusted(sender) });

  // Iconos de ventanas abiertas para el escritorio interno: solo de rutas que acaban de salir de la lista de ventanas del sistema
  const iconCache = new Map();
  ipcMain.handle('desktop:icon', async (e, d) => {
    const w = getWin(); if (!w || e.sender !== w.webContents) return { error: 'Origen no permitido' };
    const p = d && typeof d.path === 'string' ? d.path : '';
    if (!p || !core.lastWindowPaths || !core.lastWindowPaths.has(p.toLowerCase())) return { error: 'Icono no disponible' };
    if (iconCache.has(p)) return { icon: iconCache.get(p) };
    try { const img = await app.getFileIcon(p, { size: 'normal' }); const url = img.toDataURL(); iconCache.set(p, url); return { icon: url }; } catch { return { error: 'Sin icono' }; }
  });
  const orig = core.services.system.windows;
  core.services.system.windows = async () => { const r = await orig(); core.lastWindowPaths = new Set(r.map((x) => (x.path || '').toLowerCase()).filter(Boolean)); return r; };
  return core;
}
// El permiso de ubicación solo se concede tras la confirmación explícita del usuario (ver acción 'location-consent')
const locationAllowedFlag = () => global.__novaLocationAllowed === true;
module.exports = {
  createCore, init, setStats, preflight,
  handleCommand: (c) => { try { mgr && mgr.handleCommand(c); } catch {} },
  isShellActive: () => !!mgr && mgr.isShellActive(),
  hasWidgets: () => !!mgr && mgr.isShellActive(),
  onShellChange: (f) => (mgr ? mgr.onChange(f) : () => {}),
  dispose: () => { try { mgr && mgr.dispose(); } catch {} },
};
