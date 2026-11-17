// Proceso principal: ventana, IPC, herramientas y servicios
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const readline = require('readline');
const { spawn, execFile } = require('child_process');
const { Worker } = require('worker_threads');
require('dotenv').config();

let win, mem, voice, voiceId = 0; const pending = new Map();
const DEV = process.env.ELECTRON_DEV === '1';
const providers = require('./providers/registry');
const { notify } = require('./notify');
const { sendWhatsApp } = require('./whatsapp');

// Lista blanca de apps (nunca se ejecuta texto libre del modelo)
const APPS = process.platform === 'win32'
  ? { notepad: 'notepad.exe', calculadora: 'calc.exe', explorador: 'explorer.exe', chrome: 'chrome.exe', spotify: 'spotify.exe' }
  : { notepad: 'gedit', calculadora: 'gnome-calculator', explorador: 'nautilus', chrome: 'firefox', spotify: 'spotify' };

// --- Abrir aplicaciones: lista fija; el renderer solo envía un id, nunca comandos ---
const SYS = process.env.SystemRoot || 'C:\\Windows';
const LAUNCH = {
  discord: { label: 'Discord', start: 'Discord', url: 'https://discord.com/app' },
  spotify: { label: 'Spotify', start: 'Spotify', url: 'https://open.spotify.com' },
  youtube: { label: 'YouTube', url: 'https://www.youtube.com' },
  claude: { label: 'Claude', url: 'https://claude.ai' },
  twitch: { label: 'Twitch', url: 'https://www.twitch.tv' },
  calculadora: { label: 'la calculadora', file: path.join(SYS, 'System32', 'calc.exe') },
  bloc: { label: 'el Bloc de notas', file: path.join(SYS, 'System32', 'notepad.exe') },
  onenote: { label: 'OneNote', start: 'OneNote', url: 'https://www.onenote.com/notebooks' },
  explorador: { label: 'el Explorador', file: path.join(SYS, 'explorer.exe') },
  tareas: { label: 'el Administrador de tareas', file: path.join(SYS, 'System32', 'Taskmgr.exe') },
  minecraft: { label: 'Minecraft', start: 'Minecraft Launcher' },
  steam: { label: 'Steam', start: 'Steam' },
};
const runPS = (script) => new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 20000 }, (err, out) => resolve(err ? '' : String(out).trim())));
async function openApp(id) {
  if (!Object.hasOwn(LAUNCH, id)) return { error: 'Aplicación desconocida' };
  const a = LAUNCH[id];
  try {
    if (a.file) { const err = await shell.openPath(a.file); return err ? { error: 'No he podido abrir ' + a.label } : { ok: true, via: 'app' }; }
    if (a.start && process.platform === 'win32') {
      // Busca la app por nombre en el menú Inicio (sirve para versión de Microsoft Store o instalador normal)
      const r = await runPS(`$a = Get-StartApps | Where-Object { $_.Name -like '*${a.start}*' } | Sort-Object { $_.Name.Length } | Select-Object -First 1; if ($a) { Start-Process explorer.exe ('shell:AppsFolder\\' + $a.AppID); 'OK' } else { 'NO' }`);
      if (r.split(/\r?\n/).pop() === 'OK') return { ok: true, via: 'app' };
    }
    if (a.url) { await shell.openExternal(a.url); return { ok: true, via: a.start ? 'fallback' : 'browser' }; }
    return { error: 'No encuentro ' + a.label + ' instalado' };
  } catch { return { error: 'No he podido abrir ' + a.label }; }
}

function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 800, frame: false, backgroundColor: '#020b14',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  DEV ? win.loadURL('http://localhost:5173') : win.loadFile(path.join(__dirname, '../dist/index.html'));
}

const confirm = async (msg) => (await dialog.showMessageBox(win, { type: 'warning', buttons: ['Cancelar', 'Permitir'], defaultId: 0, cancelId: 0, title: 'Confirmar acción', message: msg })).response === 1;
const insideHome = (p) => { const r = path.resolve(p); return r.startsWith(os.homedir() + path.sep); };

