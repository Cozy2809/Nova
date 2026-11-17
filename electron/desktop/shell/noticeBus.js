// Punto de entrada único para avisos desde cualquier módulo del proceso principal (notify.js, agente, shell).
// Si el shell todavía no está activo (o se ejecuta fuera de Electron) devuelve null y el llamador usa su vía clásica.
'use strict';
let handler = null;
module.exports = { setHandler: (f) => { handler = f; }, push: (p) => { try { return handler ? handler(p) : null; } catch { return null; } }, hasHandler: () => !!handler };
