import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nv } from './useNative.js';
import { usePrefs } from '../prefs.js';
import './flow.css';

// Mapa de flujo 3D de Nova (estilo grafo de Obsidian): nodos = módulos, servicios, carpetas, archivos y aplicaciones;
// líneas = cómo se conectan. Sin dependencias: motor de fuerzas 3D y proyección en canvas.
const COLORS = { core: '#ffd36d', module: '#6fe3ff', service: '#c084fc', tool: '#6dffb0', folder: '#ffa66d', file: '#9db4d6', app: '#ff7ab8' };
const KIND_LABEL = { core: 'Núcleo', module: 'Módulos', service: 'Servicios', tool: 'Herramientas', folder: 'Carpetas', file: 'Archivos', app: 'Aplicaciones' };
const KIND_ONE = { core: 'Núcleo', module: 'Módulo', service: 'Servicio externo', tool: 'Herramientas del agente', folder: 'Carpeta', file: 'Archivo', app: 'Aplicación' };
const STATUS = { on: 'Activo', off: 'Inactivo', unknown: 'Sin datos' };
const BASE_R = { core: 11, module: 7, service: 6.5, tool: 5.5, folder: 5, file: 4, app: 5 };

const seed = (id) => { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const startPos = (id) => { const u = seed(id + 'a'), v = seed(id + 'b'), w = seed(id + 'c'); const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1), r = 90 + w * 130; return [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)]; };

function step(nodes, links, idx, alpha) {
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; const d2 = dx * dx + dy * dy + dz * dz + 1, d = Math.sqrt(d2), f = (2200 * alpha) / d2;
      dx /= d; dy /= d; dz /= d; a.vx += dx * f; a.vy += dy * f; a.vz += dz * f; b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f;
    }
  }
  for (const l of links) {
    const a = nodes[idx.get(l.s)], b = nodes[idx.get(l.t)]; if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, f = (d - (l.rest || 70)) * 0.035 * alpha;
    const fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f; a.vx += fx; a.vy += fy; a.vz += fz; b.vx -= fx; b.vy -= fy; b.vz -= fz;
  }
  for (const a of nodes) { a.vx -= a.x * 0.012 * alpha; a.vy -= a.y * 0.012 * alpha; a.vz -= a.z * 0.012 * alpha; a.vx *= 0.82; a.vy *= 0.82; a.vz *= 0.82; a.x += a.vx; a.y += a.vy; a.z += a.vz; }
}

