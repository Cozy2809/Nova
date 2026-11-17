// Gestor de ventanas internas de Nova Desktop (reducer puro: fácil de probar).
export const APP_DEFS = {
  assistant: { title: 'Hablar con Nova', w: 560, h: 500 },
  explorer: { title: 'Archivos', w: 840, h: 520 },
  media: { title: 'Multimedia', w: 420, h: 360 },
  system: { title: 'Sistema', w: 560, h: 520 },
  activity: { title: 'Actividad de Nova', w: 560, h: 480 },
  settings: { title: 'Ajustes del escritorio', w: 700, h: 520 },
};
const MIN_W = 320, MIN_H = 220;
let seq = 0;
export const initial = { list: [], z: 1, active: null };

export function reducer(s, a) {
  const upd = (id, f) => ({ ...s, list: s.list.map((w) => (w.id === id ? { ...w, ...f(w) } : w)) });
  switch (a.type) {
    case 'open': {
      const exist = a.single !== false ? s.list.find((w) => w.app === a.app) : null;
      if (exist) { const z = s.z + 1; return { ...upd(exist.id, () => ({ min: false, z, props: { ...exist.props, ...a.props } })), z, active: exist.id }; }
      const d = APP_DEFS[a.app]; const n = s.list.length; const z = s.z + 1;
      const W = Math.min(d.w, a.area.w - 40), H = Math.min(d.h, a.area.h - 40);
      const w = { id: 'w' + ++seq, app: a.app, title: d.title, x: Math.max(8, Math.round((a.area.w - W) / 2) + (n % 6) * 26 - 40), y: Math.max(8, Math.round((a.area.h - H) / 2) + (n % 6) * 22 - 30), w: W, h: H, z, min: false, max: false, snap: null, props: a.props || {} };
      return { list: [...s.list, w], z, active: w.id };
    }
    case 'close': { const list = s.list.filter((w) => w.id !== a.id); return { ...s, list, active: s.active === a.id ? (list.filter((w) => !w.min).sort((x, y) => y.z - x.z)[0]?.id ?? null) : s.active }; }
    case 'focus': { if (s.active === a.id && !s.list.find((w) => w.id === a.id)?.min) return s; const z = s.z + 1; return { ...upd(a.id, () => ({ z, min: false })), z, active: a.id }; }
    case 'minimize': { const next = upd(a.id, () => ({ min: true })); return { ...next, active: s.active === a.id ? (next.list.filter((w) => !w.min).sort((x, y) => y.z - x.z)[0]?.id ?? null) : s.active }; }
    case 'toggleMax': return upd(a.id, (w) => (w.max ? { max: false, snap: null } : { max: true, prev: { x: w.x, y: w.y, w: w.w, h: w.h } }));
    case 'move': return upd(a.id, (w) => ({ x: a.x, y: a.y, max: false, snap: null, ...(w.snap || w.max ? { w: w.prev?.w ?? w.w, h: w.prev?.h ?? w.h } : {}) }));
    case 'resize': return upd(a.id, () => ({ x: a.x, y: a.y, w: Math.max(MIN_W, a.w), h: Math.max(MIN_H, a.h), snap: null }));
    case 'snap': { const { w: AW, h: AH } = a.area; const g = { left: [0, 0, AW / 2, AH], right: [AW / 2, 0, AW / 2, AH], top: null }[a.side]; if (!g) return upd(a.id, (w) => ({ max: true, prev: w.prev || { x: w.x, y: w.y, w: w.w, h: w.h } })); return upd(a.id, (w) => ({ x: g[0], y: g[1], w: g[2], h: g[3], max: false, snap: a.side, prev: w.snap ? w.prev : { x: w.x, y: w.y, w: w.w, h: w.h } })); }
    case 'tile': { const vis = s.list.filter((w) => !w.min); if (!vis.length) return s; const { w: AW, h: AH } = a.area; const cols = Math.ceil(Math.sqrt(vis.length)), rows = Math.ceil(vis.length / cols); const cw = AW / cols, ch = AH / rows; const pos = new Map(vis.map((w, i) => [w.id, { x: Math.round((i % cols) * cw), y: Math.round(Math.floor(i / cols) * ch), w: Math.round(cw), h: Math.round(ch), max: false, snap: null }])); return { ...s, list: s.list.map((w) => (pos.has(w.id) ? { ...w, ...pos.get(w.id) } : w)) }; }
    case 'cascade': { let i = 0; return { ...s, list: s.list.map((w) => (w.min ? w : { ...w, x: 30 + 30 * i, y: 20 + 28 * i++, w: Math.min(w.w, a.area.w - 80), h: Math.min(w.h, a.area.h - 80), max: false, snap: null })) }; }
    case 'minimizeAll': return { ...s, list: s.list.map((w) => ({ ...w, min: true })), active: null };
    default: return s;
  }
}
