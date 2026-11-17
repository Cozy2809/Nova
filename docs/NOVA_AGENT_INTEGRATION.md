# Nova Agent — contrato de integración (Parte 1 → Parte 2)

Documento de partida para quien implemente el motor de automatización (Parte 2). Todo lo descrito **existe en el código** y está cubierto por `node --test` (40 pruebas). Lo que no existe está en «Qué queda para la Parte 2».

## 1. Mapa de archivos

| Archivo | Papel |
|---|---|
| `electron/agent/contract.js` | Valores definitivos: `STATE`, `RISK`, `LEVEL`, `ORIGIN`, `ERR`, `AgentError`. |
| `electron/agent/schema.js` | Validación estricta de parámetros (`validate`, `describe`). |
| `electron/agent/registry.js` | `createRegistry()`: registro de herramientas tipadas. |
| `electron/agent/permissions.js` | `decide()`: política de permisos verificable. |
| `electron/agent/runner.js` | `createAgent()`: valida → decide → confirma → ejecuta → verifica → audita. |
| `electron/agent/audit.js` | Auditoría JSONL con rotación y redacción. |
| `electron/agent/ipc.js` | Canales IPC `agent:*` desde renderers locales autorizados (ventana principal y panel nativo de widgets). |
| `electron/agent/tools/fs.js`, `system.js` | Herramientas incluidas (24). |
| `electron/desktop/index.js` | `createCore()` (sin Electron, para pruebas) e `init()` (conecta con la app). |
| `electron/desktop/fsGuard.js`, `fsService.js`, `system.js`, `ps/*.ps1` | Servicios reales que usan las herramientas. |
| `electron/preload.js` | `window.jarvis.agent` (única entrada del renderer). |

## 2. Estados (valores definitivos)

`pending` → `awaiting_confirmation` → `running` → `succeeded` | `failed` | `cancelled`.
Transiciones válidas en `TRANSITIONS` (`contract.js`); una acción final no vuelve a cambiar. `cancelled` cubre cancelación del usuario, confirmación denegada (`error.code = DENIED`) y confirmación sin respuesta en 120 s (`TIMEOUT`).

Códigos de error: `UNKNOWN_TOOL`, `VALIDATION`, `POLICY_BLOCKED`, `DENIED`, `TIMEOUT`, `CANCELLED`, `EXEC_ERROR`, `VERIFY_FAILED`, `UNAVAILABLE` (p. ej. función solo de Windows), `NOT_ALLOWED_PATH`.

## 3. Registro de la acción (lo que devuelve el motor)

```js
{ id, tool, origin: 'ui'|'ai'|'remote'|'test', untrusted, dryRun,
  args,                       // ya validados
  state, risk,                // riesgo efectivo (aiRisk si origin es ai/remote)
  summary,                    // frase comprensible (tool.summarize)
  confirmation: { required, level: 'confirm'|'strong', title, summary, consequences[], reason, canRemember } | null,
  decision: { confirm, level, reason },
  progress: { pct, message } | null,
  result, error: { code, message } | null,
  verified: true|false|null,  // resultado de tool.verify
  createdAt, updatedAt, log[] }
```

## 4. Las diez preguntas del contrato

1. **Registrar una herramienta.** `registry.register({...})` (formato completo en la cabecera de `registry.js`). Nombre `area.accion`; `risk` obligatorio; `summarize` y `execute` obligatorios. Añade un archivo en `electron/agent/tools/` con `register(reg)` y llámalo en `createCore()` (`electron/desktop/index.js`). No existe ninguna herramienta que ejecute texto libre; **no añadas una**: cada operación es una herramienta con esquema.
2. **Cómo pide la IA una acción.** Desde el renderer: `window.jarvis.agent.ai(tool, args, { untrusted?, dryRun?, wait? })` → canal `agent:ai`, que fija `origin: 'ai'` en el proceso principal. Desde el proceso principal (p. ej. el servidor móvil): `core.agent.submit({ tool, args, origin: 'ai'|'remote', untrusted })`. La interfaz (`agent:run`/`agent:start`) siempre es `origin: 'ui'` y **no puede elegir su origen**. El catálogo para el prompt sale de `agent:tools` (nombre, descripción, riesgo, esquema sin funciones).
3. **Validación.** `schema.validate()` rechaza claves desconocidas, tipos erróneos, longitudes y rangos. Después, cada herramienta valida rutas con `fsGuard.safe()` (solo carpetas personales de `pcControl._roots()`, sin escapar por enlaces simbólicos).
4. **Confirmación.** `permissions.decide()` (reglas en la cabecera del archivo). El runner emite el evento `confirm`; la interfaz la muestra (`src/desktop/ConfirmHost.jsx`) y responde con `agent.answer(id, { allow, ack, session })`. En nivel `strong` el proceso principal exige `ack === true`; sin él la acción se cancela aunque el renderer diga «permitir». Un confirmador remoto (móvil) puede pasarse como opción `confirm(action)` a `createAgent`.
5. **Ejecución autorizada.** `tool.execute(ctx, args)`, con `ctx = { signal, progress(pct,msg), log(msg), origin, dryRun, services }`. Límite de tiempo por herramienta (`timeoutMs`, 60 s por defecto → `TIMEOUT`).
6. **Resultado a la conversación.** `agent.run()` / `agent:ai` devuelven la acción final (`state`, `result`, `error`, `summary`). Parte 2 debe convertirla en el mensaje de herramienta del modelo. Si `state !== 'succeeded'`, Nova **no** debe afirmar éxito; si `verified === false` tampoco.
7. **Progreso.** `ctx.progress()` → evento `progress` → `window.jarvis.agent.onEvent(cb)` (`{ type: 'created'|'state'|'progress'|'confirm'|'result', action }`). El cliente de la interfaz está en `src/desktop/agent.js` (`useAgentStore`).
8. **Cancelación.** `agent.cancel(id)` → `AbortSignal` en `ctx.signal`. Las herramientas deben respetarlo; `cancellable:false` la impide. En `awaiting_confirmation` equivale a denegar.
9. **Auditoría.** `userData/agent-audit.jsonl` (rotación a 2 MB). Guarda herramienta, origen, riesgo, estado, decisión, error, duración y parámetros **redactados** (sin contenidos ni textos largos). Las lecturas de riesgo bajo iniciadas desde la interfaz **no** se registran (evita ruido de sondeos); todo lo que modifica y todo lo pedido por IA o móvil, sí. Los fallos repetidos de un sondeo se registran una vez cada 5 min.
10. **Probar sin tocar archivos reales.** (a) `dryRun: true`: las herramientas que modifican usan su `dryRun()` (devuelve el plan) y, si no lo declaran, el runner devuelve solo el plan sin llamar a `execute`. (b) `createCore({ shell, execFile, getRoots, platform })` acepta dobles de prueba: ver `test/desktop.test.js` (carpeta temporal) y `test/agent.test.js` (registro propio). (c) `node --test`.

