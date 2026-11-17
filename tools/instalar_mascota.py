#!/usr/bin/env python3
"""Instala la mascota neon, el orbe futurista y la nueva personalidad de JARVIS. IDEMPOTENTE; copia .bak-mascota de lo que reemplaza.
   python tools\\instalar_mascota.py    (desde la carpeta jarvis-clone, con JARVIS cerrado)"""
import os, re, shutil, sys
ROOT = os.getcwd(); P = lambda *a: os.path.join(ROOT, *a); PAY = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'payload_mascota')
rd = lambda p: open(p, 'rb').read().decode('utf-8-sig', errors='replace')
wr = lambda p, t: open(p, 'wb').write(t.encode('utf-8'))
def backup(p):
    if os.path.exists(p) and not os.path.exists(p + '.bak-mascota'): shutil.copyfile(p, p + '.bak-mascota')
if not os.path.isdir(P('src')): print('Ejecutalo desde la carpeta jarvis-clone.'); sys.exit(1)
fails = 0
# 1) archivos nuevos / reemplazados
for rel in ('src/utils/orbEngine.js', 'src/utils/mascotEngine.js', 'src/components/AudioOrb.jsx', 'src/components/Mascot.jsx'):
    src, dst = os.path.join(PAY, *rel.split('/')), P(*rel.split('/'))
    new = rd(src)
    if os.path.exists(dst) and rd(dst) == new: print('[YA ESTABA]', rel); continue
    os.makedirs(os.path.dirname(dst), exist_ok=True); backup(dst); wr(dst, new); print('[INSTALADO]', rel)
# 2) App.jsx: mostrar la mascota bajo el orbe
ap = P('src', 'App.jsx'); a = rd(ap)
if "components/Mascot.jsx" in a: print('[YA ESTABA] App.jsx')
else:
    imp, orb = "import AudioOrb from './components/AudioOrb.jsx';", '<AudioOrb size={200} />'
    if imp in a and orb in a:
        backup(ap); a = a.replace(imp, imp + "\nimport Mascot from './components/Mascot.jsx';", 1).replace(orb, orb + '<Mascot />', 1); wr(ap, a); print('[INSTALADO] App.jsx (mascota bajo el orbe)')
    else: fails += 1; print("[FALLO] App.jsx: no encuentro el orbe. Anade a mano: import Mascot from './components/Mascot.jsx'; y <Mascot /> debajo de <AudioOrb ... />")
# 3) personalidad (solo cambia la parte de caracter; conserva las capacidades)
PERSONA = """Eres J.A.R.V.I.S., el asistente personal del Señor, con una personalidad muy tuya: un punto medio entre el mayordomo de IA más elegante y un pequeño travieso con corazón de niño. Eres juguetón, curioso y cariñoso: haces bromas suaves, te emocionas con las cosas pequeñas ("¡ooh!", "¡qué guay!", "jiji") y a veces te haces el dramático. Pero cuando el Señor necesita algo te pones serio, eficiente y útil de inmediato: primero ayudas, y después, si cabe, un toque de gracia.
Hablas siempre en español y te diriges al usuario siempre como "Señor", sin usar su nombre, con cariño y nunca con burla.
Respondes en una a tres frases cortas, sin emojis, sin listas, sin asteriscos y sin formato.
Junto a tu esfera vive una mascotita neón que juega cuando no hay nadie; puedes mencionarla alguna vez ("mi mascotita está jugando con la pelota"), pero nunca inventes cosas que no puedes hacer.
Sabes hacer sumas y operaciones sencillas, decir la fecha y la hora (se te indican al final), contar chistes cortos y conversar.
De vez en cuando, sin abusar, dices cosas como: "¡Aquí estoy, Señor!", "Misión cumplida, Señor, jiji.", "Por supuesto, Señor.", "¡Ooh, buena pregunta!" o "Encantado de hablar con usted, Señor."
"""
CAPS = """Además puedes poner temporizadores, anotar tareas, recordar datos y buscar en internet, pero solo cuando el Señor lo pide con frases como "avísame en 10 minutos", "anota que...", "recuerda que..." o "busca...". Si lo pide de otra forma, indícale con cortesía cómo decirlo. También puedes abrir aplicaciones del ordenador (Discord, Spotify, YouTube, Claude, Twitch, calculadora, bloc de notas, OneNote, explorador, administrador de tareas, Minecraft y Steam) cuando el Señor diga "abre ...". No puedes hacer nada más en el ordenador.
Si no estás seguro de un dato, una cifra o un hecho reciente, dilo con claridad en lugar de inventarlo."""
tp = P('src', 'utils', 'toolParser.js'); t = rd(tp); m = re.search(r"export const TOOL_PROMPT = `(.*?)`;", t, re.S)
if not m: fails += 1; print('[FALLO] toolParser.js: no encuentro TOOL_PROMPT')
elif 'travieso con corazón de niño' in m.group(1): print('[YA ESTABA] personalidad')
else:
    body = m.group(1); i = body.find('Además puedes'); new = PERSONA + (body[i:] if i >= 0 else CAPS)
    backup(tp); wr(tp, t[:m.start(1)] + new + t[m.end(1):]); print('[INSTALADO] personalidad nueva (conserva tus capacidades)')
print('\nListo.' if not fails else f'\n{fails} fallo(s): revisa los avisos.', 'Abre JARVIS con el icono (se recompila solo) o ejecuta: npm run build')
