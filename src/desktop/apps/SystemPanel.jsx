import React, { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import { run, usePoll, msgOf } from '../agent.js';
import { pct } from '../util.js';

const Bar = ({ label, v, extra }) => (<div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 64px', gap: 10, alignItems: 'center' }}>
  <span className="nd-mut">{label}</span><div className="nd-meter" style={{ width: '100%', height: 8 }} data-hot={v >= 90 ? 1 : 0}><i style={{ width: (v ?? 0) + '%' }} /></div><b style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v == null ? 'N/D' : v + ' %'}</b>{extra}</div>);
const dur = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return (d ? d + ' d ' : '') + h + ' h ' + m + ' min'; };

export default function SystemPanel() {
  const [st, setSt] = useState(null); useEffect(() => window.jarvis?.onStats?.(setSt), []);
  const info = usePoll(() => run('system.metrics'), 0, {}); const net = usePoll(() => run('system.network'), 8000, {});
  const [pr, setPr] = useState({ loading: false, data: null, err: '' });
  const load = async () => { setPr({ loading: true, data: null, err: '' }); try { setPr({ loading: false, data: await run('system.processes'), err: '' }); } catch (e) { setPr({ loading: false, data: null, err: msgOf(e) }); } };
  const m = info.data;
  return (<div className="nd-pad">
    <div className="nd-card">
      {!st && <div className="nd-row nd-mut"><span className="nd-spin" />Esperando las primeras lecturas…</div>}
      <Bar label="CPU" v={pct(st?.cpu)} /><Bar label="RAM" v={pct(st?.ram)} /><Bar label="Disco" v={pct(st?.disk)} />
      <Bar label="GPU" v={pct(st?.gpu)} />
      <div className="nd-mut" style={{ fontSize: 12 }}>{Number.isFinite(st?.temp) ? `GPU ${st.gpuName || ''} · ${st.temp} °C` : 'Sin datos de temperatura (solo se leen en GPU NVIDIA)'}</div>
    </div>
    <div className="nd-card">
      <b>Equipo</b>
      {info.error && <div className="nd-err">{info.error}</div>}
      {m && <div className="nd-mut" style={{ lineHeight: 1.7 }}>{m.cpuModel || 'Procesador desconocido'} · {m.cores} hilos<br />Memoria instalada: {m.totalMemGB} GB<br />Encendido desde hace {dur(m.uptimeSec)}</div>}
    </div>
    <div className="nd-card">
      <div className="nd-row"><Icon n="net" s={18} /><b className="nd-grow">Red</b><span className="nd-mut" style={{ fontVariantNumeric: 'tabular-nums' }}>↓ {st?.rx ?? 'N/D'} · ↑ {st?.tx ?? 'N/D'} KB/s</span></div>
      {net.error && <div className="nd-err">{net.error}</div>}
      {net.data && (net.data.interfaces.length ? net.data.interfaces.map((i) => <div key={i.name + i.address} className="nd-mut">{i.name}: {i.address}</div>) : <div className="nd-mut">Sin interfaces de red activas</div>)}
    </div>
    <div className="nd-card">
      <div className="nd-row"><b className="nd-grow">Procesos que más consumen</b><button className="nd-btn" onClick={load} disabled={pr.loading}>{pr.loading ? 'Midiendo…' : pr.data ? 'Actualizar' : 'Medir ahora'}</button></div>
      {pr.err && <div className="nd-note err" role="alert">{pr.err}</div>}
      {pr.loading && <div className="nd-row nd-mut"><span className="nd-spin" />Leyendo procesos (puede tardar unos segundos)…</div>}
      {pr.data && (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div><div className="nd-mut" style={{ fontSize: 11.5 }}>Por CPU</div>{pr.data.cpu.map((p) => <div key={p.name} className="nd-row"><span className="nd-grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span><b>{p.cpu} %</b></div>)}</div>
        <div><div className="nd-mut" style={{ fontSize: 11.5 }}>Por RAM</div>{pr.data.ram.map((p) => <div key={p.name} className="nd-row"><span className="nd-grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span><b>{p.mb} MB</b></div>)}</div></div>)}
    </div></div>);
}
