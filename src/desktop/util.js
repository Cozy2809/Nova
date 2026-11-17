import { createContext, useContext } from 'react';
export const DeskCtx = createContext(null);
export const useDesk = () => useContext(DeskCtx);

export const fmtSize = (n) => (n == null ? '' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(1) + ' GB');
export const fmtDate = (t) => (t ? new Date(t).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
export const fmtDur = (s) => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
export const baseName = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || String(p || '');
export const hueOf = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const pct = (v) => (Number.isFinite(v) ? Math.round(v) : null);
export const sameKey = (a, b) => a.type === b.type && (a.appId || a.path) === (b.appId || b.path);
