// Geometría pura del shell de Nova: dónde colocar dock, barra y panel según monitores y barra de tareas de Windows.
// Trabaja con objetos como los de electron.screen (id, bounds, workArea). Sin dependencias de Electron.
'use strict';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** La barra de tareas se deduce de la diferencia entre bounds y workArea. 'none' = oculta automáticamente o inexistente. */
function detectTaskbar(d) {
  const b = d.bounds, w = d.workArea;
  const top = w.y - b.y, left = w.x - b.x, bottom = b.y + b.height - (w.y + w.height), right = b.x + b.width - (w.x + w.width);
  const m = Math.max(top, left, bottom, right);
  if (m <= 0) return { edge: 'none', size: 0 };
  return { edge: m === bottom ? 'bottom' : m === top ? 'top' : m === left ? 'left' : 'right', size: m };
}

/** Dock centrado abajo, justo encima de la barra de tareas (o del borde si está oculta o en otro lado). */
function dockBounds(d, { width, height = 76, gap = 6 }) {
  const w = d.workArea, tb = detectTaskbar(d);
  const W = clamp(Math.round(width), 160, Math.max(160, w.width - 24));
  const lift = tb.edge === 'none' ? gap + 4 : gap; // sin barra visible se deja margen extra para que no choque al reaparecer
  return { x: Math.round(w.x + (w.width - W) / 2), y: Math.round(w.y + w.height - height - lift), width: W, height };
}

/** Barra superior compacta (según contenido) o a todo el ancho. */
function topbarBounds(d, { width, align = 'center', mode = 'compact', height = 50, margin = 8 }) {
  const w = d.workArea;
  if (mode === 'full') return { x: w.x, y: w.y, width: w.width, height };
  const W = clamp(Math.round(width), 260, Math.max(260, w.width - 2 * margin));
  const x = align === 'left' ? w.x + margin : align === 'right' ? w.x + w.width - W - margin : Math.round(w.x + (w.width - W) / 2);
  return { x, y: w.y, width: W, height };
}

const PANEL_W = { compact: 286, normal: 318, wide: 410 };
function panelBounds(d, { side = 'right', size = 'normal', saved = null }) {
  const w = d.workArea, width = PANEL_W[size] || PANEL_W.normal, height = Math.max(440, Math.min(850, w.height - 24));
  const okSaved = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y);
  const x = okSaved ? clamp(saved.x, w.x, w.x + w.width - width) : side === 'left' ? w.x + 12 : w.x + Math.max(0, w.width - width - 12);
  const y = okSaved ? clamp(saved.y, w.y, w.y + w.height - 300) : w.y + 12;
  return { x: Math.round(x), y: Math.round(y), width, height: Math.min(height, w.height - 12) };
}

/** Pantallas elegidas ('primary' o un id). Si ninguna existe se usa la principal: el shell nunca desaparece. */
function pickDisplays(all, primaryId, wanted) {
  const want = Array.isArray(wanted) && wanted.length ? wanted : ['primary'];
  const out = [];
  for (const k of want) { const d = k === 'primary' ? all.find((x) => x.id === primaryId) : all.find((x) => String(x.id) === String(k)); if (d && !out.includes(d)) out.push(d); }
  if (!out.length) { const p = all.find((x) => x.id === primaryId) || all[0]; if (p) out.push(p); }
  return out;
}

const inRect = (p, r, m = 0) => p.x >= r.x - m && p.x <= r.x + r.width + m && p.y >= r.y - m && p.y <= r.y + r.height + m;
/** Zona que despierta una barra oculta automáticamente. */
function revealZone(kind, d, bar) {
  if (kind === 'topbar') return { x: bar.x - 24, y: d.bounds.y, width: bar.width + 48, height: 3 };
  const w = d.workArea; return { x: bar.x, y: w.y + w.height - 10, width: bar.width, height: 10 };
}
module.exports = { detectTaskbar, dockBounds, topbarBounds, panelBounds, pickDisplays, revealZone, inRect, clamp, PANEL_W };
