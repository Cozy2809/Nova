import React, { useEffect, useMemo, useState } from 'react';
import { usePrefs } from '../prefs.js';
import { Clock, Hardware, Network, Notes } from '../widgets/Widgets.jsx';
import MusicCard from './MusicCard.jsx';
import AudioOrb from '../../components/AudioOrb.jsx';
import { startAgentEvents, useAgentStore } from '../agent.js';
import Icon from '../Icon.jsx';
import ShellSettings from './ShellSettings.jsx';
import { Glyph } from './Glyph.jsx';
import { nv, useNotices, useIcon, fmtWhen } from './useNative.js';

const Card = ({ icon, title, action, children }) => <div className="nv-card"><h5><Icon n={icon} s={14} />{title}{action}</h5>{children}</div>;

function Activity() {
  const { feed } = useAgentStore(); const status = (s) => (s === 'succeeded' ? 'Hecho' : s === 'failed' ? 'Falló' : s === 'cancelled' ? 'Cancelado' : 'En curso');
  return <Card icon="pulse" title="Actividad de Nova">{feed.length ? feed.slice(0, 4).map((a) => <div className="nv-line" key={a.id}><i data-s={a.state} /><span>{a.summary || a.tool}</span><small>{status(a.state)}</small></div>) : <div className="nd-mut">Lista para echarte una mano.</div>}</Card>;
}
function QuickItem({ x }) { const key = x.appId || x.path, icon = useIcon('pin', key); const [err, setErr] = useState('');
  return <button className="nv-quick" title={err || x.name} onClick={async () => { const r = await nv('launch-pin', { key }); setErr(r?.error || ''); }}>{icon ? <img src={icon} alt="" /> : <span>{(x.name || '•').slice(0, 1).toUpperCase()}</span>}<small>{x.name}</small></button>; }
