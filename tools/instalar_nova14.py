#!/usr/bin/env python3
"""UPDATE 14 - NOVA: avisos al movil (ntfy), agente de ordenes libres del PC, investigacion en varias paginas,
escritura en directo en el Bloc de notas y boton HTTPS para el microfono del movil. Requiere la update 13. IDEMPOTENTE.
   python tools\\instalar_nova14.py              (desde la carpeta jarvis-clone, con Nova cerrada)
   python tools\\instalar_nova14.py --sin-build
   python tools\\instalar_nova14.py --revertir"""
import os, re, shutil, subprocess, sys
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
ROOT = os.getcwd(); P = lambda *a: os.path.join(ROOT, *a)
PAY = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'payload_nova14'); SUF = '.bak-nova14'
rd = lambda p: open(p, 'rb').read().decode('utf-8-sig', errors='replace')
wr = lambda p, t: open(p, 'wb').write(t.encode('utf-8'))
def backup(p):
    if os.path.exists(p) and not os.path.exists(p + SUF): shutil.copyfile(p, p + SUF)
def payload_files():
    for d, _, fs in os.walk(PAY):
        for f in fs: yield os.path.relpath(os.path.join(d, f), PAY).replace('\\', '/')
PATCHED = ['electron/main.js', 'electron/preload.js', 'src/hooks/useAI.js', 'electron/providers/ollama.js', '.env']
if not os.path.isdir(P('src')) or not os.path.isdir(P('electron')): print('Ejecutalo desde la carpeta jarvis-clone.'); sys.exit(1)

if '--revertir' in sys.argv:
    mine = set(payload_files())
    for rel in sorted(mine) + PATCHED:
        dst = P(*rel.split('/'))
        if os.path.exists(dst + SUF): shutil.copyfile(dst + SUF, dst); os.remove(dst + SUF); print('[RESTAURADO]', rel)
        elif rel in mine and os.path.exists(dst): os.remove(dst); print('[QUITADO]', rel)
    print('\nRevertido. Recompila con: npm run build'); sys.exit(0)

if not os.path.exists(P('electron', 'mobileServer.js')): print('Falta la update 13 (Nova). Instala primero: python tools\\instalar_nova.py'); sys.exit(1)
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

MARK = '// parche-notify'
def f_main(t):
    if MARK not in t:
        t = "require('./notify.js').install(); " + MARK + ("\r\n" if '\r\n' in t else "\n") + t   # debe ir ANTES de cualquier ipcMain.handle
    if "'mobile:https'" not in t:
        a = re.sub(r"(^[ \t]*ipcMain\.handle\('mobile:info'[^\n]*\n)", lambda m: m.group(1) + "  ipcMain.handle('mobile:https', async () => { try { return await mobileServer.enableHttps(); } catch (e) { return { error: e.message }; } });\n", t, 1, flags=re.M)
        if a == t: return None
        t = a
    return t
patch('electron/main.js', f_main, 'avisos al movil (notify) y boton HTTPS')

def f_pre(t):
    if 'mobileHttps' in t: return t
    a = re.sub(r"(  mobileInfo: \(\) => ipcRenderer\.invoke\('mobile:info'\),)", r"\1\n  mobileHttps: () => ipcRenderer.invoke('mobile:https'),", t, 1)
    return None if a == t else a
patch('electron/preload.js', f_pre, 'mobileHttps')

def f_ai(t):
    if 'pcAgent' in t: return t
    imp = "import { parseExtraIntent, runExtraIntent } from '../utils/intents_extra.js';"
    if imp not in t: return None
    t = t.replace(imp, imp + "\nimport { looksLikePcCommand, pcAgent } from '../utils/pcAgent.js';", 1)
    hook = ("    // Agente del PC: una orden libre sobre archivos/PC que las frases fijas no entienden la traduce el modelo a una accion de la lista cerrada\n"
            "    if (!parseIntent(text) && looksLikePcCommand(text)) {\n"
            "      setBusy(true); let ag = null; try { ag = await pcAgent(text); } catch {} finally { setBusy(false); }\n"
            "      if (ag) { try { reply(await runExtraIntent(ag)); } catch (e) { setError(String(e.message || e)); set(base); } return; }\n"
            "    }\n")
    a = re.sub(r"(    const intent = parseIntent\(text\);)(\r?\n\s*let autoFailed = false;)", lambda m: hook.replace('\n', '\r\n' if '\r\n' in t else '\n') + m.group(1) + m.group(2), t, 1)
    return None if a == t else a
patch('src/hooks/useAI.js', f_ai, 'agente del PC')

def f_oll(t):
    if 'num_ctx' in t: return t
    old = "JSON.stringify({ model, messages, stream: true, think: false })"
    if old not in t: return None
    return t.replace(old, "JSON.stringify({ model, messages, stream: true, think: false, options: { num_ctx: parseInt(settings.numCtx || process.env.OLLAMA_NUM_CTX, 10) || 4096 } })", 1)
patch('electron/providers/ollama.js', f_oll, 'contexto 4096 (textos largos)')

envp = P('.env')
if os.path.exists(envp):
    e = rd(envp)
    if 'PC_LIVE_TYPING' in e: print('[YA ESTABA] .env')
    else: backup(envp); wr(envp, e.rstrip('\r\n') + '\n# Update 14: escribir a la vista en el Bloc de notas (on/off) y contexto del modelo\nPC_LIVE_TYPING=on\nOLLAMA_NUM_CTX=4096\n'); print('[PARCHEADO] .env')

print('\n' + ('Instalado con %d fallo(s): revisa los [FALLO].' % fails if fails else 'Instalado.'))
if '--sin-build' not in sys.argv and not fails:
    print('Recompilando (npm run build)...')
    try:
        r = subprocess.run('npm run build', shell=True, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
        print((r.stdout or '')[-900:] + (r.stderr or '')[-600:])
        print('[OK] Compilado.' if r.returncode == 0 and os.path.exists(P('dist', 'mobile.html')) else '[FALLO] La compilacion no termino bien; ejecuta: npm run build')
    except Exception as ex: print('No pude ejecutar npm:', ex, '- ejecuta a mano: npm run build')
print('\nAbre Nova. Guia: LEEME-NOVA14.md')
