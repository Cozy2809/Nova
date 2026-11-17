'use strict';
// Notificaciones push vía ntfy (JSON en UTF-8) + avisos programados en main.
// Parche "parche-notify" (oct-2026). Sustituye al notify.js anterior.
//
// Prueba sin abrir la app:   node electron\notify.js "Hola desde NOVA"

const path = require('path');
const fs = require('fs');
const { parseNotifyIntent, labelFor } = require('./notifyIntents.js');

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch { /* sin dotenv */ }

const DEFAULT_TOPIC = '';
const cfg = () => ({
  server: (process.env.NTFY_SERVER || 'https://ntfy.sh').trim().replace(/\/+$/, ''),
  topic: (process.env.NTFY_TOPIC || DEFAULT_TOPIC).trim(),
  token: (process.env.NTFY_TOKEN || '').trim(),
});

const log = (...a) => {
  console.log('[notify]', ...a);
  try { const { app } = require('electron'); fs.appendFileSync(path.join(app.getPath('userData'), 'notify.log'), new Date().toISOString() + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n'); } catch { /* fuera de Electron */ }
};

function clampPriority(p) {
  const n = Math.round(Number(p));
  return n >= 1 && n <= 5 ? n : 3;
}

// Acepta: send({title, message, priority}) | send('mensaje') | send('titulo', 'mensaje', prioridad)
async function send(a, b, c) {
  let data = a;
  if (typeof a === 'string' && typeof b === 'string') data = { title: a, message: b, priority: c };
  else if (typeof a === 'string') data = { message: a };
  data = data || {};

  const message = String(data.message ?? data.text ?? data.body ?? '').trim().slice(0, 4000);
  const title = String(data.title || 'NOVA').trim().slice(0, 200);
  if (!message) return { success: false, ok: false, error: 'Mensaje vacío' };

  const { server, topic, token } = cfg();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(topic)) {
    return { success: false, ok: false, error: 'NTFY_TOPIC inválido (solo letras, números, - y _)' };
  }

  // JSON al raíz del servidor: evita cabeceras HTTP con tildes/emojis, que fallan o llegan rotas
  const body = { topic, title, message, priority: clampPriority(data.priority) };
  if (Array.isArray(data.tags)) body.tags = data.tags.slice(0, 5).map(String);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${server}/`, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) {
      const txt = (await res.text().catch(() => '')).slice(0, 200);
      log(`error ${res.status} en ${server}/${topic}:`, txt);
      return { success: false, ok: false, status: res.status, topic, server, error: `ntfy respondió ${res.status}` };
    }
    log(`enviado a ${server}/${topic}:`, message.slice(0, 80));
    return { success: true, ok: true, status: res.status, topic, server };
  } catch (e) {
    const error = e && e.name === 'AbortError' ? 'Tiempo de espera agotado' : String((e && e.message) || e);
    log('fallo de red:', error);
    return { success: false, ok: false, topic, server, error };
  } finally {
    clearTimeout(timer);
  }
}

// Aviso de escritorio (si estamos dentro de Electron)
function desktop(title, body) {
  try {
    const { Notification } = require('electron');
    if (Notification && Notification.isSupported()) new Notification({ title, body }).show();
  } catch { /* fuera de Electron */ }
}

// ---- Avisos programados (viven en main: no se congelan con la ventana oculta) ----
const timers = new Map();
let nextId = 1;

function schedule(d = {}) {
  const ms = Math.round(Number(d.ms));
  if (!(ms >= 1000 && ms <= 7 * 86400000)) return { ok: false, error: 'Duración fuera de rango' };
  const label = d.label || labelFor(ms);
  const message = String(d.message || '').trim() || `Han pasado ${label}, Señor.`;
  const title = String(d.title || 'NOVA · Aviso');
  const id = nextId++;
  const at = Date.now() + ms;
  const handle = setTimeout(async () => {
    timers.delete(id);
    desktop(title, message);
    const r = await send({ title, message, priority: d.priority ?? 4, tags: ['alarm_clock'] });
    if (!r.success) {
      log('reintentando aviso', id, 'en 30 s');
      setTimeout(() => send({ title, message, priority: d.priority ?? 4, tags: ['alarm_clock'] }), 30000);
    }
  }, ms);
  timers.set(id, { handle, at, message });
  log(`aviso ${id} programado para dentro de ${label}`);
  return { ok: true, id, at, label };
}

function cancelAll() {
  const n = timers.size;
  for (const { handle } of timers.values()) clearTimeout(handle);
  timers.clear();
  return { ok: true, cancelled: n };
}

// ---- Respuesta local para frases de aviso que llegarían a Ollama ----
async function runIntent(it) {
  if (it.type === 'push_test') {
    const r = await send({ title: 'NOVA', message: 'Prueba de notificación. Si lee esto, funciona.' });
    return r.success ? `Prueba enviada, Señor: ntfy la ha aceptado en el tema «${r.topic}». Si no le llega, revise que la app ntfy del móvil esté suscrita a ese tema.` : `No he podido enviar la prueba, Señor. Motivo: ${r.error}.`;
  }
  if (it.type === 'push_cancel') {
    const { cancelled } = cancelAll();
    return cancelled ? `He cancelado ${cancelled} aviso${cancelled === 1 ? '' : 's'} programado${cancelled === 1 ? '' : 's'}, Señor.` : 'No había avisos programados, Señor.';
  }
  if (it.type === 'push_timer') {
    const r = schedule({ ms: it.ms, label: it.label, message: it.message });
    if (!r.ok) return `No he podido programar el aviso, Señor. ${r.error}.`;
    return `Entendido, Señor. Le avisaré en el móvil dentro de ${it.label}.`;
  }
  if (it.type === 'push') {
    if (!it.message) return '¿Qué quiere que le mande al móvil, Señor?';
    const r = await send({ title: 'NOVA', message: it.message });
    return r.success ? `Aviso enviado, Señor: ntfy lo ha aceptado en el tema «${r.topic}».` : `No he podido enviar el aviso al móvil, Señor. Motivo: ${r.error}.`;
  }
  return null;
}

async function interceptChat(event, req) {
  const msgs = req && Array.isArray(req.messages) ? req.messages : null;
  if (!msgs) return null;
  const last = [...msgs].reverse().find((m) => m && m.role === 'user');
  if (!last || typeof last.content !== 'string') return null;
  const it = parseNotifyIntent(last.content);
  if (!it) return null;
  log('intención detectada antes de Ollama:', it.type);
  const text = await runIntent(it);
  if (!text) return null;
  try { event.sender.send('ai:chunk', { id: req.id, text }); } catch { /* ventana cerrada */ }
  return { text };
}

// ---- Instalación: se llama en la PRIMERA línea de main.js ----
let installed = false;
function install() {
  if (installed) return;
  installed = true;
  const { ipcMain } = require('electron');
  const origHandle = ipcMain.handle.bind(ipcMain);
  const origRemove = ipcMain.removeHandler.bind(ipcMain);
  const OWN = new Set(['notify:send', 'notify:schedule', 'notify:cancel']);

  origHandle('notify:send', (_e, data) => (data && data.auto && String(process.env.NTFY_AUTO).toLowerCase() === 'false' ? { skipped: true } : send(data)));
  origHandle('notify:schedule', (_e, d) => schedule(d || {}));
  origHandle('notify:cancel', () => cancelAll());

  // Los handlers antiguos de estos canales se ignoran (evita el error de handler duplicado)
  ipcMain.handle = (channel, fn) => {
    if (OWN.has(channel)) { log('ignorado handler antiguo de', channel); return undefined; }
    if (channel === 'ai:chat') {
      return origHandle(channel, async (e, req) => {
        try { const r = await interceptChat(e, req); if (r) return r; } catch (err) { log('error en intercepción:', err); }
        return fn(e, req);
      });
    }
    return origHandle(channel, fn);
  };
  ipcMain.removeHandler = (channel) => (OWN.has(channel) ? undefined : origRemove(channel));
  const { server, topic } = cfg();
  log(`listo (${server}/${topic})`);
}

module.exports = Object.assign(send, {
  send, sendNotification: send, sendPush: send, sendNtfy: send, notify: send, default: send,
  schedule, cancelAll, install, interceptChat, runIntent,
});

// Uso por línea de comandos
if (require.main === module) {
  const msg = process.argv.slice(2).join(' ') || 'Prueba de NOVA desde la terminal';
  const { server, topic } = cfg();
  console.log(`Enviando a ${server}/${topic} ...`);
  send({ title: 'NOVA', message: msg }).then((r) => {
    console.log(r.success ? 'OK: revisa el móvil.' : `FALLO: ${r.error}`);
    process.exit(r.success ? 0 : 1);
  });
}
