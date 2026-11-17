import React from 'react';
export default function ArcReactor() {
  return (<svg viewBox="0 0 200 200" className="glow w-40 h-40 mx-auto" aria-hidden="true">
    <g className="ring" style={{ transformOrigin: '100px 100px' }}><circle cx="100" cy="100" r="90" fill="none" stroke="#00e5ff" strokeWidth="3" strokeDasharray="12 8" /></g>
    <g className="ring2" style={{ transformOrigin: '100px 100px' }}><circle cx="100" cy="100" r="68" fill="none" stroke="#00e5ff" strokeWidth="2" strokeDasharray="30 10" /></g>
    <circle cx="100" cy="100" r="40" fill="rgba(0,229,255,.15)" stroke="#00e5ff" strokeWidth="2" />
    <circle cx="100" cy="100" r="16" fill="#00e5ff" style={{ animation: 'pulse 2s infinite' }} /></svg>);
}
