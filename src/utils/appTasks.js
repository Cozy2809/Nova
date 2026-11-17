// Abrir cualquier aplicación por nombre aproximado y hacer fotos con la cámara (siempre con permiso).
import { APPS } from './apps.js';
import { nv } from './nova.js';
const PFX = '^(?:por favor[,\\s]+)?(?:(?:nova|jarvis)[,\\s]+)?';
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const KNOWN = (q) => APPS.some((a) => a.aliases.some((al) => q === al || q.startsWith(al + ' ')));
export function parseCamIntent(t) {
  const s = String(t).trim().replace(/[.!?¿¡]+$/g, '');
  if (new RegExp(PFX + '(?:abre|abrir|[aá]breme|enciende|activa|usa|lanza)\\s+(?:la\\s+)?(?:app\\s+(?:de\\s+(?:la\\s+)?)?|aplicaci[oó]n\\s+(?:de\\s+(?:la\\s+)?)?)?c[aá]mara\\s+y\\s+(?:haz|hazme|toma|t[oó]mame|saca|s[aá]came|hazte)\\s+(?:una\\s+)?(?:foto|fotograf[ií]a|selfie|selfi)$', 'i').test(s)) return { type: 'cam_photo' };
  if (new RegExp(PFX + '(?:haz|hazme|toma|t[oó]mame|saca|s[aá]came)\\s+(?:una\\s+)?(?:foto|fotograf[ií]a|selfie|selfi)(?:\\s+(?:con|de)\\s+(?:la\\s+)?c[aá]mara)?$', 'i').test(s)) return { type: 'cam_photo' };
  if (new RegExp(PFX + '(?:abre|abrir|[aá]breme|enciende|activa|usa|lanza)\\s+(?:la\\s+)?(?:app\\s+(?:de\\s+(?:la\\s+)?)?|aplicaci[oó]n\\s+(?:de\\s+(?:la\\s+)?)?)?c[aá]mara$', 'i').test(s)) return { type: 'cam_open' };
  return null;
}
export function parseAppIntent(t) {
  const s = String(t).trim().replace(/[.!?¿¡]+$/g, ''); const m = s.match(new RegExp(PFX + '(?:abre|abrir|[aá]breme|abreme|lanza|l[aá]nzame|inicia|ejecuta|arranca)\\s+(?:(?:la|el|mi|una?|las|los)\\s+)?(?:(?:aplicaci[oó]n|app|programa)\\s+(?:de\\s+(?:la\\s+|el\\s+)?)?)?(.{2,40})$', 'i'));
  if (!m) return null; const q = norm(m[1]);
  if (!q || q.split(' ').length > 5 || KNOWN(q) || /^(carpeta|archivo|fichero|documento|pdf|biblioteca|enlace|pagina|web|url|http|todo|cualquier|algo)\b/.test(q) || /\b(carpeta|archivo|fichero|escritorio|descargas)\b/.test(q)) return null;
  return { type: 'app_open', query: m[1].trim() };
}
async function captureInternal() {
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false }); } catch { return { error: 'no he podido acceder a la cámara (revisa los permisos de cámara de Windows)' }; }
  try {
    const v = document.createElement('video'); v.srcObject = stream; v.muted = true; await v.play(); await new Promise((r) => setTimeout(r, 1600));
    const c = document.createElement('canvas'); c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return await nv('camera:save', { b64: c.toDataURL('image/jpeg', 0.92).split(',')[1] });
  } finally { stream.getTracks().forEach((x) => x.stop()); }
}
export async function runAppIntent(i) {
  if (i.type === 'cam_open') { const a = await nv('camera:ask', { shot: false }); if (!a.ok) return a.error ? `No puedo abrir la cámara, Señor: ${a.error}.` : 'Entendido, Señor: no abro la cámara.'; const r = await nv('camera:app', { shot: false }); return r.ok ? 'Cámara abierta, Señor.' : `No he podido abrir la cámara, Señor: ${r.error}.`; }
  if (i.type === 'cam_photo') {
    const a = await nv('camera:ask', { shot: true }); if (!a.ok) return a.error ? `No puedo usar la cámara, Señor: ${a.error}.` : 'Entendido, Señor: no usaré la cámara.';
    let mode = 'app'; try { mode = (await window.jarvis.getSettings()).cameraMode || 'app'; } catch {}
    let r = null; if (mode !== 'interna') r = await nv('camera:app', { shot: true });
    const fallback = !r?.ok; if (fallback) r = await captureInternal();
    if (r.error) return `No he podido hacer la foto, Señor: ${r.error}.`;
    window.dispatchEvent(new CustomEvent('nova-photo', { detail: r }));
    return `Foto hecha, Señor${fallback && mode !== 'interna' ? ' (con la cámara interna, porque la app no respondió)' : ''}. La tiene en ${r.path}.`;
  }
  if (i.type === 'app_open') {
    const r = await nv('app:find', { q: i.query }); if (r.error) return `No puedo buscar aplicaciones, Señor: ${r.error}.`;
    const best = r.matches?.[0]; if (!best) return `No encuentro ninguna aplicación parecida a «${i.query}», Señor.`;
    const l = await nv('app:launch', { appId: best.appId, sure: best.score >= 0.92 });
    return l.denied ? 'De acuerdo, Señor: no la abro.' : l.error ? `No he podido abrirla, Señor: ${l.error}.` : `Abriendo «${l.name}», Señor.`;
  }
  return null;
}
