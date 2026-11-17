#!/usr/bin/env python3
"""Instala A1 (ntfy), C2 (WhatsApp) y B2 (modo Discord) en TU proyecto. Es IDEMPOTENTE: cada parche lleva una marca
y si ya esta aplicado se salta, asi que se puede ejecutar varias veces sin duplicar codigo.
   python tools\\instalar_fases.py          (desde la carpeta jarvis-clone)
Hace copia .bak-fases de cada archivo la primera vez. Si un ancla no existe en tu version, NO toca ese archivo
y te imprime el fragmento para pegarlo a mano."""
import os, shutil, subprocess, sys

ROOT = os.getcwd()
res = {'ok': [], 'skip': [], 'fail': []}
P = lambda *a: os.path.join(ROOT, *a)

MAIN_REQ = "\nconst { notify } = require('./notify');\nconst { sendWhatsApp } = require('./whatsapp');"
IPC_A1 = """// Aviso al movil (ntfy). Los envios automaticos (auto:true) se apagan con NTFY_AUTO=false en .env
  ipcMain.handle('notify:send', async (_e, p = {}) => {
    try {
      if (p.auto && process.env.NTFY_AUTO === 'false') return { skipped: true };
      await notify({ title: p.title, message: p.message, priority: p.priority, tags: p.tags });
      return { ok: true };
    } catch (e) { return { error: e.message }; }
  });
  """
IPC_C2 = """// WhatsApp: prepara el mensaje (no lo envia)
  ipcMain.handle('whatsapp:send', async (_e, p = {}) => { try { return await sendWhatsApp(String(p.contact || ''), String(p.text || '')); } catch (e) { return { error: e.message }; } });
  """
IPC_B2 = """// Modo Discord: activa/desactiva la captura del audio de salida (on:null = alternar)
  ipcMain.handle('voice:toggleLoopback', async (_e, on) => { try { return await voiceCall({ cmd: 'loopback', on: typeof on === 'boolean' ? on : null }); } catch (e) { return { error: e.message }; } });
  """
