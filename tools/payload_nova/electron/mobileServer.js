// Servidor web de NOVA para el móvil (proceso principal de Electron). Sin dependencias: solo módulos de Node.
// - Escucha SOLO en 127.0.0.1 y en las IP de Tailscale (100.64.0.0/10). Nunca en la red Wi-Fi/LAN.
// - La página (dist/mobile.html) es pública, pero TODO lo que empieza por /api exige el código (token) de NOVA.
// - Comparte memoria, notas y modelo con la app del PC. Las acciones sobre el PC piden permiso EN EL MÓVIL.
// Se apaga con NOVA_MOBILE=off en .env; el control del PC desde el móvil, con NOVA_MOBILE_PC=off.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DIST = path.join(__dirname, '..', 'dist');
const ICON = path.join(__dirname, '..', 'assets', 'jarvis.png');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.svg': 'image/svg+xml', '.map': 'application/json' };
const MANIFEST = JSON.stringify({ name: 'Nova', short_name: 'Nova', start_url: '/', display: 'standalone', background_color: '#060914', theme_color: '#060914', icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }] });
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

let deps = null, token = '', timer = null, lastStats = {}, lastErr = '';
const servers = new Map(); // host -> http.Server
let approvals = [], aid = 0; const resolvers = new Map();
const fails = new Map(); // ip -> { n, t }: freno a los intentos de código erróneos

const port = () => parseInt(process.env.NOVA_MOBILE_PORT, 10) || 8787;
const enabled = () => String(process.env.NOVA_MOBILE || 'on').toLowerCase() !== 'off';
const pcAllowed = () => String(process.env.NOVA_MOBILE_PC || 'on').toLowerCase() !== 'off';

function tailscaleIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if (a.family !== 'IPv4' && a.family !== 4) continue;
    const p = a.address.split('.').map(Number);
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) out.push(a.address);
  }
  return [...new Set(out)];
}

function getToken() {
  if (token) return token;
  const env = String(process.env.NOVA_MOBILE_TOKEN || '').trim();
  if (env.length >= 8) return (token = env);
  const s = deps.mem.getSettings();
  if (s.mobileToken && s.mobileToken.length >= 8) return (token = s.mobileToken);
  token = crypto.randomBytes(8).toString('hex');
  deps.mem.setSettings({ mobileToken: token });
  return token;
}
const sameToken = (a) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(getToken()).digest(); return crypto.timingSafeEqual(x, y); };

const send = (res, code, obj) => { if (res.headersSent) return; res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
function body(req, max = 300000) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > max) { reject(new Error('Petición demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('JSON no válido')); } });
    req.on('error', reject);
  });
}

// Pide permiso en el móvil: el móvil consulta /api/approvals mientras espera y responde con /api/approvals/answer
function asker(info) {
  return new Promise((resolve) => {
    const id = ++aid;
    const a = { id, action: info.action, message: String(info.message || '').slice(0, 300), detail: String(info.detail || '').slice(0, 600), buttons: ['Denegar', 'Permitir'], ts: Date.now() };
    approvals.push(a);
    const done = (r) => { clearTimeout(tm); approvals = approvals.filter((x) => x.id !== id); resolvers.delete(id); resolve(r); };
    const tm = setTimeout(() => done(0), 120000); // sin respuesta en 2 minutos = denegado
    resolvers.set(id, done);
  });
}

