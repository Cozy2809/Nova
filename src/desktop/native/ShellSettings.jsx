import React, { useEffect, useState } from 'react';
import { usePrefs, setDeep, setPrefs } from '../prefs.js';
import { nv } from './useNative.js';
import { Glyph } from './Glyph.jsx';
import CloudModelCard from './CloudModelCard.jsx';
import ScraplingCard from './ScraplingCard.jsx'; // nova-integrations:scrapling

const Switch = ({ on, set, label }) => <button type="button" role="switch" className="nd-sw" aria-checked={!!on} aria-label={label} onClick={() => set(!on)} />;
const Row = ({ label, hint, children }) => <div className="nd-sw-row"><span>{label}{hint && <small className="nv-hint">{hint}</small>}</span>{children}</div>;
const Sel = ({ value, set, opts, label }) => <select className="nd-sel" aria-label={label} value={value} onChange={(e) => set(e.target.value)}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>;

const ITEMS = { orb: 'Círculo de audio y voz', talk: 'Botón para hablar', clock: 'Reloj y calendario', system: 'Sistema', net: 'Red', music: 'Música', notes: 'Recordatorios', activity: 'Actividad de Nova', quick: 'Accesos rápidos', map: 'Mapa (opcional)', notifications: 'Centro de avisos' };
const BAR_MODULES = [['showStatus', 'Estado de Nova'], ['showTalk', 'Botón de voz'], ['showWidgets', 'Botón de widgets'], ['showDock', 'Acceso al dock'], ['showStart', 'Botón de Inicio de Windows'], ['showBell', 'Campana de avisos'], ['showNotifications', 'Avisos emergentes'], ['showActive', 'Aplicación activa'], ['showSystem', 'CPU y RAM'], ['showClock', 'Hora y fecha']];
const DOCK_MODULES = [['showTalk', 'Botón de voz'], ['showWidgets', 'Botón de widgets'], ['showPins', 'Accesos fijados'], ['showRunning', 'Ventanas abiertas de Windows'], ['showSystem', 'Inicio, vista de tareas y escritorio']];

function Displays({ value, set, displays }) {
  const has = (id) => value.includes(id);
  const toggle = (id) => { const next = has(id) ? value.filter((x) => x !== id) : [...value, id]; set(next.length ? next : ['primary']); };
  return <div className="nv-checks">{[{ id: 'primary', label: 'Pantalla principal (sigue a la principal)' }, ...displays.filter((d) => !d.primary).map((d) => ({ id: d.id, label: d.label }))].map((d) => <label key={d.id} className="nd-native-check"><input type="checkbox" checked={has(d.id)} onChange={() => toggle(d.id)} /> {d.label}</label>)}</div>;
}

