'use strict';
const net = require('net');
let socket = null, enabled = false, appId = '', state = 'idle', retry = null, buffer = Buffer.alloc(0), nonce = 0;
const labels = { idle: 'Disponible para ayudarte', listening: 'Escuchando a su Señor', thinking: 'Preparando una respuesta', speaking: 'Hablando con su Señor', muted: 'En pausa' };
const packet = (op, data) => { const body = Buffer.from(JSON.stringify(data)); const h = Buffer.alloc(8); h.writeInt32LE(op, 0); h.writeInt32LE(body.length, 4); return Buffer.concat([h, body]); };
function sendActivity() { if (!socket || socket.destroyed || !enabled || !appId) return; socket.write(packet(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: { details: 'Asistente Nova ON', state: labels[state] || labels.idle, assets: { large_image: 'nova', large_text: 'Nova' }, instance: false } }, nonce: String(++nonce) })); }
function close() { clearInterval(retry); retry = null; try { socket?.destroy(); } catch {} socket = null; buffer = Buffer.alloc(0); }
function consume(chunk) {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 8) { const op = buffer.readInt32LE(0), len = buffer.readInt32LE(4); if (len < 0 || len > 1024 * 1024) return close(); if (buffer.length < 8 + len) return; const raw = buffer.subarray(8, 8 + len).toString('utf8'); buffer = buffer.subarray(8 + len); if (op === 1) { let msg; try { msg = JSON.parse(raw); } catch {} if (msg?.evt === 'READY') sendActivity(); } }
}
async function connect() {
  if (!enabled || !/^\d{5,25}$/.test(appId) || process.platform !== 'win32' || (socket && !socket.destroyed)) return;
  for (let i = 0; i < 10 && enabled; i++) {
    const pipe = `\\\\?\\pipe\\discord-ipc-${i}`;
    const ok = await new Promise((resolve) => { const s = net.createConnection(pipe); let done = false; const finish = (v) => { if (done) return; done = true; clearTimeout(t); resolve(v); }; const t = setTimeout(() => { s.destroy(); finish(false); }, 700); s.once('connect', () => { socket = s; buffer = Buffer.alloc(0); s.on('data', consume); s.on('error', () => { if (socket === s) { socket = null; buffer = Buffer.alloc(0); } }); s.on('close', () => { if (socket === s) { socket = null; buffer = Buffer.alloc(0); } }); s.write(packet(0, { v: 1, client_id: appId })); finish(true); }); s.once('error', () => { s.destroy(); finish(false); }); });
    if (ok) return;
  }
}
function configure(opts = {}) { enabled = opts.enabled === true; appId = String(opts.appId || '').trim(); state = opts.state || state; close(); if (enabled && /^\d{5,25}$/.test(appId)) { connect(); retry = setInterval(() => { if (!socket || socket.destroyed) connect(); }, 12000); retry.unref?.(); } }
function setState(next) { state = String(next || 'idle'); if (socket && !socket.destroyed) sendActivity(); else if (enabled) connect(); }
module.exports = { configure, setState, stop: close };