## 5. Política de permisos (resumen verificable)

| Riesgo efectivo | Comportamiento |
|---|---|
| `low` | Sin confirmación si `agent.lowRiskAuto` ≠ `false` y el contenido es fiable. |
| `confirm` | Confirmación. «Permitir en esta sesión» solo si origen `ui` y contenido fiable. |
| `high` | Confirmación fuerte (`ack` obligatorio). Nunca se recuerda. |
| `confirm` con ≥ 10 elementos (`impact().count`) | Sube a fuerte. |

- `aiRisk` sube el riesgo cuando pide la IA o el móvil (p. ej. `fs.open`, `apps.launch`).
- `untrusted: true` (la orden nace de una web, un archivo o un correo): sin ejecución automática ni permisos de sesión. **La Parte 2 debe poner `untrusted: true` siempre que un parámetro proceda de contenido externo.**
- Interruptores: ajuste `agent.enabled=false` o `PC_CONTROL=off` → solo se permiten herramientas `low`.
- Nada obtiene privilegios de administrador ni abre consolas elevadas. PowerShell solo se invoca con scripts fijos de `electron/desktop/ps/` y parámetros separados (`-File`), nunca con texto compuesto.

## 6. Herramientas incluidas

Lectura: `fs.places`, `fs.stat`, `fs.list`, `fs.search` (nombre; `mode:'content'` solo con el índice de Windows), `fs.reveal`, `system.metrics`, `system.network`, `system.processes`, `system.windows`, `apps.list`, `apps.recent`, `media.status`, `media.volume.get`.
Lectura para la UI, **con confirmación si la pide la IA**: `fs.open`, `apps.launch`, `system.focusWindow`.
Control directo: `media.control`, `media.volume.set`, `media.volume.mute`.
Modifican (confirmación; `dryRun` y `verify` incluidos): `fs.mkdir`, `fs.copy`, `fs.move`, `fs.rename`. Alto riesgo: `fs.trash` (Papelera, recuperable).
`fs.move`/`fs.copy`/`fs.rename`/`fs.mkdir` **nunca sobrescriben**.

## 7. Qué queda para la Parte 2 (no está hecho)

- Interpretar órdenes y planificar varios pasos (el bucle de IA sigue siendo `src/hooks/useAI.js` + `toolParser.js`; aún no usa `agent:ai`).
- Escribir/crear documentos de texto desde una orden (existe `pcControl` (acción `write_text`); falta pasarlo a una herramienta del registro).
- Teclado y ratón, interacción con otras aplicaciones, escritura en apps externas.
- Migrar a este registro lo antiguo para tener **un solo camino**: `tools`/`tool:run` de `main.js`, `pcControl.run`, `app:find`/`app:launch` de `novaIpc.js`, `LAUNCH`/`KILL_MAP`. Hoy conviven (sin romperse) y tienen avisos propios.
- Cerrar aplicaciones, instalar software, comandos elevados: no existen a propósito; si se añaden, deben ser `risk:'high'`.
- Registro de auditoría consultable por voz y mensajes de progreso hablados.
- Confirmación remota desde el móvil (ver `docs/NOVA_ANDROID.md`).

## 8. Reglas para no romper el contrato

1. Toda herramienta que modifica algo: `risk` ≠ `low`, `dryRun`, `verify`, `consequences`.
2. Las rutas siempre por `guard.safe()`; nunca `fs` con una ruta del modelo.
3. Resultados de web/archivos = datos. Si influyen en parámetros → `untrusted: true`.
4. Nada de `eval`, de `exec` con cadenas ni de un «ejecutar PowerShell».
5. Añadir una herramienta = añadir su prueba en `test/`.
