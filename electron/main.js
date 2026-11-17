// Proceso principal: ventana, IPC, herramientas y servicios
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, desktopCapturer, screen } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const readline = require('readline');
const { spawn, execFile } = require('child_process');
const { Worker } = require('worker_threads');
require('dotenv').config();
// Conserva la ruta de memoria de las instalaciones con el nombre anterior del paquete.
app.setPath('userData', path.join(app.getPath('appData'), 'jarvis-clone'));
require('./notify.js').install(); // parche-notify

let win, mem, voice, voiceId = 0; const pending = new Map();
const DEV = process.env.ELECTRON_DEV === '1';
const providers = require('./providers/registry');
const { notify } = require('./notify');
const pcControl = require('./pcControl');
const mobileServer = require('./mobileServer');
try { require('electron').app.setAppUserModelId('Nova'); } catch {}
const { sendWhatsApp } = require('./whatsapp');
// Instancia única: abrir Nova otra vez (acceso directo, Jump List) envía la orden a la instancia en marcha
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
let quitting = false;
const shellActive = () => { try { return require('./desktop').isShellActive(); } catch { return false; } };
app.on('second-instance', (_e, argv) => { try { const { parseCommand } = require('./desktop/shell/cli'); const cmd = parseCommand(argv); if (cmd) require('./desktop').handleCommand(cmd); else if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } } catch {} });

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
  chrome: { label: 'el Navegador', start: 'Chrome', url: 'https://google.com' },
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

// --- Cierre de aplicaciones: mapa cerrado de ejecutables reales (seguridad contra inyección) ---
const KILL_MAP = {
  spotify: ['Spotify.exe'],
  discord: ['Discord.exe'],
  chrome: ['chrome.exe', 'msedge.exe'],
  minecraft: ['MinecraftLauncher.exe', 'javaw.exe', 'Minecraft.exe'],
  steam: ['steam.exe'],
  calculadora: ['CalculatorApp.exe', 'Calculator.exe'],
  bloc: ['notepad.exe'],
  onenote: ['ONENOTE.EXE', 'onenote.exe'],
  tareas: ['Taskmgr.exe'],
  explorador: ['explorer.exe'],
};

async function closeApp(id) {
  if (!Object.hasOwn(KILL_MAP, id)) {
    const a = LAUNCH[id];
    return { error: `No se puede cerrar ${a?.label || id} de forma directa, Señor` };
  }
  const exes = KILL_MAP[id];
  let killed = false;
  for (const exe of exes) {
    try {
      await new Promise((resolve) => {
        execFile('taskkill.exe', ['/IM', exe, '/F'], { windowsHide: true }, (err) => {
          if (!err) killed = true;
          resolve();
        });
      });
    } catch {}
  }
  const label = LAUNCH[id]?.label || id;
  return killed
    ? { ok: true, closed: true, label }
    : { ok: true, closed: false, label };
}

// --- Control multimedia y volumen (lista cerrada de constantes seguras) ---
const MEDIA_ACTIONS = new Set(['vol_up', 'vol_down', 'mute', 'unmute', 'play_pause', 'next', 'prev', 'stop']);
function mediaControl(action) {
  if (!MEDIA_ACTIONS.has(action)) return Promise.resolve({ error: 'Acción multimedia no permitida' });
  const scriptPath = path.join(__dirname, 'mediaControl.ps1');
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-action', action], { windowsHide: true, timeout: 10000 }, (err) => {
      if (err) return resolve({ error: 'No he podido controlar el audio' });
      resolve({ ok: true });
    });
  });
}

// --- Captura de pantalla en la carpeta de Imágenes ---
async function takeScreenshot() {
  const picturesDir = app.getPath('pictures') || path.join(os.homedir(), 'Pictures');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filePath = path.join(picturesDir, `NOVA_Captura_${ts}.png`);

  // Intento 1: desktopCapturer nativo de Electron
  try {
    const primary = screen.getPrimaryDisplay();
    const { width, height } = primary.size;
    const sf = primary.scaleFactor || 1;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(width * sf), height: Math.round(height * sf) }
    });
    if (sources.length > 0 && !sources[0].thumbnail.isEmpty()) {
      fs.writeFileSync(filePath, sources[0].thumbnail.toPNG());
      shell.showItemInFolder(filePath);
      return { ok: true, path: filePath, name: path.basename(filePath) };
    }
  } catch {}

  // Intento 2 (fallback): script PowerShell con System.Drawing
  const psCapture = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height; $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); $bmp.Save('${filePath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose();`;
  try {
    await runPS(psCapture);
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      shell.showItemInFolder(filePath);
      return { ok: true, path: filePath, name: path.basename(filePath) };
    }
  } catch {}

  return { error: 'No se pudo tomar la captura de pantalla' };
}

