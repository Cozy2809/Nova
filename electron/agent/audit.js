// Auditoría en JSONL (una línea por evento relevante) con rotación. No guarda contenidos de archivos ni textos largos.
'use strict';
const fs = require('fs');
const path = require('path');

const SENSITIVE = /content|text|body|token|password|secret|clave/i;
function redact(v, key = '') {
  if (typeof v === 'string') {
    if (SENSITIVE.test(key)) return `[omitido: ${v.length} car.]`;
    return v.length > 200 ? v.slice(0, 200) + `…(+${v.length - 200})` : v;
  }
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => redact(x, key)).concat(v.length > 20 ? [`…(+${v.length - 20})`] : []);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redact(x, k)]));
  return v;
}

function createAudit(file, { maxBytes = 2 * 1024 * 1024 } = {}) {
  const write = (entry) => {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try { if (fs.statSync(file).size > maxBytes) fs.renameSync(file, file + '.1'); } catch {}
      fs.appendFileSync(file, JSON.stringify({ t: new Date().toISOString(), ...redact(entry) }) + '\n');
    } catch { /* la auditoría nunca debe romper una acción */ }
  };
  const tail = (n = 100) => {
    if (!file) return [];
    try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
  };
  return { write, tail, file };
}
module.exports = { createAudit, redact };
