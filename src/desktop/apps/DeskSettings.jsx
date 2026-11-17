import React, { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import { usePrefs, setDeep, setPrefs, resetPrefs } from '../prefs.js';
import { run, usePoll, msgOf } from '../agent.js';
import { useDesk } from '../util.js';
import ShellSettings from '../native/ShellSettings.jsx';

const WALLS = [['aurora', 'Aurora', 'radial-gradient(60% 60% at 25% 25%,hsl(192 100% 50%/.55),transparent 70%),radial-gradient(60% 60% at 80% 80%,hsl(267 100% 60%/.45),transparent 70%),#070b16'], ['midnight', 'Medianoche', 'linear-gradient(180deg,#050816,#101b3d)'], ['graphite', 'Grafito', 'linear-gradient(160deg,#16181d,#2a2f38)'], ['dawn', 'Amanecer', 'radial-gradient(60% 60% at 20% 20%,hsl(192 90% 82%),transparent 70%),radial-gradient(60% 60% at 85% 85%,hsl(267 85% 85%),transparent 70%),#eef3fb']];
const WIDGETS = [['clock', 'Reloj y calendario'], ['system', 'Estado del hardware'], ['net', 'Red'], ['music', 'Música'], ['notes', 'Recordatorios de Nova'], ['quick', 'Accesos rápidos'], ['activity', 'Actividad de Nova']];
const WIDGET_POS = { clock: [28, 64], system: [28, 430], music: [null, 64], quick: [null, 230], notes: [null, 540], net: [28, 650], activity: [null, 390] };
const Switch = ({ on, set, label }) => <button type="button" role="switch" className="nd-sw" aria-checked={on} aria-label={label} onClick={() => set(!on)} />;
const Seg = ({ value, set, opts, label }) => <div className="nd-seg" role="group" aria-label={label}>{opts.map(([v, t]) => <button key={v} aria-pressed={value === v} onClick={() => set(v)}>{t}</button>)}</div>;

export default function DeskSettings() {
  const p = usePrefs(); const D = useDesk(); const [tab, setTab] = useState('look'); const [ag, setAg] = useState({ auto: true, enabled: true }); const [apps, setApps] = useState({ list: null, err: '', loading: false }); const [places, setPlaces] = useState([]);
  const tools = usePoll(async () => { const r = await window.jarvis.agent.tools(); if (r.error) throw new Error(r.error); return r.tools; }, 0, { enabled: tab === 'agent', deps: [tab] });
  useEffect(() => { window.jarvis.getSettings().then((s) => setAg({ auto: s['agent.lowRiskAuto'] !== 'false', enabled: s['agent.enabled'] !== 'false' })).catch(() => {}); }, []);
  useEffect(() => { if (tab === 'dock') run('fs.places').then((r) => setPlaces(r.places)).catch(() => {}); }, [tab]);
  const setAgent = (k, key, v) => { setAg((s) => ({ ...s, [k]: v })); window.jarvis.setSettings({ [key]: v }); };
  const loadApps = async () => { setApps({ list: null, err: '', loading: true }); try { setApps({ list: (await run('apps.list')).apps, err: '', loading: false }); } catch (e) { setApps({ list: null, err: msgOf(e), loading: false }); } };
  const addPin = (pin) => { if (p.dock.pins.some((x) => (x.appId || x.path) === (pin.appId || pin.path))) return D.toast('Ya está en el dock'); setDeep('dock.pins', [...p.dock.pins, pin]); };
  const reset = async () => { const ok = await D.ask({ title: 'Restablecer el escritorio', message: 'Se restaurarán el tema, el dock, los widgets y la barra. No se borra ningún archivo ni la memoria de Nova.', input: false, okText: 'Restablecer', danger: true }); if (ok) { resetPrefs(); D.toast('Escritorio restablecido'); } };
  const tabs = [['look', 'Apariencia'], ['dock', 'Dock'], ['widgets', 'Widgets'], ['shell', 'Integración con Windows'], ['agent', 'Agente'], ['data', 'Datos']];
  return (<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div className="nd-tabs" role="tablist">{tabs.map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t}</button>)}</div>
    <div className="nd-pad" style={{ overflow: 'auto', flex: 1 }}>
      {tab === 'look' && (<>
        <div className="nd-card"><b>Tema</b><Seg label="Tema" value={p.theme} set={(v) => setPrefs({ theme: v })} opts={[['dark', 'Oscuro'], ['light', 'Claro'], ['system', 'Sistema']]} /></div>
        <div className="nd-card"><b>Fondo</b><div className="nd-wp">{WALLS.map(([id, name, bg]) => <button key={id} aria-pressed={p.wallpaper === id} style={{ background: bg }} onClick={() => setPrefs({ wallpaper: id })} aria-label={'Fondo ' + name}><span>{name}</span></button>)}</div></div>
        <div className="nd-card"><b>Color de acento</b><Seg label="Acento" value={p.accent} set={(v) => setPrefs({ accent: v })} opts={[['nova', 'Sigue el estado de Nova'], ['fixed', 'Fijo'], ['system', 'Color de Windows']]} />
          {p.accent === 'fixed' && <div className="nd-row"><input type="range" min="0" max="360" className="nd-grow" value={p.accentHue} aria-label="Matiz del acento" onChange={(e) => setPrefs({ accentHue: Number(e.target.value) })} /><span style={{ width: 16, height: 16, borderRadius: '50%', background: `hsl(${p.accentHue} 100% 62%)` }} /></div>}</div>
        <div className="nd-card"><b>Barra superior</b>{[['cpu', 'CPU'], ['ram', 'RAM'], ['net', 'Red'], ['nova', 'Estado de Nova']].map(([k, t]) => <div key={k} className="nd-sw-row"><span>{t}</span><Switch on={p.bar[k]} label={t} set={(v) => setDeep('bar.' + k, v)} /></div>)}</div>
        <div className="nd-card"><div className="nd-sw-row"><span>Abrir Nova directamente en el escritorio</span><Switch on={p.startInDesktop} label="Abrir en el escritorio" set={(v) => setPrefs({ startInDesktop: v })} /></div></div></>)}
      {tab === 'shell' && <ShellSettings />}
      {tab === 'dock' && (<>
        <div className="nd-card"><b>Posición</b><Seg label="Posición del dock" value={p.dock.pos} set={(v) => setDeep('dock.pos', v)} opts={[['bottom', 'Abajo'], ['left', 'Izquierda'], ['right', 'Derecha']]} />
          <div className="nd-sw-row"><span>Tamaño de los iconos</span><input type="range" min="36" max="64" value={p.dock.size} aria-label="Tamaño de los iconos" onChange={(e) => setDeep('dock.size', Number(e.target.value))} /></div>
          <div className="nd-sw-row"><span>Mostrar nombres</span><Switch on={p.dock.labels} label="Mostrar nombres" set={(v) => setDeep('dock.labels', v)} /></div></div>
        <div className="nd-card"><b>Accesos fijados</b>
          {!p.dock.pins.length && <div className="nd-mut">Todavía no has fijado nada. Fija aplicaciones, carpetas o archivos desde el menú de inicio, desde Archivos o desde aquí.</div>}
          {p.dock.pins.map((x) => <div key={(x.appId || x.path)} className="nd-row"><Icon n={x.type === 'app' ? 'grid' : x.type === 'folder' ? 'folder' : 'file'} s={16} /><span className="nd-grow" title={x.path || x.appId}>{x.name}</span><button className="nd-btn" onClick={() => setDeep('dock.pins', p.dock.pins.filter((y) => y !== x))}>Quitar</button></div>)}
          <div className="nd-mut" style={{ fontSize: 12 }}>Quitar un acceso solo lo retira del dock: el archivo, la carpeta o la aplicación no se tocan.</div></div>
        <div className="nd-card"><b>Añadir</b>
          <div className="nd-row"><select className="nd-sel nd-grow" aria-label="Carpeta" id="nd-pl" defaultValue="">{<option value="" disabled>Carpeta habitual…</option>}{places.map((pl) => <option key={pl.id} value={pl.path}>{pl.label}</option>)}</select>
            <button className="nd-btn" onClick={() => { const el = document.getElementById('nd-pl'); const pl = places.find((x) => x.path === el.value); if (pl) addPin({ type: 'folder', path: pl.path, name: pl.label }); }}>Fijar carpeta</button></div>
          <div className="nd-row">{apps.list ? (<><select className="nd-sel nd-grow" aria-label="Aplicación" id="nd-ap" defaultValue="">{<option value="" disabled>Aplicación instalada…</option>}{apps.list.map((a) => <option key={a.appId} value={a.appId}>{a.name}</option>)}</select>
            <button className="nd-btn" onClick={() => { const el = document.getElementById('nd-ap'); const a = apps.list.find((x) => x.appId === el.value); if (a) addPin({ type: 'app', appId: a.appId, name: a.name }); }}>Fijar aplicación</button></>) : <button className="nd-btn" disabled={apps.loading} onClick={loadApps}>{apps.loading ? 'Leyendo aplicaciones…' : 'Cargar aplicaciones instaladas'}</button>}</div>
          {apps.err && <div className="nd-note err">{apps.err}</div>}</div></>)}
      {tab === 'widgets' && (<div className="nd-card"><b>Widgets visibles</b>{WIDGETS.map(([k, t]) => <div key={k} className="nd-sw-row"><span>{t}</span><Switch on={p.widgets[k].on} label={t} set={(v) => setDeep('widgets.' + k + '.on', v)} /></div>)}
        <div className="nd-mut" style={{ fontSize: 12 }}>Arrastra cada widget por el escritorio para colocarlo; su posición se guarda sola.</div>
        <button className="nd-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setPrefs((current) => ({ ...current, widgets: Object.fromEntries(Object.entries(current.widgets).map(([k, v]) => [k, { ...v, x: WIDGET_POS[k][0], y: WIDGET_POS[k][1] }])) }))}>Recolocar widgets sin superponer</button></div>)}
      {tab === 'agent' && (<>
        <div className="nd-card"><b>Permisos de las acciones</b>
          <div className="nd-sw-row"><span>Ejecutar sin preguntar las acciones de lectura (buscar, consultar métricas…)</span><Switch on={ag.auto} label="Acciones de lectura automáticas" set={(v) => setAgent('auto', 'agent.lowRiskAuto', v)} /></div>
          <div className="nd-sw-row"><span>Permitir acciones que modifican archivos o abren aplicaciones</span><Switch on={ag.enabled} label="Permitir acciones que modifican" set={(v) => setAgent('enabled', 'agent.enabled', v)} /></div>
          <div className="nd-mut" style={{ fontSize: 12 }}>Mover, copiar, renombrar y crear siempre piden confirmación. Enviar a la Papelera o mover 10 o más elementos exige una confirmación reforzada. La variable PC_CONTROL=off del archivo .env también lo bloquea todo.</div></div>
        <div className="nd-card"><b>Herramientas registradas</b>
          {tools.loading && <div className="nd-row nd-mut"><span className="nd-spin" />Cargando…</div>}{tools.error && <div className="nd-err">{tools.error}</div>}
          {tools.data && tools.data.map((t) => <div key={t.name} className="nd-row" title={t.description}><span className="nd-grow">{t.title}<span className="nd-mut" style={{ fontSize: 11.5 }}> · {t.name}</span></span><span className="nd-badge" data-k={t.risk}>{t.risk === 'high' ? 'alto' : t.risk === 'confirm' ? 'confirma' : 'lectura'}</span></div>)}</div></>)}
      {tab === 'data' && (<div className="nd-card"><b>Restablecer</b><div className="nd-mut">Deja el escritorio como al instalarlo (tema, dock, widgets y barra). No borra archivos, conversaciones ni memoria.</div><button className="nd-btn danger" style={{ alignSelf: 'flex-start' }} onClick={reset}>Dejar escritorio predeterminado</button></div>)}
    </div></div>);
}