function Quick() {
  const prefs = usePrefs(); const items = prefs.dock.pins.slice(0, 8);
  return <Card icon="pin" title="Accesos rápidos">{items.length ? <div className="nv-quickgrid">{items.map((x) => <QuickItem key={x.type + (x.appId || x.path)} x={x} />)}</div> : <div className="nd-mut">Fija aplicaciones, archivos o carpetas en el dock de Nova.</div>}</Card>;
}
function Notices() {
  const { items, unread, read, dismiss, clear } = useNotices();
  useEffect(() => { if (!unread) return undefined; const t = setTimeout(() => { if (document.hasFocus()) read('all'); }, 2500); return () => clearTimeout(t); }, [unread]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Card icon="pulse" title="Centro de avisos" action={<span className="nv-head-actions">{unread > 0 && <button onClick={() => read('all')}>Marcar leídos</button>}<button onClick={clear} disabled={!items.length}>Limpiar</button></span>}>
    {items.length ? <div className="nv-feed">{items.slice(0, 20).map((n) => <article className="nv-notice" data-level={n.level} data-read={n.read ? 1 : 0} key={n.id} onClick={() => !n.read && read(n.id)}>
      <i /><div><b>{n.title}{n.count > 1 && <em> ×{n.count}</em>}</b><span>{n.message}</span><small>{n.source} · {fmtWhen(n.at)}</small></div>
      <button aria-label="Descartar aviso" onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}><Glyph n="close" s={12} /></button></article>)}</div> : <div className="nd-mut">Sin avisos. Los de Nova y del móvil quedan guardados aquí.</div>}</Card>;
}
const Orb = () => <Card icon="pulse" title="Nova"><div className="nd-native-orb"><AudioOrb size={132} /></div></Card>;
const Talk = () => <button className="nv-talk" onClick={() => window.jarvis.desktopWidgets('talk')}><Glyph n="mic" s={18} /> Hablar con Nova</button>;
function MapW() {
  const [loc, setLoc] = useState(null), [state, setState] = useState('Pulsa para pedir tu ubicación.'), [busy, setBusy] = useState(false);
  const locate = async () => {
    setBusy(true); setLoc(null);
    try {
      const permit = await window.jarvis.desktopWidgets('location-consent'); if (!permit.allowed) { setState('Ubicación desactivada.'); setBusy(false); return; }
      if (!navigator.geolocation) { setState('Este equipo no ofrece geolocalización.'); setBusy(false); return; }
      setState('Buscando ubicación…');
      navigator.geolocation.getCurrentPosition(({ coords }) => { setLoc({ lat: coords.latitude, lon: coords.longitude }); setState('Ubicación actual'); setBusy(false); }, (e) => { setState(e.code === 1 ? 'Permiso de ubicación denegado.' : 'No se pudo obtener la ubicación.'); setBusy(false); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
    } catch { setState('No se pudo consultar la ubicación.'); setBusy(false); }
  };
  const src = useMemo(() => { if (!loc) return ''; const d = 0.012; return `https://www.openstreetmap.org/export/embed.html?bbox=${loc.lon - d}%2C${loc.lat - d}%2C${loc.lon + d}%2C${loc.lat + d}&layer=mapnik&marker=${loc.lat}%2C${loc.lon}`; }, [loc]);
  return <Card icon="pin" title="Mi ubicación">{loc ? <iframe className="nd-native-map" title="Mapa de tu ubicación" src={src} referrerPolicy="no-referrer" /> : <div className="nd-native-map-empty">{state}</div>}<button className="nd-btn" disabled={busy} onClick={locate}>{busy ? 'Buscando…' : loc ? 'Actualizar ubicación' : 'Permitir y mostrar mapa'}</button><small className="nd-native-privacy">Solo se consulta al pulsar. OpenStreetMap recibe las coordenadas para cargar el mapa.</small></Card>;
}
// Los widgets históricos ya traen su propia cabecera: se envuelven en la tarjeta común
const Wrap = (C) => function Wrapped() { return <div className="nv-card nv-legacy nd-wg"><C /></div>; };
const WIDGETS = { orb: Orb, talk: Talk, clock: Wrap(Clock), system: Wrap(Hardware), net: Wrap(Network), music: MusicCard, notes: Wrap(Notes), activity: Activity, quick: Quick, map: MapW, notifications: Notices };

export default function Panel({ state, ready }) {
  const prefs = usePrefs(), nw = prefs.nativeWidgets; const [open, setOpen] = useState(false), [hover, setHover] = useState(false);
  const { unread } = useNotices(); useEffect(() => { startAgentEvents(); }, []);
  const pass = (ignore) => { setHover(!ignore); window.jarvis.desktopWidgetsInput(ignore).catch(() => {}); };
  const items = Array.isArray(nw.items) ? nw.items : [];
  return <>
    <header className="nv-head" onMouseEnter={() => pass(false)} onMouseLeave={() => pass(true)}>
      <span className="nv-title"><i data-state={state} />NOVA</span>
      <div className="nv-head-btns">
        <button aria-label="Centro de avisos" title="Centro de avisos" onClick={() => { setOpen(false); document.querySelector('.nv-feed')?.scrollIntoView({ behavior: 'smooth' }); }}><Glyph n="bell" s={16} />{unread > 0 && <i className="nv-badge">{unread > 9 ? '9+' : unread}</i>}</button>
        <button aria-label="Mapa de Nova" title="Mapa de flujo 3D de Nova" onClick={() => window.jarvis.nova('flow-open')}><Glyph n="flow" s={16} /></button>
        <button aria-label="Personalizar" title="Personalizar el shell de Nova" aria-pressed={open} onClick={() => setOpen((v) => !v)}><Glyph n="gear" s={16} /></button>
        {items.includes('talk') && <button aria-label="Hablar con Nova" title="Hablar con Nova" onClick={() => window.jarvis.desktopWidgets('talk')}><Glyph n="mic" s={16} /></button>}
        <button aria-label="Ocultar widgets" title="Ocultar" onClick={() => window.jarvis.desktopWidgets('hide')}><Glyph n="close" s={16} /></button>
      </div>
    </header>
    {open && <section className="nv-drawer" onMouseEnter={() => pass(false)} onMouseLeave={() => pass(true)}><ShellSettings /></section>}
    {!ready ? <div className="nd-native-loading">Cargando…</div> : <section className="nv-grid" data-size={nw.size} data-hover={hover ? 1 : 0} onMouseEnter={() => pass(false)} onMouseLeave={() => pass(true)}>{items.filter((id) => WIDGETS[id]).map((id) => { const C = WIDGETS[id]; return <C key={id} />; })}</section>}
  </>;
}