export default function FlowMap() {
  const prefs = usePrefs();
  const [graph, setGraph] = useState(null), [err, setErr] = useState(''), [sel, setSel] = useState(null), [hov, setHov] = useState(null);
  const [q, setQ] = useState(''), [kinds, setKinds] = useState(() => new Set(Object.keys(COLORS))), [auto, setAuto] = useState(true), [loading, setLoading] = useState(false);
  const canvas = useRef(null), wrap = useRef(null), S = useRef({ nodes: [], links: [], idx: new Map(), yaw: 0.6, pitch: -0.35, zoom: 1.15, alpha: 1, ticks: 0, drag: null, proj: [], size: [800, 600], dpr: 1, last: 0, moved: false });
  const ui = useRef({ sel: null, hov: null, q: '', kinds, auto, motion: true }); ui.current = { sel, hov, q, kinds, auto, motion: prefs.nativeWidgets.animations !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches };

  const load = useCallback(async () => {
    setLoading(true); const r = await nv('flow-graph').catch((e) => ({ error: e.message })); setLoading(false);
    if (!r || r.error) { setErr((r && r.error) || 'No se pudo leer el estado de Nova.'); return; }
    setErr(''); setGraph(r);
    const s = S.current, old = new Map(s.nodes.map((n) => [n.id, n]));
    s.nodes = r.nodes.map((n) => { const o = old.get(n.id); const [x, y, z] = o ? [o.x, o.y, o.z] : startPos(n.id); return { ...n, x, y, z, vx: 0, vy: 0, vz: 0, r: (BASE_R[n.kind] || 5) + Math.sqrt(n.degree || 0) * 0.9 }; });
    s.idx = new Map(s.nodes.map((n, i) => [n.id, i]));
    s.links = r.links.map((l) => ({ ...l, rest: l.rest || (l.s === 'nova' || l.t === 'nova' ? 105 : 62) }));
    if (!old.size || r.nodes.some((n) => !old.has(n.id))) { s.alpha = old.size ? 0.45 : 1; s.ticks = 0; }
  }, []);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 20000); return () => clearInterval(t); }, [load]);

  const visible = useMemo(() => (graph ? graph.nodes.filter((n) => kinds.has(n.kind) && (!q || n.label.toLowerCase().includes(q.toLowerCase()))) : []), [graph, kinds, q]);
  const byId = useMemo(() => new Map((graph ? graph.nodes : []).map((n) => [n.id, n])), [graph]);
  const neighbors = useMemo(() => { const m = new Map(); if (graph) for (const l of graph.links) { (m.get(l.s) || m.set(l.s, []).get(l.s)).push({ id: l.t, label: l.label }); (m.get(l.t) || m.set(l.t, []).get(l.t)).push({ id: l.s, label: l.label }); } return m; }, [graph]);
  const focus = sel || hov; const near = useMemo(() => new Set(focus ? [focus, ...(neighbors.get(focus) || []).map((x) => x.id)] : []), [focus, neighbors]);
  const nearRef = useRef(near); nearRef.current = near;

  // ---- Dibujo ----
  useEffect(() => {
    const cv = canvas.current, box = wrap.current; if (!cv || !box) return undefined; const ctx = cv.getContext('2d'); let raf = 0, alive = true;
    const resize = () => { const r = box.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); S.current.dpr = dpr; S.current.size = [r.width, r.height]; cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr)); };
    resize(); const ro = new ResizeObserver(resize); ro.observe(box);
    const frame = (t) => {
      if (!alive) return; raf = requestAnimationFrame(frame);
      if (document.hidden) return; const s = S.current, u = ui.current, settled = s.alpha < 0.02, idle = settled && !s.drag && !(u.auto && u.motion);
      if (t - s.last < (s.drag ? 16 : 33)) return; if (idle && !u.motion && !s.dirty) return; s.last = t; s.dirty = false;
      for (let k = 0; k < 3 && s.alpha >= 0.02; k++) { step(s.nodes, s.links, s.idx, s.alpha); s.alpha *= 0.992; s.ticks++; }
      if (u.auto && u.motion && !s.drag && !u.sel) s.yaw += 0.0035;
      const [W, H] = s.size, cx = W / 2, cy = H / 2, D = 560, cyw = Math.cos(s.yaw), syw = Math.sin(s.yaw), cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const pr = new Array(s.nodes.length);
      s.nodes.forEach((n, i) => { const x1 = n.x * cyw + n.z * syw, z1 = -n.x * syw + n.z * cyw, y1 = n.y * cp - z1 * sp, z2 = n.y * sp + z1 * cp, k = D / (D + z2 + 260); pr[i] = { x: cx + x1 * k * s.zoom, y: cy + y1 * k * s.zoom, k, z: z2, n }; });
      s.proj = pr;
      const vis = (n) => u.kinds.has(n.kind) && (!u.q || n.label.toLowerCase().includes(u.q.toLowerCase())), nr = nearRef.current, hasFocus = nr.size > 0;
      // conexiones
      for (const l of s.links) {
        const a = pr[s.idx.get(l.s)], b = pr[s.idx.get(l.t)]; if (!a || !b || !vis(a.n) || !vis(b.n)) continue;
        const hot = hasFocus && nr.has(l.s) && nr.has(l.t) && (l.s === u.sel || l.t === u.sel || l.s === u.hov || l.t === u.hov), depth = Math.max(0.12, Math.min(0.55, (a.k + b.k) * 0.3));
        ctx.globalAlpha = hasFocus ? (hot ? 0.95 : 0.06) : depth; ctx.strokeStyle = hot ? '#6fe3ff' : '#9db4d6'; ctx.lineWidth = hot ? 1.6 : 0.8; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        if ((l.flow || hot) && u.motion) { const ph = ((t * 0.00035 + seed(l.s + l.t)) % 1); ctx.globalAlpha = hasFocus && !hot ? 0.1 : 0.95; ctx.fillStyle = hot ? '#fff' : '#6fe3ff'; ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * ph, a.y + (b.y - a.y) * ph, hot ? 2.4 : 1.9, 0, 6.283); ctx.fill(); }
      }
      // nodos, de atrás hacia delante
      const order = pr.slice().sort((p, q2) => q2.z - p.z);
      for (const p of order) {
        const n = p.n; if (!vis(n)) continue; const isF = n.id === u.sel || n.id === u.hov, dim = hasFocus && !nr.has(n.id), rad = Math.max(2, n.r * p.k * s.zoom * 0.9);
        ctx.globalAlpha = dim ? 0.15 : Math.max(0.45, Math.min(1, 0.55 + p.k * 0.45)); const c = COLORS[n.kind] || '#fff';
        const g = ctx.createRadialGradient(p.x - rad * 0.35, p.y - rad * 0.35, rad * 0.1, p.x, p.y, rad); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, c); g.addColorStop(1, c);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 6.283); ctx.fill();
        if (n.status === 'off') { ctx.globalAlpha *= 0.9; ctx.strokeStyle = '#ff5d7a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, rad + 2.5, 0, 6.283); ctx.stroke(); }
        if (isF) { ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p.x, p.y, rad + 4, 0, 6.283); ctx.stroke(); }
        const showLabel = isF || (hasFocus ? nr.has(n.id) : (n.kind === 'core' || n.kind === 'module' || (p.k > 0.82 && s.zoom > 1.05) || s.zoom > 1.8));
        if (showLabel) { ctx.globalAlpha = dim ? 0.2 : Math.min(1, 0.55 + p.k * 0.5); ctx.font = `${isF ? 600 : 500} ${Math.round(11 + p.k * 2)}px 'Segoe UI', sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#eaf4ff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(n.label, p.x, p.y + rad + 13); ctx.shadowBlur = 0; }
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  // ---- Interacción ----
  const pick = (e) => { const r = canvas.current.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, s = S.current; let best = null, bd = 1e9; for (const p of s.proj) { if (!ui.current.kinds.has(p.n.kind)) continue; const d = Math.hypot(p.x - mx, p.y - my), lim = Math.max(8, p.n.r * p.k * s.zoom) + 4; if (d < lim && d < bd) { best = p.n.id; bd = d; } } return best; };
  const down = (e) => { const s = S.current; s.drag = { x: e.clientX, y: e.clientY, yaw: s.yaw, pitch: s.pitch, moved: false }; canvas.current.setPointerCapture(e.pointerId); };
  const move = (e) => { const s = S.current; if (s.drag) { const dx = e.clientX - s.drag.x, dy = e.clientY - s.drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) s.drag.moved = true; s.yaw = s.drag.yaw + dx * 0.006; s.pitch = Math.max(-1.4, Math.min(1.4, s.drag.pitch + dy * 0.006)); s.dirty = true; } else { const id = pick(e); if (id !== ui.current.hov) { setHov(id); s.dirty = true; } } };
  const up = (e) => { const s = S.current, d = s.drag; s.drag = null; if (d && !d.moved) { const id = pick(e); setSel((cur) => (id === cur ? null : id)); } s.dirty = true; };
  const wheel = (e) => { const s = S.current; s.zoom = Math.max(0.4, Math.min(3.2, s.zoom * (e.deltaY > 0 ? 0.92 : 1.08))); s.dirty = true; };
  const reset = () => { const s = S.current; s.yaw = 0.6; s.pitch = -0.35; s.zoom = 1.15; s.alpha = Math.max(s.alpha, 0.3); s.ticks = 0; s.dirty = true; setSel(null); };
  const toggleKind = (k) => setKinds((cur) => { const n = new Set(cur); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const selNode = sel ? byId.get(sel) : null; const hovNode = hov ? byId.get(hov) : null;
  const shown = selNode || hovNode;

  return <>
    <header className="nvf-top">
      <h1>MAPA DE NOVA</h1>
      <input type="search" placeholder="Buscar en el mapa…" aria-label="Buscar en el mapa" value={q} onChange={(e) => setQ(e.target.value)} />
      {Object.keys(COLORS).map((k) => <button key={k} type="button" className="nvf-chip" style={{ '--c': COLORS[k] }} aria-pressed={kinds.has(k)} onClick={() => toggleKind(k)}><i />{KIND_LABEL[k]}{graph && graph.counts[k] ? ` ${graph.counts[k]}` : ''}</button>)}
      <span className="nvf-spacer" />
      <button type="button" className="nvf-btn" aria-pressed={auto} onClick={() => setAuto((v) => !v)}>Giro automático</button>
      <button type="button" className="nvf-btn" onClick={reset}>Restablecer vista</button>
      <button type="button" className="nvf-btn" disabled={loading} onClick={load}>{loading ? 'Actualizando…' : 'Actualizar'}</button>
    </header>
    <nav className="nvf-list" aria-label="Elementos del mapa">{[...visible].sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label, 'es')).map((n) => <button key={n.id} type="button" aria-current={sel === n.id} onClick={() => setSel((c) => (c === n.id ? null : n.id))} onMouseEnter={() => setHov(n.id)} onMouseLeave={() => setHov(null)}><i style={{ '--c': COLORS[n.kind] }} /><span>{n.label}</span></button>)}</nav>
    <div className="nvf-stage" ref={wrap}>
      <canvas ref={canvas} role="img" aria-label="Mapa 3D de cómo se conecta Nova con sus módulos, carpetas y aplicaciones. Usa la lista de la izquierda para navegarlo con teclado." onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => { if (!S.current.drag) setHov(null); }} onWheel={wheel} onDoubleClick={reset} />
      {!graph && !err && <div className="nvf-empty">Leyendo el estado de Nova…</div>}
      {err && <div className="nvf-empty">{err}</div>}
      <div className="nvf-hint">Arrastra para girar · rueda para acercar · clic en un nodo para ver sus conexiones · doble clic para restablecer</div>
    </div>
    <aside className="nvf-side" aria-live="polite">
      {shown ? <>
        <span className="nvf-tag" style={{ '--c': COLORS[shown.kind] }}><i />{KIND_ONE[shown.kind]}</span>
        <h2>{shown.label}</h2>
        <div><span className="nvf-status" data-s={shown.status}>{STATUS[shown.status]}</span></div>
        {shown.detail && <p>{shown.detail}</p>}
        {shown.path && <div className="nvf-path">{shown.path}</div>}
        <div className="nvf-links" role="list">{(neighbors.get(shown.id) || []).map((x, i) => { const o = byId.get(x.id); return o ? <button key={x.id + i} role="listitem" type="button" onClick={() => setSel(o.id)}><span>{o.label}</span><small>{x.label}</small></button> : null; })}</div>
      </> : <>
        <h2>Cómo funciona Nova</h2>
        <p>Cada punto es una pieza: <b>módulos</b> de Nova, <b>servicios</b> externos (Ollama, Piper, Tailscale…), <b>carpetas y archivos</b> con los que trabaja y <b>aplicaciones</b> de Windows con las que se relaciona.</p>
        <p>Las líneas son conexiones; los puntos que viajan por ellas marcan lo que está activo ahora. Un aro rojo indica algo inactivo o que falta.</p>
        <div className="nvf-flowkey"><b />conexión activa</div>
        <p className="nvf-path">Solo se muestran nombres y estados. Nunca el contenido de tus archivos, claves ni conversaciones.</p>
      </>}
      <div className="nvf-legend">{Object.keys(COLORS).map((k) => <span key={k} className="nvf-tag" style={{ '--c': COLORS[k] }}><i />{KIND_ONE[k]}</span>)}</div>
    </aside>
  </>;
}
