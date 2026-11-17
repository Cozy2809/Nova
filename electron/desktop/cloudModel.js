// Modelo en la nube de Ollama: Inkling 2 Small (inkling-2-small:cloud).
// Es OPCIONAL y requiere consentimiento: a diferencia del resto de Nova, los mensajes salen del PC hacia Ollama Cloud.
// Nunca se ejecuta texto libre: los comandos de ollama usan argumentos fijos.
'use strict';

const MODEL = 'inkling-2-small:cloud';
const KEY = 'cloud.inkling';

const enabled = (settings) => !!settings && String(settings[KEY]) === 'true';

/** Ajustes con el modelo de la nube aplicado (solo si el proveedor es Ollama y el usuario lo activó). */
function override(settings, env = process.env) {
  const provider = String((settings && settings.provider) || env.AI_PROVIDER || 'ollama');
  if (provider !== 'ollama' || !enabled(settings)) return { active: false, settings, model: null };
  return { active: true, model: MODEL, settings: { ...settings, model: MODEL, ollamaModel: MODEL, ollama_model: MODEL } };
}
/** Algunos proveedores leen OLLAMA_MODEL del entorno: se fija solo durante la llamada y se restaura. */
function withEnv(model, env = process.env) {
  const prev = env.OLLAMA_MODEL; env.OLLAMA_MODEL = model;
  return () => { if (env.OLLAMA_MODEL === model) { if (prev === undefined) delete env.OLLAMA_MODEL; else env.OLLAMA_MODEL = prev; } };
}

function createCloud({ execFile, spawn, fetchImpl = globalThis.fetch, getUrl = () => 'http://localhost:11434', getSettings = () => ({}), setSettings = () => {}, platform = process.platform }) {
  const base = () => String(getUrl() || 'http://localhost:11434').replace(/\/+$/, '');
  const timed = async (url, opts = {}, ms = 4000) => { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms); try { return await fetchImpl(url, { ...opts, signal: ac.signal }); } finally { clearTimeout(t); } };

  async function status() {
    const out = { model: MODEL, enabled: enabled(getSettings()), reachable: false, listed: false };
    try { const r = await timed(base() + '/api/tags', {}, 2500); if (r.ok) { out.reachable = true; const j = await r.json(); out.listed = (j.models || []).some((m) => m && (m.name === MODEL || m.model === MODEL)); } } catch {}
    return out;
  }
  // Registra el modelo en la nube en el Ollama local (no descarga pesos: es un acceso remoto)
  const register = () => new Promise((resolve) => { execFile('ollama', ['pull', MODEL], { windowsHide: true, timeout: 180000 }, (err, so, se) => { if (err) return resolve({ ok: false, error: String(se || err.message || 'ollama no respondió').split(/\r?\n/).find((l) => l.trim())?.slice(0, 200) || 'ollama no respondió' }); resolve({ ok: true }); }); });
  // Abre el inicio de sesión de Ollama (navegador). Es una acción del usuario, con argumentos fijos.
  function signin() { try { const p = spawn('ollama', ['signin'], { detached: true, stdio: 'ignore', windowsHide: false }); if (p && p.unref) p.unref(); return { ok: true }; } catch (e) { return { ok: false, error: 'No pude abrir «ollama signin»: ' + e.message }; } }
  // Prueba de extremo a extremo con un mensaje fijo (no se envía nada del usuario)
  async function test() {
    if (platform !== 'win32' && platform !== 'linux' && platform !== 'darwin') return { ok: false, error: 'Plataforma no soportada' };
    try {
      const r = await timed(base() + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, stream: false, messages: [{ role: 'user', content: 'Responde solo: ok' }] }) }, 40000);
      if (!r.ok) { const t = String(await r.text()).slice(0, 200); return { ok: false, status: r.status, error: r.status === 401 || /unauthor|sign ?in|login/i.test(t) ? 'Falta iniciar sesión en Ollama: pulsa «Iniciar sesión».' : r.status === 404 ? 'El modelo no está registrado: pulsa «Registrar modelo».' : (t || 'HTTP ' + r.status) }; }
      return { ok: true };
    } catch (e) { return { ok: false, error: e.name === 'AbortError' ? 'Ollama Cloud no respondió a tiempo.' : 'No se pudo contactar con Ollama: ' + e.message }; }
  }
  const setEnabled = (on) => { setSettings({ [KEY]: on ? 'true' : 'false' }); return { enabled: !!on }; };
  return { status, register, signin, test, setEnabled, MODEL };
}

module.exports = { createCloud, override, withEnv, enabled, MODEL, KEY };