IPC_ANCHORS = ["ipcMain.handle('app:open',", "ipcMain.handle('voice:listen',"]
INTENTS = r"""  // Modo Discord (captura del audio de salida del equipo)
  if (/^(?:activa|enciende|inicia|pon)\s+(?:el\s+)?modo\s+discord$/i.test(s) || /^(?:escucha|esc[uú]chame)\s+(?:la\s+)?(?:llamada|discord)$/i.test(s)) return { type: 'loopback', on: true };
  if (/^(?:desactiva|apaga|det[eé]n|quita)\s+(?:el\s+)?modo\s+discord$/i.test(s) || /^(?:deja|para)\s+de\s+escuchar\s+(?:la\s+)?(?:llamada|discord)$/i.test(s)) return { type: 'loopback', on: false };
  // WhatsApp: "envia un WhatsApp a mama diciendo que llego tarde", "dile a Pedro por WhatsApp que ..."
  if ((m = s.match(/^(?:env[ií]a(?:le)?|m[aá]nda(?:le)?|escribe(?:le)?)\s+(?:un\s+|el\s+)?(?:whats\s?app|wasap|guasap)\s+a\s+(.+?)\s+(?:diciendo(?:le)?(?:\s+que)?|con el mensaje|que (?:diga|dice)|:)\s*(.+)$/i))) return { type: 'whatsapp', contact: m[1].trim(), text: m[2].trim() };
  if ((m = s.match(/^dile\s+a\s+(.+?)\s+por\s+(?:whats\s?app|wasap|guasap)\s+(?:que\s+)?(.+)$/i))) return { type: 'whatsapp', contact: m[1].trim(), text: m[2].trim() };
  // Aviso al movil (ntfy): "mandame esto al movil", "envia al movil que ..."
  if (/^(?:m[aá]ndame|env[ií]ame|p[aá]same)\s+(?:esto|eso|la respuesta|lo anterior)\s+(?:al|a mi)\s+(?:m[oó]vil|tel[eé]fono|celular)(?:\s+por favor)?$/i.test(s)) return { type: 'notify_last' };
  if ((m = s.match(/^(?:env[ií]a|manda|m[aá]ndame|env[ií]ame)(?:\s+(?:un\s+)?(?:mensaje|aviso|notificaci[oó]n))?\s+(?:al|a mi)\s+(?:m[oó]vil|tel[eé]fono|celular)(?:\s+(?:que\s+diga|diciendo|con el mensaje|que)|\s*:)?\s*(.+)$/i))) return { type: 'notify_text', text: m[1].trim() };
  if ((m = s.match(/^(?:env[ií]a|manda|m[aá]ndame|env[ií]ame)\s+(?:un\s+)?(?:aviso|notificaci[oó]n)(?:\s+(?:que\s+diga|diciendo(?:\s+que)?)|\s*:)\s*(.+)$/i))) return { type: 'notify_text', text: m[1].trim() };
"""
CASES = """      case 'notify_last': case 'notify_text': {
        const last = i.type === 'notify_text' ? { content: i.text } : [...msgsRef.current].reverse().find(m => m.role === 'assistant' && m.content);
        if (!last) return 'No tengo nada que enviar todavía, Señor.';
        const r = await window.jarvis.notify({ title: 'JARVIS', message: last.content, priority: 3, tags: ['robot'] });
        return r.error ? 'No he podido enviarlo a su teléfono, Señor.' : 'Enviado a su teléfono móvil, Señor.';
      }
      case 'whatsapp': {
        const r = await window.jarvis.whatsapp({ contact: i.contact, text: i.text });
        if (r.error) return 'No he podido preparar el mensaje de WhatsApp, Señor.';
        const donde = r.via === 'web' ? 'en WhatsApp Web' : 'en WhatsApp';
        return r.matched ? `Mensaje para ${i.contact} preparado ${donde}, Señor. Pulse enviar para mandarlo.` : `No tengo el número de ${i.contact}, Señor. He abierto ${donde} con el mensaje para que elija el chat.`;
      }
      case 'loopback': {
        const r = await window.jarvis.toggleLoopback(i.on);
        if (r.error) return `No he podido ${i.on ? 'activar' : 'desactivar'} el modo Discord, Señor.`;
        return r.on ? 'Modo Discord activado, Señor. Escucho el audio de su equipo.' : 'Modo Discord desactivado, Señor.';
      }
"""
WB_HELPER = '''_tr_lock = threading.Lock()  # whisper.cpp no es seguro entre hilos: una transcripcion a la vez

def _transcribe(audio, prompt=None):
    with _tr_lock:
        model = _get_model()
        try:
            segs = model.transcribe(audio, language="es", initial_prompt=prompt) if prompt else model.transcribe(audio, language="es")
        except TypeError:
            segs = model.transcribe(audio, language="es")
        return " ".join(s.text for s in segs).strip()

'''
WB_OLD = '''    model = _get_model()
    prompt = "Conversación en español con Jarvis, el asistente del Señor."
    try:
        segs = model.transcribe(audio, language="es", initial_prompt=prompt)
    except TypeError:
        segs = model.transcribe(audio, language="es")
    text = " ".join(s.text for s in segs).strip()
'''
WB_NEW = '''    text = _transcribe(audio, "Conversación en español con Jarvis, el asistente del Señor.")
'''
WB_LOOP = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'loopback_block.py'), encoding='utf-8').read() if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'loopback_block.py')) else None
VS_LB = '''            elif cmd == "loopback":
                want = req.get("on")
                on = (not loopback_running()) if want is None else bool(want)
                if on:
                    start_loopback(lambda t: emit({"event": "heard", "source": "loopback", "text": t}),
                                   lambda e: emit({"event": "error", "message": "Modo Discord: " + e}))
                else:
                    stop_loopback()
                emit({"event": "loopback", "state": "on" if on else "off"})
                emit({"id": req.get("id"), "ok": True, "on": on})
'''
# (archivo, marca de "ya aplicado", [ (tipo, anclas, texto) ... ])  tipos: before | after | replace | append
PATCHES = [
 ('src/components/MemoryPanel.jsx', "h-64 shrink-0", [('replace', ["panel flex-1 min-h-[10rem] flex flex-col"], "panel h-64 shrink-0 flex flex-col")]),
 ('electron/main.js', "require('./notify')", [('after', ["const providers = require('./providers/registry');", "require('dotenv').config();"], MAIN_REQ)]),
 ('electron/main.js', "'notify:send'", [('before', IPC_ANCHORS, IPC_A1)]),
 ('electron/main.js', "'whatsapp:send'", [('before', IPC_ANCHORS, IPC_C2)]),
 ('electron/main.js', "'voice:toggleLoopback'", [('before', IPC_ANCHORS, IPC_B2)]),
 ('electron/preload.js', "'notify:send'", [('before', ["memHistory:"], "notify: (p) => ipcRenderer.invoke('notify:send', p),\n  ")]),
 ('electron/preload.js', "'whatsapp:send'", [('before', ["memHistory:"], "whatsapp: (p) => ipcRenderer.invoke('whatsapp:send', p),\n  ")]),
 ('electron/preload.js', "'voice:toggleLoopback'", [('before', ["memHistory:"], "toggleLoopback: (on) => ipcRenderer.invoke('voice:toggleLoopback', on),\n  ")]),
 ('src/hooks/useAI.js', "from '../utils/intents_extra.js'", [('prepend', None, "import { parseExtraIntent, runExtraIntent } from '../utils/intents_extra.js';\n")]),
 ('src/hooks/useAI.js', "parseExtraIntent(text)", [('needs', ["const reply =", "const base =", "msgsRef"], None), ('before', ["    const intent = parseIntent(text);", "const intent = parseIntent(text);"], "    // Intenciones extra: aviso al móvil (A1), WhatsApp (C2), modo Discord (B2)\n    const extra = parseExtraIntent(text);\n    if (extra) {\n      try { reply(await runExtraIntent(extra, { lastAssistant: () => ([...msgsRef.current].reverse().find(m => m.role === 'assistant' && m.content) || {}).content || '' })); }\n      catch (e) { setError(String(e.message || e)); set(base); }\n      return;\n    }\n")]),
 ('src/hooks/useAI.js', "m.role !== 'call'", [('replace', ["const clean = (arr) => arr.map(({ role, content }) => ({ role, content }));"], "const clean = (arr) => arr.filter(m => m.role !== 'call').map(({ role, content }) => ({ role, content })); // 'call' = lo oído en el modo Discord (solo UI)")]),
 ('src/hooks/useAI.js', "JARVIS — Temporizador", [('after', ["          try { new Notification('JARVIS', { body: msg }); } catch {}"], "\n          window.jarvis.notify({ title: 'JARVIS — Temporizador', message: msg, priority: 4, tags: ['alarm_clock'], auto: true });")]),
 ('src/hooks/useAI.js', "const t0 = Date.now()", [('after', ["    const id = ++idRef.current; let acc = '', from = 0;"], " const t0 = Date.now();")]),
 ('src/hooks/useAI.js', "JARVIS respondió", [('after', ["    window.jarvis.memAdd('assistant', final);\n  };"], "")]),
 ('src/components/ChatCore.jsx', "m.event === 'heard'", [('after', ["    else if (m.event === 'error') { setVoiceErr(m.message); setPendingSay(false); }"], "\n    else if (m.event === 'heard') push('call', m.text); // modo Discord: lo que suena en el equipo")]),
 ('src/components/ChatCore.jsx', "text-yellow-300", [('replace', ["className={m.role === 'user' ? 'text-white' : 'text-hud-cyan'}>"], "className={m.role === 'user' ? 'text-white' : m.role === 'call' ? 'text-yellow-300 text-sm' : 'text-hud-cyan'}>")]),
 ('src/components/ChatCore.jsx', "'LLAMADA: '", [('replace', ["<b>{m.role === 'user' ? '> TÚ: ' : 'JARVIS: '}</b>"], "<b>{m.role === 'user' ? '> TÚ: ' : m.role === 'call' ? 'LLAMADA: ' : 'JARVIS: '}</b>")]),
 ('whisper_bridge.py', "def _transcribe(", [('before', ["def warmup():"], WB_HELPER)]),
 ('whisper_bridge.py', "_transcribe(audio, \"Conversación", [('replace', [WB_OLD], WB_NEW)]),
 ('whisper_bridge.py', "def start_loopback", [('append', None, WB_LOOP)]),
 ('voice_server.py', "start_loopback", [('replace', ["from whisper_bridge import listen_and_transcribe, warmup, cancel_listen"], "from whisper_bridge import listen_and_transcribe, warmup, cancel_listen, start_loopback, stop_loopback, loopback_running, set_speaking_probe")]),
 ('voice_server.py', "set_speaking_probe(lambda", [('before', ["    threading.Thread(target=warm_piper, daemon=True).start()"], "    set_speaking_probe(lambda: speaking or outstanding > 0)  # para que el modo Discord no transcriba a Jarvis\n")]),
 ('voice_server.py', 'cmd == "loopback"', [('before', ['            elif cmd == "cancel":', '            elif cmd == "stop":'], VS_LB)]),
]
# useAI: el aviso al terminar de responder va DENTRO de stream(); lo tratamos con un parche propio
STREAM_NOTIFY = "\n    // Ventana oculta/minimizada y respuesta larga: aviso al móvil\n    if (document.hidden && (Date.now() - t0 > 6000 || final.length > 250)) window.jarvis.notify({ title: 'JARVIS respondió', message: final, priority: 3, tags: ['speech_balloon'], auto: true });"
for i, (f, mk, ops) in enumerate(PATCHES):
    if mk == 'JARVIS respondió': PATCHES[i] = (f, mk, [('after', ["    window.jarvis.memAdd('assistant', final);\n  };"[:-5]], STREAM_NOTIFY)])

