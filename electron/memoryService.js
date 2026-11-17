// Historial, memoria, notas/recuerdos y ajustes en SQLite
const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const db = new Database(path.join(app.getPath('userData'), 'jarvis.db'));
db.exec(`CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, role TEXT, content TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, kind TEXT, text TEXT, ts INTEGER);`);
const KINDS = ['note', 'fact']; // note = tarea/nota pendiente, fact = dato que Jarvis debe recordar
db.prepare("DELETE FROM messages WHERE content IS NULL OR TRIM(content) = ''").run(); // limpia filas vacías antiguas
module.exports = {
  add: (role, content) => { if (content == null || !String(content).trim()) return; return db.prepare('INSERT INTO messages(role,content,ts) VALUES(?,?,?)').run(role, String(content), Date.now()); },
  clear: () => db.prepare('DELETE FROM messages').run(),
  history: (n = 100) => db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT ?').all(n).reverse(),
  search: (q) => db.prepare('SELECT * FROM messages WHERE content LIKE ? ORDER BY id DESC LIMIT 50').all(`%${q}%`),
  addItem: (kind, text) => { if (KINDS.includes(kind) && text.trim()) db.prepare('INSERT INTO items(kind,text,ts) VALUES(?,?,?)').run(kind, text.trim(), Date.now()); },
  listItems: (kind) => KINDS.includes(kind) ? db.prepare('SELECT * FROM items WHERE kind=? ORDER BY id').all(kind) : [],
  clearItems: (kind) => { if (KINDS.includes(kind)) db.prepare('DELETE FROM items WHERE kind=?').run(kind); },
  getSettings: () => Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(r => [r.key, r.value])),
  setSettings: (o) => { const st = db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)'); for (const [k, v] of Object.entries(o)) st.run(k, String(v)); }
};
