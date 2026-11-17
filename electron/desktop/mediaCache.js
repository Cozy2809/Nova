// Consulta multimedia compartida: una sola ejecución de PowerShell a la vez y resultado reutilizable unos segundos.
// Así varios paneles/ventanas con el widget de música no repiten el mismo trabajo.
'use strict';

function createMediaCache({ read, ttl = 4000, now = Date.now }) {
  let value = null, at = 0, inflight = null;
  const get = ({ force = false } = {}) => {
    if (!force && value && now() - at < ttl) return Promise.resolve(value);
    if (inflight) return inflight;
    inflight = Promise.resolve().then(read).then((v) => { value = v; at = now(); return v; }).finally(() => { inflight = null; });
    return inflight;
  };
  return { get, invalidate() { at = 0; }, peek: () => value };
}

const pick = (o, ...keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== '') return String(o[k]); return ''; };

/** Normaliza la respuesta de media.ps1 (acepta objeto, lista o { sessions }) a una forma estable para la interfaz. */
function normalizeMedia(raw) {
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.sessions) ? raw.sessions : raw && typeof raw === 'object' && (raw.title || raw.app || raw.name) ? [raw] : [];
  const sessions = list.filter((s) => s && typeof s === 'object').slice(0, 12).map((s) => {
    const status = pick(s, 'status', 'state', 'playback', 'playbackStatus').toLowerCase();
    const playing = s.playing === true || (/play/.test(status) && !/pause/.test(status));
    return { app: pick(s, 'app', 'appId', 'source', 'session', 'sourceApp', 'AppUserModelId').slice(0, 80), title: pick(s, 'title', 'Title').slice(0, 120), artist: pick(s, 'artist', 'Artist', 'author').slice(0, 120), album: pick(s, 'album', 'albumTitle').slice(0, 120), playing, status };
  });
  const current = sessions.find((s) => s.playing) || sessions.find((s) => s.title) || sessions[0] || null;
  return { sessions, current, liner: sessions.some((s) => /liner/i.test(s.app)) };
}

module.exports = { createMediaCache, normalizeMedia };
