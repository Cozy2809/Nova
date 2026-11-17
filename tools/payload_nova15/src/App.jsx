import React, { useState, useEffect } from 'react';
import ChatCore from './components/ChatCore.jsx';
import SystemStats from './components/SystemStats.jsx';
import AudioOrb from './components/AudioOrb.jsx';
import Mascot from './components/Mascot.jsx';
import MemoryPanel from './components/MemoryPanel.jsx';
import Settings from './components/Settings.jsx';
import QuickActions from './components/QuickActions.jsx';
import MobileLink from './components/MobileLink.jsx';
// El color de toda la interfaz sigue el estado de NOVA (matiz HSL): espera, escucha, piensa, habla, silenciada
const HUE = { idle: 192, listening: 168, thinking: 262, speaking: 205, muted: 350 };
export default function App() {
  const [cfg, setCfg] = useState(false); const [speak, setSpeak] = useState(null); // null = cargando ajustes
  const [st, setSt] = useState('idle'); const [menu, setMenu] = useState(false); const [w, setW] = useState(window.innerWidth);
  useEffect(() => { window.jarvis.getSettings().then(s => setSpeak(s.voiceOn !== 'false')).catch(() => setSpeak(true)); }, []);
  useEffect(() => { const k = (e) => { if (e.ctrlKey && e.key === ',') setCfg(c => !c); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []);
  useEffect(() => { const f = (e) => setSt(e.detail); window.addEventListener('jarvis-state', f); return () => window.removeEventListener('jarvis-state', f); }, []);
  useEffect(() => { const f = () => setW(window.innerWidth); addEventListener('resize', f); return () => removeEventListener('resize', f); }, []);
  useEffect(() => { document.documentElement.style.setProperty('--h', HUE[st] ?? 192); }, [st]);
  const toggleVoice = () => { const v = !speak; setSpeak(v); window.jarvis.setSettings({ voiceOn: v }); if (!v) window.jarvis.stop(); };
  const win = (a) => { setMenu(false); window.jarvis.win(a); };
  return (<div className="nova-root h-screen flex flex-col p-4 gap-3" data-state={st}>
    <div className="nova-bg" aria-hidden="true" />
    <header className="nova-head drag flex justify-between items-center">
      <div className="flex items-center gap-3"><div className="nova-logo" /><h1 className="nova-title">NOVA</h1><span className="nova-tag">asistente personal</span></div>
      <div className="nodrag flex items-center gap-2">
        <button className={'pill' + (speak ? ' pill-on' : '')} onClick={toggleVoice} aria-pressed={!!speak}>VOZ {speak ? 'ON' : 'OFF'}</button>
        <button className={'pill' + (cfg ? ' pill-on' : '')} onClick={() => setCfg(!cfg)}>AJUSTES</button>
        <div className="relative"><button className="pill" onClick={() => setMenu(!menu)} aria-expanded={menu}>VENTANA ▾</button>
          {menu && <div className="menu" onMouseLeave={() => setMenu(false)}>
            <button onClick={() => win('hide')} title="Seguir en la bandeja del sistema">Segundo plano</button>
            <button onClick={() => win('float')}>Widget flotante</button>
            <button onClick={() => win('full')}>Pantalla completa</button></div>}</div>
        <button className="wbtn" onClick={() => win('min')} title="Minimizar" aria-label="Minimizar">—</button>
        <button className="wbtn wbtn-x" onClick={() => win('close')} title="Cerrar" aria-label="Cerrar">✕</button></div></header>
    <main className="nova-main flex-1 min-h-0">
      <aside className="side space-y-4 overflow-y-auto overflow-x-hidden px-1"><Mascot /><SystemStats /></aside>
      <section className="min-h-0 flex flex-col gap-2">
        {!cfg && <div className="orb-stage"><AudioOrb size={w < 820 ? 170 : 270} big /></div>}
        {cfg && <div className="flex-1 min-h-0 overflow-y-auto pr-1"><Settings onClose={() => setCfg(false)} /></div>}
        {speak !== null && <div className={cfg ? 'hidden' : 'flex-1 min-h-0'}><ChatCore speakOn={speak} /></div>}
      </section>
      <aside className="side flex flex-col gap-4 min-h-0 overflow-y-auto overflow-x-hidden px-1"><MobileLink /><MemoryPanel /><QuickActions /></aside></main>
    <footer className="text-xs opacity-50 text-center">Ollama local · Ctrl+M hablar · Esc callar · Ctrl+, ajustes</footer></div>);
}
