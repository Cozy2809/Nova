// Centro de avisos de Nova (proceso principal): historial persistente, estados de lectura y duplicados agrupados.
// No depende de Electron: se prueba con node --test.
'use strict';
const fs = require('fs');
const path = require('path');
const LEVELS = ['info', 'ok', 'warn', 'err'];
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

function createNotices({ file = null, max = 100, now = Date.now, emit = () => {}, fsImpl = fs, dedupeMs = 60000 } = {}) {
  let items = [], timer = null, seq = 0;
  if (file) { try { const j = JSON.parse(fsImpl.readFileSync(file, 'utf8')); if (Array.isArray(j)) items = j.filter((x) => x && x.id && x.title).slice(0, max); } catch { items = []; } }
  const unread = () => items.filter((x) => !x.read).length;
  const save = () => {
    if (!file) return; clearTimeout(timer);
    timer = setTimeout(() => { try { fsImpl.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.tmp'; fsImpl.writeFileSync(tmp, JSON.stringify(items), 'utf8'); fsImpl.renameSync(tmp, file); } catch { /* el historial es opcional */ } }, 400);
    if (timer.unref) timer.unref();
  };
  const changed = (type, entry) => { save(); emit({ type, entry: entry || null, unread: unread() }); };
  return {
    push(p = {}) {
      const title = clip(p.title || 'Nova', 80), message = clip(p.message || p.body, 240);
      if (!message && !p.title) return null;
      const level = LEVELS.includes(p.level) ? p.level : 'info', source = clip(p.source || 'nova', 24), t = now();
      const dup = items.find((x) => x.title === title && x.message === message && x.source === source && t - x.at < dedupeMs);
      if (dup) { dup.count = (dup.count || 1) + 1; dup.at = t; dup.read = false; items = [dup, ...items.filter((x) => x !== dup)]; changed('updated', dup); return { ...dup, repeated: true }; }
      const e = { id: `${t}-${++seq}-${Math.random().toString(36).slice(2, 6)}`, title, message, level, source, priority: Math.max(1, Math.min(5, Number(p.priority) || 3)), at: t, read: false, count: 1 };
      items = [e, ...items].slice(0, max); changed('added', e); return { ...e, repeated: false };
    },
    list: (limit = 50) => ({ items: items.slice(0, limit), unread: unread(), total: items.length }),
    markRead(id) { let n = 0; for (const x of items) if ((id === 'all' || x.id === id) && !x.read) { x.read = true; n++; } if (n) changed('read'); return { changed: n }; },
    dismiss(id) { const n = items.length; items = items.filter((x) => x.id !== id); if (items.length !== n) changed('removed'); return { removed: n - items.length }; },
    clear() { const n = items.length; items = []; changed('cleared'); return { removed: n }; },
    unread,
  };
}
module.exports = { createNotices, LEVELS };
