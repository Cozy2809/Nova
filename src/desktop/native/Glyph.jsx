import React from 'react';
// Iconos de trazo propios del shell nativo (sin dependencias).
const P = {
  mic: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></>,
  widgets: <><rect x="4" y="4" width="7" height="7" rx="1.6" /><rect x="13" y="4" width="7" height="7" rx="1.6" /><rect x="4" y="13" width="7" height="7" rx="1.6" /><rect x="13" y="13" width="7" height="7" rx="1.6" /></>,
  start: <><rect x="4" y="4" width="7.2" height="7.2" rx=".8" /><rect x="12.8" y="4" width="7.2" height="7.2" rx=".8" /><rect x="4" y="12.8" width="7.2" height="7.2" rx=".8" /><rect x="12.8" y="12.8" width="7.2" height="7.2" rx=".8" /></>,
  tasks: <><rect x="3.5" y="6" width="12" height="9" rx="1.6" /><path d="M8 18.5h12.5V9.5" /></>,
  desktop: <><rect x="3.5" y="4.5" width="17" height="11" rx="1.6" /><path d="M9 19.5h6M12 15.5v4" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>,
  folder: <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2.2h8.5A1.5 1.5 0 0 1 21 9.7V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" />,
  file: <><path d="M6.5 3h7L18 7.5V20a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M13.5 3v4.5H18" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></>,
  flow: <><circle cx="12" cy="12" r="2.6" /><circle cx="5" cy="6" r="1.8" /><circle cx="19" cy="7" r="1.8" /><circle cx="7" cy="19" r="1.8" /><circle cx="18" cy="18" r="1.8" /><path d="m6.5 7 4 3.5M17.5 8.2l-4 2.8M8 17.4l2.8-3.2M16.6 16.6l-3.4-2.8" /></>,
  note: <><path d="M9 18V6l10-2v12" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="16" r="2" /></>,
  prev: <path d="M18 6v12M16 6 7 12l9 6z" />, next: <path d="M6 6v12M8 6l9 6-9 6z" />, play: <path d="M8 5.5v13l11-6.5z" />, pause: <path d="M8 5.5v13M16 5.5v13" />,
  close: <path d="m6 6 12 12M18 6 6 18" />, up: <path d="m6 14 6-6 6 6" />, down: <path d="m6 10 6 6 6-6" />,
};
export const Glyph = ({ n, s = 20 }) => <svg className="nv-glyph" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[n]}</svg>;
