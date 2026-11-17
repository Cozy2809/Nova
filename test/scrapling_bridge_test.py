import importlib.util, os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "fixtures", "fake_scrapling"))
spec = importlib.util.spec_from_file_location("bridge", os.path.join(HERE, "..", "electron", "integrations", "scrapling", "bridge.py"))
bridge = importlib.util.module_from_spec(spec); spec.loader.exec_module(bridge)
bridge.time.sleep = lambda s: None
PUBLIC = "93.184.216.34"
bridge.resolve = lambda h: ["10.0.0.5"] if h == "internal.test" else [PUBLIC]
bridge.robots_for = lambda url, cache: None


class Bridge(unittest.TestCase):
    def page(self, **k):
        return bridge.do_page({"url": "http://a.test/", **k}, {})

    def test_markdown(self):
        r = self.page(); self.assertTrue(r["ok"]); self.assertEqual(r["title"], "Inicio"); self.assertIn("Hola mundo", r["content"]); self.assertEqual(r["format"], "markdown")

    def test_selector_agrega_text(self):
        r = self.page(selector=".q"); self.assertEqual(r["items"], ["uno", "dos"]); self.assertEqual(r["format"], "items")

    def test_redireccion_valida_cada_salto(self):
        r = bridge.do_page({"url": "http://a.test/redir"}, {}); self.assertEqual(r["finalUrl"], "http://a.test/final")
        with self.assertRaises(bridge.Refused): bridge.do_page({"url": "http://a.test/to-local"}, {})
        with self.assertRaises(bridge.Refused): bridge.do_page({"url": "http://a.test/to-internal"}, {})
        with self.assertRaises(bridge.Refused): bridge.do_page({"url": "http://a.test/loop"}, {})

    def test_nunca_sigue_redirecciones_automaticas(self):
        import scrapling.fetchers as f; f.CALLS.clear(); bridge.do_page({"url": "http://a.test/redir"}, {})
        self.assertTrue(all(c[1] is False for c in f.CALLS))

    def test_rechaza_direcciones_peligrosas(self):
        for u in ["http://127.0.0.1/", "http://localhost/", "http://[::1]/", "http://169.254.169.254/latest", "http://10.1.2.3/", "http://[::ffff:127.0.0.1]/", "http://user:pw@a.test/", "ftp://a.test/", "file:///etc/passwd", "http://a.test:22/", "http://internal.test/", "http://100.64.0.1/"]:
            with self.assertRaises(bridge.Refused, msg=u): bridge.check_url(u)
        bridge.check_url("http://a.test/"); bridge.check_url("https://a.test:8443/x")

    def test_recorrido_mismo_sitio_y_limites(self):
        r = bridge.do_crawl({"url": "http://a.test/", "maxPages": 5}, {})
        urls = [p["url"] for p in r["pages"]]; self.assertEqual(urls, ["http://a.test/", "http://a.test/dos"])
        self.assertFalse(any("otro.test" in u or u.endswith(".pdf") for u in urls))
        self.assertEqual(len(bridge.do_crawl({"url": "http://a.test/", "maxPages": 1}, {})["pages"]), 1)

    def test_redireccion_a_otro_sitio_no_se_sigue_en_recorrido(self):
        r = bridge.do_crawl({"url": "http://a.test/to-other", "maxPages": 3}, {}); self.assertIn("error", r["pages"][0])

    def test_robots(self):
        class RP:
            def can_fetch(self, ua, url): return False
        bridge.robots_for = lambda url, cache: RP()
        try:
            with self.assertRaises(bridge.Refused): bridge.do_page({"url": "http://a.test/", "obeyRobots": True}, {})
            self.assertTrue(bridge.do_page({"url": "http://a.test/", "obeyRobots": False}, {})["ok"])
        finally:
            bridge.robots_for = lambda url, cache: None

    def test_truncado(self):
        r = self.page(maxChars=5); self.assertEqual(len(r["content"]), 5); self.assertTrue(r["truncated"])


if __name__ == "__main__":
    unittest.main()
