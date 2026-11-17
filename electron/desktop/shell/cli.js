// Órdenes de línea de comandos de Nova (Jump List de la barra de tareas, accesos directos). Solo una lista cerrada.
'use strict';
const COMMANDS = ['talk', 'widgets', 'dock', 'assistant', 'calm', 'flow'];
function parseCommand(argv = []) {
  for (const a of argv) { const m = /^--nova=([a-z]+)$/.exec(String(a)); if (m && COMMANDS.includes(m[1])) return m[1]; }
  return null;
}
const quote = (s) => (/\s/.test(s) ? `"${s}"` : s);
/** Tareas de la lista de saltos. `appPath` solo se añade cuando Nova no está empaquetada (electron .). */
function jumpTasks({ execPath, appPath, isPackaged, icon }) {
  const base = isPackaged ? [] : [quote(appPath)];
  const t = (title, description, cmd) => ({ program: execPath, arguments: [...base, `--nova=${cmd}`].join(' '), title, description, iconPath: icon, iconIndex: 0 });
  return [t('Hablar con Nova', 'Abre Nova y empieza a escuchar', 'talk'), t('Mostrar widgets', 'Muestra u oculta el panel de widgets', 'widgets'), t('Mostrar dock', 'Muestra el dock de Nova', 'dock'), t('Abrir el asistente', 'Abre la ventana de Nova', 'assistant')];
}
module.exports = { parseCommand, jumpTasks, COMMANDS };
