// Vigilante del shell de Windows: un PowerShell persistente que SOLO LEE estado público (pantalla completa, "no molestar",
// ventana activa y ventanas abiertas) y emite una línea JSON cuando algo cambia. Si falla, el shell sigue funcionando sin él.
'use strict';
const path = require('path');
const IGNORE = new Set(['textinputhost', 'shellexperiencehost', 'searchhost', 'startmenuexperiencehost', 'lockapp']);

/** Convierte la línea cruda del script en el estado que usa Nova. */
function parseLine(line, selfPid = -1) {
  let j; try { j = JSON.parse(line); } catch { return null; }
  if (!j || j.t !== 'state') return null;
  const quns = Number(j.quns) || 0;
  const wins = (Array.isArray(j.w) ? j.w : []).filter((w) => w && w.pid !== selfPid && w.t && !IGNORE.has(String(w.n || '').toLowerCase()))
    .map((w) => ({ pid: w.pid, name: String(w.n || ''), title: String(w.t).slice(0, 120), path: w.p || null, minimized: !!w.m, active: w.pid === j.fg })).slice(0, 24);
  return { available: true, quns, fullscreen: [2, 3, 4].includes(quns) || j.cover === true, away: quns === 1, quiet: quns === 6, taskbarAutoHide: !!j.abh, fgPid: Number(j.fg) || 0, windows: wins };
}
const EMPTY = { available: false, quns: 0, fullscreen: false, away: false, quiet: false, taskbarAutoHide: false, fgPid: 0, windows: [] };

function createShellWatch({ spawn, scriptDir = path.join(__dirname, '..', 'ps'), platform = process.platform, selfPid = process.pid, log = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let proc = null, state = { ...EMPTY }, want = null, retries = 0, retryTimer = null, buf = '';
  const subs = new Set(); const emit = () => subs.forEach((f) => { try { f(state); } catch {} });
  function launch() {
    if (!want || proc || platform !== 'win32') return;
    try {
      proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(scriptDir, 'shellwatch.ps1'), '-IntervalMs', '1500', '-Windows', want.windows ? '1' : '0'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) { log('shellwatch: no arrancó', e.message); proc = null; return; }
    const me = proc; buf = '';
    me.stdout.on('data', (d) => { buf += d.toString('utf8'); let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); const s = l && parseLine(l, selfPid); if (s) { retries = 0; state = s; emit(); } } });
    me.on('error', () => {});
    me.on('exit', () => {
      if (proc !== me) return; proc = null; state = { ...EMPTY }; emit();
      if (want && retries < 3) { retries++; retryTimer = setTimer(launch, 2000 * retries); if (retryTimer && retryTimer.unref) retryTimer.unref(); } else log('shellwatch: desactivado (sin datos de pantalla completa)');
    });
  }
  return {
    /** Arranca (o reajusta) el vigilante. windows=true añade la lista de ventanas abiertas. */
    start(opts = {}) { const next = { windows: !!opts.windows }; if (want && proc && want.windows !== next.windows) this.stop(); want = next; launch(); },
    stop() { want = null; clearTimer(retryTimer); const p = proc; proc = null; if (p) { try { p.kill(); } catch {} } state = { ...EMPTY }; emit(); },
    state: () => state, onChange(f) { subs.add(f); return () => subs.delete(f); }, running: () => !!proc,
  };
}
module.exports = { createShellWatch, parseLine, EMPTY };
