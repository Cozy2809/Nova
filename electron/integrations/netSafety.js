// Seguridad de red compartida por las integraciones: solo http/https hacia direcciones PÚBLICAS.
// Bloquea localhost, red local, enlace local, metadatos de la nube y rangos reservados (IPv4 e IPv6), y credenciales dentro de la URL.
'use strict';
const net = require('net');
const dns = require('dns').promises;

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);
const v4n = (ip) => ip.split('.').reduce((a, p) => ((a << 8) >>> 0) + Number(p), 0) >>> 0;
const V4_BLOCKED = [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]].map(([a, b]) => [v4n(a), b]);
const inNet = (n, base, bits) => (bits === 0 ? true : (n >>> (32 - bits)) === (base >>> (32 - bits)));

function expandV6(ip) {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const m = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (m) { const n = v4n(m[2]); s = m[1] + ((n >>> 16).toString(16)) + ':' + ((n & 0xffff).toString(16)); }
  const [head, tail] = s.split('::'); const h = head ? head.split(':') : [], t = tail !== undefined && tail ? tail.split(':') : [];
  const fill = tail === undefined ? [] : new Array(Math.max(0, 8 - h.length - t.length)).fill('0');
  const all = [...h, ...fill, ...t].map((x) => parseInt(x || '0', 16));
  return all.length === 8 && all.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? all : null;
}
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) { const n = v4n(ip); return V4_BLOCKED.some(([b, bits]) => inNet(n, b, bits)); }
  if (net.isIPv6(ip.replace(/^\[|\]$/g, ''))) {
    const g = expandV6(ip); if (!g) return true;
    if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1)) return true;           // :: y ::1
    if ((g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00) return true;     // ULA, enlace local, multicast
    if (g[0] === 0x2001 && g[1] === 0x0db8) return true;                                                          // documentación
    const emb = (a, b) => isPrivateIp(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`);
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return emb(g[6], g[7]);                           // IPv4 mapeada
    if (g[0] === 0x64 && g[1] === 0xff9b) return true;                                                            // NAT64
    if (g[0] === 0x2002) return emb(g[1], g[2]);                                                                  // 6to4
    return false;
  }
  return true; // no es una IP válida
}
function parseHttpUrl(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || s.length > 2000) throw new Error('URL vacía o demasiado larga');
  let u; try { u = new URL(s); } catch { throw new Error('URL no válida (incluye http:// o https://)'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Solo se permiten direcciones http o https');
  if (u.username || u.password) throw new Error('No se permiten credenciales dentro de la URL');
  if (!u.hostname) throw new Error('Falta el nombre del sitio');
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
  if (!ALLOWED_PORTS.has(port)) throw new Error('Puerto no permitido (solo 80, 443, 8080 y 8443)');
  u.hash = ''; return u;
}
/** Comprueba la URL y que TODAS las direcciones a las que resuelve el nombre sean públicas. */
async function assertPublicUrl(raw, lookup = (h) => dns.lookup(h, { all: true, verbatim: true })) {
  const u = parseHttpUrl(raw); const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$|\.localhost$|\.local$|\.internal$|\.lan$/i.test(host)) throw new Error('Ese sitio pertenece a la red local');
  const ips = net.isIP(host) ? [host] : (await lookup(host)).map((x) => (typeof x === 'string' ? x : x.address));
  if (!ips.length) throw new Error('No se pudo resolver el sitio');
  if (ips.some(isPrivateIp)) throw new Error('Ese sitio apunta a una dirección interna o reservada; Nova no accede a la red local');
  return u;
}
module.exports = { isPrivateIp, parseHttpUrl, assertPublicUrl, ALLOWED_PORTS };
