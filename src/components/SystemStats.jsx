import React, { useEffect, useState } from 'react';
const Bar = ({ label, v, unit = '%' }) => (<div className="mb-2.5"><div className="flex justify-between text-xs mb-1"><span className="opacity-70 tracking-widest">{label}</span><span className="mono">{v ?? 'N/D'}{v != null && unit}</span></div>
  <div className="bar"><i style={{ width: `${Math.min(100, v ?? 0)}%` }} /></div></div>);
export default function SystemStats() {
  const [s, setS] = useState({}); useEffect(() => window.jarvis.onStats(setS), []);
  return (<div className="panel"><h3 className="mb-3">SISTEMA</h3>
    <Bar label="CPU" v={s.cpu} /><Bar label="RAM" v={s.ram} /><Bar label="GPU" v={s.gpu} /><Bar label="DISCO" v={s.disk} />
    <div className="text-xs opacity-70 mono">GPU {s.temp ?? 'N/D'}°C · ↓{s.rx ?? 0} ↑{s.tx ?? 0} KB/s</div></div>);
}
