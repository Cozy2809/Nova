import React, { useEffect, useState } from 'react';
import { usePrefs, loadPrefs } from '../prefs.js';
import { onNv, useSystemTheme, useVisible } from './useNative.js';
import Panel from './Panel.jsx';
import NativeDock from './Dock.jsx';
import NativeTopbar from './Topbar.jsx';
import FlowMap from './FlowMap.jsx';
import '../desktop.css';
import './native.css';

// Una sola página para las tres capas nativas de Nova (panel, barra y dock); `mode` en la URL decide cuál.
export default function NativeApp() {
  const prefs = usePrefs(); const [ready, setReady] = useState(false), [state, setState] = useState('idle');
  const mode = new URLSearchParams(location.search).get('mode') || 'panel'; const visible = useVisible(); const sys = useSystemTheme(prefs);
  useEffect(() => { document.documentElement.classList.add('nova-widgets-page'); loadPrefs().finally(() => setReady(true)); const off = onNv('app-state', setState); return () => { off(); document.documentElement.classList.remove('nova-widgets-page'); }; }, []);
  const alpha = Math.max(30, Math.min(94, Number(prefs.nativeWidgets.opacity) || 62)) / 100;
  const style = { ...(sys.hue != null ? { '--h': sys.hue } : {}), '--native-alpha': alpha };
  const common = { 'data-theme': sys.theme, 'data-motion': prefs.nativeWidgets.animations === false ? 'off' : 'on', 'data-contrast': sys.contrast ? 'high' : 'normal', 'data-effects': prefs.shell.effects === 'light' ? 'light' : 'full', style };
  if (mode === 'flow') return <div className="nd nv nv-root nv-flowroot" {...common}><FlowMap /></div>;
  if (mode === 'dock') return <div className="nd nv nv-root nv-dockroot" {...common} data-visible={visible ? 1 : 0}><NativeDock state={state} /></div>;
  if (mode === 'topbar') return <div className="nd nv nv-root nv-barroot" {...common} data-visible={visible ? 1 : 0}><NativeTopbar state={state} /></div>;
  return <main className="nd nv nv-root nv-panel" {...common} data-idle={prefs.nativeWidgets.dimIdle !== false ? 1 : 0}><Panel state={state} ready={ready} /></main>;
}
