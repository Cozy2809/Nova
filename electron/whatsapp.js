// WhatsApp sin API de pago: abre la app (whatsapp://send) o WhatsApp Web (wa.me) con el mensaje YA escrito.
// NO lo envía solo: hay que pulsar Enviar. Los números salen de contacts.json (raíz del proyecto, fuera de git).
const { shell } = require('electron');
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'contacts.json'); // { "contacto": "NUMERO_E164_EJEMPLO" } (prefijo internacional, sin +)
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').replace(/^(?:mi|mis|el|la)\s+/, '').trim();

function loadContacts() {
  try {
    const out = {};
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8').replace(/^\uFEFF/, '')))) {
      const num = String(v).replace(/\D/g, '');
      if (/^\d{6,15}$/.test(num)) out[norm(k)] = num;
    }
    return out;
  } catch { return {}; }
}
function findPhone(contact) {
  const n = norm(contact); if (!n) return null;
  const c = loadContacts();
  if (c[n]) return c[n];
  const k = Object.keys(c).find((x) => x.startsWith(n) || n.startsWith(x));
  return k ? c[k] : null;
}

async function sendWhatsApp(contact, text) {
  const msg = String(text).trim().slice(0, 1000);
  if (!msg) throw new Error('Mensaje vacío');
  const phone = findPhone(contact);
  const enc = encodeURIComponent(msg);
  if (process.env.WHATSAPP_MODE !== 'web') {
    try { await shell.openExternal('whatsapp://send?' + (phone ? `phone=${phone}&` : '') + 'text=' + enc); return { ok: true, via: 'app', matched: !!phone }; } catch {}
  }
  await shell.openExternal(`https://wa.me/${phone || ''}?text=${enc}`);
  return { ok: true, via: 'web', matched: !!phone };
}
module.exports = { sendWhatsApp, findPhone };