const tools = {
  async search({ query }) {
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key) throw new Error('Falta BRAVE_SEARCH_API_KEY en .env');
    const r = await fetch('https://api.search.brave.com/res/v1/web/search?count=5&q=' + encodeURIComponent(String(query).slice(0, 200)), { headers: { 'X-Subscription-Token': key, Accept: 'application/json' } });
    if (!r.ok) throw new Error('Brave Search respondió ' + r.status);
    return ((await r.json()).web?.results || []).map(x => ({ title: x.title, url: x.url, description: x.description }));
  },
  async open_app({ app: name }) {
    const bin = APPS[String(name).toLowerCase()];
    if (!bin) throw new Error('App no permitida. Permitidas: ' + Object.keys(APPS).join(', '));
    if (!(await confirm('Abrir ' + name + '?'))) return 'Cancelado por el usuario';
    spawn(bin, [], { detached: true, stdio: 'ignore', shell: false }).on('error', () => {}).unref();
    return 'Abierta ' + name;
  },
  async list_dir({ path: p }) {
    const full = path.resolve(os.homedir(), String(p || '.'));
    if (full !== os.homedir() && !insideHome(full)) throw new Error('Solo se permite dentro de tu carpeta de usuario');
    return fs.readdirSync(full).slice(0, 100);
  },
  async delete_file({ path: p }) {
    const full = path.resolve(os.homedir(), String(p));
    if (!insideHome(full)) throw new Error('Solo dentro de tu carpeta de usuario');
    if (!(await confirm('Mover a la papelera:\n' + full))) return 'Cancelado por el usuario';
    await shell.trashItem(full); return 'Movido a la papelera';
  }
};