function Startup() {
  const prefs = usePrefs(); const [login, setLogin] = useState(null); const [msg, setMsg] = useState('');
  useEffect(() => { nv('login:get').then((r) => setLogin(!!r?.on)).catch(() => {}); }, []);
  return <>
    <Row label="Iniciar Nova con Windows" hint="Usa el mismo ajuste que «Inicio con Windows» de Ajustes."><Switch on={!!login} label="Iniciar con Windows" set={async (v) => { const r = await nv('login:set', { on: v }); setLogin(!!r?.on); }} /></Row>
    <Row label="Al arrancar" hint="En segundo plano solo se muestran el dock, la barra y los widgets que tengas activos."><Sel label="Al arrancar" value={prefs.shell.startMode} set={(v) => setDeep('shell.startMode', v)} opts={[['window', 'Abrir la ventana de Nova'], ['background', 'Solo dock, barra y widgets']]} /></Row>
    <button type="button" className="nd-btn" onClick={async () => { const r = await window.jarvis.desktopWidgets('shortcut'); setMsg(r?.ok ? 'Acceso creado en Inicio. Búscalo, clic derecho y «Anclar a la barra de tareas».' : r?.cancelled ? '' : r?.error || 'No se pudo crear el acceso.'); }}>Crear acceso para anclar a la barra de tareas</button>
    {msg && <small className="nv-hint">{msg}</small>}
  </>;
}
function Discord() {
  const [appId, setAppId] = useState(''), [enabled, setEnabled] = useState(false), [msg, setMsg] = useState('');
  useEffect(() => { window.jarvis.getSettings().then((s) => { setAppId(s.discordAppId || ''); setEnabled(s.discordPresence === 'true'); }).catch(() => {}); }, []);
  const save = async () => { const r = await window.jarvis.desktopWidgets('discord', { enabled, appId }); setMsg(r.error || (enabled ? 'Presencia activada.' : 'Presencia desactivada.')); };
  return <div className="nd-native-discord"><b>Estado en Discord</b><input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="Application ID de Discord" aria-label="Application ID de Discord" /><label className="nd-native-check"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Mostrar «Asistente Nova ON»</label><button type="button" className="nd-btn" onClick={save}>Guardar estado de Discord</button><small>Necesitas crear una aplicación en Discord Developer Portal y subir el logo como asset «nova».</small>{msg && <small>{msg}</small>}</div>;
}
function Status() {
  const [s, setS] = useState(null); useEffect(() => { const f = () => nv('shell-status').then((r) => r && !r.error && setS(r)).catch(() => {}); f(); const t = setInterval(f, 4000); return () => clearInterval(t); }, []);
  if (!s) return null;
  return <div className="nv-status-box"><b>Estado del shell</b>
    <span>Detección de pantalla completa: {s.watch.available ? 'activa' : 'sin datos (el dock seguirá visible)'}</span>
    <span>Ahora: {s.watch.fullscreen ? 'pantalla completa o presentación' : s.watch.quiet ? 'modo «no molestar»' : 'uso normal'}{s.calm ? ' · modo calma' : ''}</span>
    {s.hotkey && <span>Modo calma: {s.hotkey.replace('CommandOrControl', 'Ctrl')}</span>}</div>;
}

