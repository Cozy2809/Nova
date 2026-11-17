// Ruta segura única de Nova Desktop: una ruta solo es válida si ella Y su destino real (por si hay enlaces) están dentro de
// las carpetas personales permitidas. Las raíces vienen de pcControl (una sola lista en todo el proyecto).
'use strict';
const fs = require('fs');
const path = require('path');
const { AgentError, ERR } = require('../agent/contract');

const RISKY = new Set(['.exe', '.bat', '.cmd', '.com', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.msi', '.msp', '.scr', '.lnk', '.reg', '.dll', '.jar', '.hta', '.cpl', '.url']);
const eq = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const inside = (p, base) => { const a = path.resolve(p).toLowerCase(), b = path.resolve(base).toLowerCase(); return a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep); };

function createFsGuard({ getRoots }) {
  const roots = () => [...new Set((getRoots() || []).filter(Boolean).map((r) => path.resolve(r)))];
  /** Devuelve la ruta absoluta o lanza NOT_ALLOWED_PATH. */
  function safe(p, { mustExist = false } = {}) {
    if (typeof p !== 'string' || !p.trim() || p.includes('\0')) throw new AgentError(ERR.NOT_ALLOWED_PATH, 'Ruta no válida');
    const rp = path.resolve(p);
    if (!roots().some((r) => inside(rp, r))) throw new AgentError(ERR.NOT_ALLOWED_PATH, 'Ruta fuera de tus carpetas personales: ' + rp);
    let exists = false;
    try { exists = fs.existsSync(rp); } catch {}
    if (exists) {
      let real; try { real = fs.realpathSync(rp); } catch { throw new AgentError(ERR.NOT_ALLOWED_PATH, 'No se puede resolver la ruta'); }
      if (!roots().some((r) => { let rr = r; try { rr = fs.realpathSync(r); } catch {} return inside(real, r) || inside(real, rr); })) throw new AgentError(ERR.NOT_ALLOWED_PATH, 'El destino real de la ruta está fuera de tus carpetas personales');
    } else if (mustExist) throw new AgentError(ERR.NOT_ALLOWED_PATH, 'No existe: ' + rp);
    return rp;
  }
  const isRoot = (p) => roots().some((r) => eq(r, p));
  return { safe, isRoot, roots, inside };
}

// Nombre de archivo/carpeta válido en Windows
function cleanName(s, max = 120) {
  let b = String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).replace(/[. ]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(b)) b += '_';
  return b;
}
module.exports = { createFsGuard, cleanName, RISKY, eq, inside };
