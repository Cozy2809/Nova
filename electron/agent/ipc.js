// IPC de Nova Agent: canales mínimos y validados. Acepta la ventana principal y los renderer propios autorizados.
// Canales: agent:tools, agent:start, agent:run, agent:ai, agent:cancel, agent:answer, agent:get, agent:list, agent:audit. Evento: agent:event.
'use strict';
const { describe } = require('./schema');
const { ORIGIN } = require('./contract');

const isStr = (v, n = 200) => typeof v === 'string' && v.length > 0 && v.length <= n;
const isId = (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v);

function registerAgentIpc({ ipcMain, getWin, agent, registry, audit, isTrustedSender }) {
  const fromMain = (e) => {
    if (isTrustedSender) return isTrustedSender(e.sender) === true;
    const w = getWin(); return !!w && !w.isDestroyed() && e.sender === w.webContents;
  };
  const guard = (fn) => async (e, d) => { if (!fromMain(e)) return { error: 'Origen no permitido' }; try { return await fn(d || {}); } catch (err) { return { error: err.message || String(err) }; } };
  // La interfaz solo puede pedir acciones con origen "ui": el origen "ai"/"remote" lo fija el proceso principal, nunca el renderer.
  const req = (d) => ({ tool: String(d.tool), args: d.args && typeof d.args === 'object' ? d.args : {}, origin: ORIGIN.UI, untrusted: false, dryRun: d.dryRun === true });

  ipcMain.handle('agent:tools', guard(() => ({ tools: registry.list().map((t) => ({ name: t.name, title: t.title, description: t.description || '', risk: t.risk, aiRisk: t.aiRisk || null, schema: describe(t.schema) })) })));
  ipcMain.handle('agent:start', guard((d) => { if (!isStr(d.tool, 60)) return { error: 'Herramienta no válida' }; const { action } = agent.submit(req(d)); return { id: action.id, action: agent.get(action.id) }; }));
  ipcMain.handle('agent:run', guard(async (d) => { if (!isStr(d.tool, 60)) return { error: 'Herramienta no válida' }; return { action: await agent.run(req(d)) }; }));
  // Adaptador mínimo de la Parte 2: el flujo de IA pide herramientas con origen "ai" (más restrictivo que "ui": nunca menos).
  // `untrusted:true` marca que la orden nace de contenido externo (web, archivo, correo): desactiva permisos de sesión y ejecución automática.
  ipcMain.handle('agent:ai', guard(async (d) => {
    if (!isStr(d.tool, 60)) return { error: 'Herramienta no válida' };
    const { action, done } = agent.submit({ tool: String(d.tool), args: d.args && typeof d.args === 'object' ? d.args : {}, origin: ORIGIN.AI, untrusted: d.untrusted === true, dryRun: d.dryRun === true });
    return d.wait === false ? { id: action.id } : { action: await done };
  }));
  ipcMain.handle('agent:cancel', guard((d) => (isId(d.id) ? agent.cancel(d.id) : { error: 'Identificador no válido' })));
  ipcMain.handle('agent:answer', guard((d) => (isId(d.id) ? agent.answer(d.id, { allow: d.allow === true, ack: d.ack === true, session: d.session === true }) : { error: 'Identificador no válido' })));
  ipcMain.handle('agent:get', guard((d) => ({ action: isId(d.id) ? agent.get(d.id) : null })));
  ipcMain.handle('agent:list', guard((d) => ({ actions: agent.list(Math.min(100, parseInt(d.limit, 10) || 30)) })));
  ipcMain.handle('agent:audit', guard((d) => ({ entries: audit.tail(Math.min(200, parseInt(d.limit, 10) || 50)).reverse() })));
}
module.exports = { registerAgentIpc };