function createWindow(startHidden = false) {
  win = new BrowserWindow({ show: !startHidden, width: 1280, height: 800, frame: false, icon: path.join(__dirname, '../assets/nova.ico'), backgroundColor: '#00000000', transparent: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  DEV ? win.loadURL('http://localhost:5173') : win.loadFile(path.join(__dirname, '../dist/index.html'));
  // Con dock, barra o widgets activos, cerrar la ventana (Alt+F4 incluido) la oculta en lugar de destruirla: Nova sigue en segundo plano
  win.on('close', (e) => { if (!quitting && shellActive()) { e.preventDefault(); win.hide(); } });
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
function restartVoice() {
  if (voice) {
    try { voice.kill(); } catch {}
    voice = null;
  }
  for (const [id, f] of pending) f({ id, error: 'Servicio de voz reiniciado' });
  pending.clear();
}

function voiceCall(cmd) {
  return new Promise((resolve, reject) => {
    if (!voice) {
      const py = process.env.PYTHON || (process.platform === 'win32' ? 'venv\\Scripts\\python.exe' : 'venv/bin/python');
      voice = spawn(py, [path.join(__dirname, '../voice_server.py')], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
      voice.on('error', (e) => { voice = null; for (const [id, f] of pending) f({ id, error: 'No se pudo iniciar el servicio de voz: ' + e.message }); pending.clear(); });
      voice.on('exit', () => { voice = null; for (const [id, f] of pending) f({ id, error: 'El servicio de voz se cerró' }); pending.clear(); });
      readline.createInterface({ input: voice.stdout }).on('line', (l) => { try { const m = JSON.parse(l); if (m.event) { if (m.event === 'level') { for (const bw of BrowserWindow.getAllWindows()) { try { bw.webContents.send('voice:level', m); } catch {} } } else win?.webContents.send('voice:event', m); return; } pending.get(m.id)?.(m); pending.delete(m.id); } catch {} });
    }
    const id = ++voiceId; pending.set(id, (m) => m.error ? reject(new Error(m.error)) : resolve(m));
    try {
      voice.stdin.write(JSON.stringify({ ...cmd, id }) + '\n');
    } catch (e) {
      pending.delete(id);
      restartVoice();
      reject(new Error('Error de comunicación con el servicio de voz: ' + e.message));
    }
  });
}

app.whenReady().then(() => {
  if (!gotLock) return;
  mem = require('./memoryService');
  try { const s = mem.getSettings(); notify.configure({ topic: s.ntfyTopic ?? process.env.NTFY_TOPIC ?? '', server: s.ntfyServer ?? process.env.NTFY_SERVER ?? 'https://ntfy.sh', auto: s.ntfyAuto === undefined ? String(process.env.NTFY_AUTO).toLowerCase() !== 'false' : s.ntfyAuto === 'true' }); } catch {}
  let pre = { startHidden: false, cmd: null }; try { pre = require('./desktop').preflight({ mem, argv: process.argv }); } catch {}
  createWindow(pre.startHidden);
  try { mobileServer.start({ mem, providers, tools, pcControl, openApp, closeApp, mediaControl, takeScreenshot }); } catch (e) { console.error('Servidor movil:', e.message); }
  try { require('./integrations').register({ ipcMain, app, tools, confirm, execFile }); } catch (e) { console.error('integrations', e); } // nova-integrations
  try { require('./novaIpc').register({ ipcMain, app, shell, getWin: () => win, mem, voiceCall, screen, BrowserWindow, dialog }); } catch (e) { console.error('novaIpc', e); }
  try { require('./desktop').init({ ipcMain, app, shell, getWin: () => win, mem, pcControl, execFile, BrowserWindow, dialog, mediaControl }); } catch (e) { console.error('desktop', e); } // update 19 + Windows widgets
  if (pre.cmd) setTimeout(() => { try { require('./desktop').handleCommand(pre.cmd); } catch {} }, 2200);
  voiceCall({ cmd: 'warmup' }).catch(() => {}); // precarga Whisper para que el primer uso no tarde
  const w = new Worker(path.join(__dirname, 'workers/statsWorker.js'));
  w.on('message', (m) => { try { mobileServer.setStats(m); } catch {} try { require('./desktop').setStats(m); } catch {} if (win && !win.isDestroyed()) win.webContents.send('stats', m); });
  // Icono de bandeja: modo segundo plano y modo conversación
  let tray = null;
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '../assets/nova.png')));
    tray.setToolTip('NOVA');
    const showWin = () => { win.show(); win.focus(); };
    const toUI = (c) => win?.webContents.send('app:cmd', c);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir NOVA (modo normal)', click: () => { toUI('convo-off'); showWin(); } },
      { label: 'Modo conversación (pantalla completa)', click: () => { showWin(); toUI('convo-on'); } },
      { label: 'Escuchar en segundo plano', click: () => { toUI('convo-on'); win.hide(); } },
      { label: 'Dejar de escuchar', click: () => toUI('convo-off') },
      { type: 'separator' },
      { label: 'Widgets', click: () => require('./desktop').handleCommand('widgets') },
      { label: 'Dock de Nova', click: () => require('./desktop').handleCommand('dock') },
      { label: 'Modo calma (Ctrl+Alt+N)', click: () => require('./desktop').handleCommand('calm') },
      { type: 'separator' },
      { label: 'Salir', click: () => app.quit() }
    ]));
    tray.on('click', () => tray.popUpContextMenu());
  } catch {}
  // Las estadísticas solo se pausan si no hay ninguna superficie de Nova visible (ventana, dock, barra o widgets)
  const syncStats = () => w.postMessage((win && !win.isDestroyed() && win.isVisible()) || shellActive() ? 'resume' : 'pause');
  win.on('hide', syncStats); win.on('show', syncStats);
  try { require('./desktop').onShellChange(syncStats); } catch {}
  ipcMain.on('app:convoState', (_e, on) => tray?.setToolTip(on ? 'NOVA — escuchando' : 'NOVA'));

  // 'notify:send' lo registra notify.js (install) y emite los avisos al centro de avisos; el handler que había aquí se ignoraba.

