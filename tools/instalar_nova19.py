#!/usr/bin/env python3
"""UPDATE 19 - NOVA DESKTOP (Parte 1) + contrato de Nova Agent.
Los archivos NUEVOS ya vienen en el ZIP (no sobrescribe ninguno existente). Este script solo hace 5 parches pequeños
sobre archivos existentes (copia .bak-nova19 de cada uno) y recompila. IDEMPOTENTE.
   python tools\\instalar_nova19.py [--sin-build | --sin-pruebas | --revertir]"""
import json, os, shutil, subprocess, sys
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
ROOT = os.getcwd(); P = lambda *a: os.path.join(ROOT, *a); SUF = '.bak-nova19'
rd = lambda p: open(p, 'rb').read().decode('utf-8-sig', errors='replace')
wr = lambda p, t: open(p, 'wb').write(t.encode('utf-8'))
PATCHED = ['electron/main.js', 'electron/preload.js', 'electron/pcControl.js', 'src/App.jsx', 'package.json']
MANIFEST = P('tools', 'nova19_manifest.txt')

def backup(p):
    if os.path.exists(p) and not os.path.exists(p + SUF): shutil.copyfile(p, p + SUF)

if not os.path.isdir(P('src')) or not os.path.isdir(P('electron')):
    print('Ejecutalo desde la carpeta jarvis-clone.'); sys.exit(1)

if '--revertir' in sys.argv:
    for rel in PATCHED:
        dst = P(*rel.split('/'))
        if os.path.exists(dst + SUF): shutil.copyfile(dst + SUF, dst); os.remove(dst + SUF); print('[RESTAURADO]', rel)
    if os.path.exists(MANIFEST):
        for rel in [l.strip() for l in open(MANIFEST, encoding='utf-8') if l.strip()]:
            f = P(*rel.split('/'))
            if os.path.isfile(f): os.remove(f); print('[ELIMINADO]  ', rel)
        for d in ['electron/agent/tools', 'electron/agent', 'electron/desktop/ps', 'electron/desktop', 'src/desktop/apps', 'src/desktop/widgets', 'src/desktop', 'test', 'docs']:
            try: os.rmdir(P(*d.split('/')))
            except OSError: pass
    print('\nRevertido. Tu memoria y tus ajustes no se han tocado (las preferencias del escritorio quedan en la base de datos sin efecto).\nRecompila con: npm run build'); sys.exit(0)

need = ['electron/agent/runner.js', 'electron/desktop/index.js', 'src/desktop/DesktopShell.jsx']
miss = [n for n in need if not os.path.exists(P(*n.split('/')))]
if miss: print('Faltan archivos nuevos (¿descomprimiste el zip dentro de jarvis-clone?):', miss); sys.exit(1)
if not os.path.exists(P('electron', 'novaIpc.js')): print('Faltan updates anteriores (novaIpc.js). Instala primero las updates 16-18.'); sys.exit(1)

fails = 0
def patch(rel, fn, label):
    global fails
    p = P(*rel.split('/'))
    if not os.path.exists(p): print('[AVISO] no existe', rel); fails += 1; return
    t = rd(p); new = fn(t)
    if new is None: fails += 1; print('[FALLO]', rel, '-', label, '(no encontré el punto de anclaje; no se ha tocado el archivo)'); return
    if new == t: print('[YA ESTABA]', rel, '-', label); return
    backup(p); wr(p, new); print('[PARCHEADO]', rel, '-', label)

def rep(t, old, new, marker):
    if marker in t: return t
    if t.count(old) != 1: return None
    return t.replace(old, new, 1)

# 1) main.js: arrancar Nova Desktop y alimentarlo con las métricas existentes
def f_main(t):
    t = rep(t, "  voiceCall({ cmd: 'warmup' }).catch(() => {});",
            "  try { require('./desktop').init({ ipcMain, app, shell, getWin: () => win, mem, pcControl, execFile }); } catch (e) { console.error('desktop', e); } // update 19\n  voiceCall({ cmd: 'warmup' }).catch(() => {});", "require('./desktop').init")
    if t is None: return None
    return rep(t, "w.on('message', (m) => { try { mobileServer.setStats(m); } catch {}",
               "w.on('message', (m) => { try { mobileServer.setStats(m); } catch {} try { require('./desktop').setStats(m); } catch {}", "require('./desktop').setStats")
patch('electron/main.js', f_main, 'iniciar Nova Desktop y métricas')

