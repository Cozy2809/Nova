import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { run, msgOf } from '../agent.js';
import { useDesk, fmtSize, fmtDate } from '../util.js';
import { usePrefs, setDeep } from '../prefs.js';

let clip = null; // { mode:'copy'|'move', paths } — compartido entre ventanas de Archivos
const sepOf = (p) => (p.includes('\\') ? '\\' : '/');
const crumbs = (p) => {
  const s = sepOf(p); const parts = p.split(/[\\/]/); const out = []; let acc = '';
  parts.forEach((x, i) => { acc = i === 0 ? x + (parts.length > 1 ? s : '') : acc + (acc.endsWith(s) ? '' : s) + x; if (x) out.push({ name: x, path: acc }); });
  return out;
};

export default function Explorer({ props }) {
  const D = useDesk(); const prefs = usePrefs();
  const [places, setPlaces] = useState({ list: [], err: '' });
  const [dir, setDir] = useState(null); const [cur, setCur] = useState(props?.path || null);
  const [state, setState] = useState({ loading: true, err: '' });
  const [sel, setSel] = useState([]); const [anchor, setAnchor] = useState(null);
  const [sort, setSort] = useState({ k: 'name', d: 1 });
  const [q, setQ] = useState(''); const [found, setFound] = useState(null);
  const [msg, setMsg] = useState(null); const [hist, setHist] = useState({ back: [], fwd: [] });
  const [, force] = useState(0);

  useEffect(() => {
    run('fs.places').then((r) => {
      setPlaces({ list: r.places, err: '' });
      if (!cur && r.places.length) setCur((r.places.find((x) => x.id === 'documents') || r.places[0]).path);
      else if (!cur) setState({ loading: false, err: 'No hay carpetas personales disponibles' });
    }).catch((e) => { setPlaces({ list: [], err: msgOf(e) }); setState({ loading: false, err: msgOf(e) }); });
  }, []); // eslint-disable-line
  useEffect(() => { if (props?.path && props.path !== cur) go(props.path); }, [props?.path]); // eslint-disable-line

  const load = useCallback(async (p) => {
    setState({ loading: true, err: '' }); setSel([]); setFound(null);
    try { const r = await run('fs.list', { path: p }); setDir(r); setState({ loading: false, err: '' }); }
    catch (e) { setState({ loading: false, err: msgOf(e) }); }
  }, []);
  useEffect(() => { if (cur) load(cur); }, [cur, load]);

  const go = (p, push = true) => { if (push && cur) setHist((h) => ({ back: [...h.back, cur], fwd: [] })); setCur(p); setQ(''); };
  const back = () => { const b = hist.back.slice(); const p = b.pop(); if (!p) return; setHist({ back: b, fwd: [cur, ...hist.fwd] }); setCur(p); };
  const fwd = () => { const [p, ...rest] = hist.fwd; if (!p) return; setHist({ back: [...hist.back, cur], fwd: rest }); setCur(p); };

  const items = useMemo(() => {
    const base = found ? found.items : dir?.items || []; const k = sort.k, m = sort.d;
    return [...base].sort((a, b) => {
      if (!found && a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      const v = k === 'name' ? a.name.localeCompare(b.name, 'es', { numeric: true }) : k === 'size' ? (a.size ?? -1) - (b.size ?? -1) : k === 'type' ? (a.ext || '').localeCompare(b.ext || '') : (a.mtime || 0) - (b.mtime || 0);
      return v * m;
    });
  }, [dir, found, sort]);
  const selItems = items.filter((i) => sel.includes(i.path));
  const one = selItems.length === 1;

  const click = (e, it, i) => {
    if (e.shiftKey && anchor != null) { const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)]; setSel(items.slice(a, b + 1).map((x) => x.path)); }
    else if (e.ctrlKey || e.metaKey) setSel((s) => (s.includes(it.path) ? s.filter((x) => x !== it.path) : [...s, it.path]));
    else setSel([it.path]);
    if (!e.shiftKey) setAnchor(i);
  };
  const openIt = async (it) => {
    if (it.isDir) return go(it.path);
    try { await run('fs.open', { path: it.path }); setMsg({ t: 'Abierto «' + it.name + '»' }); } catch (e) { setMsg({ t: msgOf(e), err: true }); }
  };
  // Las operaciones que modifican pasan por el agente: él pide la confirmación y comprueba el resultado real
  const act = async (fn, ok) => {
    try { const r = await fn(); setMsg({ t: ok(r) }); await load(cur); }
    catch (e) { const cancelled = e.action?.state === 'cancelled'; setMsg({ t: cancelled ? 'Operación cancelada: ' + msgOf(e) : msgOf(e), err: !cancelled }); }
  };
  const newFolder = async () => {
    const n = await D.ask({ title: 'Nueva carpeta', label: 'Nombre', value: 'Nueva carpeta', okText: 'Crear' });
    if (n) act(() => run('fs.mkdir', { path: cur + (cur.endsWith(sepOf(cur)) ? '' : sepOf(cur)) + n }), () => 'Carpeta «' + n + '» creada');
  };
  const rename = async () => {
    const it = selItems[0]; if (!it) return;
    const n = await D.ask({ title: 'Renombrar', label: 'Nuevo nombre', value: it.name, okText: 'Renombrar' });
    if (n && n !== it.name) act(() => run('fs.rename', { path: it.path, newName: n }), () => 'Renombrado a «' + n + '»');
  };
  const trash = () => act(() => run('fs.trash', { paths: selItems.map((i) => i.path) }), (r) => r.done.length + ' elemento(s) enviados a la Papelera');
  const setClip = (mode) => { clip = { mode, paths: selItems.map((i) => i.path) }; setMsg({ t: (mode === 'copy' ? 'Copiar' : 'Mover') + ': ' + clip.paths.length + ' elemento(s). Ve a la carpeta de destino y pulsa «Pegar aquí».' }); force((n) => n + 1); };
  const paste = () => {
    const c = clip; if (!c) return;
    act(() => run(c.mode === 'copy' ? 'fs.copy' : 'fs.move', { paths: c.paths, toDir: cur }), (r) => { if (c.mode === 'move') clip = null; return r.done.length + ' elemento(s) ' + (c.mode === 'copy' ? 'copiados' : 'movidos'); });
  };
  const pin = () => {
    const it = selItems[0]; if (!it) return; const pins = prefs.dock.pins;
    if (pins.some((x) => x.path === it.path)) return D.toast('Ya está en el dock');
    setDeep('dock.pins', [...pins, { type: it.isDir ? 'folder' : 'file', path: it.path, name: it.name }]); D.toast('«' + it.name + '» fijado en el dock');
  };
  const search = async (e) => {
    e.preventDefault(); const s = q.trim(); if (!s) return setFound(null);
    setState({ loading: true, err: '' });
    try { const r = await run('fs.search', { query: s, folder: cur, limit: 100 }); setFound({ items: r.items, q: s, note: r.note || '', truncated: r.truncated, source: r.source }); setState({ loading: false, err: '' }); setSel([]); }
    catch (er) { setState({ loading: false, err: msgOf(er) }); }
  };
  const head = (k, label) => (
    <button aria-sort={sort.k === k ? (sort.d > 0 ? 'ascending' : 'descending') : undefined} onClick={() => setSort((s) => ({ k, d: s.k === k ? -s.d : 1 }))}>{label}{sort.k === k ? (sort.d > 0 ? ' ▲' : ' ▼') : ''}</button>
  );
  const onKey = (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Enter' && selItems[0]) openIt(selItems[0]);
    else if (e.key === 'F2') rename();
    else if (e.key === 'Delete' && selItems.length) trash();
    else if (e.key === 'Backspace' && dir?.parent) go(dir.parent);
    else if (e.ctrlKey && e.key === 'c' && selItems.length) setClip('copy');
    else if (e.ctrlKey && e.key === 'x' && selItems.length) setClip('move');
    else if (e.ctrlKey && e.key === 'v') paste();
    else if (e.ctrlKey && e.key === 'a') { e.preventDefault(); setSel(items.map((i) => i.path)); }
  };
  const pinnedFolders = prefs.dock.pins.filter((x) => x.type === 'folder');

  return (
    <div className="nd-ex" onKeyDown={onKey}>
      <nav className="nd-side" aria-label="Ubicaciones">
        {places.list.map((pl) => <button key={pl.id} aria-current={!!dir && dir.path.toLowerCase().startsWith(pl.path.toLowerCase())} onClick={() => go(pl.path)}><Icon n="folder" s={16} />{pl.label}</button>)}
        {places.err && <div className="nd-note err" style={{ fontSize: 12 }}>{places.err}</div>}
        {pinnedFolders.length > 0 && <div className="nd-mut" style={{ fontSize: 11, padding: '8px 9px 2px' }}>Fijadas</div>}
        {pinnedFolders.map((x) => <button key={x.path} onClick={() => go(x.path)}><Icon n="pin" s={15} />{x.name}</button>)}
      </nav>
      <div className="nd-main">
        <div className="nd-tool">
          <button className="nd-btn ico" aria-label="Atrás" disabled={!hist.back.length} onClick={back}><Icon n="back" s={16} /></button>
          <button className="nd-btn ico" aria-label="Adelante" disabled={!hist.fwd.length} onClick={fwd}><Icon n="fwd" s={16} /></button>
          <button className="nd-btn ico" aria-label="Subir un nivel" disabled={!dir?.parent} onClick={() => go(dir.parent)}><Icon n="up" s={16} /></button>
          <button className="nd-btn ico" aria-label="Actualizar" onClick={() => cur && load(cur)}><Icon n="refresh" s={16} /></button>
          <div className="nd-path" title={dir?.path || ''}>
            {dir && crumbs(dir.path).map((c, i, a) => (<React.Fragment key={c.path}><button onClick={() => go(c.path)}>{c.name}</button>{i < a.length - 1 && <span className="nd-mut">›</span>}</React.Fragment>))}
          </div>
          <form onSubmit={search} className="nd-row" role="search">
            <input className="nd-in" style={{ width: 160 }} value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setFound(null); }} placeholder="Buscar aquí" aria-label="Buscar en esta carpeta" />
          </form>
        </div>
        <div className="nd-tool" role="toolbar" aria-label="Acciones">
          <button className="nd-btn" onClick={newFolder} disabled={!dir || !!found}><Icon n="plus" s={15} />Nueva carpeta</button>
          <button className="nd-btn" disabled={!one} onClick={rename}><Icon n="edit" s={15} />Renombrar</button>
          <button className="nd-btn" disabled={!selItems.length} onClick={() => setClip('copy')}><Icon n="copy" s={15} />Copiar</button>
          <button className="nd-btn" disabled={!selItems.length} onClick={() => setClip('move')}><Icon n="cut" s={15} />Mover</button>
          <button className="nd-btn" disabled={!clip || !!found} onClick={paste} title={clip ? `${clip.paths.length} elemento(s) para ${clip.mode === 'copy' ? 'copiar' : 'mover'}` : 'No hay nada copiado ni cortado'}><Icon n="paste" s={15} />Pegar aquí</button>
          <button className="nd-btn danger" disabled={!selItems.length} onClick={trash}><Icon n="trash" s={15} />Papelera</button>
          <span className="nd-sp" />
          <button className="nd-btn" disabled={!one} onClick={pin}><Icon n="pin" s={15} />Fijar en el dock</button>
          <button className="nd-btn" disabled={!one} onClick={() => run('fs.reveal', { path: selItems[0].path }).catch((e) => setMsg({ t: msgOf(e), err: true }))}>Mostrar en Windows</button>
        </div>
        <div className="nd-list" role="grid" aria-label="Contenido">
          <div className="nd-th" role="row">{head('name', 'Nombre')}{head('type', 'Tipo')}{head('size', 'Tamaño')}{head('date', 'Modificado')}</div>
          {state.loading && <div className="nd-empty"><span className="nd-spin" />Cargando…</div>}
          {!state.loading && state.err && <div className="nd-empty nd-err" role="alert"><Icon n="warn" s={22} />{state.err}</div>}
          {!state.loading && !state.err && found && (
            <div className="nd-mut" style={{ padding: '6px 12px', fontSize: 12 }}>
              {items.length} resultado(s) para «{found.q}» {found.source === 'windows-index' ? '(índice de Windows)' : '(recorrido de carpetas)'}{found.truncated ? ' · búsqueda recortada por tiempo' : ''}
              <button className="nd-btn" style={{ height: 24, marginLeft: 8 }} onClick={() => { setFound(null); setQ(''); }}>Volver a la carpeta</button>
              {found.note && <div>{found.note}</div>}
            </div>
          )}
          {!state.loading && !state.err && !items.length && <div className="nd-empty">{found ? 'Sin resultados' : 'Esta carpeta está vacía'}</div>}
          {!state.loading && !state.err && items.map((it, i) => (
            <div key={it.path} role="row" tabIndex={0} className="nd-tr" aria-selected={sel.includes(it.path)} onClick={(e) => click(e, it, i)} onDoubleClick={() => openIt(it)} onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); click(e, it, i); } }}>
              <span className="n"><Icon n={it.isDir ? 'folder' : 'file'} s={16} /><span title={it.path}>{it.name}</span></span>
              <span className="c">{it.isDir ? 'Carpeta' : (it.ext || 'archivo').toUpperCase()}</span><span className="c">{fmtSize(it.size)}</span><span className="c">{fmtDate(it.mtime)}</span>
            </div>
          ))}
        </div>
        <div className="nd-status" role="status">
          <span>{items.length} elemento(s){sel.length ? ` · ${sel.length} seleccionado(s)` : ''}{dir?.truncated ? ' · lista recortada a 1000' : ''}</span>
          {msg && <span className={msg.err ? 'nd-err' : ''} style={{ marginLeft: 'auto' }}>{msg.t}</span>}
        </div>
      </div>
    </div>
  );
}
