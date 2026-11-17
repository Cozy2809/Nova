import React, { useState } from 'react';
import Icon from './Icon.jsx';
import { usePrefs, setDeep } from './prefs.js';
import { run, usePoll, msgOf } from './agent.js';
import { useDesk, hueOf, baseName } from './util.js';

const INTERNAL = [['assistant', 'Hablar con Nova', 'nova'], ['explorer', 'Archivos', 'folder'], ['media', 'Multimedia', 'music'], ['system', 'Sistema', 'chip'], ['activity', 'Actividad de Nova', 'pulse'], ['settings', 'Ajustes del escritorio', 'gear']];

function Item({ label, open, nova, miss, size, labels, onClick, onContext, children }) {
  return (<button className="nd-di" style={{ width: size + 6, height: size + (labels ? 16 : 0) }} data-open={open ? 1 : 0} data-nova={nova ? 1 : 0} data-miss={miss ? 1 : 0} aria-label={label} title={label} onClick={onClick} onContextMenu={onContext}>
    {children}{labels && <span className="nd-lab">{label}</span>}</button>);
}

export default function Dock({ windows, onExit, onStart }) {
  const p = usePrefs(); const D = useDesk(); const d = p.dock; const [menu, setMenu] = useState(null); const [icons, setIcons] = useState({});
  // Ventanas abiertas de Windows (datos reales; si el sistema no las puede listar, simplemente no se muestran)
  const wins = usePoll(async () => { const r = await run('system.windows'); const list = r.windows || []; list.forEach(async (w) => { if (w.path && !icons[w.path]) { const i = await window.jarvis.agent.icon(w.path); if (i?.icon) setIcons((s) => ({ ...s, [w.path]: i.icon })); } }); return list; }, 7000, { deps: [] });
  // Comprobación de destinos de los accesos fijados: si ya no existen se marcan, no se ocultan en silencio
  const pinKey = d.pins.map((x) => x.path || x.appId).join('|');
  const check = usePoll(async () => {
    const miss = {}; let apps = null;
    for (const x of d.pins) {
      try {
        if (x.type === 'app') { if (!apps) apps = (await run('apps.list')).apps; miss[x.appId] = !apps.some((a) => a.appId === x.appId); }
        else { const s = await run('fs.stat', { path: x.path }); miss[x.path] = !s.exists; }
      } catch (e) { miss[x.appId || x.path] = x.type === 'app' ? false : true; }
    }
    return miss;
  }, 60000, { deps: [pinKey] });
  const missing = check.data || {};
  const openApps = new Set(windows.map((w) => w.app));
  const act = async (fn, okMsg) => { try { await fn(); okMsg && D.toast(okMsg); } catch (e) { D.toast(msgOf(e), 'err'); } };
  const clickPin = (x) => {
    if (x.type === 'app') return act(() => run('apps.launch', { appId: x.appId }));
    if (x.type === 'folder') return D.open('explorer', { path: x.path });
    return act(() => run('fs.open', { path: x.path }));
  };
  const size = d.size;
  return (<nav className="nd-dock" data-pos={d.pos} data-labels={d.labels ? 1 : 0} aria-label="Dock">
    <Item label="Volver al asistente Nova" nova size={size} labels={d.labels} onClick={onExit}><Icon n="nova" s={size * .5} /></Item>
    <Item label="Inicio y búsqueda (Ctrl+K)" size={size} labels={d.labels} onClick={onStart}><Icon n="grid" s={size * .46} /></Item>
    <span className="nd-sep" />
    {INTERNAL.map(([id, label, ic]) => <Item key={id} label={label} open={openApps.has(id)} size={size} labels={d.labels} onClick={() => D.open(id)}><Icon n={ic} s={size * .46} /></Item>)}
    {d.pins.length > 0 && <span className="nd-sep" />}
    {d.pins.map((x) => { const k = x.appId || x.path; const miss = !!missing[k]; return (
      <Item key={x.type + k} label={x.name + (miss ? ' (no se encuentra)' : '')} miss={miss} size={size} labels={d.labels} onClick={() => (miss ? D.toast('«' + x.name + '» ya no existe. Quítalo del dock con clic derecho.', 'err') : clickPin(x))} onContext={(e) => { e.preventDefault(); setMenu({ x, at: { left: e.clientX, top: e.clientY } }); }}>
        {x.type === 'app' ? <span className="letter" style={{ color: `hsl(${hueOf(x.name)} 80% 66%)` }}>{x.name.slice(0, 1).toUpperCase()}</span> : <Icon n={x.type === 'folder' ? 'folder' : 'file'} s={size * .46} />}
      </Item>); })}
    {(wins.data || []).length > 0 && <span className="nd-sep" />}
    {(wins.data || []).slice(0, 12).map((w) => (
      <Item key={w.pid} label={`${w.name} — ${w.title}`} open size={size} labels={d.labels} onClick={() => act(() => run('system.focusWindow', { pid: w.pid }))}>
        {icons[w.path] ? <img src={icons[w.path]} alt="" onError={() => setIcons((s) => { const n = { ...s }; delete n[w.path]; return n; })} /> : <span className="letter" style={{ color: `hsl(${hueOf(w.name)} 80% 66%)` }}>{w.name.slice(0, 1).toUpperCase()}</span>}</Item>))}
    {menu && <div className="nd-menu" style={{ position: 'fixed', left: Math.min(menu.at.left, innerWidth - 220), top: Math.max(8, menu.at.top - 80) }} role="menu" onMouseLeave={() => setMenu(null)}>
      <div className="sub">{menu.x.name}</div>
      <button role="menuitem" onClick={() => { setDeep('dock.pins', d.pins.filter((y) => y !== menu.x)); D.toast('Quitado del dock (el original no se toca)'); setMenu(null); }}><Icon n="close" s={15} />Quitar del dock</button>
      {menu.x.type !== 'app' && <button role="menuitem" onClick={() => { D.open('explorer', { path: menu.x.type === 'folder' ? menu.x.path : menu.x.path.replace(/[\\/][^\\/]*$/, '') }); setMenu(null); }}><Icon n="folder" s={15} />Ver en Archivos</button>}
    </div>}
  </nav>);
}
