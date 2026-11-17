// Mapa de flujo de Nova: construye el grafo (nodos y conexiones) a partir del estado real del proceso principal.
// Función pura: recibe datos ya recogidos (carpetas, preferencias, ventanas, herramientas, estado de servicios).
// Privacidad: solo nombres de carpetas/archivos conocidos y booleanos («hay clave»); nunca contenido, claves ni temas de ntfy.
'use strict';
const nodePath = require('path');

const base = (p) => nodePath.win32.basename(String(p || '').replace(/[\\/]+$/, '')) || String(p || '');
const clip = (s, n = 40) => String(s == null ? '' : s).slice(0, n);

function buildGraph(inp = {}) {
  const fs = inp.fs || require('fs');
  const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
  const nodes = new Map(), links = [];
  const add = (id, label, kind, o = {}) => { if (!nodes.has(id)) nodes.set(id, { id, label: clip(label), kind, status: 'unknown', detail: '', ...o }); return nodes.get(id); };
  const link = (s, t, label = '', o = {}) => { if (nodes.has(s) && nodes.has(t) && s !== t && !links.some((l) => l.s === s && l.t === t)) links.push({ s, t, label: clip(label, 48), ...o }); };
  const st = (on) => (on === undefined || on === null ? 'unknown' : on ? 'on' : 'off');

  const env = inp.env || {}, prefs = inp.prefs || {}, nw = prefs.nativeWidgets || {}, shellOn = !!(inp.shellActive);
  const ollama = inp.ollama || {}, cloudOn = !!(inp.cloud && inp.cloud.enabled);

  // ---- Núcleo y módulos de Nova ----
  add('nova', 'Nova', 'core', { status: 'on', detail: 'Aplicación de escritorio (Electron + React). Todo lo demás cuelga de aquí.' });
  const mods = [
    ['chat', 'Chat y personalidad', 'Conversaciones, personalidad y respuesta por voz o texto.', 'on'],
    ['voice', 'Voz', 'Servicio local de voz (voice_server.py): escucha, transcribe y habla.', st(inp.voiceRunning)],
    ['memory', 'Memoria', 'Historial, ajustes y notas guardados en una base SQLite local.', 'on'],
    ['library', 'Biblioteca', 'Documentos (PDF/Word) que tú eliges para que Nova los consulte.', 'unknown'],
    ['agent', 'Agente de Nova', 'Ejecuta acciones con permisos: cada herramienta pasa por una lista cerrada y las que modifican archivos piden confirmación.', 'on'],
    ['shell', 'Shell de Windows', 'Dock, barra superior y panel de widgets sobre el escritorio.', st(shellOn)],
    ['notices', 'Centro de avisos', 'Historial de avisos de Nova y del móvil.', 'on'],
    ['media', 'Música y multimedia', 'Lee y controla las sesiones multimedia de Windows.', 'on'],
    ['mobile', 'Nova móvil', 'Web app para el teléfono que habla con la Nova de este PC.', st(inp.mobileOn)],
    ['search', 'Búsqueda web', 'Consulta información actual cuando hay clave configurada.', st(!!env.braveKey)],
    ['discord', 'Discord', 'Presencia y modo de escucha del audio del sistema.', st(inp.discordOn)],
    ['pcctl', 'Control del PC', 'Buscar archivos, abrir apps y redactar documentos, siempre con permiso.', st(env.pcControl !== false)],
  ];
  for (const [id, label, detail, status] of mods) { add(id, label, 'module', { detail, status }); link('nova', id, '', { rest: 95 }); }

  // ---- Servicios y programas externos ----
  const ollamaDetail = ollama.reachable ? `Ollama responde${ollama.models != null ? ` · ${ollama.models} modelos instalados` : ''}.` : 'Ollama no responde ahora mismo. Ábrelo desde Inicio o ejecuta «ollama serve».';
  add('ollama', 'Ollama', 'service', { status: st(!!ollama.reachable), detail: ollamaDetail });
  add('model', env.model || 'Modelo local', 'service', { status: st(!!ollama.reachable), detail: 'Modelo que responde en tu equipo.' });
  add('inkling', 'Inkling 2 Small (nube)', 'service', { status: cloudOn ? 'on' : 'off', detail: cloudOn ? 'Activo: los mensajes se envían a Ollama Cloud (inkling-2-small:cloud).' : 'Desactivado. Opcional: modelo en la nube de Ollama; requiere tu permiso porque los mensajes salen del PC.' });
  add('piper', 'Piper', 'service', { detail: 'Síntesis de voz local.' });
  add('whisper', 'Whisper.cpp', 'service', { detail: 'Reconocimiento de voz local.' });
  add('brave', 'Brave Search', 'service', { status: st(!!env.braveKey), detail: env.braveKey ? 'Clave configurada en .env.' : 'Sin clave en .env: la búsqueda web está desactivada.' });
  add('tailscale', 'Tailscale', 'service', { detail: 'Red privada entre tu PC y tu móvil (Tailscale Serve, sin abrir puertos).' });
  add('ntfy', 'ntfy', 'service', { status: st(!!env.ntfyTopic), detail: env.ntfyTopic ? 'Avisos al móvil configurados.' : 'Sin tema de ntfy: avisos al móvil desactivados.' });
  add('discordapp', 'Discord (app)', 'service', { detail: 'Aplicación de Discord instalada en el PC.' });
  add('windows', 'Windows', 'service', { status: 'on', detail: 'API públicas del sistema: ventanas, multimedia, monitores, avisos.' });
  if (inp.linerInstalled !== undefined && inp.linerInstalled !== null) add('liner', 'Liner', 'app', { status: inp.linerInstalled ? (inp.linerPlaying ? 'on' : 'off') : 'off', detail: inp.linerInstalled ? (inp.linerPlaying ? 'Reproduciendo: Nova la ve como sesión multimedia de Windows.' : 'Instalado. Si publica sesión multimedia, Nova la mostrará y controlará.') : 'No está instalado (aplicación independiente de música).' });

  link('chat', 'ollama', 'genera respuestas', { flow: !!ollama.reachable });
  link('ollama', 'model', 'carga');
  link('chat', 'inkling', 'opcional · nube', { flow: cloudOn });
  link('chat', 'memory', 'historial');
  link('chat', 'voice', 'voz');
  link('voice', 'piper', 'habla');
  link('voice', 'whisper', 'escucha');
  link('search', 'brave', 'consulta web', { flow: !!env.braveKey });
  link('chat', 'search', 'datos actuales');
  link('mobile', 'tailscale', 'red privada');
  link('mobile', 'chat', 'misma Nova', { flow: !!inp.mobileOn });
  link('notices', 'ntfy', 'avisa al móvil');
  link('notices', 'mobile', 'avisos');
  link('discord', 'discordapp', 'presencia');
  link('media', 'windows', 'sesiones multimedia', { flow: true });
  link('shell', 'windows', 'ventanas y pantalla completa', { flow: shellOn });
  link('shell', 'notices', 'muestra avisos');
  link('agent', 'chat', 'ejecuta lo que pides');
  link('agent', 'pcctl', 'permisos');
  link('pcctl', 'windows', 'abrir y buscar');
  link('library', 'chat', 'contexto');
  if (nodes.has('liner')) { link('media', 'liner', 'controla', { flow: !!inp.linerPlaying }); link('shell', 'liner', 'abrir'); }

  // ---- Herramientas del agente (agrupadas por prefijo) ----
  const groups = new Map();
  for (const t of Array.isArray(inp.tools) ? inp.tools : []) { const g = String(t).split('.')[0] || 'otras'; groups.set(g, (groups.get(g) || 0) + 1); }
  const GROUP_NAME = { fs: 'Archivos', system: 'Sistema', apps: 'Aplicaciones', web: 'Web', media: 'Multimedia' };
  for (const [g, n] of [...groups].slice(0, 10)) { add('tool:' + g, `${GROUP_NAME[g] || g} (${n})`, 'tool', { status: 'on', detail: `${n} herramienta${n === 1 ? '' : 's'} del agente en «${g}».` }); link('agent', 'tool:' + g, 'herramientas'); }
  if (nodes.has('tool:system')) link('tool:system', 'windows', 'lee y controla');
  if (nodes.has('tool:apps')) link('tool:apps', 'windows', 'abre apps');
  if (nodes.has('tool:media')) link('tool:media', 'media', 'controla');

  // ---- Carpetas ----
  const folder = (id, label, p, detail, status) => add(id, label, 'folder', { path: p, status: status || (exists(p) ? 'on' : 'off'), detail });
  if (inp.appRoot) { folder('dir:project', 'Proyecto Nova', inp.appRoot, 'Código de Nova. No contiene tus conversaciones.'); link('nova', 'dir:project', 'código', { rest: 120 }); }
  if (inp.userData) {
    folder('dir:userdata', 'Datos de usuario', inp.userData, 'Aquí viven tus ajustes y tu memoria (perfil local de Windows).'); link('nova', 'dir:userdata', 'guarda', { rest: 110 }); link('memory', 'dir:userdata', 'base y ajustes');
    let names = []; try { names = fs.readdirSync(inp.userData); } catch {}
    const known = ['nova-notices.json', 'agent-audit.jsonl', 'nova-personalizacion.txt'];
    for (const f of names.filter((x) => /\.(db|sqlite3?)$/i.test(x)).slice(0, 2)) { add('file:' + f, f, 'file', { path: nodePath.win32.join(inp.userData, f), status: 'on', detail: 'Base de datos SQLite con tu memoria. No se comparte.' }); link('dir:userdata', 'file:' + f, 'contiene'); link('memory', 'file:' + f, 'lee y escribe', { flow: true }); }
    for (const f of known.filter((x) => names.includes(x))) {
      add('file:' + f, f, 'file', { path: nodePath.win32.join(inp.userData, f), status: 'on', detail: f === 'nova-notices.json' ? 'Historial del centro de avisos.' : f === 'agent-audit.jsonl' ? 'Registro de lo que ha hecho el agente.' : 'Tu personalización de Nova (se edita desde Ajustes).' });
      link('dir:userdata', 'file:' + f, 'contiene'); link(f === 'nova-notices.json' ? 'notices' : f === 'agent-audit.jsonl' ? 'agent' : 'chat', 'file:' + f, f === 'agent-audit.jsonl' ? 'registra' : 'usa');
    }
  }
  if (inp.appRoot) { const v = nodePath.win32.join(inp.appRoot, 'voices'); if (exists(v)) { folder('dir:voices', 'Voces', v, 'Modelos de voz descargados (no se suben a GitHub).'); link('dir:project', 'dir:voices', 'contiene'); link('voice', 'dir:voices', 'carga voces'); } }
  const seen = new Set();
  for (const r of (Array.isArray(inp.roots) ? inp.roots : []).slice(0, 10)) { const k = String(r).toLowerCase(); if (!r || seen.has(k)) continue; seen.add(k); const id = 'dir:root:' + k; folder(id, base(r), r, 'Carpeta a la que el control del PC puede acceder (con permiso).'); link('pcctl', id, 'acceso permitido'); if (nodes.has('tool:fs')) link('tool:fs', id, 'lee/escribe'); }
  for (const p of (Array.isArray(inp.places) ? inp.places : []).slice(0, 8)) { const k = String(p.path || '').toLowerCase(); if (!k || seen.has(k)) continue; seen.add(k); const id = 'dir:place:' + p.id; folder(id, p.label || base(p.path), p.path, 'Carpeta conocida de Windows.'); link('windows', id, 'carpeta del sistema'); if (nodes.has('tool:fs')) link('tool:fs', id, 'explora'); }

  // ---- Aplicaciones: accesos fijados y ventanas abiertas ----
  const pins = (prefs.dock && Array.isArray(prefs.dock.pins)) ? prefs.dock.pins : [];
  for (const pin of pins.slice(0, 10)) {
    if (pin.type === 'app') { const id = 'app:pin:' + String(pin.name || pin.appId).toLowerCase(); add(id, pin.name || 'App', 'app', { status: 'unknown', detail: 'Acceso fijado en el dock de Nova.' }); link('shell', id, 'acceso fijado'); }
    else if (pin.path) { const id = 'dir:pin:' + String(pin.path).toLowerCase(); if (!nodes.has(id) && !seen.has(String(pin.path).toLowerCase())) { add(id, base(pin.path), pin.type === 'folder' ? 'folder' : 'file', { path: pin.path, status: exists(pin.path) ? 'on' : 'off', detail: 'Acceso fijado en el dock de Nova.' }); link('shell', id, 'acceso fijado'); } }
  }
  const openNames = new Set();
  for (const w of (Array.isArray(inp.windows) ? inp.windows : [])) { const n = String(w.name || '').toLowerCase(); if (!n || openNames.has(n) || openNames.size >= 10) continue; openNames.add(n); const id = 'app:win:' + n; add(id, w.name, 'app', { status: 'on', detail: 'Ventana abierta ahora mismo en Windows.' }); link('shell', id, 'ventana abierta', { flow: true }); }

  const list = [...nodes.values()];
  const deg = new Map(); for (const l of links) { deg.set(l.s, (deg.get(l.s) || 0) + 1); deg.set(l.t, (deg.get(l.t) || 0) + 1); }
  for (const n of list) n.degree = deg.get(n.id) || 0;
  return { nodes: list, links, at: Date.now(), counts: list.reduce((a, n) => { a[n.kind] = (a[n.kind] || 0) + 1; return a; }, {}) };
}

module.exports = { buildGraph };
