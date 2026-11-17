#!/usr/bin/env python3
"""Diagnostico de salud de Nova (solo lee; no modifica nada). Ejecutalo desde la carpeta Nova:
   python tools\\diagnostico.py
Pega la salida completa si algo sale en FALLO."""
import json, os, re, subprocess, sys, urllib.request
R = os.getcwd(); P = lambda *a: os.path.join(R, *a)
N = {'OK': 0, 'FALLO': 0, 'AVISO': 0}
def say(k, m): N[k] += 1; print(f'[{k}] {m}')
def rd(*a):
    try: return open(P(*a), encoding='utf-8', errors='replace').read()
    except OSError: return None
if not os.path.exists(P('electron', 'main.js')): print('Ejecutalo desde la carpeta Nova.'); sys.exit(1)
main, pre, intents, useai, ws, vs, wb, chat, mem = (rd('electron/main.js'), rd('electron/preload.js'), rd('src/utils/intents.js'), rd('src/hooks/useAI.js'),
    rd('electron/whatsapp.js'), rd('voice_server.py'), rd('whisper_bridge.py'), rd('src/components/ChatCore.jsx'), rd('src/components/MemoryPanel.jsx'))
print(f'main.js: {len(main.splitlines())} lineas, {len(main)} bytes' + ('  <-- parece la version ORIGINAL (97 lineas): no es tu proyecto vivo' if len(main.splitlines()) < 150 else ''))
print('\n== Sintaxis')
for f in sorted(os.listdir(P('electron'))):
    if f.endswith('.js'):
        r = subprocess.run(['node', '--check', P('electron', f)], capture_output=True, text=True)
        say('OK' if r.returncode == 0 else 'FALLO', f'electron/{f}' + ('' if r.returncode == 0 else ': ' + r.stderr.strip().splitlines()[0][:150]))
for f in ('voice_server.py', 'whisper_bridge.py'):
    r = subprocess.run([sys.executable, '-m', 'py_compile', P(f)], capture_output=True, text=True)
    say('OK' if r.returncode == 0 else 'FALLO', f + ('' if r.returncode == 0 else ': ' + r.stderr.strip()[-150:]))
print('\n== IPC')
handlers = re.findall(r"ipcMain\.(?:handle|on)\(\s*'([^']+)'", main)
dups = sorted({c for c in handlers if handlers.count(c) > 1})
say('FALLO' if dups else 'OK', 'canales duplicados en main.js: ' + (', '.join(dups) if dups else 'ninguno') + f' ({len(set(handlers))} canales)')
called = set(re.findall(r"ipcRenderer\.(?:invoke|send)\(\s*'([^']+)'", pre))
miss = sorted(called - set(handlers)); say('FALLO' if miss else 'OK', 'preload llama a canales sin manejador en main: ' + (', '.join(miss) if miss else 'ninguno'))
exposed = set(re.findall(r"^\s*(\w+):", pre[pre.find('exposeInMainWorld'):], re.M))
used = set()
for root, _, files in os.walk(P('src')):
    for f in files:
        if f.endswith(('.js', '.jsx')): used |= set(re.findall(r'window\.jarvis\??\.(\w+)', open(os.path.join(root, f), encoding='utf-8', errors='replace').read()))
miss = sorted(used - exposed); say('FALLO' if miss else 'OK', 'la interfaz usa window.jarvis.X que el preload NO expone: ' + (', '.join(miss) if miss else 'ninguno'))
print('\n== Codigo reescrito por otras herramientas')
say('OK' if 'export function useAI(speak' in (useai or '') else 'FALLO', 'useAI.js tiene la firma que espera ChatCore (useAI(speak) -> busy/error/push)' if 'export function useAI(speak' in (useai or '') else 'useAI.js NO tiene la firma que espera ChatCore: sin saludo, sin personalidad ni memoria (usa tools\\reparar_todo.py)')
say('OK' if bool(intents) and "type: 'volume_up'" in intents else 'FALLO', 'intents.js conserva las ordenes de volumen/captura/cerrar apps' if bool(intents) and "type: 'volume_up'" in intents else 'intents.js perdio las ordenes de volumen/captura/cerrar apps (usa tools\\reparar_todo.py)')
bad = []
for root, _, files in os.walk(P('src')):
    for f in files:
        if f.endswith(('.js', '.jsx')):
            tx = open(os.path.join(root, f), encoding='utf-8', errors='replace').read()
            if re.search(r'(Se\?or|m\?vil|tel\?fono|[Nn]otificaci\?n|\ufffd)', tx): bad.append(f)
