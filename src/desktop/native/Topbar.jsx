import React, { useEffect, useRef, useState } from 'react';
import { usePrefs } from '../prefs.js';
import { nv, useNotices, useToast, useWindows, useReportWidth } from './useNative.js';
import { Glyph } from './Glyph.jsx';

const STATE_TXT = { idle: 'Disponible', listening: 'Escuchando', thinking: 'Pensando', speaking: 'Hablando', muted: 'Silenciada' };
const useStats = () => { const [s, set] = useState(null); useEffect(() => window.jarvis.onStats?.(set), []); return s; };

// Barra superior secundaria: compacta por defecto para no tapar los botones de las ventanas maximizadas.
export default function NativeTopbar({ state }) {
  const prefs = usePrefs(), cfg = prefs.nativeWidgets.topbar; const ref = useRef(null);
  const [now, setNow] = useState(new Date()); const { unread } = useNotices(); const { toast, dismiss } = useToast();
  const wins = useWindows(cfg.showActive); const stats = useStats(); const active = wins.find((w) => w.active && !w.minimized);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  useReportWidth(ref, [toast && toast.id, cfg.showStatus, cfg.showTalk, cfg.showWidgets, cfg.showDock, cfg.showClock, cfg.showBell, cfg.showActive, cfg.showSystem, cfg.showStart, active && active.title, cfg.width]);
  const open = () => { window.jarvis.desktopWidgets('show'); dismiss(); };
  return <div className="nv-bar" ref={ref} data-mode={cfg.width} data-level={toast ? toast.level : ''}>
    <button type="button" className="nv-brand" title="Abrir Nova" onClick={() => window.jarvis.desktopWidgets('open-nova')}><i data-state={state} />NOVA</button>
    {cfg.showStatus && <span className="nv-status">{STATE_TXT[state] || 'Disponible'}</span>}
    {cfg.showActive && active && <span className="nv-active" title={active.title}>{active.name}</span>}
    {toast && cfg.showNotifications !== false && <button type="button" className="nv-toast" data-level={toast.level} onClick={open} title="Abrir el centro de avisos"><b>{toast.title}</b><span>{toast.message}</span></button>}
    {cfg.width === 'full' && <span className="nv-grow" />}
    {cfg.showSystem && stats && <span className="nv-sysmini" title="CPU y RAM">CPU {Math.round(stats.cpu)}% · RAM {Math.round(stats.ram)}%</span>}
    {cfg.showTalk && <button type="button" className="nv-act" title="Hablar con Nova" aria-label="Hablar con Nova" onClick={() => window.jarvis.desktopWidgets('talk')}><Glyph n="mic" s={17} /></button>}
    {cfg.showWidgets && <button type="button" className="nv-act" title="Widgets" aria-label="Widgets" onClick={() => window.jarvis.desktopWidgets('toggle')}><Glyph n="widgets" s={17} /></button>}
    {cfg.showDock && <button type="button" className="nv-act" title="Dock de Nova" aria-label="Dock de Nova" onClick={() => window.jarvis.desktopWidgets('dock-show')}><Glyph n="desktop" s={17} /></button>}
    {cfg.showStart && <button type="button" className="nv-act" title="Menú Inicio de Windows" aria-label="Menú Inicio de Windows" onClick={() => nv('shell-action', { action: 'start' })}><Glyph n="start" s={17} /></button>}
    {cfg.showBell && <button type="button" className="nv-act nv-bell" title={unread ? `${unread} avisos sin leer` : 'Centro de avisos'} aria-label="Centro de avisos" onClick={open}><Glyph n="bell" s={17} />{unread > 0 && <i className="nv-badge">{unread > 9 ? '9+' : unread}</i>}</button>}
    {cfg.showClock && <span className="nv-clock" title={now.toLocaleDateString('es-ES', { dateStyle: 'full' })}>{now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · {now.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>}
  </div>;
}
