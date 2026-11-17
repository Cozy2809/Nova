"""Puente de Nova con Scrapling (https://github.com/D4Vinci/Scrapling, licencia BSD-3-Clause).

Lee UNA petición JSON por stdin y escribe UNA respuesta JSON por stdout. Solo usa HTTP + análisis (Fetcher):
no usa navegadores, modo sigiloso ni evasión de protecciones antibot. Revalida cada salto de redirección,
solo accede a direcciones públicas, respeta robots.txt (salvo orden contraria del usuario) y limita tamaño y tiempo.
"""
import ipaddress
import json
import socket
import sys
import time
import urllib.parse
import urllib.request
import urllib.robotparser

UA = "Nova-Scrapling/1.0"
ALLOWED_PORTS = {80, 443, 8080, 8443}
MAX_REDIRECTS = 5
MAX_CHARS = 60000
MAX_ITEMS = 200
SKIP_EXT = (".pdf", ".zip", ".rar", ".7z", ".exe", ".msi", ".dmg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp3", ".mp4", ".avi", ".mov", ".css", ".js", ".ico", ".woff", ".woff2")


class Refused(Exception):
    pass


def resolve(host):
    return [x[4][0] for x in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)]


def blocked_ip(text):
    ip = ipaddress.ip_address(text.split("%")[0])
    if ip.version == 6:
        if ip.ipv4_mapped is not None:
            return blocked_ip(str(ip.ipv4_mapped))
        if ip.sixtofour is not None:
            return blocked_ip(str(ip.sixtofour))
        if ip in ipaddress.ip_network("64:ff9b::/96"):
            return True
    return (not ip.is_global) or ip.is_multicast or ip.is_loopback or ip.is_link_local or ip.is_unspecified or ip.is_reserved


def check_url(url):
    p = urllib.parse.urlsplit(url)
    if p.scheme not in ("http", "https"):
        raise Refused("Solo se permiten direcciones http o https")
    if p.username or p.password:
        raise Refused("No se permiten credenciales dentro de la URL")
    host = p.hostname
    if not host:
        raise Refused("Falta el nombre del sitio")
    port = p.port or (443 if p.scheme == "https" else 80)
    if port not in ALLOWED_PORTS:
        raise Refused("Puerto no permitido")
    low = host.lower()
    if low == "localhost" or low.endswith((".localhost", ".local", ".internal", ".lan")):
        raise Refused("Ese sitio pertenece a la red local")
    try:
        ips = [host] if _is_ip(host) else resolve(host)
    except OSError:
        raise Refused("No se pudo resolver el sitio")
    if not ips or any(blocked_ip(i) for i in ips):
        raise Refused("Ese sitio apunta a una dirección interna o reservada")
    return p


def _is_ip(s):
    try:
        ipaddress.ip_address(s)
        return True
    except ValueError:
        return False


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def robots_for(url, cache):
    p = urllib.parse.urlsplit(url)
    origin = f"{p.scheme}://{p.netloc}"
    if origin in cache:
        return cache[origin]
    rp = urllib.robotparser.RobotFileParser()
    try:
        check_url(origin + "/robots.txt")
        req = urllib.request.Request(origin + "/robots.txt", headers={"User-Agent": UA})
        with urllib.request.build_opener(_NoRedirect).open(req, timeout=8) as r:
            rp.parse(r.read(200000).decode("utf-8", "ignore").splitlines())
    except Exception:
        rp = None  # sin robots.txt legible: se permite
    cache[origin] = rp
    return rp


def get_header(page, name):
    h = getattr(page, "headers", None) or {}
    try:
        for k, v in dict(h).items():
            if str(k).lower() == name:
                return str(v)
    except Exception:
        pass
    return ""


def fetch(url, obey, cache):
    from scrapling.fetchers import Fetcher

    for _ in range(MAX_REDIRECTS + 1):
        check_url(url)
        if obey:
            rp = robots_for(url, cache)
            if rp is not None and not rp.can_fetch(UA, url):
                raise Refused("robots.txt de ese sitio no permite leer esa página")
        try:
            page = Fetcher.get(url, follow_redirects=False, timeout=20)
        except TypeError:
            raise Refused("Esta versión de Scrapling no permite desactivar las redirecciones automáticas; actualiza Scrapling para usar esta función con seguridad")
        status = int(getattr(page, "status", 0) or 0)
        if status in (301, 302, 303, 307, 308):
            loc = get_header(page, "location")
            if not loc:
                return page, url, status
            url = urllib.parse.urljoin(url, loc)
            continue
        return page, url, status
    raise Refused("Demasiadas redirecciones")


