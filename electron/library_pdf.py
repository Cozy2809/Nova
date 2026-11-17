# Extrae el texto de un PDF (lo usa la biblioteca de Nova). Necesita: pip install pypdf
import json, sys
sys.stdout.reconfigure(encoding="utf-8")
try:
    from pypdf import PdfReader
except Exception:
    print(json.dumps({"error": "nopypdf"})); sys.exit(0)
try:
    r = PdfReader(sys.argv[1])
    text = "\n".join((p.extract_text() or "") for p in r.pages[:300])
    print(json.dumps({"text": text}, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"error": str(e)[:200]}))
