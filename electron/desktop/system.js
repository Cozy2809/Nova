// Servicios de sistema de Nova Desktop (solo lectura salvo volumen, multimedia y traer una ventana al frente).
// Todo lo que llama a PowerShell usa scripts FIJOS con parámetros separados: nunca se arma un comando con texto libre.
'use strict';
const path = require('path');
const fs = require('fs');
const { AgentError, ERR } = require('../agent/contract');
const { createMediaCache } = require('./mediaCache');

function createSystem({ execFile, platform = process.platform, scriptsDir = path.join(__dirname, 'ps'), getStats = () => null, os = require('os'), selfPid = process.pid, shell = null, recentDir = null, guardSafe = null }) {
  const isWin = platform === 'win32';
  const needWin = () => { if (!isWin) throw new AgentError(ERR.UNAVAILABLE, 'Esta función solo está disponible en Windows'); };
  const PS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'];

  const run = (args, timeout) => new Promise((resolve, reject) => {
    execFile('powershell.exe', [...PS, ...args], { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, so, se) => {
      if (err) { const msg = String(se || err.message || '').split(/\r?\n/).find((l) => l.trim()) || 'PowerShell no respondió'; return reject(new AgentError(err.killed ? ERR.TIMEOUT : ERR.UNAVAILABLE, msg.slice(0, 240))); }
      resolve(String(so || '').trim());
    });
  });
  const json = (txt) => { try { return JSON.parse(txt); } catch { throw new AgentError(ERR.EXEC, 'Respuesta no válida del sistema'); } };
  const script = (name, args = [], timeout = 15000) => { needWin(); return run(['-File', path.join(scriptsDir, name), ...args], timeout).then(json); };
  const command = (cmd, timeout = 20000) => { needWin(); return run(['-Command', cmd], timeout); };

  // ---- Ventanas abiertas ----
  const windows = async () => { const rows = await script('windows.ps1', ['-Action', 'list']); return (Array.isArray(rows) ? rows : [rows]).filter((w) => w && w.pid !== selfPid && w.title).map((w) => ({ pid: w.pid, name: w.name, title: String(w.title).slice(0, 120), path: w.path || null, minimized: !!w.minimized, active: !!w.active })); };
  const focusWindow = (pid) => script('windows.ps1', ['-Action', 'focus', '-ProcessId', String(Math.trunc(pid))]);
  // Gestión de ventanas de otras aplicaciones (lista cerrada de acciones; el proceso debe tener ventana)
  const WINDOW_ACTIONS = new Set(['focus', 'minimize', 'maximize', 'restore', 'close']);
  const windowAction = (pid, action) => { if (!WINDOW_ACTIONS.has(action)) throw new AgentError(ERR.VALIDATION, 'Acción de ventana no permitida'); const n = Math.trunc(Number(pid)); if (!(n > 0)) throw new AgentError(ERR.VALIDATION, 'Proceso no válido'); return script('windows.ps1', ['-Action', action, '-ProcessId', String(n)]); };
  // Acciones del shell de Windows (Inicio, búsqueda, vista de tareas, escritorio…) con atajos públicos del sistema
  const SHELL_ACTIONS = new Set(['start', 'search', 'taskview', 'quicksettings', 'notifications', 'desktop']);
  const shellAction = (action) => { if (!SHELL_ACTIONS.has(action)) throw new AgentError(ERR.VALIDATION, 'Acción del shell no permitida'); return script('shell.ps1', ['-Action', action]); };

  // ---- Multimedia (sesiones de Windows) y volumen real ----
  // Una sola consulta compartida (4 s de vida): varios paneles o ventanas no lanzan PowerShell por separado
  const mediaCache = createMediaCache({ read: () => script('media.ps1', ['-Action', 'status'], 12000), ttl: 4000 });
  const mediaStatus = (opts) => mediaCache.get(opts);
  const mediaControl = async (action, session = '') => { try { return await script('media.ps1', ['-Action', action, ...(session ? ['-Session', session] : [])], 12000); } finally { mediaCache.invalidate(); } };
  const volume = {
    get: () => script('volume.ps1', ['-Action', 'get'], 10000),
    set: (level) => script('volume.ps1', ['-Action', 'set', '-Level', String(Math.round(level))], 10000),
    mute: (muted) => script('volume.ps1', ['-Action', 'mute', '-Muted', muted ? '1' : '0'], 10000),
  };

  // ---- Búsqueda con el índice de Windows ----
  const indexSearch = ({ query, scopes, mode = 'name', limit = 40 }) => script('search.ps1', ['-Query', query, '-Scopes', scopes.join('|'), '-Mode', mode, '-Limit', String(limit)], 12000);

  // ---- Aplicaciones del menú Inicio ----
  let appCache = { t: 0, list: [] };
  async function startApps(force = false) {
    if (!force && Date.now() - appCache.t < 10 * 60 * 1000 && appCache.list.length) return appCache.list;
    const out = await command('Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress', 25000);
    let l = []; try { const j = JSON.parse(out || '[]'); l = Array.isArray(j) ? j : [j]; } catch { throw new AgentError(ERR.EXEC, 'No pude leer las aplicaciones instaladas'); }
    appCache = { t: Date.now(), list: l.filter((x) => x && x.Name && x.AppID).map((x) => ({ name: String(x.Name), appId: String(x.AppID) })).sort((a, b) => a.name.localeCompare(b.name, 'es')) };
    return appCache.list;
  }
  async function launchApp(appId) {
    const a = (await startApps()).find((x) => x.appId === appId);
    if (!a) throw new AgentError(ERR.VALIDATION, 'Aplicación no encontrada entre las instaladas');
    await new Promise((res) => execFile('explorer.exe', ['shell:AppsFolder\\' + a.appId], { windowsHide: true }, () => res()));
    return { name: a.name };
  }

  // ---- Documentos recientes (accesos de Windows → destino real, solo si existe y es accesible) ----
  function recents(limit = 20) {
    needWin();
    const dir = recentDir || path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Recent');
    let names = []; try { names = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.lnk')); } catch { throw new AgentError(ERR.UNAVAILABLE, 'No puedo leer la carpeta de documentos recientes'); }
    const rows = [];
    for (const f of names) {
      const full = path.join(dir, f); let mtime = 0; try { mtime = fs.statSync(full).mtimeMs; } catch { continue; }
      rows.push({ f: full, mtime });
    }
    rows.sort((a, b) => b.mtime - a.mtime);
    const out = [];
    for (const r of rows) {
      if (out.length >= limit) break;
      let target = ''; try { target = shell.readShortcutLink(r.f).target || ''; } catch { continue; }
      if (!target || !fs.existsSync(target)) continue;
      if (guardSafe) { try { guardSafe(target); } catch { continue; } }
      let isDir = false; try { isDir = fs.statSync(target).isDirectory(); } catch {}
      out.push({ name: path.basename(target), path: target, isDir, mtime: r.mtime });
    }
    return out;
  }

  // ---- Métricas y red (datos reales del worker; lo que no existe va como null) ----
  function metrics() {
    const s = getStats();
    return {
      available: !!s, ts: Date.now(),
      cpu: s ? s.cpu : null, ram: s ? s.ram : null, disk: s ? s.disk : null,
      gpu: s && Number.isFinite(s.gpu) ? s.gpu : null, gpuTemp: s && Number.isFinite(s.temp) ? s.temp : null, gpuName: s && s.gpuName ? s.gpuName : null,
      rx: s ? s.rx : null, tx: s ? s.tx : null,
      totalMemGB: Math.round((os.totalmem() / 1073741824) * 10) / 10, cores: os.cpus().length, cpuModel: (os.cpus()[0] || {}).model || null, uptimeSec: Math.round(os.uptime()),
    };
  }
  function network() {
    const interfaces = [];
    for (const [name, list] of Object.entries(os.networkInterfaces())) for (const a of list || []) if ((a.family === 'IPv4' || a.family === 4) && !a.internal) interfaces.push({ name, address: a.address });
    const s = getStats();
    return { interfaces, rx: s ? s.rx : null, tx: s ? s.tx : null };
  }
  async function processes() {
    const ps = "Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.Name -ne '_Total' -and $_.Name -ne 'Idle' } | Select-Object Name,PercentProcessorTime,WorkingSetPrivate | ConvertTo-Json -Compress";
    const rows0 = json(await command(ps, 25000)); const rows = Array.isArray(rows0) ? rows0 : [rows0];
    const agg = {}, n = os.cpus().length;
    for (const r of rows) { const k = String(r.Name).replace(/#\d+$/, ''); (agg[k] = agg[k] || { cpu: 0, ram: 0 }); agg[k].cpu += Number(r.PercentProcessorTime) || 0; agg[k].ram += Number(r.WorkingSetPrivate) || 0; }
    const list = Object.entries(agg).map(([name, v]) => ({ name: name === 'electron' ? 'Nova (Electron)' : name, cpu: Math.round(v.cpu / n), mb: Math.round(v.ram / 1048576) }));
    return { cpu: [...list].sort((a, b) => b.cpu - a.cpu).slice(0, 8), ram: [...list].sort((a, b) => b.mb - a.mb).slice(0, 8) };
  }

  return { windows, focusWindow, windowAction, shellAction, mediaStatus, mediaControl, volume, indexSearch, startApps, launchApp, recents, metrics, network, processes, isWin };
}
module.exports = { createSystem };
