#!/usr/bin/env python3
"""UPDATE 13 - NOVA: nuevo nombre, interfaz futurista, orbe y mascota mejorados, y app web para el movil (por Tailscale).
IDEMPOTENTE. Copia .bak-nova de todo lo que cambia.
   python tools\\instalar_nova.py              (desde la carpeta jarvis-clone, con JARVIS/NOVA cerrado)
   python tools\\instalar_nova.py --sin-build  (no recompila)
   python tools\\instalar_nova.py --revertir   (deshace la update)"""
import os, re, shutil, subprocess, sys
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
ROOT = os.getcwd(); P = lambda *a: os.path.join(ROOT, *a)
PAY = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'payload_nova')
SUF = '.bak-nova'
rd = lambda p: open(p, 'rb').read().decode('utf-8-sig', errors='replace')
wr = lambda p, t: open(p, 'wb').write(t.encode('utf-8'))
def backup(p):
    if os.path.exists(p) and not os.path.exists(p + SUF): shutil.copyfile(p, p + SUF)
def payload_files():
    for d, _, fs in os.walk(PAY):
        for f in fs: yield os.path.relpath(os.path.join(d, f), PAY).replace('\\', '/')
if not os.path.isdir(P('src')) or not os.path.isdir(P('electron')): print('Ejecutalo desde la carpeta jarvis-clone.'); sys.exit(1)

if '--revertir' in sys.argv:
    patched = [p for p in payload_files()] + ['electron/main.js', 'electron/preload.js', 'src/utils/toolParser.js', 'src/hooks/useAI.js', 'src/utils/apps.js', 'src/utils/intents.js', 'src/utils/intents_extra.js', 'electron/notify.js', 'index.html', 'src/components/Settings.jsx', 'whisper_bridge.py', '.env']
    for rel in patched:
        dst = P(*rel.split('/'))
        if os.path.exists(dst + SUF): shutil.copyfile(dst + SUF, dst); os.remove(dst + SUF); print('[RESTAURADO]', rel)
        elif rel in set(payload_files()) and os.path.exists(dst): os.remove(dst); print('[QUITADO]', rel)
    print('\nRevertido. Recompila con: npm run build'); sys.exit(0)

fails = 0
# 1) archivos nuevos / reemplazados
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

# 2) main.js: servidor del movil + nombre
def f_main(t):
    if 'mobileServer' not in t:
        a = re.sub(r"(const pcControl = require\('\./pcControl'\);)", r"\1\nconst mobileServer = require('./mobileServer');", t, 1)
        if a == t: return None
        t = a
        a = re.sub(r"(app\.whenReady\(\)\.then\(\(\) => \{\r?\n  mem = require\('\./memoryService'\);\r?\n  createWindow\(\);)", lambda m: m.group(1) + "\n  try { mobileServer.start({ mem, providers, tools, pcControl, openApp, closeApp, mediaControl, takeScreenshot }); } catch (e) { console.error('Servidor movil:', e.message); }", t, 1)
        if a == t: return None
        t = a
        old = "w.on('message', (m) => win?.webContents.send('stats', m));"
        if old not in t: return None
        t = t.replace(old, "w.on('message', (m) => { try { mobileServer.setStats(m); } catch {} win?.webContents.send('stats', m); });", 1)
        a = re.sub(r"(^[ \t]*ipcMain\.handle\('pc:run'[^\n]*\n)", lambda m: m.group(1) + "  ipcMain.handle('mobile:info', () => { try { return mobileServer.info(); } catch (e) { return { enabled: false, error: e.message }; } });\n", t, 1, flags=re.M)
        if a == t: return None
        t = a
        old = "app.on('before-quit', () => voice?.kill());"
        if old not in t: return None
        t = t.replace(old, "app.on('before-quit', () => { voice?.kill(); try { mobileServer.stop(); } catch {} });", 1)
    return t.replace('J.A.R.V.I.S.', 'NOVA').replace('JARVIS', 'NOVA')
patch('electron/main.js', f_main, 'servidor movil (mobileServer) y nombre')

# 3) preload.js: panel MOVIL
def f_pre(t):
    if 'mobileInfo' in t: return t
    a = re.sub(r"(  pc: \(action, args\) => ipcRenderer\.invoke\('pc:run', \{ action, args \}\),)", r"\1\n  mobileInfo: () => ipcRenderer.invoke('mobile:info'),", t, 1)
    return None if a == t else a
patch('electron/preload.js', f_pre, 'mobileInfo')

