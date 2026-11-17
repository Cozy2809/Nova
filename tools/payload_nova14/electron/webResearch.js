// Investigación web para redactar documentos: busca en Brave, descarga las mejores páginas PÚBLICAS y extrae su texto.
// Solo lectura. Nunca visita direcciones locales/privadas ni redes sociales. Necesita BRAVE_SEARCH_API_KEY en .env.
const BLOCK = /(^|\.)(youtube\.com|youtu\.be|facebook\.com|instagram\.com|tiktok\.com|twitter\.com|x\.com|pinterest\.[a-z.]+|reddit\.com|linkedin\.com)$/i;
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ntilde: 'ñ', Ntilde: 'Ñ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', uuml: 'ü', iquest: '¿', iexcl: '¡', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»' };
const cp = (n) => { try { return String.fromCodePoint(n); } catch { return ' '; } };
const decode = (s) => String(s).replace(/&#(\d+);/g, (_, n) => cp(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => cp(parseInt(n, 16))).replace(/&([a-zA-Z]+);/g, (m, n) => ENT[n] ?? m);

function publicUrl(u) {
  let x; try { x = new URL(u); } catch { return null; }
  if (!/^https?:$/.test(x.protocol)) return null;
  const h = x.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.includes(':')) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) { const [a, b] = h.split('.').map(Number); if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null; }
  return x;
}

// Texto legible de una página: párrafos <p> largos; si no hay, todo el texto visible. Máximo ~1400 caracteres (el modelo local es pequeño).
function extract(html, max = 1400) {
  const h = String(html).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|iframe|figure|table)\b[\s\S]*?<\/\1>/gi, ' ');
  const paras = [...h.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => decode(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()).filter((s) => s.length > 60);
  let out = paras.join('\n');
  if (out.length < 300) out = decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return out.slice(0, max);
}

async function page(r) {
  const u = publicUrl(r.url); if (!u || BLOCK.test(u.hostname)) return null;
  const res = await fetch(u.href, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NovaBot/1.0)', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'es,en;q=0.7' } });
  if (!res.ok || !publicUrl(res.url)) return null;
  const ct = res.headers.get('content-type') || ''; if (!/text\/html|application\/xhtml/i.test(ct)) return null;
  const buf = Buffer.from(await res.arrayBuffer()).subarray(0, 700000);
  const cs = (ct.match(/charset=([\w-]+)/i) || [])[1] || (buf.toString('latin1', 0, 3000).match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
  let html; try { html = new TextDecoder(cs).decode(buf); } catch { html = buf.toString('utf8'); }
  const text = extract(html); if (text.length < 200) return null;
  return { title: decode(String(r.title || u.hostname)).replace(/<[^>]+>/g, '').slice(0, 120), url: res.url, text };
}

async function research(topic) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return { error: 'Falta BRAVE_SEARCH_API_KEY en .env' };
  const q = String(topic || '').slice(0, 200).trim(); if (!q) return { error: 'Tema vacío' };
  let results;
  try {
    const r = await fetch('https://api.search.brave.com/res/v1/web/search?count=8&search_lang=es&q=' + encodeURIComponent(q), { headers: { 'X-Subscription-Token': key, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return { error: 'Brave Search respondió ' + r.status };
    results = ((await r.json()).web?.results || []).map((x) => ({ title: x.title, url: x.url, description: x.description }));
  } catch (e) { return { error: 'La búsqueda ha fallado' }; }
  const settled = await Promise.allSettled(results.slice(0, 8).map(page));
  const pages = settled.map((s) => (s.status === 'fulfilled' ? s.value : null)).filter(Boolean).slice(0, 4);
  return { ok: true, pages, snippets: results.slice(0, 6) };
}
module.exports = { research, extract, publicUrl };
