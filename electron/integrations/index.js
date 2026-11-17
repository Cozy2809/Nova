// Integraciones de Nova (herramientas externas dentro de Nova). Cada integración vive en su carpeta con un `register.js`
// y se descubre aquí: instalar o quitar una integración no obliga a tocar las demás.
'use strict';
const fs = require('fs');
const path = require('path');

// Solo páginas propias de Nova (cargadas desde archivo local o el servidor de desarrollo), en el marco principal.
function isOwnPage(e) {
  try { const f = e && e.senderFrame; if (!f || f.parent) return false; const u = new URL(f.url); return u.protocol === 'file:' || (u.hostname === 'localhost' && u.port === '5173'); } catch { return false; }
}

function register({ ipcMain, app, tools, confirm, execFile, spawn = require('child_process').spawn, dir = __dirname }) {
  const handle = (ch, fn) => ipcMain.handle('nova:' + ch, async (e, d) => { if (!isOwnPage(e)) return { error: 'Origen no permitido' }; try { return await fn(d || {}); } catch (err) { return { error: err.message || String(err) }; } });
  const loaded = {};
  for (const name of fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const file = path.join(dir, name, 'register.js'); if (!fs.existsSync(file)) continue;
    try { loaded[name] = require(file)({ app, tools, confirm, execFile, spawn, handle }); } catch (e) { console.error('integración «' + name + '»:', e); }
  }
  return loaded;
}
module.exports = { register, isOwnPage };
