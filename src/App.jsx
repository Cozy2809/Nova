import React, { useState, useEffect } from 'react';
import ChatCore from './components/ChatCore.jsx';
import SystemStats from './components/SystemStats.jsx';
import AudioOrb from './components/AudioOrb.jsx';
import Mascot from './components/Mascot.jsx';
import MemoryPanel from './components/MemoryPanel.jsx';
import Settings from './components/Settings.jsx';
import QuickActions from './components/QuickActions.jsx';
import MobileLink from './components/MobileLink.jsx';
import LibraryPanel from './components/LibraryPanel.jsx';
import Overlays from './components/Overlays.jsx';
import { nv } from './utils/nova.js';
import DesktopShell from './desktop/DesktopShell.jsx';
import InitialSetup from './components/InitialSetup.jsx';
// El color de toda la interfaz sigue el estado de NOVA (matiz HSL): espera, escucha, piensa, habla, silenciada
const HUE = { idle: 192, listening: 168, thinking: 262, speaking: 205, muted: 350 };
export default function App() {
  const [cfg, setCfg] = useState(false); const [speak, setSpeak] = useState(null); // null = cargando ajustes
  const [perf, setPerf] = useState('auto');
  const [desk, setDesk] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  useEffect(() => { window.jarvis.getSettings().then((s) => { try { if (JSON.parse(s['desk.prefs'] || '{}').startInDesktop) setDesk(true); } catch {} if (s.setupComplete !== 'true') setSetupOpen(true); }).catch(() => {}); }, []);
  const [modes, setModes] = useState(false); const [discord, setDiscord] = useState(false); const [musicOn, setMusicOn] = useState(false); const [island, setIsland] = useState(false);
  const [music, setMusic] = useState({ playing: false, label: '' }); const [islandUi, setIslandUi] = useState('');
  const [st, setSt] = useState('idle'); const [menu, setMenu] = useState(false); const [w, setW] = useState(window.innerWidth);
  useEffect(() => { const load = () => window.jarvis.getSettings().then((s) => setSpeak(s.voiceOn !== 'false')).catch(() => setSpeak(true)); load(); window.addEventListener('nova-settings', load); return () => window.removeEventListener('nova-settings', load); }, []);
  useEffect(() => {
    const load = () => window.jarvis.getSettings().then((s) => { const m = ['auto', 'ahorro', 'normal'].includes(s.perfMode) ? s.perfMode : 'auto'; setPerf(m); document.documentElement.dataset.perf = m; }).catch(() => {});
    load(); window.addEventListener('nova-settings', load); return () => window.removeEventListener('nova-settings', load);
  }, []);
  useEffect(() => window.jarvis.onVoiceEvent?.((m) => {
    if (m.event === 'loopback') setDiscord(m.state === 'on');
    else if (m.event === 'musicmode') setMusicOn(m.state === 'on');
    else if (m.event === 'music') setMusic((p) => (p.playing === !!m.playing ? p : { playing: !!m.playing, label: m.playing ? p.label : '' }));
  }), []);
  useEffect(() => { nv('island:get').then((r) => setIsland(!!r.on)); window.jarvis.getSettings().then((s) => { if (s.musicMode === 'true') setTimeout(() => nv('music:set', { on: true }), 7000); }).catch(() => {}); }, []);
  useEffect(() => {
    if (!musicOn || !music.playing) return; let on = true;
    const load = async () => { const r = await nv('music:now'); if (on && !r.error) setMusic((p) => (p.label === (r.label || '') ? p : { ...p, label: r.label || '' })); };
    load(); const t = setInterval(load, 8000); return () => { on = false; clearInterval(t); };
  }, [musicOn, music.playing]);
  useEffect(() => {
    const playing = musicOn && music.playing; window.dispatchEvent(new CustomEvent('nova-music', { detail: { playing, label: music.label } }));
    nv('island:state', { st, music: playing ? (music.label || 'música') : '' });
  }, [st, musicOn, music]);
  useEffect(() => window.jarvis.onNova?.('island-ui', (d) => {
    const phase = d?.phase || 'reset';
    if (phase === 'reset') { document.body.classList.remove('nova-island-window'); setIslandUi(''); return; }
    document.body.classList.add('nova-island-window');
    setIslandUi(phase === 'exit' ? 'exit' : 'enter');
  }), []);
  const toggleDiscord = async () => { setModes(false); const r = await window.jarvis.toggleLoopback(); if (r && typeof r.on === 'boolean') setDiscord(r.on); };
  const toggleMusic = async () => { setModes(false); const on = !musicOn; setMusicOn(on); await nv('music:set', { on }); window.jarvis.setSettings({ musicMode: on }); if (!on) setMusic({ playing: false, label: '' }); };
  const toggleIsland = async () => { setMenu(false); const r = await nv('island:toggle'); if (r && typeof r.on === 'boolean') setIsland(r.on); };
  useEffect(() => { const k = (e) => { if (e.ctrlKey && e.key === ',') setCfg(c => !c); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []);
  useEffect(() => { const f = (e) => setSt(e.detail); window.addEventListener('jarvis-state', f); return () => window.removeEventListener('jarvis-state', f); }, []);
  useEffect(() => { const f = (e) => window.jarvis.desktopWidgets('state', { state: e.detail }).catch(() => {}); window.addEventListener('jarvis-state', f); return () => window.removeEventListener('jarvis-state', f); }, []);
  useEffect(() => { const f = () => setW(window.innerWidth); addEventListener('resize', f); return () => removeEventListener('resize', f); }, []);
  useEffect(() => { document.documentElement.style.setProperty('--h', HUE[st] ?? 192); }, [st]);
  const toggleVoice = () => { const v = !speak; setSpeak(v); window.jarvis.setSettings({ voiceOn: v }); if (!v) window.jarvis.stop(); };
  const win = (a) => { setMenu(false); window.jarvis.win(a); };
  return (<><div className={'nova-root h-screen flex flex-col p-4 gap-3' + (islandUi ? ' nova-island-' + islandUi : '') + (desk ? ' nova-desk-on' : '')} data-state={st}>
    <div className="nova-bg" aria-hidden="true" />
    <header className="nova-head drag flex justify-between items-center">
      <div className="flex items-center gap-3"><div className="nova-logo" /><h1 className="nova-title">NOVA</h1><span className="nova-tag">asistente personal</span></div>
      <div className="nodrag flex items-center gap-2">
        <button className={'pill' + (speak ? ' pill-on' : '')} onClick={toggleVoice} aria-pressed={!!speak}>VOZ {speak ? 'ON' : 'OFF'}</button>
        <button className={'pill' + (desk ? ' pill-on' : '')} onClick={() => setDesk(!desk)} aria-pressed={desk}>ESCRITORIO</button>
        <button className="pill" onClick={() => window.jarvis.desktopWidgets('toggle')} title="Mostrar widgets sobre el escritorio de Windows">WIDGETS WINDOWS</button>
        <button className={'pill' + (cfg ? ' pill-on' : '')} onClick={() => setCfg(!cfg)}>AJUSTES</button>
        <div className="relative"><button className="pill" onClick={() => setMenu(!menu)} aria-expanded={menu}>VENTANA ▾</button>
          {menu && <div className="menu" onMouseLeave={() => setMenu(false)}>
            <button onClick={() => win('hide')} title="Seguir en la bandeja del sistema">Segundo plano</button>
            <button onClick={() => win('float')}>Widget flotante</button>
            <button onClick={() => win('free')}>Ventana suelta</button>
            <button onClick={toggleIsland}>{island ? '✓ ' : ''}Isla emergente</button>
            <button onClick={() => win('full')}>Pantalla completa</button></div>}</div>
        <div className="relative"><button className={'pill' + (discord || musicOn ? ' pill-on' : '')} onClick={() => setModes(!modes)} aria-expanded={modes}>MODOS ▾</button>
          {modes && <div className="menu" onMouseLeave={() => setModes(false)}>
            <button onClick={toggleDiscord}>{discord ? '✓ ' : ''}🎧 Modo Discord (escucha el escritorio)</button>
            <button onClick={toggleMusic}>{musicOn ? '✓ ' : ''}🎵 Reaccionar a la música</button></div>}</div>
        <button className="wbtn" onClick={() => win('min')} title="Minimizar" aria-label="Minimizar">—</button>
        <button className="wbtn wbtn-x" onClick={() => win('close')} title="Cerrar" aria-label="Cerrar">✕</button></div></header>
    <main className="nova-main flex-1 min-h-0">
      <aside className="side space-y-4 overflow-y-auto overflow-x-hidden px-1">{perf !== 'ahorro' && <Mascot />}<SystemStats /></aside>
      <section className="min-h-0 flex flex-col gap-2">
        {!cfg && <div className="orb-stage"><AudioOrb size={w < 820 ? 170 : 270} big /></div>}
        {cfg && <div className="flex-1 min-h-0 overflow-y-auto pr-1"><Settings onClose={() => setCfg(false)} onStartSetup={() => setSetupOpen(true)} /></div>}
        {!desk && speak !== null && <div className={cfg ? 'hidden' : 'flex-1 min-h-0'}><ChatCore speakOn={speak} /></div>}
      </section>
      <aside className="side flex flex-col gap-4 min-h-0 overflow-y-auto overflow-x-hidden px-1"><MobileLink /><LibraryPanel /><MemoryPanel /><QuickActions /></aside></main>
    {desk && <DesktopShell state={st} speakOn={!!speak} onExit={() => setDesk(false)} onAssistantSettings={() => { setDesk(false); setCfg(true); }} />}
    <Overlays />
    <footer className="text-xs opacity-50 text-center">Ollama local · Ctrl+M hablar · Esc callar · Ctrl+, ajustes</footer></div>
    {setupOpen && <InitialSetup onDone={(startDesktop) => { setSetupOpen(false); if (startDesktop) setDesk(true); }} />}</>);
}
