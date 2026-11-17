// Herramientas de archivos (reales). Todas pasan por fsGuard: solo carpetas personales, sin sobrescribir.
'use strict';
const path = require('path');
const { AgentError, ERR } = require('../contract');
const { RISKY } = require('../../desktop/fsGuard');

const P = (description, extra = {}) => ({ type: 'path', required: true, description, ...extra });
const names = (paths, n = 4) => paths.slice(0, n).map((p) => '«' + path.basename(p) + '»').join(', ') + (paths.length > n ? ` y ${paths.length - n} más` : '');
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

function register(reg) {
  reg.register({
    name: 'fs.places', title: 'Ubicaciones habituales', risk: 'low', description: 'Escritorio, Documentos, Descargas, Imágenes, Vídeos, Música y OneDrive (solo las que existen).',
    schema: {}, summarize: () => 'Listar ubicaciones habituales', execute: async (c) => ({ places: c.services.fs.places() }),
  });
  reg.register({
    name: 'fs.stat', title: 'Comprobar elemento', risk: 'low', description: 'Indica si un archivo o carpeta existe y es accesible (para validar accesos antes de crearlos).',
    schema: { path: P('Elemento') }, summarize: (a) => `Comprobar «${path.basename(a.path)}»`,
    async execute(c, a) {
      let p; try { p = c.services.guard.safe(a.path); } catch { return { exists: false, allowed: false }; }
      const s = c.services.fs.stat(p); return s ? { exists: true, allowed: true, path: p, isDir: s.isDir, size: s.size, mtime: s.mtime } : { exists: false, allowed: true, path: p };
    },
  });
  reg.register({
    name: 'fs.list', title: 'Ver carpeta', risk: 'low', description: 'Lista el contenido de una carpeta personal con metadatos básicos.',
    schema: { path: P('Carpeta') }, summarize: (a) => `Ver la carpeta «${path.basename(a.path) || a.path}»`, execute: async (c, a) => c.services.fs.list(a.path),
  });
  reg.register({
    name: 'fs.search', title: 'Buscar archivos', risk: 'low', timeoutMs: 20000,
    description: 'Busca por nombre (o por contenido con mode=content) en las carpetas personales. Usa el índice de Windows y, si no responde, un recorrido acotado.',
    schema: { query: { type: 'string', max: 120 }, folder: { type: 'path' }, ext: { type: 'string', max: 12 }, kind: { type: 'enum', values: ['any', 'file', 'folder'], default: 'any' }, mode: { type: 'enum', values: ['name', 'content'], default: 'name' }, limit: { type: 'integer', min: 1, max: 200, default: 40 } },
    summarize: (a) => `Buscar «${a.query || ''}${a.ext ? ' .' + a.ext.replace(/^\./, '') : ''}»${a.folder ? ' en «' + path.basename(a.folder) + '»' : ''}${a.mode === 'content' ? ' (por contenido)' : ''}`,
    async execute(c, a) {
      const S = c.services, guard = S.guard; let source = 'walk', note = '';
      const roots = a.folder ? [guard.safe(a.folder, { mustExist: true })] : guard.roots().filter((r) => S.fs.exists(r));
      if (a.query && S.system.isWin) {
        try {
          const r = await S.system.indexSearch({ query: a.query, scopes: roots, mode: a.mode, limit: a.limit });
          let items = (r.items || []).map((x) => ({ name: x.name, path: x.path, dir: path.dirname(x.path), isDir: !!x.isDir, size: x.isDir ? null : x.size, mtime: x.mtime, score: 1 }));
          items = items.filter((x) => { try { guard.safe(x.path); return true; } catch { return false; } });
          if (a.kind === 'file') items = items.filter((x) => !x.isDir); if (a.kind === 'folder') items = items.filter((x) => x.isDir);
          if (a.ext) { const e = a.ext.replace(/^\./, '').toLowerCase(); items = items.filter((x) => path.extname(x.path).toLowerCase().slice(1) === e); }
          if (items.length || a.mode === 'content') return { items, source: 'windows-index', truncated: false };
          source = 'walk'; note = 'El índice de Windows no devolvió resultados; se amplió con un recorrido de carpetas.';
        } catch (e) { note = 'Índice de Windows no disponible (' + e.message + '); se usó un recorrido de carpetas.'; }
      }
      if (a.mode === 'content') throw new AgentError(ERR.UNAVAILABLE, 'La búsqueda por contenido necesita el índice de Windows Search. ' + note);
      const r = S.fs.walkSearch({ query: a.query, folder: a.folder, ext: a.ext, kind: a.kind === 'any' ? undefined : a.kind, limit: a.limit });
      return { ...r, source, note };
    },
  });
  reg.register({
    name: 'fs.open', title: 'Abrir archivo', risk: 'low', aiRisk: 'confirm', description: 'Abre un archivo o carpeta con la aplicación predeterminada. No abre programas ni scripts.',
    schema: { path: P('Archivo o carpeta') }, summarize: (a) => `Abrir «${path.basename(a.path)}»`,
    consequences: (a) => [a.path, 'Se abrirá con la aplicación predeterminada de Windows'],
    async execute(c, a) {
      const p = c.services.guard.safe(a.path, { mustExist: true });
      if (RISKY.has(path.extname(p).toLowerCase())) throw new AgentError(ERR.POLICY_BLOCKED, 'Por seguridad Nova no abre programas ni scripts con esta función');
      const err = await c.services.shell.openPath(p); if (err) throw new AgentError(ERR.EXEC, err); return { path: p };
    },
  });
  reg.register({
    name: 'fs.reveal', title: 'Mostrar en el Explorador', risk: 'low', description: 'Muestra el elemento en el Explorador de Windows.',
    schema: { path: P('Elemento') }, summarize: (a) => `Mostrar «${path.basename(a.path)}» en el Explorador`,
    async execute(c, a) { const p = c.services.guard.safe(a.path, { mustExist: true }); c.services.shell.showItemInFolder(p); return { path: p }; },
  });
  reg.register({
    name: 'fs.mkdir', title: 'Crear carpeta', risk: 'confirm', description: 'Crea una carpeta nueva (la ruta completa de la carpeta nueva).',
    schema: { path: P('Ruta de la carpeta nueva') }, summarize: (a) => `Crear la carpeta «${path.basename(a.path)}» en «${path.basename(path.dirname(a.path))}»`,
    consequences: (a) => [a.path, 'No se modifica nada existente'],
    dryRun: async (c, a) => ({ planned: [{ create: a.path }] }),
    execute: async (c, a) => c.services.fs.mkdir(a.path),
    verify: async (c, a, r) => ({ ok: !!r && c.services.fs.exists(r.path), message: 'La carpeta no aparece en el disco' }),
  });
  const moveLike = (name, title, verb, key) => reg.register({
    name, title, risk: 'confirm', description: `${verb} uno o varios elementos a una carpeta de destino. Nunca sobrescribe: si el nombre ya existe, se cancela.`,
    schema: { paths: { type: 'array', items: { type: 'path' }, required: true, maxItems: 200 }, toDir: P('Carpeta de destino') },
    summarize: (a) => `${verb} ${plural(a.paths.length, 'elemento', 'elementos')} (${names(a.paths)}) a «${path.basename(a.toDir)}»`,
    consequences: (a) => [`Destino: ${a.toDir}`, key === 'move' ? 'Los elementos dejarán de estar en su carpeta original' : 'Los originales se conservan', 'Si ya existe un elemento con el mismo nombre, no se hace nada'],
    impact: (a) => ({ count: a.paths.length }),
    dryRun: async (c, a) => ({ planned: c.services.fs.plan(a.paths, a.toDir) }),
    async execute(c, a) { const pairs = c.services.fs[key](a.paths, a.toDir, c.signal); c.progress(100, plural(pairs.length, 'elemento', 'elementos')); return { done: pairs }; },
    verify: async (c, a, r) => { const ok = r.done.every((p) => c.services.fs.exists(p.to) && (key === 'copy' || !c.services.fs.exists(p.from))); return { ok, message: 'Algún elemento no quedó en su sitio' }; },
  });
  moveLike('fs.move', 'Mover archivos', 'Mover', 'move');
  moveLike('fs.copy', 'Copiar archivos', 'Copiar', 'copy');
  reg.register({
    name: 'fs.rename', title: 'Renombrar', risk: 'confirm', description: 'Cambia el nombre de un archivo o carpeta (en su misma carpeta).',
    schema: { path: P('Elemento'), newName: { type: 'string', required: true, max: 120 } }, summarize: (a) => `Renombrar «${path.basename(a.path)}» como «${a.newName}»`,
    consequences: (a) => [a.path, 'Otros programas que usen el nombre antiguo dejarán de encontrarlo'],
    dryRun: async (c, a) => ({ planned: [{ from: a.path, newName: a.newName }] }),
    execute: async (c, a) => c.services.fs.rename(a.path, a.newName),
    verify: async (c, a, r) => ({ ok: c.services.fs.exists(r.to) && (r.to.toLowerCase() === r.from.toLowerCase() || !c.services.fs.exists(r.from)), message: 'El cambio de nombre no se reflejó en el disco' }),
  });
  reg.register({
    name: 'fs.trash', title: 'Mover a la Papelera', risk: 'high', description: 'Envía elementos a la Papelera de reciclaje (se pueden recuperar). Exige confirmación fuerte.',
    schema: { paths: { type: 'array', items: { type: 'path' }, required: true, maxItems: 200 } },
    summarize: (a) => `Mover a la Papelera ${plural(a.paths.length, 'elemento', 'elementos')} (${names(a.paths)})`,
    consequences: (a) => [...a.paths.slice(0, 5), ...(a.paths.length > 5 ? [`…y ${a.paths.length - 5} más`] : []), 'Podrás recuperarlos desde la Papelera de reciclaje'],
    impact: (a) => ({ count: a.paths.length }),
    dryRun: async (c, a) => ({ planned: a.paths.map((p) => ({ trash: c.services.guard.safe(p, { mustExist: true }) })) }),
    async execute(c, a) { const done = await c.services.fs.trashItems(a.paths, c.signal); return { done }; },
    verify: async (c, a, r) => ({ ok: r.done.every((p) => !c.services.fs.exists(p)), message: 'Algún elemento sigue en su carpeta' }),
  });
}
module.exports = { register };