say('FALLO' if bad else 'OK', 'acentos sustituidos por "?" en: ' + ', '.join(bad) if bad else 'sin acentos dañados en src/')
say('FALLO' if (main.startswith('\ufeff') or 'sendNotification' in main) else 'OK', 'main.js: ' + ('BOM al inicio o referencia a sendNotification (usa tools\\reparar_todo.py)' if (main.startswith('\ufeff') or 'sendNotification' in main) else 'cabecera y manejador de notificaciones correctos'))
print('\n== Fases A1 / C2 / B2')
chk = [('A1 main: notify:send (1 vez)', main.count("'notify:send'") == 1), ('A1 preload: notify', "'notify:send'" in pre), ('A1 modulo notify.js', os.path.exists(P('electron', 'notify.js'))),
       ('A1 intents: aviso al movil', os.path.exists(P('src','utils','intents_extra.js')) or (bool(intents) and 'notify_last' in intents)), ('A1 useAI: llama a las intenciones extra', 'parseExtraIntent(text)' in (useai or '') or "case 'notify_last'" in (useai or '')),
       ('C2 main: whatsapp:send (1 vez)', main.count("'whatsapp:send'") == 1), ('C2 preload', "'whatsapp:send'" in pre), ('C2 modulo whatsapp.js', ws is not None),
       ('C2 intents: whatsapp', os.path.exists(P('src','utils','intents_extra.js')) or (bool(intents) and "type: 'whatsapp'" in intents)), ('B2 main: voice:toggleLoopback (1 vez)', main.count("'voice:toggleLoopback'") == 1),
       ('B2 preload', "'voice:toggleLoopback'" in pre), ('B2 voice_server: cmd loopback', 'loopback' in (vs or '')), ('B2 whisper_bridge: start_loopback', 'def start_loopback' in (wb or '')),
       ('B2 intents: modo Discord', os.path.exists(P('src','utils','intents_extra.js')) or (bool(intents) and "type: 'loopback'" in intents)), ('B2 ChatCore: muestra LLAMADA', 'LLAMADA' in (chat or ''))]
for n, ok in chk: say('OK' if ok else 'FALLO', n)
print('\n== Protocolo de voz (main -> voice_server)')
cmds = set(re.findall(r"cmd:\s*'(\w+)'", main)); srv = vs or ''
for c in sorted(cmds): say('OK' if (f'"{c}"' in srv or f"'{c}'" in srv) else 'FALLO', f'voice_server entiende "{c}"')
print('\n== Interfaz')
if mem: say('OK' if 'h-64' in mem else 'AVISO', 'panel de memoria con altura fija (h-64)' if 'h-64' in mem else 'panel de memoria sin altura fija: ocupa todo el alto (usa tools\\instalar_fases.py)')
print('\n== .env y archivos')
env = {}
for l in (rd('.env') or '').splitlines():
    if '=' in l and not l.strip().startswith('#'): k, v = l.split('=', 1); env[k.strip()] = v.strip()
say('OK' if env else 'FALLO', '.env ' + ('encontrado' if env else 'no existe o esta vacio'))
for k in ('PIPER_BIN', 'PIPER_MODEL'):
    v = env.get(k); say('OK' if v and os.path.exists(P(v)) else 'FALLO', f'{k} -> ' + (v or '(vacio)') + ('' if v and os.path.exists(P(v)) else '  (no existe)'))