def backup(path):
    b = path + '.bak-fases'
    if not os.path.exists(b): shutil.copy(path, b)

def pick(t, anchors):
    for a in anchors:
        if a in t: return a
    return None

def validar(path):
    try:
        if path.endswith('.js') and path.startswith(P('electron')): r = subprocess.run(['node', '--check', path], capture_output=True, text=True)
        elif path.endswith('.py'): r = subprocess.run([sys.executable, '-m', 'py_compile', path], capture_output=True, text=True)
        else: return True, ''
        return r.returncode == 0, r.stderr
    except FileNotFoundError: return True, ''

def run():
    if not os.path.isdir(P('electron')): print('Ejecutalo desde la carpeta jarvis-clone.'); sys.exit(1)
    for need in ('electron/notify.js', 'electron/whatsapp.js'):
        if not os.path.exists(P(need)): print('Falta', need, '(descomprime el zip encima del proyecto antes).'); sys.exit(1)
    if not os.path.exists(P('tools', 'loopback_block.py')): print('Falta tools/loopback_block.py'); sys.exit(1)
    global WB_LOOP
    WB_LOOP = open(P('tools', 'loopback_block.py'), encoding='utf-8').read()
    for i, (f, mk, ops) in enumerate(PATCHES):
        if f == 'whisper_bridge.py' and mk == 'def start_loopback': PATCHES[i] = (f, mk, [('append', None, WB_LOOP)])
    for f, mk, ops in PATCHES:
        path = P(*f.split('/'))
        if not os.path.exists(path): res['fail'].append((f, mk, 'no existe el archivo', None)); continue
        t = open(path, encoding='utf-8').read()
        if mk in t: res['skip'].append((f, mk)); continue
        new, bad = t, None
        for kind, anchors, text in ops:
            if kind == 'append': new = new.rstrip('\n') + '\n\n' + text; continue
            if kind == 'prepend': new = text + new; continue
            if kind == 'needs':
                falta = [a for a in anchors if a not in new]
                if falta: bad = ('(falta en el archivo: ' + ', '.join(falta) + ')', 'Tu useAI.js tiene otra estructura. Pegalo a mano o enviame src/hooks/useAI.js.'); break
                continue
            a = pick(new, anchors)
            if not a: bad = (anchors[0], text); break
            new = new.replace(a, (text + a) if kind == 'before' else (a + text) if kind == 'after' else text, 1)
        if bad: res['fail'].append((f, mk, 'no encuentro el ancla: ' + bad[0].strip()[:70], bad[1])); continue
        backup(path); open(path, 'w', encoding='utf-8', newline='').write(new)
        ok, err = validar(path)
        if not ok:
            shutil.copy(path + '.bak-fases', path); res['fail'].append((f, mk, 'error de sintaxis, restaurado: ' + err[:200], None)); continue
        res['ok'].append((f, mk))
    for f, mk in res['ok']: print('APLICADO ', f, '->', mk)
    for f, mk in res['skip']: print('YA ESTABA', f, '->', mk)
    for f, mk, why, snip in res['fail']:
        print('FALLO    ', f, '->', mk, '|', why)
        if snip: print('   --- pega esto a mano en', f, '---\n' + snip + '\n   ---')
    for ex, key in (('.env.example', 'NTFY_TOPIC'), ('.gitignore', 'contacts.json'), ('requirements.txt', 'soundcard')):
        p = P(ex)
        t = open(p, encoding='utf-8').read() if os.path.exists(p) else ''
        if key not in t:
            add = {'.env.example': '\n# Aviso al movil (ntfy). OJO: el tema es publico; quien conozca el nombre puede leer y enviar. Usa uno largo y aleatorio.\nNTFY_TOPIC=\nNTFY_AUTO=false\n# WhatsApp: app (whatsapp://) o web (wa.me)\nWHATSAPP_MODE=app\n# Modo Discord (audio del sistema): umbral de volumen para detectar voz\nLOOPBACK_THRESHOLD=0.01\n',
                   '.gitignore': '\ncontacts.json\n', 'requirements.txt': '\nsoundcard\n'}[ex]
            open(p, 'a', encoding='utf-8').write(add); print('ACTUALIZADO', ex)
    print('\nResumen: %d aplicados, %d ya estaban, %d fallos.' % (len(res['ok']), len(res['skip']), len(res['fail'])))
    sys.exit(1 if res['fail'] else 0)
run()
