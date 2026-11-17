// Herramientas de sistema, multimedia y aplicaciones (reales; las de Windows devuelven el error real si fallan).
'use strict';
const { AgentError, ERR } = require('../contract');

function register(reg) {
  reg.register({ name: 'system.metrics', title: 'Métricas del sistema', risk: 'low', description: 'CPU, RAM, disco, GPU, red y temperatura de GPU. Lo que no existe devuelve null.', schema: {}, summarize: () => 'Consultar métricas del sistema', execute: async (c) => c.services.system.metrics() });
  reg.register({ name: 'system.network', title: 'Estado de red', risk: 'low', description: 'Interfaces de red activas y velocidad actual.', schema: {}, summarize: () => 'Consultar la red', execute: async (c) => c.services.system.network() });
  reg.register({ name: 'system.processes', title: 'Procesos que más consumen', risk: 'low', timeoutMs: 30000, description: 'Los procesos con más CPU y RAM (Windows).', schema: {}, summarize: () => 'Ver qué procesos consumen más', execute: async (c) => c.services.system.processes() });
  reg.register({ name: 'system.windows', title: 'Ventanas abiertas', risk: 'low', description: 'Aplicaciones con ventana abierta (Windows).', schema: {}, summarize: () => 'Listar ventanas abiertas', execute: async (c) => ({ windows: await c.services.system.windows() }) });
  reg.register({
    name: 'system.focusWindow', title: 'Traer ventana al frente', risk: 'low', aiRisk: 'confirm', description: 'Trae al frente la ventana de un proceso de la lista de ventanas abiertas.',
    schema: { pid: { type: 'integer', required: true, min: 1, max: 4194304 } }, summarize: (a) => `Traer al frente la ventana del proceso ${a.pid}`,
    async execute(c, a) {
      const w = (await c.services.system.windows()).find((x) => x.pid === a.pid);
      if (!w) throw new AgentError(ERR.VALIDATION, 'Ese proceso ya no tiene una ventana abierta');
      await c.services.system.focusWindow(a.pid); return { pid: a.pid, title: w.title };
    },
  });
  reg.register({ name: 'apps.list', title: 'Aplicaciones instaladas', risk: 'low', timeoutMs: 30000, description: 'Aplicaciones del menú Inicio de Windows.', schema: {}, summarize: () => 'Listar aplicaciones instaladas', execute: async (c) => ({ apps: await c.services.system.startApps() }) });
  reg.register({
    name: 'apps.launch', title: 'Abrir aplicación', risk: 'low', aiRisk: 'confirm', timeoutMs: 30000, description: 'Abre una aplicación de la lista de instaladas (por su appId).',
    schema: { appId: { type: 'string', required: true, max: 300 } }, summarize: (a) => `Abrir la aplicación ${a.appId.split('!').pop()}`,
    consequences: () => ['Se iniciará la aplicación en Windows'],
    execute: async (c, a) => c.services.system.launchApp(a.appId),
  });
  reg.register({ name: 'apps.recent', title: 'Documentos recientes', risk: 'low', description: 'Documentos abiertos hace poco que siguen existiendo y están en carpetas personales.', schema: { limit: { type: 'integer', min: 1, max: 50, default: 20 } }, summarize: () => 'Ver documentos recientes', execute: async (c, a) => ({ items: c.services.system.recents(a.limit) }) });

  reg.register({ name: 'media.status', title: 'Estado multimedia', risk: 'low', timeoutMs: 15000, description: 'Sesiones multimedia de Windows: título, artista, progreso y controles disponibles.', schema: {}, summarize: () => 'Consultar la reproducción', execute: async (c) => c.services.system.mediaStatus() });
  reg.register({
    name: 'media.control', title: 'Controlar reproducción', risk: 'low', timeoutMs: 15000, description: 'Reproducir, pausar, alternar, siguiente o anterior en la sesión multimedia actual. Falla con un error claro si no hay sesión o no lo permite.',
    schema: { action: { type: 'enum', values: ['play', 'pause', 'toggle', 'next', 'prev'], required: true }, session: { type: 'string', max: 300 } },
    summarize: (a) => ({ play: 'Reproducir', pause: 'Pausar', toggle: 'Reproducir o pausar', next: 'Pasar a la siguiente canción', prev: 'Volver a la canción anterior' }[a.action]),
    async execute(c, a) { const r = await c.services.system.mediaControl(a.action, a.session || ''); if (!r.ok) throw new AgentError(ERR.EXEC, 'La aplicación no aceptó la orden (puede que no admita esa función)'); return r; },
    verify: async (c, a, r) => r.ok === true,
  });
  reg.register({ name: 'media.volume.get', title: 'Leer volumen', risk: 'low', timeoutMs: 15000, description: 'Volumen real y silencio del dispositivo de salida.', schema: {}, summarize: () => 'Leer el volumen', execute: async (c) => c.services.system.volume.get() });
  reg.register({
    name: 'media.volume.set', title: 'Cambiar volumen', risk: 'low', timeoutMs: 15000, description: 'Fija el volumen real (0–100).',
    schema: { level: { type: 'integer', required: true, min: 0, max: 100 } }, summarize: (a) => `Poner el volumen al ${a.level} %`,
    execute: async (c, a) => c.services.system.volume.set(a.level),
    verify: async (c, a, r) => ({ ok: Math.abs(r.level - a.level) <= 1, message: `El volumen quedó en ${r.level} %` }),
  });
  reg.register({
    name: 'media.volume.mute', title: 'Silenciar', risk: 'low', timeoutMs: 15000, description: 'Silencia o reactiva el sonido.',
    schema: { muted: { type: 'boolean', required: true } }, summarize: (a) => (a.muted ? 'Silenciar el sonido' : 'Reactivar el sonido'),
    execute: async (c, a) => c.services.system.volume.mute(a.muted), verify: async (c, a, r) => ({ ok: r.muted === a.muted, message: 'El estado de silencio no cambió' }),
  });
}
module.exports = { register };
