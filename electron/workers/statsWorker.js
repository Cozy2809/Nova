// Worker en segundo plano: métricas del sistema. Versión ligera: CPU y RAM con el módulo os (sin lanzar procesos);
// GPU con nvidia-smi cada 4 s; red cada 6 s y disco cada 60 s (esas dos usan systeminformation, que lanza PowerShell en Windows).
const os = require('os');
const { execFile } = require('child_process');
const { parentPort } = require('worker_threads');
let si = null; try { si = require('systeminformation'); } catch {}
let paused = false, prev = snap(), last = { cpu: 0, ram: 0, temp: null, disk: 0, gpu: null, gpuName: '', rx: 0, tx: 0 };
function snap() { let idle = 0, total = 0; for (const c of os.cpus()) { for (const k in c.times) total += c.times[k]; idle += c.times.idle; } return { idle, total }; }
function fast() {
  const n = snap(), di = n.idle - prev.idle, dt = n.total - prev.total; prev = n;
  last.cpu = dt > 0 ? Math.round((1 - di / dt) * 100) : last.cpu;
  last.ram = Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
}
let nvidia = true;
function gpu() {
  if (!nvidia) return;
  execFile('nvidia-smi', ['--query-gpu=utilization.gpu,temperature.gpu,name', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 4000 }, (err, so) => {
    if (err) { nvidia = false; return; }
    const [u, t, ...nm] = String(so).trim().split(',').map((s) => s.trim()); last.gpu = parseInt(u, 10); last.temp = parseInt(t, 10); last.gpuName = nm.join(',');
  });
}
async function net() { if (!si) return; try { const n = await si.networkStats(); last.rx = Math.round((n[0]?.rx_sec ?? 0) / 1024); last.tx = Math.round((n[0]?.tx_sec ?? 0) / 1024); } catch {} }
async function disk() { if (!si) return; try { const f = await si.fsSize(); last.disk = Math.round(f[0]?.use ?? 0); } catch {} }
const send = () => { if (!paused) parentPort.postMessage({ ...last }); };
let n = 0;
async function tick() {
  if (paused) return; fast(); if (n % 2 === 0) gpu(); if (n % 3 === 0) net(); if (n % 30 === 0) disk(); n++; send();
}
parentPort.on('message', (m) => { paused = m === 'pause'; if (!paused) tick(); });
setInterval(tick, 2000); tick();
