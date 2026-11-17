#!/usr/bin/env python3
"""Repara JARVIS tras los cambios de Gemini. IDEMPOTENTE; copia .bak-update8 de todo lo que toca. Desde la carpeta jarvis-clone:
   python tools\\reparar_todo.py
1) Restaura useAI.js e intents.js desde las copias .bak-fases (version completa: personalidad, memoria, saludo, volumen, capturas, cerrar apps...)
2) main.js: quita el BOM y la linea sendNotification (rota) y pone un manejador notify:send correcto
3) notify.js con alias sendNotification; MemoryPanel con altura fija
4) .env: anade SOLO lo que falte (no pisa nada, no imprime valores) y genera un tema ntfy privado si esta vacio
5) ejecuta tools\\instalar_fases.py (conecta aviso al movil, WhatsApp y modo Discord)"""
import os, re, secrets, shutil, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from limpiar_ipc import scan
ROOT = os.getcwd(); P = lambda *a: os.path.join(ROOT, *a)
rd = lambda p: open(p, 'rb').read().decode('utf-8-sig', errors='replace')
wr = lambda p, t: open(p, 'wb').write(t.encode('utf-8'))
def backup(p):
    b = p + '.bak-update8'
    if not os.path.exists(b): shutil.copy(p, b)
def say(k, m): print(f'[{k}] {m}')
if not os.path.isdir(P('electron')): print('Ejecutalo desde la carpeta jarvis-clone.'); sys.exit(1)

# 1) restaurar renderer completo
for rel, good_marker in (('src/hooks/useAI.js', 'export function useAI(speak'), ('src/utils/intents.js', "type: 'volume_up'")):
    p = P(*rel.split('/'))
    if not os.path.exists(p): say('FALLO', rel + ' no existe'); continue
    if good_marker in rd(p): say('YA ESTABA', rel + ' ya es la version completa'); continue
    bak = p + '.bak-fases'
    if not os.path.exists(bak) or good_marker not in rd(bak): say('FALLO', f'{rel}: no hay copia .bak-fases valida. Enviame el archivo.'); continue
    backup(p); wr(p, rd(bak)); say('RESTAURADO', f'{rel} desde .bak-fases (copia de lo anterior: {rel}.bak-update8)')

# 2) main.js
mp = P('electron', 'main.js'); raw = open(mp, 'rb').read().decode('utf-8', errors='replace'); m = raw.lstrip('\ufeff'); eol = '\r\n' if '\r\n' in m else '\n'
new = re.sub(r"^[ \t]*const \{ sendNotification \} = require\('\./notify(?:\.js)?'\);\r?\n", '', m, flags=re.M)
i = new.find("ipcMain.handle('notify:send'")
if i >= 0 and 'sendNotification' in new[i:i + 400]:
    end = scan(new, new.index('(', i)); k = end
    while k < len(new) and new[k] in ' \t;': k += 1
    if new[k:k + 2] == '\r\n': k += 2
    elif new[k:k + 1] == '\n': k += 1
    H = ("ipcMain.handle('notify:send', async (_e, p = {}) => {\n    try {\n      if (p.auto && process.env.NTFY_AUTO === 'false') return { skipped: true };\n"
         "      await notify({ title: p.title, message: p.message, priority: p.priority, tags: p.tags });\n      return { ok: true };\n    } catch (e) { return { error: e.message }; }\n  });\n").replace('\n', eol)
    new = new[:i] + H + new[k:]
if new != raw:
    backup(mp); wr(mp, new); r = subprocess.run(['node', '--check', mp], capture_output=True, text=True)
    if r.returncode: shutil.copy(mp + '.bak-update8', mp); say('FALLO', 'main.js: error de sintaxis, restaurado: ' + r.stderr[:200])
    else: say('REPARADO', 'main.js (BOM y notificaciones)')
else: say('YA ESTABA', 'main.js correcto')

# 3) notify.js alias + MemoryPanel
np_ = P('electron', 'notify.js')
if os.path.exists(np_) and 'sendNotification' not in rd(np_): backup(np_); open(np_, 'ab').write(b'\nmodule.exports.sendNotification = module.exports.notify || module.exports; // alias\n'); say('REPARADO', 'notify.js (alias sendNotification)')
mem = P('src', 'components', 'MemoryPanel.jsx'); pay = P('tools', 'payload', 'MemoryPanel.jsx')
if os.path.exists(pay) and (not os.path.exists(mem) or 'h-64 shrink-0' not in rd(mem)): 
    if os.path.exists(mem): backup(mem)
    shutil.copy(pay, mem); say('REPARADO', 'MemoryPanel.jsx (altura fija, borrado en dos pulsaciones)')
else: say('YA ESTABA', 'MemoryPanel.jsx correcto')

# 4) .env: solo anade lo que falta
ep = P('.env'); b = open(ep, 'rb').read() if os.path.exists(ep) else b''
txt = b.decode('utf-16') if b[:2] in (b'\xff\xfe', b'\xfe\xff') else b.decode('utf-8-sig', errors='replace')
eol = '\r\n' if '\r\n' in txt else '\n'; have = {}
for l in txt.splitlines():
    if '=' in l and not l.lstrip().startswith('#'): k, v = l.split('=', 1); have[k.strip()] = v.strip()
DEF = {'AI_PROVIDER': 'ollama', 'OLLAMA_API_URL': 'http://localhost:11434', 'OLLAMA_MODEL': 'qwen2.5:3b', 'PIPER_BIN': 'piper\\piper.exe', 'PIPER_MODEL': 'voices/es_MX-claude-high.onnx',
       'WHISPER_MODEL': 'base', 'MIC_DEVICE': '2', 'NTFY_AUTO': 'true', 'WHATSAPP_MODE': 'app', 'LOOPBACK_THRESHOLD': '0.01', 'BRAVE_SEARCH_API_KEY': ''}
add = [f'{k}={v}' for k, v in DEF.items() if k not in have]; topic = None
if not have.get('NTFY_TOPIC'):
    topic = 'jarvis-' + ''.join(secrets.choice('abcdefghijklmnopqrstuvwxyz0123456789') for _ in range(16))
    txt = re.sub(r'^NTFY_TOPIC=.*(\r?\n)?', '', txt, flags=re.M); add.append('NTFY_TOPIC=' + topic)
if add or b[:3] == b'\xef\xbb\xbf' or b[:2] in (b'\xff\xfe', b'\xfe\xff'):
    if os.path.exists(ep): backup(ep)
    out = txt.rstrip('\r\n') + (eol if txt.strip() else '') + eol.join(add) + eol; wr(ep, out)
    say('REPARADO', '.env: anadidas ' + (', '.join(a.split('=')[0] for a in add) or 'ninguna (solo recodificado a UTF-8 sin BOM)'))
    if 'BRAVE_SEARCH_API_KEY=' in add: say('AVISO', 'BRAVE_SEARCH_API_KEY esta vacia: pega tu clave en .env (notepad .env) para la busqueda web')
else: say('YA ESTABA', '.env completo')
if topic: print(f'\n>>> NUEVO TEMA NTFY: {topic}\n>>> Suscribete a ESE nombre en la app ntfy del movil (el anterior deja de recibir).\n')

# 5) fases
r = subprocess.run([sys.executable, P('tools', 'instalar_fases.py')], capture_output=True, text=True)
print(r.stdout.strip()[-1500:]); 
if r.returncode: print(r.stderr.strip()[-500:])
print('\nListo. Siguiente: python tools\\diagnostico.py  y  npm run dev')