// Servicio de voz Python (JSON por líneas por stdin/stdout)
function voiceCall(cmd) {
  return new Promise((resolve, reject) => {
    if (!voice) {
      const py = process.env.PYTHON || (process.platform === 'win32' ? 'venv\\Scripts\\python.exe' : 'venv/bin/python');
      voice = spawn(py, [path.join(__dirname, '../voice_server.py')], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
      voice.on('error', (e) => { voice = null; for (const [id, f] of pending) f({ id, error: 'No se pudo iniciar el servicio de voz: ' + e.message }); pending.clear(); });
      voice.on('exit', () => { voice = null; for (const [id, f] of pending) f({ id, error: 'El servicio de voz se cerró' }); pending.clear(); });
      readline.createInterface({ input: voice.stdout }).on('line', (l) => { try { const m = JSON.parse(l); if (m.event) { win?.webContents.send(m.event === 'level' ? 'voice:level' : 'voice:event', m); return; } pending.get(m.id)?.(m); pending.delete(m.id); } catch {} });
    }
    const id = ++voiceId; pending.set(id, (m) => m.error ? reject(new Error(m.error)) : resolve(m));
    voice.stdin.write(JSON.stringify({ ...cmd, id }) + '\n');
  });
}

app.whenReady().then(() => {
  mem = require('./memoryService');
  createWindow();
  voiceCall({ cmd: 'warmup' }).catch(() => {}); // precarga Whisper para que el primer uso no tarde
  const w = new Worker(path.join(__dirname, 'workers/statsWorker.js'));
  w.on('message', (m) => win?.webContents.send('stats', m));
  // Icono de bandeja: modo segundo plano y modo conversación
  let tray = null;
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '../assets/jarvis.png')));
    tray.setToolTip('JARVIS');
    const showWin = () => { win.show(); win.focus(); };
    const toUI = (c) => win?.webContents.send('app:cmd', c);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir JARVIS (modo normal)', click: () => { toUI('convo-off'); showWin(); } },
      { label: 'Modo conversación (pantalla completa)', click: () => { showWin(); toUI('convo-on'); } },
      { label: 'Escuchar en segundo plano', click: () => { toUI('convo-on'); win.hide(); } },
      { label: 'Dejar de escuchar', click: () => toUI('convo-off') },
      { type: 'separator' },
      { label: 'Salir', click: () => app.quit() }
    ]));
    tray.on('click', () => tray.popUpContextMenu());
  } catch {}
  win.on('hide', () => w.postMessage('pause'));
  win.on('show', () => w.postMessage('resume'));
  ipcMain.on('app:convoState', (_e, on) => tray?.setToolTip(on ? 'JARVIS — escuchando' : 'JARVIS'));

  ipcMain.handle('ai:chat', async (_e, { id, messages }) => {
    const s = { ...mem.getSettings() }; const prov = providers[s.provider || process.env.AI_PROVIDER || 'ollama'] || providers.ollama;
    try { return { text: await prov.stream({ messages, settings: s, onChunk: (t) => win.webContents.send('ai:chunk', { id, text: t }) }) }; }
    catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('tool:run', async (_e, { name, args }) => {
    if (!Object.hasOwn(tools, name)) return { error: 'Herramienta desconocida' };
    try { return { result: await tools[name](args || {}) }; } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('settings:get', () => mem.getSettings());
  ipcMain.handle('settings:set', (_e, s) => { mem.setSettings(s); return true; });
  ipcMain.handle('mem:add', (_e, { role, content }) => { mem.add(role, content); return true; });
  ipcMain.handle('mem:clear', () => { mem.clear(); return true; });
  ipcMain.handle('mem:history', () => mem.history());
  ipcMain.handle('mem:search', (_e, q) => mem.search(String(q)));
  // Ajustes de voz guardados (velocidad, volumen, efecto Jarvis)
  const vopts = () => { const s = mem.getSettings(); return { speed: parseFloat(s.voiceSpeed) || 1, volume: parseFloat(s.voiceVolume) || 1, effect: s.voiceEffect === undefined ? 35 : (parseFloat(s.voiceEffect) || 0) }; };
  ipcMain.handle('voice:say', async (_e, text) => { try { return await voiceCall({ cmd: 'say', text: String(text).slice(0, 2000), ...vopts() }); } catch (e) { return { error: e.message }; } });
  ipcMain.handle('voice:stop', async () => { try { return await voiceCall({ cmd: 'stop' }); } catch (e) { return { error: e.message }; } });
  ipcMain.handle('item:add', (_e, { kind, text }) => { mem.addItem(String(kind), String(text).slice(0, 500)); return true; });
  ipcMain.handle('item:list', (_e, kind) => mem.listItems(String(kind)));
  ipcMain.handle('item:clear', (_e, kind) => { mem.clearItems(String(kind)); return true; });
  ipcMain.handle('voice:cancel', async () => { try { return await voiceCall({ cmd: 'cancel' }); } catch (e) { return { error: e.message }; } });
  // Aviso al movil (ntfy). Los envios automaticos (auto:true) se apagan con NTFY_AUTO=false en .env
  ipcMain.handle('notify:send', async (_e, p = {}) => {
    try {
      if (p.auto && process.env.NTFY_AUTO === 'false') return { skipped: true };
      await notify({ title: p.title, message: p.message, priority: p.priority, tags: p.tags });
      return { ok: true };
    } catch (e) { return { error: e.message }; }
  });
  // WhatsApp: prepara el mensaje (no lo envia)
  ipcMain.handle('whatsapp:send', async (_e, p = {}) => { try { return await sendWhatsApp(String(p.contact || ''), String(p.text || '')); } catch (e) { return { error: e.message }; } });
  // Modo Discord: activa/desactiva la captura del audio de salida (on:null = alternar)
  ipcMain.handle('voice:toggleLoopback', async (_e, on) => { try { return await voiceCall({ cmd: 'loopback', on: typeof on === 'boolean' ? on : null }); } catch (e) { return { error: e.message }; } });
  ipcMain.handle('app:open', (_e, id) => openApp(String(id)));
  ipcMain.handle('voice:listen', async () => { try { return await voiceCall({ cmd: 'listen' }); } catch (e) { return { error: e.message }; } });
  ipcMain.handle('voice:speak', async (_e, text) => { try { return await voiceCall({ cmd: 'speak', text: String(text).slice(0, 2000) }); } catch (e) { return { error: e.message }; } });
  ipcMain.on('win', (_e, a) => { if (a === 'close') app.quit(); if (a === 'hide') win.hide(); if (a === 'min') win.minimize(); if (a === 'max') win.isMaximized() ? win.unmaximize() : win.maximize(); if (a === 'float') { win.setSize(380, 560); win.setAlwaysOnTop(true); } if (a === 'full') { win.setAlwaysOnTop(false); win.setFullScreen(!win.isFullScreen()); } });
});
app.on('before-quit', () => voice?.kill());
app.on('window-all-closed', () => app.quit());
