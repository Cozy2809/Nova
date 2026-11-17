import React from 'react';
// Iconos de línea propios de Nova Desktop (24×24, trazo 1.6). Sin dependencias.
const P = {
  nova: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
  folder: <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2.2h8.5A1.5 1.5 0 0 1 21 9.7v8.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />,
  file: <><path d="M6.5 3h7L18 7.5V20a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M13.5 3v4.5H18" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5.5 5.5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></>,
  pulse: <path d="M3 12h4l2.2-6 4 12L15.5 12H21" />,
  music: <><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>,
  chip: <><rect x="6.5" y="6.5" width="11" height="11" rx="1.5" /><path d="M9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />, min: <path d="M6 12h12" />, max: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  restore: <><rect x="6" y="9" width="9" height="9" rx="1.3" /><path d="M9 9V7a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3" /></>,
  back: <path d="m14 6-6 6 6 6" />, fwd: <path d="m10 6 6 6-6 6" />, up: <path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" />,
  refresh: <path d="M19 8a7.5 7.5 0 0 0-13.2-1.5M5 4v3h3M5 16a7.5 7.5 0 0 0 13.2 1.5M19 20v-3h-3" />,
  plus: <path d="M12 5v14M5 12h14" />, trash: <><path d="M5 7h14M10 7V5h4v2M7 7l.8 12h8.4L17 7" /></>,
  copy: <><rect x="8" y="8" width="11" height="11" rx="1.5" /><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15" /></>,
  cut: <><circle cx="7" cy="17" r="2.5" /><circle cx="17" cy="17" r="2.5" /><path d="m8.5 15 8-10M15.5 15l-8-10" /></>,
  paste: <><rect x="6" y="5" width="12" height="15" rx="1.5" /><path d="M9.5 5V4h5v1" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  play: <path d="M8 5.5v13l11-6.5z" />, pause: <path d="M8 5.5v13M16 5.5v13" />, next: <path d="M6 6v12l9-6zM18 6v12" />, prev: <path d="M18 6v12l-9-6zM6 6v12" />,
  vol: <><path d="M4 10v4h3.5L12 18V6L7.5 10z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" /></>, mute: <><path d="M4 10v4h3.5L12 18V6L7.5 10z" /><path d="m16 9.5 4 5M20 9.5l-4 5" /></>,
  net: <><path d="M3.5 9.5a12 12 0 0 1 17 0M6.5 12.8a7.7 7.7 0 0 1 11 0M9.6 16a3.4 3.4 0 0 1 4.8 0" /><circle cx="12" cy="19" r=".9" fill="currentColor" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  pin: <path d="m14 4 6 6-3 .8-3.2 3.2.5 4.2-1.8 1.8-3.3-4.4L5 20l-.2-.2 4.4-5.2L4.8 11.5l1.8-1.8 4.2.5L14 7z" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  windows: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 9h16" /></>, tile: <><rect x="4" y="4" width="7" height="16" rx="1.3" /><rect x="13" y="4" width="7" height="7" rx="1.3" /><rect x="13" y="13" width="7" height="7" rx="1.3" /></>,
  warn: <><path d="M12 4 3 19.5h18z" /><path d="M12 10v4.5M12 17v.2" /></>, check: <path d="m5 12.5 4.5 4.5L19 7.5" />, mic: <><rect x="9" y="4" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></>,
};
export default function Icon({ n, s = 18, className = '' }) {
  return <svg className={'nd-ico ' + className} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[n] || P.file}</svg>;
}
