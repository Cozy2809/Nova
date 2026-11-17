import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { run, msgOf } from './agent.js';
import { useDesk, baseName, fmtSize } from './util.js';
import { usePrefs, setDeep } from './prefs.js';

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const FUNCS = [
  { id: 'explorer', name: 'Archivos', sub: 'Explorar y buscar carpetas', icon: 'folder' }, { id: 'media', name: 'Multimedia', sub: 'Reproducción y volumen', icon: 'music' },
  { id: 'system', name: 'Sistema', sub: 'CPU, RAM, disco, red y procesos', icon: 'chip' }, { id: 'activity', name: 'Actividad de Nova', sub: 'Acciones y permisos', icon: 'pulse' },
  { id: 'settings', name: 'Ajustes del escritorio', sub: 'Tema, dock, widgets y agente', icon: 'gear' }, { id: '@assistant', name: 'Asistente Nova', sub: 'Volver al chat y la voz', icon: 'nova' },
  { id: '@nova-settings', name: 'Ajustes de Nova', sub: 'IA, voz y modelos', icon: 'gear' },
];
let appsCache = null; // la lista de Inicio tarda en leerse: se reutiliza mientras Nova está abierta

export default function StartMenu({ onClose, onExit, onAssistantSettings }) {
  const D = useDesk(); const p = usePrefs(); const [q, setQ] = useState(''); const [sel, setSel] = useState(0);
  const [apps, setApps] = useState({ list: appsCache || [], err: '', loading: !appsCache }); const [recent, setRecent] = useState({ list: [], err: '' }); const [files, setFiles] = useState({ list: [], loading: false, err: '', note: '' });
  const box = useRef(null);
  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => { if (appsCache) return; run('apps.list').then((r) => { appsCache = r.apps; setApps({ list: r.apps, err: '', loading: false }); }).catch((e) => setApps({ list: [], err: msgOf(e), loading: false })); }, []);
  useEffect(() => { run('apps.recent', { limit: 8 }).then((r) => setRecent({ list: r.items, err: '' })).catch((e) => setRecent({ list: [], err: msgOf(e) })); }, []);
  useEffect(() => {
    const s = q.trim(); if (s.length < 2) { setFiles({ list: [], loading: false, err: '', note: '' }); return undefined; }
    setFiles((f) => ({ ...f, loading: true })); let on = true;
    const t = setTimeout(() => run('fs.search', { query: s, limit: 8 }).then((r) => on && setFiles({ list: r.items, loading: false, err: '', note: r.note || '' })).catch((e) => on && setFiles({ list: [], loading: false, err: msgOf(e), note: '' })), 280);
    return () => { on = false; clearTimeout(t); };
  }, [q]);

  const nq = norm(q.trim());
  const groups = useMemo(() => {
    const g = []; const fn = FUNCS.filter((f) => !nq || norm(f.name + ' ' + f.sub).includes(nq));
    if (fn.length) g.push({ title: 'Nova', items: fn.map((f) => ({ k: 'fn', id: f.id, name: f.name, sub: f.sub, icon: f.icon })) });
    const ap = (nq ? apps.list.filter((a) => norm(a.name).includes(nq)) : apps.list.slice(0, 6)).slice(0, nq ? 8 : 6);
    if (ap.length) g.push({ title: 'Aplicaciones', items: ap.map((a) => ({ k: 'app', id: a.appId, name: a.name, sub: 'Aplicación', icon: 'grid', pin: { type: 'app', appId: a.appId, name: a.name } })) });
    const rc = (nq ? recent.list.filter((r) => norm(r.name).includes(nq)) : recent.list).slice(0, 6);
    if (rc.length) g.push({ title: 'Recientes', items: rc.map((r) => ({ k: r.isDir ? 'dir' : 'file', id: r.path, name: r.name, sub: r.path, icon: r.isDir ? 'folder' : 'file', pin: { type: r.isDir ? 'folder' : 'file', path: r.path, name: r.name } })) });
    if (files.list.length) g.push({ title: 'Archivos y carpetas', items: files.list.map((f) => ({ k: f.isDir ? 'dir' : 'file', id: f.path, name: f.name, sub: f.path + (f.size != null ? ' · ' + fmtSize(f.size) : ''), icon: f.isDir ? 'folder' : 'file', pin: { type: f.isDir ? 'folder' : 'file', path: f.path, name: f.name } })) });
    return g;
  }, [nq, apps.list, recent.list, files.list]);
  const flat = groups.flatMap((g) => g.items);
  useEffect(() => setSel(0), [q]);

  const activate = async (it) => {
    if (!it) return;
    try {
      if (it.k === 'fn') { onClose(); if (it.id === '@assistant') onExit(); else if (it.id === '@nova-settings') onAssistantSettings(); else D.open(it.id); return; }
      if (it.k === 'dir') { onClose(); D.open('explorer', { path: it.id }); return; }
      onClose();
      if (it.k === 'app') await run('apps.launch', { appId: it.id }); else await run('fs.open', { path: it.id });
    } catch (e) { D.toast(msgOf(e), 'err'); }
  };
  const pin = (it) => {
    if (p.dock.pins.some((x) => (x.appId || x.path) === (it.pin.appId || it.pin.path))) return D.toast('Ya está en el dock');
    setDeep('dock.pins', [...p.dock.pins, it.pin]); D.toast('«' + it.name + '» fijado en el dock');
  };
  const key = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') activate(flat[sel]);
  };
  let idx = -1;
  return (<div className="nd-start" role="dialog" aria-label="Inicio y búsqueda" onKeyDown={key}>
    <div className="in"><Icon n="search" s={18} /><input ref={box} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca aplicaciones, archivos, carpetas o funciones de Nova" aria-label="Buscar" /><span className="nd-key">Esc</span></div>
    <div className="nd-res" role="listbox">
      {groups.map((g) => (<div key={g.title}><h4>{g.title}</h4>{g.items.map((it) => { idx += 1; const i = idx; return (
        <div key={it.k + it.id} className="nd-row"><button role="option" aria-selected={i === sel} className="nd-it" onMouseEnter={() => setSel(i)} onClick={() => activate(it)}><Icon n={it.icon} s={18} /><span className="tx"><div>{it.name}</div><div className="sub">{it.sub}</div></span></button>
          {it.pin && <button className="nd-btn ico" aria-label={'Fijar ' + it.name + ' en el dock'} title="Fijar en el dock" onClick={() => pin(it)}><Icon n="pin" s={15} /></button>}</div>); })}</div>))}
      {apps.loading && <div className="nd-row nd-mut" style={{ padding: 10 }}><span className="nd-spin" />Leyendo aplicaciones instaladas…</div>}
      {apps.err && <div className="nd-note warn" style={{ margin: 6 }}>No se pudieron leer las aplicaciones: {apps.err}</div>}
      {files.loading && <div className="nd-row nd-mut" style={{ padding: 10 }}><span className="nd-spin" />Buscando archivos…</div>}
      {files.err && <div className="nd-note err" style={{ margin: 6 }}>La búsqueda falló: {files.err}</div>}
      {files.note && <div className="nd-mut" style={{ padding: '4px 12px', fontSize: 11.5 }}>{files.note}</div>}
      {!flat.length && !apps.loading && !files.loading && nq && <div className="nd-empty">Sin resultados para «{q}»</div>}
    </div></div>);
}
