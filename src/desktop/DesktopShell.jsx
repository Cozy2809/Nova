import { useSystemTheme } from './native/useNative.js';
import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import './desktop.css';
import { DeskCtx } from './util.js';
import { usePrefs, loadPrefs, prefsLoaded } from './prefs.js';
import { startAgentEvents } from './agent.js';
import { reducer, initial, APP_DEFS } from './windows.js';
import TopBar from './TopBar.jsx';
import Dock from './Dock.jsx';
import StartMenu from './StartMenu.jsx';
import WindowFrame from './WindowFrame.jsx';
import ConfirmHost from './ConfirmHost.jsx';
import AskDialog from './AskDialog.jsx';
import WidgetLayer from './widgets/Widgets.jsx';
import Explorer from './apps/Explorer.jsx';
import Media from './apps/Media.jsx';
import SystemPanel from './apps/SystemPanel.jsx';
import Activity from './apps/Activity.jsx';
import DeskSettings from './apps/DeskSettings.jsx';
import AssistantChat from './apps/AssistantChat.jsx';

const BODY = { assistant: AssistantChat, explorer: Explorer, media: Media, system: SystemPanel, activity: Activity, settings: DeskSettings };

// Nova Desktop: vista de escritorio dentro de la ventana de Nova. El HUD del asistente sigue montado debajo (voz y chat no se pierden).
export default function DesktopShell({ state = 'idle', speakOn = true, onExit, onAssistantSettings }) {
  const prefs = usePrefs(); const [ready, setReady] = useState(prefsLoaded());
  const [wins, dispatch] = useReducer(reducer, initial); const [start, setStart] = useState(false);
  const [area, setArea] = useState({ w: innerWidth, h: innerHeight - 38 }); const areaRef = useRef(null);
  const [toasts, setToasts] = useState([]); const [askReq, setAskReq] = useState(null); const askRes = useRef(null); const [snap, setSnap] = useState(null);

  useEffect(() => { startAgentEvents(); if (!prefsLoaded()) loadPrefs().then(() => setReady(true)); }, []);
  useEffect(() => {
    const el = areaRef.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setArea({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [ready]);
  useEffect(() => { const k = (e) => { if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setStart((s) => !s); } }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []);

  const toast = useCallback((msg, kind) => { const id = Math.random(); setToasts((t) => [...t.slice(-2), { id, msg, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500); }, []);
  const ask = useCallback((req) => new Promise((res) => { askRes.current = res; setAskReq(req); }), []);
  const doneAsk = (v) => { setAskReq(null); askRes.current?.(v); askRes.current = null; };
  const ctx = useMemo(() => ({
    open: (app, props) => { if (!APP_DEFS[app]) return; dispatch({ type: 'open', app, props, area: { w: areaRef.current?.clientWidth || area.w, h: areaRef.current?.clientHeight || area.h } }); },
    layout: (type) => { if (!wins.list.some((w) => !w.min)) { toast('Abre primero una ventana de Nova para usar esta distribución.'); return; } dispatch({ type, area }); }, toast, ask,
  }), [area, wins.list, toast, ask]);

  const sys = useSystemTheme(prefs);
  if (!ready) return <div className="nd" data-theme="dark"><div className="nd-empty"><span className="nd-spin" />Cargando el escritorio…</div></div>;
  const active = wins.list.find((w) => w.id === wins.active);
  const snapBox = snap && ({ left: { left: 0, top: 0, width: area.w / 2, height: area.h }, right: { left: area.w / 2, top: 0, width: area.w / 2, height: area.h }, top: { left: 0, top: 0, width: area.w, height: area.h } })[snap];
  const style = sys.hue != null ? { '--h': sys.hue } : undefined;
  const pad = prefs.dock.pos === 'bottom' ? { bottom: prefs.dock.size + 38 } : prefs.dock.pos === 'left' ? { left: prefs.dock.size + 36 } : { right: prefs.dock.size + 36 };

  // Portal al <body>: el HUD aplica reglas a todos los hijos de .nova-root que romperían la capa fija del escritorio
  return createPortal(<DeskCtx.Provider value={ctx}>
    <div className="nd" data-theme={sys.theme} style={style}>
      <div className="nd-wall" data-w={prefs.wallpaper} aria-hidden="true" />
      <WidgetLayer area={area} />
      <TopBar state={state} onExit={onExit} onAssistantSettings={onAssistantSettings} onSearch={() => setStart(true)} activeTitle={active?.title} />
      <div className="nd-area" ref={areaRef} onPointerDown={(e) => { if (e.target === e.currentTarget && start) setStart(false); }}>
        {wins.list.map((w) => { const B = BODY[w.app]; return <WindowFrame key={w.id} w={w} active={wins.active === w.id} area={area} dispatch={dispatch} onSnapPreview={setSnap}>{w.app === 'assistant' ? <B speakOn={speakOn} /> : <B props={w.props} />}</WindowFrame>; })}
        {snapBox && <div className="nd-snap" style={snapBox} />}
      </div>
      <Dock windows={wins.list} onExit={onExit} onStart={() => setStart((s) => !s)} />
      {start && <StartMenu onClose={() => setStart(false)} onExit={onExit} onAssistantSettings={onAssistantSettings} />}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, pointerEvents: 'none', zIndex: 80 }}>
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', ...(prefs.dock.pos === 'bottom' ? { bottom: prefs.dock.size + 36 } : { bottom: 24 }) }} role="status" aria-live="polite">
          {toasts.map((t) => <div key={t.id} className={'nd-note ' + (t.kind === 'err' ? 'err' : '')} style={{ background: 'var(--surf)', boxShadow: 'var(--shadow)', maxWidth: 480 }}>{t.msg}</div>)}</div></div>
      <ConfirmHost />
      <AskDialog req={askReq} onDone={doneAsk} />
    </div>
  </DeskCtx.Provider>, document.body);
}