def as_text(v):
    return "" if v is None else str(v)


def page_content(page, fmt):
    if fmt == "markdown":
        try:
            md = as_text(page.markdown())
            if md.strip():
                return md, "markdown"
        except Exception:
            pass
    parts = [as_text(x).strip() for x in page.css("body ::text").getall()]
    return "\n".join(x for x in parts if x), "texto"


def clip(s, n):
    return (s[:n], True) if len(s) > n else (s, False)


def do_page(req, cache):
    page, final, status = fetch(req["url"], req.get("obeyRobots", True), cache)
    out = {"ok": True, "url": req["url"], "finalUrl": final, "status": status}
    try:
        t = page.css("title::text").get()
        out["title"] = as_text(t).strip()[:200]
    except Exception:
        out["title"] = ""
    sel = (req.get("selector") or "").strip()
    if sel:
        sel = sel if "::" in sel else sel + "::text"
        items = [as_text(x).strip()[:500] for x in page.css(sel).getall()]
        out["format"] = "items"
        out["items"] = [x for x in items if x][:MAX_ITEMS]
        out["truncated"] = len(items) > MAX_ITEMS
    else:
        text, kind = page_content(page, req.get("format", "markdown"))
        text, cut = clip(text, int(req.get("maxChars") or MAX_CHARS))
        out.update({"format": kind, "content": text, "truncated": cut})
    return out


def do_crawl(req, cache):
    start = urllib.parse.urlsplit(req["url"])
    host = start.hostname
    limit = max(1, min(10, int(req.get("maxPages") or 5)))
    queue, seen, pages, total = [req["url"]], set(), [], 0
    delay = 1.0
    while queue and len(pages) < limit and total < MAX_CHARS:
        url = queue.pop(0).split("#")[0]
        if url in seen:
            continue
        seen.add(url)
        try:
            page, final, status = fetch(url, req.get("obeyRobots", True), cache)
        except Refused as e:
            pages.append({"url": url, "error": str(e)})
            continue
        if urllib.parse.urlsplit(final).hostname != host:
            pages.append({"url": url, "error": "Redirige a otro sitio; no se sigue"})
            continue
        text, kind = page_content(page, "markdown")
        text, _ = clip(text, 4000)
        total += len(text)
        try:
            title = as_text(page.css("title::text").get()).strip()[:200]
        except Exception:
            title = ""
        pages.append({"url": final, "status": status, "title": title, "format": kind, "content": text})
        try:
            links = page.css("a::attr(href)").getall()
        except Exception:
            links = []
        for href in links[:300]:
            nxt = urllib.parse.urljoin(final, as_text(href)).split("#")[0]
            p = urllib.parse.urlsplit(nxt)
            if p.scheme in ("http", "https") and p.hostname == host and not p.path.lower().endswith(SKIP_EXT) and nxt not in seen:
                queue.append(nxt)
        rp = robots_for(final, cache) if req.get("obeyRobots", True) else None
        cd = rp.crawl_delay(UA) if rp is not None else None
        delay = max(1.0, float(cd or 1.0))
        if queue and len(pages) < limit:
            time.sleep(min(delay, 5.0))
    return {"ok": True, "url": req["url"], "format": "paginas", "pages": pages, "truncated": bool(queue)}


def main():
    try:
        req = json.loads(sys.stdin.read(200000))
        cache = {}
        check_url(req["url"])
        res = do_crawl(req, cache) if req.get("action") == "crawl" else do_page(req, cache)
    except Refused as e:
        res = {"ok": False, "error": str(e), "code": "refused"}
    except ImportError:
        res = {"ok": False, "error": "Scrapling no está instalado en el entorno Python de Nova", "code": "missing"}
    except Exception as e:  # noqa: BLE001
        res = {"ok": False, "error": f"{type(e).__name__}: {str(e)[:200]}", "code": "error"}
    sys.stdout.write(json.dumps(res, ensure_ascii=False) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
