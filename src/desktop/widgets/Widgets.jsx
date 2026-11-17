import React, { useEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { usePrefs, setDeep } from '../prefs.js';
import { useMedia } from '../media.js';
import { run, usePoll, useAgentStore, msgOf } from '../agent.js';
import { useDesk, pct, fmtDur } from '../util.js';

const useStats = () => { const [s, set] = useState(null); useEffect(() => window.jarvis?.onStats?.(set), []); return s; };
const W = ({ title, icon, children }) => <><h5><Icon n={icon} s={14} />{title}</h5>{children}</>;
const Loading = ({ t = 'Cargando…' }) => <div className="nd-row nd-mut"><span className="nd-spin" />{t}</div>;

export function Clock() {
  const [n, setN] = useState(new Date()); const [view, setView] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1)); const [selected, setSelected] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setN(new Date()), 1000); return () => clearInterval(t); }, []);
  const y = view.getFullYear(), m = view.getMonth(); const first = (new Date(y, m, 1).getDay() + 6) % 7; const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const shiftMonth = (step) => setView((v) => new Date(v.getFullYear(), v.getMonth() + step, 1));
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  return (<W title={n.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} icon="clock">
    <div className="big">{n.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}<span className="nd-mut" style={{ fontSize: 15 }}> :{String(n.getSeconds()).padStart(2, '0')}</span></div>
    <div className="nd-cal-head"><button type="button" aria-label="Mes anterior" onClick={() => shiftMonth(-1)}><Icon n="back" s={14} /></button><strong>{view.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</strong><button type="button" aria-label="Mes siguiente" onClick={() => shiftMonth(1)}><Icon n="fwd" s={14} /></button><button type="button" className="nd-cal-today" onClick={() => { setView(new Date(n.getFullYear(), n.getMonth(), 1)); setSelected(n); }}>Hoy</button></div>
    <div className="nd-cal" aria-label="Calendario interactivo">{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => <span key={d} className="h">{d}</span>)}{cells.map((c, i) => { const d = c ? new Date(y, m, c) : null; return d ? <button type="button" key={d.toISOString()} className={`${sameDay(d, n) ? 'today' : ''} ${sameDay(d, selected) ? 'selected' : ''}`} aria-pressed={sameDay(d, selected)} aria-label={d.toLocaleDateString('es-ES', { dateStyle: 'full' })} onClick={() => setSelected(d)}>{c}</button> : <span key={'blank-' + i} />; })}</div>
    <div className="nd-cal-selected">Seleccionado: {selected.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></W>);
}
export function Hardware() {
  const s = useStats();
  const row = (l, v) => <div><span className="nd-mut">{l}</span><div className="bar"><i style={{ width: (v ?? 0) + '%' }} /></div><em>{v == null ? 'N/D' : v + ' %'}</em></div>;
  return (<W title="Hardware" icon="chip">{!s ? <Loading t="Esperando lecturas…" /> : <div className="bars">{row('CPU', pct(s.cpu))}{row('RAM', pct(s.ram))}{row('Disco', pct(s.disk))}{row('GPU', pct(s.gpu))}</div>}
    {s && <div className="nd-mut" style={{ fontSize: 11.5, marginTop: 8 }}>{Number.isFinite(s.temp) ? `GPU ${s.temp} °C` : 'Temperatura: sin datos'}</div>}</W>);
}
export function Network() {
  const s = useStats(); const net = usePoll(() => run('system.network'), 15000, {}); const [on, setOn] = useState(navigator.onLine);
  useEffect(() => { const a = () => setOn(true), b = () => setOn(false); addEventListener('online', a); addEventListener('offline', b); return () => { removeEventListener('online', a); removeEventListener('offline', b); }; }, []);
  return (<W title="Red" icon="net"><div className={on ? 'nd-ok' : 'nd-err'} style={{ fontWeight: 600 }}>{on ? 'Con conexión' : 'Sin conexión'}</div>
    <div className="nd-mut" style={{ fontVariantNumeric: 'tabular-nums' }}>↓ {s?.rx ?? 'N/D'} · ↑ {s?.tx ?? 'N/D'} KB/s</div>
    {net.error && <div className="nd-err" style={{ fontSize: 12 }}>{net.error}</div>}{net.data?.interfaces.slice(0, 2).map((i) => <div key={i.name + i.address} className="nd-mut" style={{ fontSize: 11.5 }}>{i.name}: {i.address}</div>)}</W>);
}
export function Music() {
  const M = useMedia(true, 5000); const c = M.cur; const playing = c?.status === 'Playing'; const [err, setErr] = useState('');
  const control = async (action) => { const message = await M.act(action); setErr(message || ''); };
  return (<W title="Música" icon="music">
    {M.loading && !M.d ? <Loading /> : M.d?.mediaErr ? <div className="nd-err" style={{ fontSize: 12.5 }}>{M.d.mediaErr}</div> : !c ? <div className="nd-mut">Nada en reproducción</div> : (<>
      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'Sin título'}</div><div className="nd-mut" style={{ fontSize: 12 }}>{c.artist || 'Artista desconocido'}</div>
      {c.durationSec > 0 && <><div className="nd-prog"><i style={{ width: Math.min(100, (M.pos / c.durationSec) * 100) + '%' }} /></div><div className="nd-mut" style={{ fontSize: 11 }}>{fmtDur(M.pos)} / {fmtDur(c.durationSec)}</div></>}
      <div className="nd-row" style={{ justifyContent: 'center' }} onPointerDown={(e) => e.stopPropagation()}>
        <button className="nd-btn ico" aria-label="Anterior" disabled={!c.canPrev} onClick={() => control('prev')}><Icon n="prev" s={15} /></button>
        <button className="nd-btn pri ico" aria-label={playing ? 'Pausar' : 'Reproducir'} disabled={playing ? !c.canPause : !c.canPlay} onClick={() => control('toggle')}><Icon n={playing ? 'pause' : 'play'} s={15} /></button>
        <button className="nd-btn ico" aria-label="Siguiente" disabled={!c.canNext} onClick={() => control('next')}><Icon n="next" s={15} /></button></div>{err && <div className="nd-err" role="alert" style={{ fontSize: 11 }}>{err}</div>}</>)}</W>);
}
export function Notes() {
  const [s, setS] = useState({ loading: true, list: [], err: '' }); const [t, setT] = useState(''); const [actionErr, setActionErr] = useState('');
  const load = () => window.jarvis.itemList('note').then((list) => setS({ loading: false, list, err: '' })).catch((e) => setS({ loading: false, list: [], err: msgOf(e) }));
  useEffect(() => { load(); }, []);
  const add = async (e) => { e.preventDefault(); const v = t.trim(); if (!v) return; try { setActionErr(''); await window.jarvis.itemAdd('note', v); setT(''); await load(); } catch (err) { setActionErr(msgOf(err)); } };
  return (<W title="Recordatorios de Nova" icon="edit">{s.loading ? <Loading /> : s.err ? <div className="nd-err">{s.err}</div> : !s.list.length ? <div className="nd-mut">No hay notas pendientes</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 130, overflow: 'auto' }}>{s.list.slice(-6).map((n) => <div key={n.id} style={{ fontSize: 12.5 }}>• {n.text}</div>)}</div>}
    <form onSubmit={add} onPointerDown={(e) => e.stopPropagation()} style={{ marginTop: 8, display: 'flex', gap: 6 }}><input className="nd-in" style={{ width: '100%', minWidth: 0 }} value={t} onChange={(e) => setT(e.target.value)} placeholder="Anotar algo…" aria-label="Nueva nota" /><button className="nd-btn pri" type="submit" disabled={!t.trim()} aria-label="Guardar nota">Añadir</button></form>{actionErr && <div className="nd-err" role="alert">{actionErr}</div>}</W>);
}
function Quick() {
  const p = usePrefs(); const D = useDesk();
  const go = async (x) => { try { if (x.type === 'app') await run('apps.launch', { appId: x.appId }); else if (x.type === 'folder') D.open('explorer', { path: x.path }); else await run('fs.open', { path: x.path }); } catch (e) { D.toast(msgOf(e), 'err'); } };
  return (<W title="Accesos rápidos" icon="pin">{!p.dock.pins.length ? <div className="nd-mut" style={{ fontSize: 12.5 }}>Fija elementos en el dock y aparecerán aquí.</div> : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} onPointerDown={(e) => e.stopPropagation()}>{p.dock.pins.slice(0, 8).map((x) => <button key={(x.appId || x.path)} className="nd-btn" onClick={() => go(x)}>{x.name}</button>)}</div>}</W>);
}
function Activity() {
  const { feed } = useAgentStore(); const D = useDesk();
  return (<W title="Actividad de Nova" icon="pulse">{!feed.length ? <div className="nd-mut" style={{ fontSize: 12.5 }}>Sin acciones todavía</div> : feed.slice(0, 4).map((a) => <div key={a.id} style={{ fontSize: 12.5, display: 'flex', gap: 6, margin: '3px 0' }}><span className={a.state === 'succeeded' ? 'nd-ok' : a.state === 'failed' ? 'nd-err' : 'nd-mut'}>●</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.summary || a.tool}</span></div>)}
    <button className="nd-btn" style={{ marginTop: 6 }} onPointerDown={(e) => e.stopPropagation()} onClick={() => D.open('activity')}>Ver todo</button></W>);
}
const MAP = { clock: Clock, system: Hardware, net: Network, music: Music, notes: Notes, quick: Quick, activity: Activity };

