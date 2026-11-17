// Escritura "en directo" en el Bloc de notas (solo Windows). Pega el texto por trozos de unas 4 palabras para que se vea escribir,
// y lo guarda en 'file'. Si algo falla devuelve { ok:false, reason } y el llamador guarda el archivo directamente.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function chunks(text, words = 4) {
  const parts = String(text).replace(/\r\n/g, '\n').split(/(\s+)/); const out = []; let cur = '', n = 0;
  for (const p of parts) { cur += p; if (p && !/^\s+$/.test(p)) n++; if (n >= words || /\n/.test(p)) { out.push(cur); cur = ''; n = 0; } }
  if (cur) out.push(cur);
  return out.map((c) => c.replace(/\n/g, '\r\n'));
}

function typeLive(file, text, delay = 70) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ ok: false, reason: 'E9' });
    const tmp = path.join(os.tmpdir(), `nova-type-${Date.now()}.json`);
    try { fs.writeFileSync(tmp, '\uFEFF' + JSON.stringify(chunks(text)), 'utf8'); } catch { return resolve({ ok: false, reason: 'E9' }); }
    const est = Math.ceil(chunks(text).length * (delay + 120)) + 25000;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA', '-File', path.join(__dirname, 'typeLive.ps1'), '-ChunksFile', tmp, '-SavePath', file, '-Delay', String(delay)],
      { windowsHide: true, timeout: Math.min(est, 600000) }, (err) => {
        try { fs.unlinkSync(tmp); } catch {}
        if (!err) return resolve({ ok: true });
        const c = typeof err.code === 'number' ? err.code : 9;
        resolve({ ok: false, reason: 'E' + ([2, 3, 4].includes(c) ? c : 9) });
      });
  });
}
module.exports = { typeLive, chunks };