ipcMain.handle('ai:chat', async (_e, { id, messages }) => {
    const s = { ...mem.getSettings() }; const prov = providers[s.provider || process.env.AI_PROVIDER || 'ollama'] || providers.ollama;
    const cm = require('./desktop/cloudModel'); const ov = cm.override(s);
    try {
      if (!ov.active) return { text: await prov.stream({ messages, settings: s, onChunk: (t) => win.webContents.send('ai:chunk', { id, text: t }) }) };
      // Modelo en la nube (Inkling 2 Small), solo si el usuario lo activó. Si falla antes de empezar a responder, vuelve al modelo local.
      let got = false; const restoreEnv = cm.withEnv(ov.model);
      try { return { text: await prov.stream({ messages, settings: ov.settings, onChunk: (t) => { got = true; win.webContents.send('ai:chunk', { id, text: t }); } }) }; }
      catch (e) {
        if (got) throw e;
        try { require('./desktop/shell/noticeBus').push({ title: 'Modelo en la nube no disponible', message: 'Nova usó el modelo local. Motivo: ' + String(e.message || e).slice(0, 120), level: 'warn', source: 'modelo' }); } catch {}
        return { text: await prov.stream({ messages, settings: s, onChunk: (t) => win.webContents.send('ai:chunk', { id, text: t }) }) };
      } finally { restoreEnv(); }
    }
    catch (e) { return { error: e.message }; }
  });

ipcMain.handle('tool:run', async (_e, { name, args }) => {
    if (!Object.hasOwn(tools, name)) return { error: 'Herramienta desconocida' };
    try { return { result: await tools[name](args || {}) }; } catch (e) { return { error: e.message }; }
  });

const personaFile = () => path.join(app.getPath('userData'), 'nova-personalizacion.txt');
function readPersonaFile() {
  const file = personaFile();
  if (!fs.existsSync(file)) fs.writeFileSync(file, '# Personalización de Nova\n# Escribe aquí preferencias de idioma, tono y forma de responder.\n# No incluyas contraseñas, claves API ni instrucciones para desactivar permisos.\n', 'utf8');
  return fs.readFileSync(file, 'utf8').slice(0, 4000);
}
ipcMain.handle('settings:get', () => {
  const s = mem.getSettings();
  s.personaText = readPersonaFile();
  if (s.ntfyTopic === undefined) s.ntfyTopic = process.env.NTFY_TOPIC || '';
  if (s.ntfyServer === undefined) s.ntfyServer = process.env.NTFY_SERVER || 'https://ntfy.sh';
  if (s.ntfyAuto === undefined) s.ntfyAuto = String(process.env.NTFY_AUTO).toLowerCase() !== 'false' ? 'true' : 'false';
  return s;
});

ipcMain.handle('settings:set', (_e, s = {}) => {
  const values = { ...s };
  if (Object.hasOwn(values, 'personaText')) {
    fs.writeFileSync(personaFile(), String(values.personaText || '').slice(0, 4000), 'utf8');
    delete values.personaText;
  }
  mem.setSettings(values);
  if (Object.hasOwn(s, 'ntfyTopic') || Object.hasOwn(s, 'ntfyServer') || Object.hasOwn(s, 'ntfyAuto')) notify.configure({ topic: s.ntfyTopic ?? mem.getSettings().ntfyTopic ?? process.env.NTFY_TOPIC ?? '', server: s.ntfyServer ?? mem.getSettings().ntfyServer ?? process.env.NTFY_SERVER ?? 'https://ntfy.sh', auto: (s.ntfyAuto ?? mem.getSettings().ntfyAuto ?? (String(process.env.NTFY_AUTO).toLowerCase() !== 'false' ? 'true' : 'false')) === 'true' });
  return true;
});

