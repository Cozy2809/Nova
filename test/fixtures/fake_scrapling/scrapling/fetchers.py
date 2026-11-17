"""Sustituto mínimo de Scrapling SOLO para probar el puente sin red. No es Scrapling."""
SITE = {
    "http://a.test/": (200, {}, {"title::text": ["Inicio"], "body ::text": ["Hola", "mundo"], ".q::text": ["uno", "dos"], "a::attr(href)": ["/dos", "http://otro.test/x", "/f.pdf", "#top"]}),
    "http://a.test/dos": (200, {}, {"title::text": ["Dos"], "body ::text": ["Segunda"], "a::attr(href)": ["/"]}),
    "http://a.test/redir": (302, {"Location": "/final"}, {}),
    "http://a.test/final": (200, {}, {"title::text": ["Final"], "body ::text": ["ok"], "a::attr(href)": []}),
    "http://a.test/to-local": (302, {"Location": "http://127.0.0.1/admin"}, {}),
    "http://a.test/to-internal": (301, {"Location": "http://internal.test/"}, {}),
    "http://a.test/loop": (302, {"Location": "/loop"}, {}),
    "http://a.test/to-other": (302, {"Location": "http://otro.test/x"}, {}),
    "http://otro.test/x": (200, {}, {"title::text": ["Otro"], "body ::text": ["otro sitio"], "a::attr(href)": []}),
}
CALLS = []


class _Sel:
    def __init__(self, vals):
        self.vals = vals

    def getall(self):
        return list(self.vals)

    def get(self):
        return self.vals[0] if self.vals else None


class _Page:
    def __init__(self, status, headers, sels):
        self.status, self.headers, self.sels = status, headers, sels

    def css(self, q):
        return _Sel(self.sels.get(q, []))

    def markdown(self):
        return "# " + (self.sels.get("title::text") or [""])[0] + "\n\n" + " ".join(self.sels.get("body ::text", []))


class Fetcher:
    @staticmethod
    def get(url, follow_redirects=True, timeout=30, **kw):
        CALLS.append((url, follow_redirects))
        st, h, s = SITE.get(url, (404, {}, {}))
        return _Page(st, h, s)
