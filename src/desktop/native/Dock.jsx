import React, { useEffect, useRef, useState } from 'react';
import { usePrefs } from '../prefs.js';
import { nv, useWindows, useIcon, useReportWidth, useNotices } from './useNative.js';
import { Glyph } from './Glyph.jsx';

const letterOf = (s) => (s || '•').trim().slice(0, 1).toUpperCase();
function Tile({ title, onClick, onContext, active, running, minimized, label, children, badge }) {
  return <button type="button" className="nv-tile" data-active={active ? 1 : 0} data-running={running ? 1 : 0} data-min={minimized ? 1 : 0} title={title} aria-label={title} onClick={onClick} onContextMenu={(e) => { e.preventDefault(); onContext && onContext(); }}>
    {children}{badge > 0 && <i className="nv-badge">{badge > 9 ? '9+' : badge}</i>}{label && <small>{label}</small>}</button>;
}
function PinTile({ pin, labels }) {
  const key = pin.appId || pin.path; const icon = useIcon('pin', key);
  return <Tile title={pin.name} label={labels ? pin.name : ''} onClick={() => nv('launch-pin', { key })} onContext={() => nv('shell-menu', { kind: 'pin', key })}>
    {icon ? <img src={icon} alt="" draggable="false" /> : pin.type === 'folder' ? <Glyph n="folder" /> : pin.type === 'file' ? <Glyph n="file" /> : <span className="nv-letter">{letterOf(pin.name)}</span>}</Tile>;
}
function WinTile({ w, labels }) {
  const icon = useIcon('window', w.pid);
  const click = () => nv('window-action', { pid: w.pid, action: w.active && !w.minimized ? 'minimize' : 'focus' });
  return <Tile title={`${w.name} — ${w.title}`} label={labels ? w.name : ''} running active={w.active && !w.minimized} minimized={w.minimized} onClick={click} onContext={() => nv('shell-menu', { kind: 'window', pid: w.pid })}>
    {icon ? <img src={icon} alt="" draggable="false" /> : <span className="nv-letter">{letterOf(w.name)}</span>}</Tile>;
}

// Dock nativo de Nova: capa propia sobre el área de la barra de tareas. No sustituye la barra de Windows.
export default function NativeDock({ state }) {
  const prefs = usePrefs(), cfg = prefs.nativeWidgets.dockbar; const ref = useRef(null);
  const wins = useWindows(cfg.showRunning).slice(0, 10); const { unread } = useNotices();
  const pins = cfg.showPins ? prefs.dock.pins.slice(0, 8) : [];
  const sys = (action) => () => nv('shell-action', { action });
  useReportWidth(ref, [pins.length, wins.length, cfg.showRunning, cfg.showSystem, cfg.showWidgets, cfg.showTalk, cfg.labels, cfg.size, cfg.showPins]);
  return <nav className="nv-dock" ref={ref} aria-label="Dock de Nova" data-labels={cfg.labels ? 1 : 0} data-size={cfg.size || 'normal'} onContextMenu={(e) => { e.preventDefault(); nv('shell-menu', { kind: 'dock' }); }}>
    <Tile title="Abrir Nova" onClick={() => window.jarvis.desktopWidgets('open-nova')} active={false} badge={unread}><span className="nv-orb" data-state={state}>N</span></Tile>
    {cfg.showTalk && <Tile title="Hablar con Nova" onClick={() => window.jarvis.desktopWidgets('talk')}><Glyph n="mic" /></Tile>}
    {cfg.showWidgets && <Tile title="Widgets" onClick={() => window.jarvis.desktopWidgets('toggle')}><Glyph n="widgets" /></Tile>}
    {pins.length > 0 && <span className="nv-sep" />}
    {pins.map((x) => <PinTile key={x.type + (x.appId || x.path)} pin={x} labels={cfg.labels} />)}
    {cfg.showRunning && wins.length > 0 && <span className="nv-sep" />}
    {cfg.showRunning && wins.map((w) => <WinTile key={w.pid} w={w} labels={cfg.labels} />)}
    {cfg.showSystem && <><span className="nv-sep" />
      <Tile title="Menú Inicio de Windows" onClick={sys('start')}><Glyph n="start" /></Tile>
      <Tile title="Vista de tareas" onClick={sys('taskview')}><Glyph n="tasks" /></Tile>
      <Tile title="Mostrar escritorio" onClick={sys('desktop')}><Glyph n="desktop" /></Tile></>}
  </nav>;
}