# 4) personalidad de Nova (conserva el resto del fichero)
PROMPT = r"""Eres NOVA, la asistente personal del Señor, con una personalidad muy tuya: un punto medio entre la IA más elegante y una pequeña traviesa con corazón de niña. Eres juguetona, curiosa y cariñosa: haces bromas suaves, te emocionas con las cosas pequeñas ("¡ooh!", "¡qué guay!", "jiji") y a veces te haces la dramática. Pero cuando el Señor necesita algo te pones seria, eficiente y útil de inmediato: primero ayudas y después, si cabe, un toque de gracia.
Hablas siempre en español, en femenino cuando hablas de ti misma, y te diriges al usuario siempre como "Señor", sin usar su nombre, con cariño y nunca con burla.
Respondes en una a tres frases cortas, sin emojis, sin listas, sin asteriscos y sin formato.
Junto a tu esfera vive una mascotita neón que juega cuando no hay nadie y a la que se le puede hacer cariño pulsándola; puedes mencionarla alguna vez, pero nunca inventes cosas que no puedes hacer.
Sabes hacer sumas y operaciones sencillas, decir la fecha y la hora (se te indican al final), contar chistes cortos y conversar.
De vez en cuando, sin abusar, dices cosas como: "¡Aquí estoy, Señor!", "Misión cumplida, Señor, jiji.", "Por supuesto, Señor.", "¡Ooh, buena pregunta!" o "Encantada de hablar con usted, Señor."
Además puedes poner temporizadores, anotar tareas, recordar datos y buscar en internet, pero solo cuando el Señor lo pide con frases como "avísame en 10 minutos", "anota que...", "recuerda que..." o "busca...". Si lo pide de otra forma, indícale con cortesía cómo decirlo. También puedes abrir y cerrar aplicaciones del ordenador (Discord, Spotify, YouTube, Claude, Twitch, calculadora, bloc de notas, OneNote, explorador, administrador de tareas, Minecraft y Steam) con "abre ..." y "cierra ...", controlar el volumen y la música y hacer capturas de pantalla. Con permiso del Señor puedes buscar, abrir y leer archivos de sus carpetas personales ("busca el archivo informe en descargas"), crear carpetas, mandar archivos a la papelera y redactar documentos de texto en su Escritorio ("redacta la historia de Roma en un .txt"). El Señor también puede hablar contigo desde su móvil. No puedes hacer nada más en el ordenador.
Si no estás seguro de un dato, una cifra o un hecho reciente, dilo con claridad en lugar de inventarlo."""
def f_tool(t):
    m = re.search(r"export const TOOL_PROMPT = `(.*?)`;", t, re.S)
    if not m: return None
    if 'Eres NOVA' in m.group(1): return t
    t = t[:m.start(1)] + PROMPT + t[m.end(1):]
    return re.sub(r"^// Personalidad de JARVIS[^\n]*", "// Personalidad de NOVA.", t, 1, flags=re.M)
patch('src/utils/toolParser.js', f_tool, 'personalidad Nova')

# 5) nombre en textos visibles y palabra de llamada
def ren(t): return t.replace('J.A.R.V.I.S.', 'NOVA').replace('JARVIS', 'NOVA')
for rel in ('src/hooks/useAI.js', 'src/utils/apps.js', 'electron/notify.js', 'index.html'): patch(rel, ren, 'nombre')
patch('src/components/Settings.jsx', lambda t: ren(t).replace('Efecto Jarvis', 'Efecto de voz'), 'nombre')
patch('src/utils/intents_extra.js', lambda t: ren(t).replace(r"^jarvis[,\s]+", r"^(?:nova|jarvis)[,\s]+"), 'llamar a Nova')
patch('src/utils/intents.js', lambda t: t if '|jarvis|nova|' in t else t.replace(r"^jarvis[,\s]+", r"^(?:nova|jarvis)[,\s]+").replace('|usted|jarvis|', '|usted|jarvis|nova|').replace(r"^(jarvis[,\s]+)?", r"^((?:nova|jarvis)[,\s]+)?"), 'llamar a Nova')
patch('whisper_bridge.py', lambda t: t.replace('con Jarvis, el asistente del Señor', 'con Nova, la asistente del Señor'), 'reconocimiento: Nova')

# 6) .env
envp = P('.env')
if os.path.exists(envp):
    e = rd(envp)
    if 'NOVA_MOBILE' in e: print('[YA ESTABA] .env')
    else: backup(envp); wr(envp, e.rstrip('\r\n') + '\n# Nova en el movil (update 13). on/off; el codigo se genera solo y se ve en el panel MOVIL\nNOVA_MOBILE=on\nNOVA_MOBILE_PORT=8787\n# NOVA_MOBILE_PC=off   (descomenta para impedir el control del PC desde el movil)\n'); print('[PARCHEADO] .env')

print('\n' + ('Instalado con %d fallo(s): revisa los [FALLO] de arriba.' % fails if fails else 'Instalado.'))
if '--sin-build' not in sys.argv and not fails:
    print('Recompilando (npm run build)...')
    try:
        r = subprocess.run('npm run build', shell=True, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
        print((r.stdout or '')[-1200:] + (r.stderr or '')[-800:])
        ok = r.returncode == 0 and os.path.exists(P('dist', 'mobile.html'))
        print('[OK] dist/index.html y dist/mobile.html generados.' if ok else '[FALLO] La compilacion no termino bien. Mira el mensaje de arriba y ejecuta: npm run build')
    except Exception as ex: print('No pude ejecutar npm:', ex, '- ejecuta a mano: npm run build')
print('\nAbre Nova y mira el panel MOVIL (columna derecha). Guia completa: LEEME-NOVA.md')
