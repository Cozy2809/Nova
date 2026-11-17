#!/usr/bin/env python3
"""UPDATE 15 - NOVA (arreglos): menu VENTANA, ajustes con scroll, menos CPU, microfono sin bloqueos ('transcribiendo' + tiempo maximo),
avisos ntfy con diagnostico. Requiere las updates 13 y 14. IDEMPOTENTE.
   python tools\\instalar_nova15.py [--sin-build | --revertir]"""
import os, re, shutil, subprocess, sys
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
ROOT = os.getcwd(); P = lambda *a: os.path.join(ROOT, *a)
PAY = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'payload_nova15'); SUF = '.bak-nova15'
rd = lambda p: open(p, 'rb').read().decode('utf-8-sig', errors='replace')
wr = lambda p, t: open(p, 'wb').write(t.encode('utf-8'))
def backup(p):
    if os.path.exists(p) and not os.path.exists(p + SUF): shutil.copyfile(p, p + SUF)
def payload_files():
    for d, _, fs in os.walk(PAY):
        for f in fs: yield os.path.relpath(os.path.join(d, f), PAY).replace('\\', '/')
PATCHED = ['src/utils/intents_extra.js', 'whisper_bridge.py', 'voice_server.py']
if not os.path.isdir(P('src')) or not os.path.isdir(P('electron')): print('Ejecutalo desde la carpeta jarvis-clone.'); sys.exit(1)
if '--revertir' in sys.argv:
    mine = set(payload_files())
    for rel in sorted(mine) + PATCHED:
        dst = P(*rel.split('/'))
        if os.path.exists(dst + SUF): shutil.copyfile(dst + SUF, dst); os.remove(dst + SUF); print('[RESTAURADO]', rel)
    print('\nRevertido. Recompila con: npm run build'); sys.exit(0)
if not os.path.exists(P('electron', 'typeLive.js')): print('Faltan las updates 13 y 14. Instalalas primero (tools\\instalar_nova.py y tools\\instalar_nova14.py).'); sys.exit(1)
fails = 0
for rel in sorted(payload_files()):
    dst = P(*rel.split('/')); new = rd(os.path.join(PAY, *rel.split('/')))
    if os.path.exists(dst) and rd(dst).replace('\r\n', '\n') == new: print('[YA ESTABA]', rel); continue
    os.makedirs(os.path.dirname(dst), exist_ok=True); backup(dst); wr(dst, new); print('[INSTALADO]', rel)

def patch(rel, fn, label):
    global fails
    p = P(*rel.split('/'))
    if not os.path.exists(p): print('[AVISO] no existe', rel); return
    t = rd(p); new = fn(t)
    if new is None: fails += 1; print('[FALLO]', rel, '-', label); return
    if new == t: print('[YA ESTABA]', rel, '-', label); return
    backup(p); wr(p, new); print('[PARCHEADO]', rel, '-', label)

def f_extra(t):
    if 'ntfy lo ha aceptado' in t: return t
    old = "return r?.error ? 'No he podido enviarlo a su teléfono, Señor.' : 'Enviado a su teléfono móvil, Señor.';"
    if old not in t: return None
    return t.replace(old, "return (r?.error || r?.success === false) ? `No he podido enviarlo a su teléfono, Señor: ${r?.error || 'sin respuesta de ntfy'}.` : `Enviado, Señor: ntfy lo ha aceptado en el tema «${r?.topic || '?'}». Si no le llega, revise que la app ntfy del móvil esté suscrita a ese tema.`;", 1)
patch('src/utils/intents_extra.js', f_extra, 'aviso con diagnostico')

def f_wb(t):
    if 'on_phase' in t: return t
    for old, new in [
        ('def listen_and_transcribe(on_level=None):', 'def listen_and_transcribe(on_level=None, on_phase=None):'),
        ('    text = _transcribe(audio, ', '    if on_phase:\n        try: on_phase("transcribing")\n        except Exception: pass\n    text = _transcribe(audio, '),
        ('return "" if _ALUCINACIONES.search(text) else text', 'return "" if (_ALUCINACIONES.search(text) or len(re.sub(r"\\W", "", text)) < 2) else text')]:
        if old not in t: return None
        t = t.replace(old, new, 1)
    t = t.replace('"Conversación en español con Nova, la asistente del Señor."', '"Conversación en español con Nova (también llamada Jarvis), la asistente del Señor."')
    t = t.replace('"Conversación en español con Jarvis, el asistente del Señor."', '"Conversación en español con Nova (también llamada Jarvis), la asistente del Señor."')
    return t
patch('whisper_bridge.py', f_wb, 'fase transcribiendo y filtro de ruido')

def f_vs(t):
    if '"event": "listen"' in t: return t
    old = 'out["text"] = listen_and_transcribe(lambda v: level(v, "mic"))'
    if old not in t: return None
    return t.replace(old, 'out["text"] = listen_and_transcribe(lambda v: level(v, "mic"), lambda p: emit({"event": "listen", "state": p}))', 1)
patch('voice_server.py', f_vs, 'aviso de fase')

print('\n' + ('Instalado con %d fallo(s): revisa los [FALLO].' % fails if fails else 'Instalado.'))
if '--sin-build' not in sys.argv and not fails:
    print('Recompilando (npm run build)...')
    try:
        r = subprocess.run('npm run build', shell=True, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
        print((r.stdout or '')[-700:] + (r.stderr or '')[-500:])
        print('[OK] Compilado.' if r.returncode == 0 and os.path.exists(P('dist', 'mobile.html')) else '[FALLO] La compilacion no termino bien; ejecuta: npm run build')
    except Exception as ex: print('No pude ejecutar npm:', ex, '- ejecuta a mano: npm run build')
print('\nAbre Nova. Guia: LEEME-NOVA15.md')