# 2) preload.js: API mínima de Nova Agent (única entrada del renderer)
AGENT = """  agent: {
    tools: () => ipcRenderer.invoke('agent:tools'),
    start: (tool, args, dryRun) => ipcRenderer.invoke('agent:start', { tool, args, dryRun }),
    run: (tool, args, dryRun) => ipcRenderer.invoke('agent:run', { tool, args, dryRun }),
    ai: (tool, args, opts) => ipcRenderer.invoke('agent:ai', { tool, args, ...(opts || {}) }),
    cancel: (id) => ipcRenderer.invoke('agent:cancel', { id }),
    answer: (id, a) => ipcRenderer.invoke('agent:answer', { id, ...(a || {}) }),
    get: (id) => ipcRenderer.invoke('agent:get', { id }),
    list: (limit) => ipcRenderer.invoke('agent:list', { limit }),
    audit: (limit) => ipcRenderer.invoke('agent:audit', { limit }),
    icon: (path) => ipcRenderer.invoke('desktop:icon', { path }),
    onEvent: on('agent:event')
  },
"""
patch('electron/preload.js', lambda t: rep(t, "  win: (action) => ipcRenderer.send('win', action)", AGENT + "  win: (action) => ipcRenderer.send('win', action)", "agent: {"), 'API window.jarvis.agent')

# 3) pcControl.js: exportar las carpetas permitidas (una sola lista en todo el proyecto)
patch('electron/pcControl.js', lambda t: rep(t, "module.exports = { run, runRemote, _safe: safe };", "module.exports = { run, runRemote, _safe: safe, _roots: roots };", "_roots: roots"), 'exportar carpetas permitidas')

# 4) App.jsx: botón ESCRITORIO y vista de Nova Desktop
def f_app(t):
    t = rep(t, "import { nv } from './utils/nova.js';", "import { nv } from './utils/nova.js';\nimport DesktopShell from './desktop/DesktopShell.jsx';", "DesktopShell from")
    if t is None: return None
    t = rep(t, "  const [perf, setPerf] = useState('auto');", "  const [perf, setPerf] = useState('auto');\n  const [desk, setDesk] = useState(false);\n  useEffect(() => { window.jarvis.getSettings().then((s) => { try { if (JSON.parse(s['desk.prefs'] || '{}').startInDesktop) setDesk(true); } catch {} }).catch(() => {}); }, []);", "const [desk, setDesk]")
    if t is None: return None
    t = rep(t, "(islandUi ? ' nova-island-' + islandUi : '')}", "(islandUi ? ' nova-island-' + islandUi : '') + (desk ? ' nova-desk-on' : '')}", "nova-desk-on")
    if t is None: return None
    t = rep(t, "        <button className={'pill' + (cfg ? ' pill-on' : '')} onClick={() => setCfg(!cfg)}>AJUSTES</button>", "        <button className={'pill' + (desk ? ' pill-on' : '')} onClick={() => setDesk(!desk)} aria-pressed={desk}>ESCRITORIO</button>\n        <button className={'pill' + (cfg ? ' pill-on' : '')} onClick={() => setCfg(!cfg)}>AJUSTES</button>", "setDesk(!desk)")
    if t is None: return None
    return rep(t, "    <Overlays />", "    {desk && <DesktopShell state={st} onExit={() => setDesk(false)} onAssistantSettings={() => { setDesk(false); setCfg(true); }} />}\n    <Overlays />", "<DesktopShell state")
patch('src/App.jsx', f_app, 'botón ESCRITORIO y vista')

# 5) package.json: script de pruebas
def f_pkg(t):
    d = json.loads(t)
    if d.get('scripts', {}).get('test'): return t
    d.setdefault('scripts', {})['test'] = 'node --test'
    return json.dumps(d, indent=2, ensure_ascii=False) + '\n'
patch('package.json', f_pkg, 'script npm test')

if fails:
    print(f'\n{fails} parche(s) no se pudieron aplicar. Nada se ha roto: los archivos que fallaron no se modificaron.\nPuedes deshacer lo aplicado con: python tools\\instalar_nova19.py --revertir'); sys.exit(2)

if '--sin-pruebas' not in sys.argv:
    print('\nEjecutando pruebas del motor (node --test)...')
    r = subprocess.run('node --test', shell=True, cwd=ROOT)
    print('[PRUEBAS OK]' if r.returncode == 0 else '[PRUEBAS CON FALLOS] revisa la salida de arriba (la instalación sigue siendo válida).')
if '--sin-build' not in sys.argv:
    print('\nCompilando (npm run build)...')
    r = subprocess.run('npm run build', shell=True, cwd=ROOT)
    print('[BUILD OK]' if r.returncode == 0 else '[BUILD FALLÓ] Ejecuta manualmente: npm run build  (si falla, envíame el error)')
print('\nListo. Abre Nova y pulsa ESCRITORIO en la cabecera. Para deshacer: python tools\\instalar_nova19.py --revertir')
