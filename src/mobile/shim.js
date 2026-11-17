// Puente del móvil: expone la MISMA API window.jarvis que usa la app del PC, pero hablando por HTTP con NOVA en el ordenador.
// Así el móvil reutiliza el mismo cerebro (useAI, órdenes del PC, memoria, notas).
const KEY = 'nova-token';
let token = ''; try { token = localStorage.getItem(KEY) || ''; } catch {}
export const getToken = () => token;
export const setToken = (t) => { token = String(t || '').trim(); try { localStorage.setItem(KEY, token); } catch {} };
export const clearToken = () => { token = ''; try { localStorage.removeItem(KEY); } catch {} };

const authFail = () => window.dispatchEvent(new Event('nova-auth'));
const headers = () => ({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' });
export async function api(path, body) {
  const r = await fetch('/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 401) { authFail(); throw new Error('Código incorrecto'); }
  if (r.status === 429) throw new Error('Demasiados intentos, espera un minuto');
  return r.json();
}
const safe = (fallback) => (e) => (fallback === undefined ? { error: e.message || 'Sin conexión con el PC' } : fallback);

const chunkCbs = new Set(); const levelCbs = new Set(); const statCbs = new Set();
export const emitLevel = (m) => levelCbs.forEach((cb) => cb(m));

// Mientras una orden del PC espera, consulta si el PC pide permiso y avisa a la interfaz del móvil
function pollApprovals() {
  let on = true; const seen = new Set();
  const tick = async () => {
    if (!on) return;
    try { const a = await api('/approvals'); for (const x of a.items || []) if (!seen.has(x.id)) { seen.add(x.id); window.dispatchEvent(new CustomEvent('nova-approval', { detail: x })); } } catch {}
    if (on) setTimeout(tick, 1000);
  };
  setTimeout(tick, 400);
  return () => { on = false; };
}
export const answerApproval = (id, response) => api('/approvals/answer', { id, response }).catch(() => null);
export const ping = () => api('/ping').then((r) => ({ ok: !!r.ok, pc: r.pc })).catch((e) => ({ ok: false, error: e.message === 'Failed to fetch' ? 'No encuentro tu PC. ¿Está encendido y con Nova abierta?' : e.message }));

setInterval(async () => { if (document.hidden || !statCbs.size || !token) return; try { const s = await api('/stats'); statCbs.forEach((cb) => cb(s)); } catch {} }, 5000);

window.jarvis = {
  async chat(id, messages) {
    let r;
    try { r = await fetch('/api/chat', { method: 'POST', headers: headers(), body: JSON.stringify({ messages }) }); } catch { return { error: 'No encuentro tu PC. ¿Está encendido y con Nova abierta?' }; }
    if (r.status === 401) { authFail(); return { error: 'Código incorrecto' }; }
    if (!r.ok || !r.body) return { error: 'El PC no respondió (' + r.status + ')' };
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', text = '', err = '';
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) { if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; } if (m.c) chunkCbs.forEach((cb) => cb({ id, text: m.c })); else if (m.error) err = m.error; else if (m.done) text = m.text; }
    }
    return err ? { error: err } : { text };
  },
  onChunk: (cb) => { chunkCbs.add(cb); return () => chunkCbs.delete(cb); },
  onLevel: (cb) => { levelCbs.add(cb); return () => levelCbs.delete(cb); },
  onStats: (cb) => { statCbs.add(cb); return () => statCbs.delete(cb); },
  tool: (name, args) => api('/tool', { name, args }).catch(safe()),
  getSettings: () => api('/settings').then((r) => (r && !r.error ? r : {})).catch(() => ({})), setSettings: async () => true,
  nova: async (ch, d) => (ch === 'lib:search' ? api('/lib/search', d || {}).catch(safe()) : { error: 'No disponible en el móvil' }),
  onNova: () => () => {},
  memAdd: (role, content) => api('/mem/add', { role, content }).catch(safe(false)),
  memClear: async () => false,
  memHistory: () => api('/mem/history').then((r) => (Array.isArray(r) ? r : [])).catch(safe([])),
  memSearch: (q) => api('/mem/search', { q }).catch(safe([])),
  itemAdd: (kind, text) => api('/item/add', { kind, text }).catch(safe(false)),
  itemList: (kind) => api('/item/list', { kind }).then((r) => (Array.isArray(r) ? r : [])).catch(safe([])),
  itemClear: (kind) => api('/item/clear', { kind }).catch(safe(false)),
  openApp: (id) => api('/app/open', { id }).catch(safe()),
  closeApp: (id) => api('/app/close', { id }).catch(safe()),
  mediaCmd: (action) => api('/media', { action }).catch(safe()),
  screenshot: () => api('/screenshot', {}).catch(safe()),
  async pc(action, args) { const stop = pollApprovals(); try { return await api('/pc', { action, args }); } catch (e) { return { error: e.message }; } finally { stop(); } },
  notify: async () => ({ skipped: true }),
  whatsapp: async () => ({ error: 'WhatsApp solo está disponible en el PC' }),
  toggleLoopback: async () => ({ error: 'El modo Discord solo está disponible en el PC' }),
  say: async () => ({}), stop: async () => ({}), cancelListen: async () => ({}), resetVoice: async () => ({}),
  onVoiceEvent: () => () => {}, onCommand: () => () => {}, convoState: () => {}, win: () => {}
};