mic = env.get('MIC_DEVICE'); say('OK' if (mic or '').isdigit() else 'AVISO', 'MIC_DEVICE=' + (mic or '(sin definir: usa el micro por defecto)'))
say('OK' if env.get('BRAVE_SEARCH_API_KEY') else 'AVISO', 'BRAVE_SEARCH_API_KEY ' + ('definida' if env.get('BRAVE_SEARCH_API_KEY') else 'vacia (no habra busqueda web)'))
tp = env.get('NTFY_TOPIC', ''); say('OK' if not tp or re.fullmatch(r'[A-Za-z0-9_-]{1,64}', tp) else 'FALLO', 'NTFY_TOPIC valido o desactivado')
if not tp: say('AVISO', 'NTFY_TOPIC no configurado; avisos moviles desactivados')
cj = rd('contacts.json')
if cj is not None:
    try: say('OK', f'contacts.json valido ({len(json.loads(cj.lstrip(chr(0xFEFF))))} contactos)')
    except ValueError as e: say('FALLO', 'contacts.json no es un JSON valido: ' + str(e) + '  (revisa comas finales, comillas dobles rectas " y que no haya comentarios)')
else: say('AVISO', 'no hay contacts.json (WhatsApp abrira el chat sin numero)')
print('\n== Python (venv) y audio')
py = P('venv', 'Scripts', 'python.exe') if os.path.exists(P('venv', 'Scripts', 'python.exe')) else (P('venv', 'bin', 'python') if os.path.exists(P('venv', 'bin', 'python')) else sys.executable)
code = ("import importlib,json;r={}\nfor m in ('pywhispercpp','sounddevice','soundfile','numpy','soundcard'):\n"
        " try: importlib.import_module(m);r[m]='ok'\n except Exception as e: r[m]=str(e)[:80]\nprint(json.dumps(r))")
try:
    out = json.loads(subprocess.run([py, '-c', code], capture_output=True, text=True, timeout=60).stdout.strip().splitlines()[-1])
    for m, v in out.items(): say('OK' if v == 'ok' else ('AVISO' if m == 'soundcard' else 'FALLO'), f'modulo {m}: {v}' + ('  (necesario solo para el modo Discord: pip install soundcard)' if m == 'soundcard' and v != 'ok' else ''))
except Exception as e: say('FALLO', 'no pude ejecutar el Python del venv: ' + str(e)[:100])
if (mic or '').isdigit():
    try:
        d = json.loads(subprocess.run([py, '-c', 'import sounddevice as s,json;d=s.query_devices(%s);print(json.dumps([d["name"],d["max_input_channels"],d["default_samplerate"]]))' % mic], capture_output=True, text=True, timeout=30).stdout.strip().splitlines()[-1])
        say('OK' if d[1] > 0 else 'FALLO', f'microfono {mic}: {d[0]} ({d[1]} canales de entrada, {int(d[2])} Hz)')
    except Exception: say('FALLO', f'MIC_DEVICE={mic} no existe o no es un dispositivo de entrada (ver: python -c "import sounddevice as s;print(s.query_devices())")')
print('\n== Ollama')
try:
    tags = json.loads(urllib.request.urlopen('http://localhost:11434/api/tags', timeout=4).read()); names = [m['name'] for m in tags.get('models', [])]
    say('OK', 'Ollama responde; modelos: ' + ', '.join(names)); say('OK' if any(n.startswith('qwen2.5:3b') for n in names) else 'AVISO', 'modelo qwen2.5:3b ' + ('instalado' if any(n.startswith('qwen2.5:3b') for n in names) else 'no encontrado'))
except Exception: say('FALLO', 'Ollama no responde en localhost:11434 (ejecuta: ollama serve)')
print(f"\nResumen: {N['OK']} OK, {N['AVISO']} avisos, {N['FALLO']} fallos.")