ipcMain.handle('mem:add', (_e, { role, content }) => { mem.add(role, content); return true; });

ipcMain.handle('mem:clear', () => { mem.clear(); return true; });

ipcMain.handle('mem:history', () => mem.history());

ipcMain.handle('mem:search', (_e, q) => mem.search(String(q)));
  // Ajustes de voz guardados (velocidad, volumen, efecto Jarvis)
  const vopts = () => { const s = mem.getSettings(); return { speed: parseFloat(s.voiceSpeed) || 1, volume: parseFloat(s.voiceVolume) || 1, effect: s.voiceEffect === undefined ? 35 : (parseFloat(s.voiceEffect) || 0), voice: s.voiceModel ? String(s.voiceModel) : undefined }; };

ipcMain.handle('voice:say', async (_e, text) => { try { return await voiceCall({ cmd: 'say', text: String(text).slice(0, 2000), ...vopts() }); } catch (e) { return { error: e.message }; } });

ipcMain.handle('voice:stop', async () => { try { return await voiceCall({ cmd: 'stop' }); } catch (e) { return { error: e.message }; } });

ipcMain.handle('item:add', (_e, { kind, text }) => { mem.addItem(String(kind), String(text).slice(0, 500)); return true; });

ipcMain.handle('item:list', (_e, kind) => mem.listItems(String(kind)));

ipcMain.handle('item:clear', (_e, kind) => { mem.clearItems(String(kind)); return true; });

ipcMain.handle('voice:cancel', async () => { try { return await voiceCall({ cmd: 'cancel' }); } catch (e) { return { error: e.message }; } });

// WhatsApp: prepara el mensaje (no lo envia)
  ipcMain.handle('whatsapp:send', async (_e, p = {}) => { try { return await sendWhatsApp(String(p.contact || ''), String(p.text || '')); } catch (e) { return { error: e.message }; } });
  // Modo Discord: activa/desactiva la captura del audio de salida (on:null = alternar)
  ipcMain.handle('voice:toggleLoopback', async (_e, on) => { try { return await voiceCall({ cmd: 'loopback', on: typeof on === 'boolean' ? on : null }); } catch (e) { return { error: e.message }; } });
  // Control del PC (acciones de lista cerrada, rutas validadas y permiso nativo). Se apaga con PC_CONTROL=off en .env
  ipcMain.handle('pc:run', async (_e, p = {}) => { try { return await pcControl.run(String(p.action || ''), p.args || {}); } catch (e) { return { error: e.message }; } });
  ipcMain.handle('mobile:info', () => { try { return mobileServer.info(); } catch (e) { return { enabled: false, error: e.message }; } });
  ipcMain.handle('mobile:https', async () => { try { return await mobileServer.enableHttps(); } catch (e) { return { error: e.message }; } });
  ipcMain.handle('app:open', (_e, id) => openApp(String(id)));

ipcMain.handle('app:close', (_e, id) => closeApp(String(id)));

ipcMain.handle('system:media', (_e, action) => mediaControl(String(action)));

ipcMain.handle('system:screenshot', () => takeScreenshot());

ipcMain.handle('voice:listen', async () => { try { return await voiceCall({ cmd: 'listen' }); } catch (e) { return { error: e.message }; } });

ipcMain.handle('voice:speak', async (_e, text) => { try { return await voiceCall({ cmd: 'speak', text: String(text).slice(0, 2000) }); } catch (e) { return { error: e.message }; } });

ipcMain.handle('voice:reset', async () => { restartVoice(); return { ok: true }; });
  ipcMain.on('win', (_e, a) => { if (a === 'close') { if (shellActive()) win.hide(); else app.quit(); } if (a === 'hide') win.hide(); if (a === 'min') win.minimize(); if (a === 'max') win.isMaximized() ? win.unmaximize() : win.maximize(); if (a === 'free') { try { require('./island').stop(); } catch {} win.setFullScreen(false); if (win.isMaximized()) win.unmaximize(); win.setAlwaysOnTop(false); win.setResizable(true); win.setSize(980, 700); win.center(); win.show(); win.focus(); win.setOpacity(1); } if (a === 'float') { win.setSize(380, 560); win.setAlwaysOnTop(true); } if (a === 'full') { win.setAlwaysOnTop(false); win.setFullScreen(!win.isFullScreen()); } });
});
app.on('before-quit', () => { quitting = true; try { require('./desktop').dispose(); } catch {} voice?.kill(); try { mobileServer.stop(); } catch {} try { require('./discordPresence').stop(); } catch {} });
app.on('window-all-closed', () => app.quit());


