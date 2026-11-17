// Ganchos compartidos por el panel, la barra y el dock nativos de Nova.
import { useEffect, useRef, useState, useCallback } from 'react';

const nv = (ch, d) => window.jarvis.nova(ch, d);
export { nv };
export const onNv = (ch, cb) => window.jarvis.onNova(ch, cb);

/** Centro de avisos: la fuente de verdad vive en el proceso principal (sobrevive a cerrar ventanas y reinicios). */
export function useNotices() {
  const [s, setS] = useState({ items: [], unread: 0 });
  useEffect(() => { let on = true; nv('notices-get').then((r) => on && r && !r.error && setS(r)).catch(() => {}); const off = onNv('notices', (r) => setS({ items: r.items || [], unread: r.unread || 0 })); return () => { on = false; off(); }; }, []);
  return { ...s, read: (id = 'all') => nv('notices-read', { id }), dismiss: (id) => nv('notices-dismiss', { id }), clear: () => nv('notices-clear') };
}
/** Avisos emergentes: se muestran de uno en uno, con duración según su nivel. */
export function useToast() {
  const [cur, setCur] = useState(null); const queue = useRef([]); const timer = useRef(null); const showing = useRef(false);
  const next = useCallback(() => { clearTimeout(timer.current); const n = queue.current.shift() || null; showing.current = !!n; setCur(n); if (n) timer.current = setTimeout(next, n.level === 'err' || n.level === 'warn' ? 8000 : 5200); }, []);
  useEffect(() => { const off = onNv('toast', (n) => { queue.current.push(n); if (queue.current.length > 4) queue.current.shift(); if (!showing.current) next(); }); return () => { off(); clearTimeout(timer.current); }; }, [next]);
  return { toast: cur, dismiss: next };
}
const hueOf = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null; const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return null; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return Math.round((h * 60 + 360) % 360); };
/** Tema y acento: "Sistema" sigue el modo claro/oscuro y el color de acento de Windows. */
export function useSystemTheme(prefs) {
  const [sys, setSys] = useState({ dark: true, accent: '', contrast: false });
  useEffect(() => { let on = true; nv('system-theme').then((r) => on && r && !r.error && setSys(r)).catch(() => {}); const off = onNv('system-theme', setSys); return () => { on = false; off(); }; }, []);
  const theme = prefs.theme === 'system' ? (sys.dark ? 'dark' : 'light') : prefs.theme;
  const sysHue = prefs.accent === 'system' ? hueOf(sys.accent) : null;
  const hue = sysHue != null ? sysHue : prefs.accent === 'fixed' ? prefs.accentHue : null;
  return { theme, hue, contrast: sys.contrast };
}
export function useVisible() { const [v, setV] = useState(true); useEffect(() => onNv('shell-visibility', (d) => setV(d.visible !== false)), []); return v; }
/** Ventanas abiertas de Windows (las envía el vigilante del shell; solo se piden si el módulo está activo). */
export function useWindows(enabled) {
  const [list, setList] = useState([]);
  useEffect(() => { if (!enabled) { setList([]); return undefined; } let on = true; nv('windows-list').then((r) => on && r && r.windows && setList(r.windows)).catch(() => {}); const off = onNv('shell-state', (s) => on && s.windows && setList(s.windows)); return () => { on = false; off(); }; }, [enabled]);
  return list;
}
const iconCache = new Map();
/** Icono real de un acceso fijado o de una ventana (null mientras carga o si no hay: se muestra la inicial). */
export function useIcon(kind, key) {
  const id = kind + ':' + key; const [url, setUrl] = useState(iconCache.get(id) || null);
  useEffect(() => { if (iconCache.has(id)) { setUrl(iconCache.get(id)); return undefined; } let on = true; nv('icon', kind === 'pin' ? { kind, key } : { kind, pid: key }).then((r) => { if (r?.icon) { iconCache.set(id, r.icon); if (on) setUrl(r.icon); } }).catch(() => {}); return () => { on = false; }; }, [id, kind, key]);
  return url;
}
/** Informa al proceso principal del ancho real del contenido para que la ventana se ajuste a él. */
export function useReportWidth(ref, deps = []) {
  useEffect(() => { const el = ref.current; if (!el) return undefined; let last = 0; const send = () => { const w = Math.ceil(el.getBoundingClientRect().width); if (w && Math.abs(w - last) > 1) { last = w; nv('bar-size', { width: w }).catch(() => {}); } }; const ro = new ResizeObserver(send); ro.observe(el); send(); return () => ro.disconnect(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
export const fmtTime = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
export const fmtWhen = (t) => { const d = new Date(t), today = new Date(); const same = d.toDateString() === today.toDateString(); return same ? fmtTime(t) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' · ' + fmtTime(t); };
