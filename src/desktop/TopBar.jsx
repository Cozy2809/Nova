import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { usePrefs } from './prefs.js';
import { useDesk, pct } from './util.js';

const STATE_TXT = { idle: 'En espera', listening: 'Escuchando', thinking: 'Pensando', speaking: 'Hablando', muted: 'Silenciada' };
const Meter = ({ v }) => <span className="nd-meter" data-hot={v >= 90 ? 1 : 0} aria-hidden="true"><i style={{ width: (v ?? 0) + '%' }} /></span>;

export default function TopBar({ state, onExit, onAssistantSettings, onSearch, activeTitle }) {
  const p = usePrefs(); const D = useDesk();
  const [now, setNow] = useState(new Date()); const [stats, setStats] = useState(null); const [online, setOnline] = useState(navigator.onLine); const [menu, setMenu] = useState('');
  const bar = useRef(null);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => window.jarvis?.onStats?.(setStats), []);
  useEffect(() => { const a = () => setOnline(true), b = () => setOnline(false); addEventListener('online', a); addEventListener('offline', b); return () => { removeEventListener('online', a); removeEventListener('offline', b); }; }, []);
  useEffect(() => { if (!menu) return undefined; const f = (e) => { if (!bar.current?.contains(e.target) && !e.target.closest?.('.nd-menu')) setMenu(''); }; addEventListener('pointerdown', f); return () => removeEventListener('pointerdown', f); }, [menu]);
  const cpu = pct(stats?.cpu), ram = pct(stats?.ram);
  const go = (fn) => () => { setMenu(''); fn(); };
  const toggleWidgets = async () => { try { const r = await window.jarvis.desktopWidgets('toggle'); if (r?.error) D.toast(r.error, 'err'); } catch (e) { D.toast(e.message || 'No se pudieron abrir los Widgets Windows.', 'err'); } };
  return (<header className="nd-bar nd-drag" ref={bar}>
    <button className="nd-chip nd-nodrag" aria-haspopup="menu" aria-expanded={menu === 'nova'} onClick={() => setMenu(menu === 'nova' ? '' : 'nova')}><Icon n="nova" s={16} /><span className="nd-brand">NOVA</span></button>
    <button className="nd-chip nd-nodrag" onClick={onSearch} title="Buscar (Ctrl+K)"><Icon n="search" s={15} />Buscar<span className="nd-key">Ctrl K</span></button>
    <span className="nd-chip nd-mut" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeTitle || ''}</span>
    <span className="nd-sp" />
    {p.bar.nova && <span className="nd-chip" title={'Nova: ' + (STATE_TXT[state] || state)}><span className="nd-state" data-s={state} />{STATE_TXT[state] || state}</span>}
    {p.bar.cpu && <button className="nd-chip nd-nodrag" onClick={() => D.open('system')} title="Uso de CPU">CPU <b>{cpu ?? 'N/D'}{cpu != null && ' %'}</b><Meter v={cpu} /></button>}
    {p.bar.ram && <button className="nd-chip nd-nodrag" onClick={() => D.open('system')} title="Uso de RAM">RAM <b>{ram ?? 'N/D'}{ram != null && ' %'}</b><Meter v={ram} /></button>}
    {p.bar.net && <button className="nd-chip nd-nodrag" onClick={() => D.open('system')} title={online ? 'Con conexión' : 'Sin conexión'}><Icon n="net" s={15} /><span className={online ? '' : 'nd-err'}>{online ? 'En línea' : 'Sin red'}</span></button>}
    <button className="nd-chip nd-nodrag" onClick={toggleWidgets} title="Widgets flotantes sobre el escritorio de Windows">Widgets Windows</button>
    <button className="nd-chip nd-nodrag" aria-haspopup="menu" aria-expanded={menu === 'win'} onClick={() => setMenu(menu === 'win' ? '' : 'win')} title="Ventanas"><Icon n="tile" s={15} /></button>
    <span className="nd-chip" title={now.toLocaleDateString('es-ES', { dateStyle: 'full' })}><b>{now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</b><span className="nd-mut">{now.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</span></span>
    <button className="nd-wbtn nd-nodrag" aria-label="Ajustes del escritorio" title="Ajustes del escritorio" onClick={() => D.open('settings')}><Icon n="gear" s={16} /></button>
    <button className="nd-wbtn nd-nodrag" aria-label="Minimizar" onClick={() => window.jarvis.win('min')}><Icon n="min" s={14} /></button>
    <button className="nd-wbtn x nd-nodrag" aria-label="Cerrar Nova" onClick={() => window.jarvis.win('close')}><Icon n="close" s={14} /></button>
    {menu === 'nova' && <div className="nd-menu nd-nodrag" role="menu" style={{ left: 8, top: 40 }}>
      <button role="menuitem" onClick={go(onExit)}><Icon n="nova" s={16} />Abrir el asistente</button>
      <button role="menuitem" onClick={go(onAssistantSettings)}><Icon n="gear" s={16} />Ajustes de Nova (IA, voz, modelos)</button>
      <hr /><button role="menuitem" onClick={go(() => D.open('settings'))}><Icon n="gear" s={16} />Ajustes del escritorio</button>
      <button role="menuitem" onClick={go(() => D.open('activity'))}><Icon n="pulse" s={16} />Actividad de Nova</button></div>}
    {menu === 'win' && <div className="nd-menu nd-nodrag" role="menu" style={{ right: 130, top: 40 }}>
      <div className="sub">Distribución de ventanas</div>
      <button role="menuitem" onClick={go(() => D.layout('tile'))}><Icon n="tile" s={16} />En mosaico</button>
      <button role="menuitem" onClick={go(() => D.layout('cascade'))}><Icon n="windows" s={16} />En cascada</button>
      <button role="menuitem" onClick={go(() => D.layout('minimizeAll'))}><Icon n="min" s={16} />Minimizar todo</button></div>}
  </header>);
}
