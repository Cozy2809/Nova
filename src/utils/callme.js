// Cómo te llama Nova: sustituye «Señor» por el apelativo elegido en Ajustes (solo al mostrar y al hablar).
let name = 'Señor';
const load = () => { try { window.jarvis.getSettings().then((s) => { const v = String(s?.callMe ?? '').trim(); name = v || 'Señor'; }).catch(() => {}); } catch {} };
if (typeof window !== 'undefined') { load(); window.addEventListener('nova-settings', load); }
export const callMe = (t) => (name === 'Señor' || typeof t !== 'string' ? t : t.replace(/\bSeñor\b/g, name).replace(/\bseñor\b/g, name));
