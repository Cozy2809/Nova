// Registro de herramientas. Una herramienta es un objeto tipado; nunca hay una función universal de "ejecutar comando".
//
// {
//   name: 'fs.move',                       // único, formato área.acción
//   title: 'Mover archivos',                // para la interfaz
//   description: '…',                       // para la IA y la interfaz
//   risk: 'low' | 'confirm' | 'high',       // riesgo base
//   aiRisk?: 'confirm',                     // riesgo cuando la pide la IA o el móvil (opcional, solo puede subir)
//   schema: { campo: { type, required, … } },
//   summarize(args): string,                // frase comprensible: qué se va a hacer y sobre qué
//   consequences?(args): string[],          // consecuencias para el diálogo de confirmación
//   impact?(args): { count: number },       // nº de elementos afectados (≥10 sube a confirmación fuerte)
//   cancellable?: boolean,
//   timeoutMs?: number,
//   dryRun?(ctx, args): any,                // simulación SIN efectos; si falta, las herramientas no-low solo devuelven el plan
//   execute(ctx, args): Promise<any>,       // ctx = { signal, progress(pct,msg), log(msg), origin, services }
//   verify?(ctx, args, result): Promise<{ok:boolean, message?:string}|boolean>, // comprueba que el efecto es real
// }
'use strict';
const { RISK } = require('./contract');

const ORDER = { low: 0, confirm: 1, high: 2 };
const NAME = /^[a-z]+(\.[a-zA-Z]+)+$/;

function createRegistry() {
  const tools = new Map();
  return {
    register(t) {
      if (!t || !NAME.test(t.name || '')) throw new Error('Nombre de herramienta no válido: ' + (t && t.name));
      if (tools.has(t.name)) throw new Error('Herramienta duplicada: ' + t.name);
      if (!Object.values(RISK).includes(t.risk)) throw new Error(t.name + ': falta el riesgo (low|confirm|high)');
      if (t.aiRisk && ORDER[t.aiRisk] < ORDER[t.risk]) throw new Error(t.name + ': aiRisk no puede ser menor que risk');
      for (const f of ['title', 'summarize', 'execute']) if (typeof t[f] !== (f === 'title' ? 'string' : 'function')) throw new Error(`${t.name}: falta ${f}`);
      tools.set(t.name, Object.freeze({ schema: {}, ...t }));
      return this;
    },
    get: (name) => tools.get(name),
    has: (name) => tools.has(name),
    list: () => [...tools.values()],
    size: () => tools.size,
  };
}
module.exports = { createRegistry, ORDER };
