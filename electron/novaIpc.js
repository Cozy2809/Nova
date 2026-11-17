// Funciones internas de Nova (updates 16+): biblioteca, voces, modelos de Ollama, diagnóstico de rendimiento, inicio con Windows y carpetas.
// El renderer las llama con window.jarvis.nova('canal', datos) y escucha eventos con window.jarvis.onNova('canal', cb).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const lib = require('./library');
const island = require('./island');

const ROOT = path.join(__dirname, '..');
const VOICES = path.join(ROOT, 'voices');
const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';
const CATALOG = [
  { id: 'es_MX-claude-high', label: 'Claude · México · femenina · alta calidad', dir: 'es/es_MX/claude/high' },
  { id: 'es_AR-daniela-high', label: 'Daniela · Argentina · femenina · alta calidad', dir: 'es/es_AR/daniela/high' },
  { id: 'es_ES-davefx-medium', label: 'Davefx · España · masculina', dir: 'es/es_ES/davefx/medium' },
  { id: 'es_MX-ald-medium', label: 'Ald · México · masculina', dir: 'es/es_MX/ald/medium' },
  { id: 'es_ES-carlfm-x_low', label: 'Carlfm · España · masculina · ligera', dir: 'es/es_ES/carlfm/x_low' }
];

function register({ ipcMain, app, shell, getWin, mem, voiceCall, screen, BrowserWindow, dialog }) {
  const h = (name, fn) => ipcMain.handle('nova:' + name, async (_e, d) => { try { return await fn(d || {}); } catch (e) { return { error: e.message || String(e) }; } });
  const emit = (ch, data) => { try { getWin()?.webContents.send('nova:' + ch, data); } catch {} };
  const base = () => String(mem.getSettings().ollamaUrl || process.env.OLLAMA_API_URL || 'http://localhost:11434').replace(/\/+$/, '');

  // Guía de perfil local: usa recursos instalados, no activa telemetría ni descarga modelos por sí sola.
  h('setup:hardware', () => {
    const ramGB = Math.round((os.totalmem() / 1073741824) * 10) / 10; const cores = os.cpus().length;
    const recommended = ramGB >= 24 && cores >= 12 ? 'premium' : ramGB >= 12 && cores >= 8 ? 'standard' : 'lite';
    return { ramGB, cores, cpu: (os.cpus()[0] || {}).model || 'Desconocido', recommended };
  });
  h('persona:open', async () => {
    const file = path.join(app.getPath('userData'), 'nova-personalizacion.txt');
    if (!fs.existsSync(file)) fs.writeFileSync(file, '# Personalización de Nova\n# Escribe aquí preferencias de idioma, tono y forma de responder.\n# No incluyas contraseñas, claves API ni instrucciones para desactivar permisos.\n', 'utf8');
    const error = await shell.openPath(file); return error ? { error } : { ok: true };
  });

  // --- Biblioteca ---
  lib.ensureDir(); setTimeout(() => lib.refresh().catch(() => {}), 4000);
  h('lib:info', () => lib.info());
  h('lib:search', (d) => lib.search(String(d.q || '').slice(0, 300), Math.min(5, parseInt(d.k, 10) || 3)));
  h('lib:read', (d) => lib.read(String(d.q || '').slice(0, 200)));
  h('lib:open', () => lib.openDir());
  h('lib:refresh', async () => { await lib.refresh(); return lib.info(); });

  // --- Voces de Piper ---
  const installed = () => { try { return fs.readdirSync(VOICES).filter((f) => f.endsWith('.onnx')).sort(); } catch { return []; } };
  h('voice:list', () => {
    const have = installed();
    return { installed: have.map((f) => ({ file: 'voices/' + f, label: f.replace(/\.onnx$/, '').replace(/-/g, ' · ') })), current: String(mem.getSettings().voiceModel || process.env.PIPER_MODEL || '').replace(/\\/g, '/'),
      catalog: CATALOG.map((c) => ({ id: c.id, label: c.label, installed: have.includes(c.id + '.onnx') })) };
  });
  h('voice:download', async (d) => {
    const c = CATALOG.find((x) => x.id === d.id); if (!c) return { error: 'Voz desconocida' };
    fs.mkdirSync(VOICES, { recursive: true });
    for (const ext of ['.onnx.json', '.onnx']) {
      const res = await fetch(HF + c.dir + '/' + c.id + ext, { redirect: 'follow' });
      if (!res.ok) return { error: `No se pudo descargar (${res.status}). Prueba más tarde.` };
      const total = parseInt(res.headers.get('content-length'), 10) || 0, tmp = path.join(VOICES, c.id + ext + '.part'), out = fs.createWriteStream(tmp); let got = 0;
      for await (const chunk of res.body) { out.write(chunk); got += chunk.length; if (total && ext === '.onnx') emit('voice-dl', { id: c.id, pct: Math.round((got / total) * 100) }); }
      await new Promise((r) => out.end(r)); fs.renameSync(tmp, path.join(VOICES, c.id + ext));
    }
    emit('voice-dl', { id: c.id, pct: 100, done: true });
    return { ok: true, file: 'voices/' + c.id + '.onnx' };
  });

  // --- Modelos de Ollama ---
  h('ollama:models', async () => {
    const r = await fetch(base() + '/api/tags', { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!r || !r.ok) return { error: 'No puedo hablar con Ollama (¿está abierto?)' };
    return { models: ((await r.json()).models || []).map((m) => ({ name: m.name, gb: Math.round((m.size / 1e9) * 10) / 10 })) };
  });
  h('ollama:pull', async (d) => {
    const name = String(d.name || ''); if (!/^[a-zA-Z0-9._:/-]{2,60}$/.test(name)) return { error: 'Nombre de modelo no válido' };
    const r = await fetch(base() + '/api/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, stream: true }) }).catch(() => null);
    if (!r || !r.ok) return { error: 'Ollama no respondió. ¿Está abierto?' };
    let buf = '', last = '';
    for await (const part of r.body) {
      buf += Buffer.from(part).toString('utf8'); const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) { if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; } if (m.error) return { error: m.error }; last = m.status || last; emit('pull', { name, status: m.status, pct: m.total ? Math.round((m.completed / m.total) * 100) : null }); }
    }
    emit('pull', { name, done: true, status: last }); return { ok: true };
  });

  // --- Diagnóstico: qué procesos gastan CPU y RAM ---
  h('perf:top', () => new Promise((resolve) => {
    const ps = "Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.Name -ne '_Total' -and $_.Name -ne 'Idle' } | Select-Object Name,PercentProcessorTime,WorkingSetPrivate | ConvertTo-Json -Compress";
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024 }, (err, so) => {
      if (err) return resolve({ error: 'No pude leer los procesos' });
      let rows; try { rows = JSON.parse(so); } catch { return resolve({ error: 'Respuesta no válida' }); } if (!Array.isArray(rows)) rows = [rows];
      const agg = {}, n = os.cpus().length;
      for (const r of rows) { const k = String(r.Name).replace(/#\d+$/, ''); (agg[k] = agg[k] || { cpu: 0, ram: 0 }); agg[k].cpu += Number(r.PercentProcessorTime) || 0; agg[k].ram += Number(r.WorkingSetPrivate) || 0; }
      const list = Object.entries(agg).map(([name, v]) => ({ name: name === 'electron' ? 'Nova (Electron)' : name, cpu: Math.round(v.cpu / n), mb: Math.round(v.ram / 1048576) }));
      resolve({ cpu: [...list].sort((a, b) => b.cpu - a.cpu).slice(0, 6), ram: [...list].sort((a, b) => b.mb - a.mb).slice(0, 6) });
    });
  }));

  // --- Inicio con Windows y carpetas ---
  const loginOpts = () => ({ path: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(ROOT, 'launch.ps1')] });
  h('login:get', () => ({ on: !!app.getLoginItemSettings(loginOpts()).openAtLogin }));
  h('login:set', (d) => { app.setLoginItemSettings({ openAtLogin: !!d.on, ...loginOpts() }); return { on: !!d.on }; });
  h('path:open', async (d) => {
    const map = { data: () => app.getPath('userData'), library: () => lib.ensureDir(), voices: () => VOICES, project: () => ROOT, photos: () => path.join(app.getPath('pictures'), 'Nova') };
    if (!map[d.kind]) return { error: 'Carpeta desconocida' }; const p = map[d.kind](); fs.mkdirSync(p, { recursive: true });
    const r = await shell.openPath(p); return r ? { error: r } : { ok: true };
  });
  // --- Isla emergente ---
  island.init({ BrowserWindow, screen, ipcMain, getWin, mem });
  h('island:toggle', () => { if (island.active()) island.stop(); else island.start(); return { on: island.active() }; });
  h('island:get', () => ({ on: island.active() }));
  h('island:state', (d) => { island.setState({ st: String(d.st || 'idle'), music: d.music ? String(d.music).slice(0, 80) : '' }); return { ok: true }; });
  if (mem.getSettings().islandMode === 'true') setTimeout(() => { try { island.start(); } catch {} }, 2500);

  // --- Modo música: el servicio de voz escucha el audio del PC; aquí se averigua qué suena (título de Spotify / pestaña de YouTube) ---
  const ps = (script, timeout = 8000) => new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (err, so) => res(err ? '' : String(so).trim())));
  h('music:set', (d) => voiceCall({ cmd: 'music', on: !!d.on }));
  h('music:now', async () => {
    const out = await ps("$o=@(); foreach($n in 'Spotify','chrome','msedge','firefox'){ Get-Process -Name $n -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | ForEach-Object { $o += ($n + '|' + $_.MainWindowTitle) } }; $o | ConvertTo-Json -Compress");
    let rows = []; try { const j = JSON.parse(out || '[]'); rows = Array.isArray(j) ? j : [j]; } catch {}
    for (const r of rows) { const [proc, ...rest] = String(r).split('|'), title = rest.join('|').trim(); if (proc === 'Spotify' && / - /.test(title) && !/^Spotify( (Free|Premium))?$/i.test(title)) return { source: 'Spotify', label: title.slice(0, 90) }; }
    for (const r of rows) { const m = String(r).split('|').slice(1).join('|').match(/^(.+?) - YouTube(?: Music)?(?: - .+)?$/); if (m && m[1].trim()) return { source: 'YouTube', label: 'YouTube · ' + m[1].trim().slice(0, 80) }; }
    return { source: '', label: '' };
  });

  // --- Cámara (siempre pide permiso) ---
  const thumb = (p) => { try { return require('electron').nativeImage.createFromPath(p).resize({ width: 320 }).toDataURL(); } catch { return ''; } };
  h('camera:ask', async (d) => {
    const r = await dialog.showMessageBox(getWin(), { type: 'question', title: 'Nova pide permiso', message: d.shot === false ? 'Abrir la aplicación Cámara de Windows' : 'Usar la cámara para hacer una foto', detail: d.shot === false ? '' : 'La foto se guardará en la carpeta Imágenes (Camera Roll o Nova).', buttons: ['Denegar', 'Permitir'], defaultId: 0, cancelId: 0, noLink: true });
    return r.response === 1 ? { ok: true } : { denied: true };
  });
  h('camera:app', (d) => new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA', '-File', path.join(__dirname, 'cameraShot.ps1'), '-Shot', d.shot === false ? '0' : '1'], { windowsHide: true, timeout: 45000, encoding: 'utf8' }, (err, so) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 9) : 0;
      if (code === 0) { if (d.shot === false) return resolve({ ok: true }); const p = String(so).trim().split(/\r?\n/).pop(); return p && fs.existsSync(p) ? resolve({ ok: true, path: p, thumb: thumb(p), via: 'app' }) : resolve({ error: 'La cámara no guardó ninguna foto' }); }
      resolve({ error: { 2: 'La app Cámara no se abrió', 3: 'Se perdió el foco de la app Cámara', 4: 'No encontré la foto nueva' }[code] || 'Error con la app Cámara' });
    });
  }));
  h('camera:save', (d) => {
    const buf = Buffer.from(String(d.b64 || ''), 'base64'); if (buf.length < 2000 || buf.length > 20 * 1024 * 1024) return { error: 'Imagen no válida' };
    const dir = path.join(app.getPath('pictures'), 'Nova'); fs.mkdirSync(dir, { recursive: true });
    const s = new Date(), z = (n) => String(n).padStart(2, '0'), file = path.join(dir, `foto-${s.getFullYear()}${z(s.getMonth() + 1)}${z(s.getDate())}-${z(s.getHours())}${z(s.getMinutes())}${z(s.getSeconds())}.jpg`);
    fs.writeFileSync(file, buf); return { ok: true, path: file, thumb: thumb(file), via: 'interna' };
  });
  h('file:open', async (d) => { const p = String(d.path || ''); const ok = ['.jpg', '.jpeg', '.png'].includes(path.extname(p).toLowerCase()) && fs.existsSync(p); if (!ok) return { error: 'No existe' }; if (d.reveal) { shell.showItemInFolder(p); return { ok: true }; } const r = await shell.openPath(p); return r ? { error: r } : { ok: true }; });

  // --- Abrir cualquier app por nombre aproximado (lista del menú Inicio) ---
  let appCache = { t: 0, list: [] };
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const SYN = { camara: 'camera', calculadora: 'calculator', 'bloc de notas': 'notepad', reloj: 'clock', alarmas: 'clock', configuracion: 'settings', ajustes: 'settings', correo: 'mail', calendario: 'calendar', fotos: 'photos', mapas: 'maps', grabadora: 'sound recorder', recortes: 'snipping tool', 'herramienta de recortes': 'snipping tool', tienda: 'microsoft store', musica: 'media player', videos: 'media player', explorador: 'file explorer', clima: 'weather', 'el tiempo': 'weather', notas: 'sticky notes', 'notas adhesivas': 'sticky notes', pintura: 'paint', terminal: 'terminal', vscode: 'visual studio code', 'visual code': 'visual studio code', code: 'visual studio code', obs: 'obs studio', edge: 'microsoft edge', whatsapp: 'whatsapp', 'word': 'word', excel: 'excel', powerpoint: 'powerpoint', 'panel de control': 'control panel', 'administrador de tareas': 'task manager' };
  const lev = (a, b) => { const m = a.length, n = b.length; if (!m || !n) return Math.max(m, n); let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; };
  const score = (q, name) => {
    const n = norm(name); if (!n) return 0; let best = 0;
    for (const v of new Set([q, SYN[q]].filter(Boolean))) {
      if (n === v) best = Math.max(best, 1); else if (n.startsWith(v) || v.startsWith(n)) best = Math.max(best, 0.95);
      const qt = v.split(' '), nt = n.split(' '); if (qt.every((t) => nt.some((x) => x === t || x.startsWith(t)))) best = Math.max(best, 0.9 - Math.min(0.2, (nt.length - qt.length) * 0.03));
      best = Math.max(best, (1 - lev(v, n) / Math.max(v.length, n.length)) * 0.85);
    } return best;
  };
  async function startApps() {
    if (Date.now() - appCache.t < 10 * 60 * 1000 && appCache.list.length) return appCache.list;
    const out = await ps('Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress', 20000); let l = []; try { const j = JSON.parse(out || '[]'); l = Array.isArray(j) ? j : [j]; } catch {}
    appCache = { t: Date.now(), list: l.filter((x) => x && x.Name && x.AppID) }; return appCache.list;
  }
  h('app:find', async (d) => {
    const q = norm(String(d.q || '').replace(/^(?:la |el |mi |una? )?(?:aplicacion |app |programa )?(?:de |del )?/i, '')); if (!q) return { error: 'Nombre vacío' };
    const list = await startApps(); if (!list.length) return { error: 'No pude leer las aplicaciones instaladas' };
    return { matches: list.map((a) => ({ name: a.Name, appId: a.AppID, score: Math.round(score(q, a.Name) * 100) / 100 })).filter((m) => m.score >= 0.6).sort((a, b) => b.score - a.score).slice(0, 3) };
  });
  h('app:launch', async (d) => {
    const a = (await startApps()).find((x) => x.AppID === d.appId); if (!a) return { error: 'Aplicación no encontrada' };
    if (!d.sure) { const r = await dialog.showMessageBox(getWin(), { type: 'question', title: 'Nova pide permiso', message: `¿Abrir «${a.Name}»?`, buttons: ['Cancelar', 'Abrir'], defaultId: 1, cancelId: 0, noLink: true }); if (r.response !== 1) return { denied: true }; }
    execFile('explorer.exe', ['shell:AppsFolder\\' + a.AppID], { windowsHide: true }, () => {}); return { ok: true, name: a.Name };
  });
}
module.exports = { register };