// Configuración del shell de Nova. Se usa dentro del panel de widgets y en los ajustes del escritorio: es la misma, con los mismos datos.
export default function ShellSettings() {
  const p = usePrefs(), nw = p.nativeWidgets, tb = nw.topbar, dk = nw.dockbar, sh = p.shell; const [displays, setDisplays] = useState([]);
  useEffect(() => { window.jarvis.desktopWidgets('displays').then((r) => setDisplays(r.displays || [])).catch(() => {}); }, []);
  const apply = (key, on, extra = {}) => window.jarvis.desktopWidgets(key, { on, ...extra });
  const layout = (k, v) => { setDeep('nativeWidgets.' + k, v); setTimeout(() => window.jarvis.desktopWidgets('layout', { side: k === 'side' ? v : nw.side, size: k === 'size' ? v : nw.size, displayId: k === 'displayId' ? v : nw.displayId }), 30); };
  const items = nw.items; const move = (id, dir) => { const i = items.indexOf(id), j = i + dir; if (i < 0 || j < 0 || j >= items.length) return; const n = items.slice(); [n[i], n[j]] = [n[j], n[i]]; setDeep('nativeWidgets.items', n); };
  const toggleItem = (id, on) => setDeep('nativeWidgets.items', on ? [...items, id] : items.filter((x) => x !== id));
  return <div className="nv-settings">
    <Status />
    <section className="nd-card"><b>Barra superior</b>
      <Row label="Mostrar la barra" hint="Compacta y centrada: no tapa los botones de las ventanas."><Switch on={tb.on} label="Barra superior" set={(v) => { setDeep('nativeWidgets.topbar.on', v); apply('topbar', v); }} /></Row>
      <div className="nv-sub">Monitores</div><Displays value={tb.displays} displays={displays} set={(v) => { setDeep('nativeWidgets.topbar.displays', v); if (tb.on) apply('topbar', true, { displays: v }); }} />
      <Row label="Alineación"><Sel label="Alineación" value={tb.align} set={(v) => setDeep('nativeWidgets.topbar.align', v)} opts={[['center', 'Centro'], ['left', 'Izquierda'], ['right', 'Derecha']]} /></Row>
      <Row label="Ancho" hint="A todo el ancho cubre la parte superior de las ventanas maximizadas."><Sel label="Ancho" value={tb.width} set={(v) => setDeep('nativeWidgets.topbar.width', v)} opts={[['compact', 'Según contenido'], ['full', 'Todo el ancho']]} /></Row>
      <Row label="Ocultar automáticamente" hint="Aparece al llevar el ratón al borde superior."><Switch on={tb.autoHide} label="Ocultar barra automáticamente" set={(v) => setDeep('nativeWidgets.topbar.autoHide', v)} /></Row>
      <div className="nv-sub">Módulos</div>{BAR_MODULES.map(([k, t]) => <label key={k} className="nd-native-check"><input type="checkbox" checked={!!tb[k]} onChange={(e) => setDeep('nativeWidgets.topbar.' + k, e.target.checked)} /> {t}</label>)}
    </section>
    <section className="nd-card"><b>Dock sobre la barra de tareas</b>
      <Row label="Mostrar el dock" hint="Es una capa de Nova; no sustituye la barra de tareas de Windows."><Switch on={dk.on} label="Dock" set={(v) => { setDeep('nativeWidgets.dockbar.on', v); apply('dock', v); }} /></Row>
      <div className="nv-sub">Monitores</div><Displays value={dk.displays} displays={displays} set={(v) => { setDeep('nativeWidgets.dockbar.displays', v); if (dk.on) apply('dock', true, { displays: v }); }} />
      <Row label="Tamaño"><Sel label="Tamaño del dock" value={dk.size} set={(v) => setDeep('nativeWidgets.dockbar.size', v)} opts={[['normal', 'Normal'], ['compact', 'Compacto']]} /></Row>
      <Row label="Mostrar nombres"><Switch on={dk.labels} label="Nombres" set={(v) => setDeep('nativeWidgets.dockbar.labels', v)} /></Row>
      <Row label="Ocultar automáticamente" hint="Aparece al llevar el ratón al borde inferior, sobre la barra de tareas."><Switch on={dk.autoHide} label="Ocultar dock automáticamente" set={(v) => setDeep('nativeWidgets.dockbar.autoHide', v)} /></Row>
      <div className="nv-sub">Módulos</div>{DOCK_MODULES.map(([k, t]) => <label key={k} className="nd-native-check"><input type="checkbox" checked={dk[k] !== false} onChange={(e) => setDeep('nativeWidgets.dockbar.' + k, e.target.checked)} /> {t}</label>)}
      <small className="nv-hint">Los accesos fijados se gestionan en Ajustes del escritorio › Dock.</small>
    </section>
    <section className="nd-card"><b>Panel de widgets</b>
      <Row label="Transparencia"><input type="range" min="6" max="70" value={100 - nw.opacity} aria-label="Transparencia" onChange={(e) => setDeep('nativeWidgets.opacity', 100 - Number(e.target.value))} /></Row>
      <Row label="Posición"><Sel label="Posición" value={nw.side} set={(v) => layout('side', v)} opts={[['right', 'Derecha'], ['left', 'Izquierda']]} /></Row>
      <Row label="Tamaño"><Sel label="Tamaño del panel" value={nw.size} set={(v) => layout('size', v)} opts={[['compact', 'Compacto'], ['normal', 'Normal'], ['wide', 'Ancho']]} /></Row>
      <Row label="Pantalla"><Sel label="Pantalla del panel" value={nw.displayId || ''} set={(v) => layout('displayId', v)} opts={[['', 'Principal'], ...displays.map((d) => [d.id, d.label])]} /></Row>
      <Row label="Animaciones"><Switch on={nw.animations !== false} label="Animaciones" set={(v) => setDeep('nativeWidgets.animations', v)} /></Row>
      <Row label="Atenuar si no lo usas" hint="Baja la opacidad cuando el ratón no está encima."><Switch on={nw.dimIdle !== false} label="Atenuar" set={(v) => setDeep('nativeWidgets.dimIdle', v)} /></Row>
      <div className="nv-sub">Widgets y orden</div>
      {items.filter((id) => ITEMS[id]).map((id, i) => <div key={id} className="nv-order"><span>{ITEMS[id]}</span><button type="button" aria-label={'Subir ' + ITEMS[id]} disabled={i === 0} onClick={() => move(id, -1)}><Glyph n="up" s={14} /></button><button type="button" aria-label={'Bajar ' + ITEMS[id]} disabled={i === items.length - 1} onClick={() => move(id, 1)}><Glyph n="down" s={14} /></button><button type="button" aria-label={'Quitar ' + ITEMS[id]} onClick={() => toggleItem(id, false)}><Glyph n="close" s={14} /></button></div>)}
      {Object.keys(ITEMS).filter((id) => !items.includes(id)).length > 0 && <Sel label="Añadir widget" value="" set={(v) => v && toggleItem(v, true)} opts={[['', 'Añadir widget…'], ...Object.entries(ITEMS).filter(([id]) => !items.includes(id))]} />}
    </section>
    <section className="nd-card"><b>Rendimiento</b>
      <Row label="Efectos de cristal" hint="«Ligeros» quita el desenfoque de dock, barra y panel: menos carga de GPU, sobre todo con varios monitores."><Sel label="Efectos de cristal" value={sh.effects || 'full'} set={(v) => setDeep('shell.effects', v)} opts={[['full', 'Completos'], ['light', 'Ligeros (menos GPU)']]} /></Row>
      <button type="button" className="nd-btn" onClick={() => nv('flow-open')}>Abrir el mapa de Nova (3D)</button>
    </section>
    <CloudModelCard />
    <ScraplingCard />
    <section className="nd-card"><b>Avisos</b>
      <Row label="Avisos emergentes"><Switch on={nw.notifications !== false} label="Avisos emergentes" set={(v) => setDeep('nativeWidgets.notifications', v)} /></Row>
      <Row label="Dónde mostrarlos" hint="Automático: en la barra de Nova si está visible; si no, como aviso de Windows."><Sel label="Dónde mostrar avisos" value={sh.toasts} set={(v) => setDeep('shell.toasts', v)} opts={[['auto', 'Automático'], ['topbar', 'Solo en la barra de Nova'], ['windows', 'Avisos de Windows']]} /></Row>
      <Row label="Respetar «no molestar»" hint="No muestra avisos emergentes con el modo concentración de Windows (los guarda en el historial)."><Switch on={sh.respectQuiet} label="Respetar no molestar" set={(v) => setDeep('shell.respectQuiet', v)} /></Row>
      <Row label="Contador en la barra de tareas" hint="Punto rojo sobre el icono de Nova cuando hay avisos sin leer."><Switch on={sh.taskbarBadge} label="Contador en la barra de tareas" set={(v) => setDeep('shell.taskbarBadge', v)} /></Row>
    </section>
    <section className="nd-card"><b>Integración con Windows</b>
      <Row label="Ocultar en pantalla completa" hint="Oculta dock y barra con juegos, vídeo a pantalla completa o presentaciones."><Switch on={sh.hideOnFullscreen} label="Ocultar en pantalla completa" set={(v) => setDeep('shell.hideOnFullscreen', v)} /></Row>
      <Row label="Atajo de modo calma" hint="Ctrl+Alt+N oculta o muestra dock y barra."><Switch on={sh.hotkey} label="Atajo de modo calma" set={(v) => setDeep('shell.hotkey', v)} /></Row>
      <Startup />
      <Discord />
    </section>
  </div>;
}