async function api(req, res, url, ip) {
  const f = fails.get(ip);
  if (f && f.n >= 10 && Date.now() - f.t < 60000) return send(res, 429, { error: 'Demasiados intentos. Espera un minuto.' });
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ') || !sameToken(auth.slice(7).trim())) {
    fails.set(ip, { n: (f && Date.now() - f.t < 60000 ? f.n : 0) + 1, t: Date.now() });
    return send(res, 401, { error: 'Código incorrecto' });
  }
  fails.delete(ip);
  const route = req.method + ' ' + url.pathname;
  const { mem, providers, tools, pcControl } = deps;
  const b = req.method === 'POST' ? await body(req) : {};
  const gate = () => (pcAllowed() ? null : { error: 'El control del PC desde el móvil está desactivado (NOVA_MOBILE_PC=off).' });
  switch (route) {
    case 'GET /api/ping': return send(res, 200, { ok: true, name: 'Nova', pc: pcAllowed() });
    case 'GET /api/stats': return send(res, 200, lastStats);
    case 'POST /api/chat': {
      const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-40).filter((m) => m && ['system', 'user', 'assistant'].includes(m.role)).map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 12000) }));
      if (!msgs.length) return send(res, 400, { error: 'Sin mensajes' });
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
      let open = true; res.on('close', () => { open = false; });
      const s = { ...mem.getSettings() }; const prov = providers[s.provider || process.env.AI_PROVIDER || 'ollama'] || providers.ollama;
      try {
        const text = await prov.stream({ messages: msgs, settings: s, onChunk: (t) => { if (open) res.write(JSON.stringify({ c: t }) + '\n'); } });
        if (open) res.write(JSON.stringify({ done: true, text }) + '\n');
      } catch (e) { if (open) res.write(JSON.stringify({ error: e.message }) + '\n'); }
      return res.end();
    }
    case 'POST /api/tool': {
      if (b.name !== 'search') return send(res, 200, { error: 'Herramienta no disponible desde el móvil' });
      try { return send(res, 200, { result: await tools.search(b.args || {}) }); } catch (e) { return send(res, 200, { error: e.message }); }
    }
    case 'GET /api/mem/history': return send(res, 200, mem.history());
    case 'POST /api/mem/search': return send(res, 200, mem.search(String(b.q || '').slice(0, 200)));
    case 'POST /api/mem/add': if (['user', 'assistant'].includes(b.role)) mem.add(b.role, String(b.content || '').slice(0, 4000)); return send(res, 200, { ok: true });
    case 'POST /api/item/add': mem.addItem(String(b.kind), String(b.text || '').slice(0, 500)); return send(res, 200, { ok: true });
    case 'POST /api/item/list': return send(res, 200, mem.listItems(String(b.kind)));
    case 'POST /api/item/clear': mem.clearItems(String(b.kind)); return send(res, 200, { ok: true });
    case 'GET /api/approvals': return send(res, 200, { items: approvals });
    case 'POST /api/approvals/answer': { const r = resolvers.get(Number(b.id)); if (r) r(b.response === 1 ? 1 : 0); return send(res, 200, { ok: !!r }); }
    case 'POST /api/pc': { const g = gate(); if (g) return send(res, 200, g); try { return send(res, 200, await pcControl.runRemote(String(b.action || ''), b.args || {}, asker)); } catch (e) { return send(res, 200, { error: e.message }); } }
    case 'POST /api/app/open': { const g = gate(); return send(res, 200, g || await deps.openApp(String(b.id))); }
    case 'POST /api/app/close': { const g = gate(); return send(res, 200, g || await deps.closeApp(String(b.id))); }
    case 'POST /api/media': { const g = gate(); return send(res, 200, g || await deps.mediaControl(String(b.action))); }
    case 'POST /api/screenshot': { const g = gate(); return send(res, 200, g || await deps.takeScreenshot()); }
    default: return send(res, 404, { error: 'No existe' });
  }
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Método no permitido' });
  const p = decodeURIComponent(url.pathname);
  if (p === '/manifest.webmanifest') { res.writeHead(200, { 'Content-Type': 'application/manifest+json' }); return res.end(MANIFEST); }
  const file = p === '/icon.png' ? ICON : path.join(DIST, p === '/' ? 'mobile.html' : p);
  const rel = path.relative(DIST, file);
  if (file !== ICON && (rel.startsWith('..') || path.isAbsolute(rel))) return send(res, 403, { error: 'Prohibido' });
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(p === '/' ? 'Falta compilar la app del móvil. Ejecuta: npm run build' : 'No encontrado'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600', ...(ext === '.html' ? { 'Content-Security-Policy': CSP } : {}) });
    res.end(data);
  });
}

function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
  let url; try { url = new URL(req.url, 'http://x'); } catch { return send(res, 400, { error: 'URL no válida' }); }
  if (url.pathname.startsWith('/api/')) return api(req, res, url, req.socket.remoteAddress || '?').catch((e) => send(res, 500, { error: e.message }));
  return serveStatic(req, res, url);
}

function scan() {
  const want = new Set(['127.0.0.1', ...tailscaleIPs(), ...String(process.env.NOVA_MOBILE_HOST || '').split(',').map((s) => s.trim()).filter(Boolean)]);
  for (const [h, s] of servers) if (!want.has(h)) { try { s.close(); } catch {} servers.delete(h); }
  for (const h of want) {
    if (servers.has(h)) continue;
    const s = http.createServer(handler);
    s.requestTimeout = 0; s.headersTimeout = 20000; // las respuestas del modelo pueden tardar
    s.on('error', (e) => { lastErr = e.code === 'EADDRINUSE' ? `El puerto ${port()} está ocupado (cambia NOVA_MOBILE_PORT en .env)` : e.message; servers.delete(h); });
    try { s.listen(port(), h, () => { lastErr = ''; }); servers.set(h, s); } catch (e) { lastErr = e.message; }
  }
}

module.exports = {
  // deps: { mem, providers, tools, pcControl, openApp, closeApp, mediaControl, takeScreenshot }
  start(d) { deps = d; if (!enabled()) return; getToken(); scan(); timer = setInterval(scan, 30000); },
  stop() { clearInterval(timer); for (const s of servers.values()) { try { s.close(); } catch {} } servers.clear(); },
  setStats(m) { lastStats = m || {}; },
  info() {
    if (!deps) return { enabled: false };
    const ips = tailscaleIPs();
    return { enabled: enabled(), port: port(), token: enabled() ? getToken() : '', urls: ips.map((ip) => `http://${ip}:${port()}`), localUrl: `http://127.0.0.1:${port()}`, tailscale: ips.length > 0, error: lastErr, pcAllowed: pcAllowed() };
  }
};