// Capa de widgets: arrastrables, con posición persistente. Cada widget muestra su propio estado de carga o error.
export default function WidgetLayer({ area: full }) {
  const p = usePrefs();
  // Si el dock está a un lado, los widgets se colocan en el espacio restante
  const L = p.dock.pos === 'left' ? p.dock.size + 40 : 0, R = p.dock.pos === 'right' ? p.dock.size + 40 : 0; const area = { w: full.w - L - R, h: full.h }; const drag = useRef(null); const [pos, setPos] = useState({});
  const at = (k) => { const w = p.widgets[k]; return pos[k] || { x: w.x == null ? Math.max(8, area.w - 236 - 28) : w.x, y: w.y }; };
  const down = (k) => (e) => { if (e.button !== 0 || e.target.closest('button,input,select,textarea,a')) return; const a = at(k); drag.current = { k, dx: e.clientX - a.x, dy: e.clientY - a.y }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => { const d = drag.current; if (!d) return; setPos((s) => ({ ...s, [d.k]: { x: Math.max(0, Math.min(area.w - 236, e.clientX - d.dx)), y: Math.max(0, Math.min(area.h - 80, e.clientY - d.dy)) } })); };
  const up = () => { const d = drag.current; drag.current = null; if (!d) return; const a = pos[d.k]; if (a) { setDeep('widgets.' + d.k + '.x', Math.round(a.x)); setDeep('widgets.' + d.k + '.y', Math.round(a.y)); } setPos((s) => { const n = { ...s }; delete n[d.k]; return n; }); };
  return (<div className="nd-widgets" style={{ left: L, right: R }}>{Object.keys(MAP).filter((k) => p.widgets[k]?.on).map((k) => { const C = MAP[k]; const a = at(k); return <div key={k} className="nd-wg" style={{ left: a.x, top: a.y }} onPointerDown={down(k)} onPointerMove={move} onPointerUp={up}><C /></div>; })}</div>);
}
