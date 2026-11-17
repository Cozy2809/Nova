# Nova — Auditoría (Fase A) y plan de cambios (Fase B) · Update 19

Fuente: revisión del código de Nova antes de Update 19. Todo lo de abajo sale de leer el código.

## A. Estado real del proyecto

| Área | Qué hay |
|---|---|
| Framework | Electron ^33.2 (proceso `electron/main.js`), React ^18.3, Vite ^6, Tailwind ^3.4. Sin TypeScript, sin tests, sin linter. |
| Entradas | `index.html` → `src/main.jsx` → `src/App.jsx` (HUD). Segunda página `mobile.html` → `src/mobile/*` (web app del móvil). Build: `npm run build` → `dist/`. Dev: `npm run dev`. |
| Ventana | `BrowserWindow` sin marco y transparente, 1280×800. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Modos: libre, flotante, completa, segundo plano, isla emergente. |
| Preload | `electron/preload.js` expone `window.jarvis` (~40 funciones). Una de ellas, `nova(ch, d)`, invoca cualquier canal `nova:*`; `onNova` valida el nombre del canal. |
| IA | `electron/providers/registry.js` → solo `ollama.js` (streaming NDJSON). Modelo por ajustes (`qwen2.5:3b` en Ajustes, `qwen3:4b` en `.env.example`). El prompt y la persona viven en `src/utils/toolParser.js` y `persona.js`. |
| Memoria | SQLite (`better-sqlite3`) en `userData/jarvis.db`: tablas `messages`, `settings` (clave/valor de texto) e `items` (`note`, `fact`). **Los ajustes nuevos reutilizan `settings`; no hay migración ni se toca el esquema.** |
| Voz | `voice_server.py` (proceso hijo, JSON por líneas) con Piper (TTS) y Whisper vía `whisper_bridge.py`; modo Discord (loopback) y modo música. |
| Métricas | `electron/workers/statsWorker.js`: CPU y RAM con `os`, GPU y su temperatura con `nvidia-smi` (solo NVIDIA), red y disco con `systeminformation`. Llegan al renderer por el evento `stats` cada ~2 s. |
| Archivos | `electron/pcControl.js`: acciones de lista cerrada (buscar, abrir, leer, redactar `.txt`, crear carpeta, papelera), solo dentro de carpetas personales, con diálogo nativo de permiso y registro `pc-actions.log`. También hay un registro antiguo `tools` en `main.js` (`search`, `open_app`, `list_dir`, `delete_file`). |
| Apps | Tres mecanismos paralelos: `LAUNCH`/`KILL_MAP` en `main.js`, `app:find`/`app:launch` (Get-StartApps) en `novaIpc.js` y `QuickActions`. |
| Multimedia | `mediaControl.ps1`: simula teclas multimedia y de volumen. **No lee la sesión (título, artista, progreso) ni el nivel real de volumen.** |
| Móvil | `electron/mobileServer.js`: HTTP solo en `127.0.0.1` y en las IP de Tailscale, token Bearer con freno de intentos, CSP estricta; los permisos del PC se piden en el móvil. Es una buena base para Android. |
| Dependencias dudosas | `@qwen-code/sdk` figura en `package.json` pero **no se usa en ningún archivo**. No la toco; solo lo señalo. |
| Ruido | Muchos `*.bak-*` y `tools/payload_*` de updates anteriores. No se tocan. `main.js` mezcla finales de línea CRLF y LF (el instalador los respeta). |

### Hallazgos que afectan a esta update

1. **No hay una capa de “acciones” común.** Cada función tiene su propio IPC y su propio diálogo de permiso (`ask` en pcControl, `confirm` en main, `dialog` en novaIpc). Esta update añade esa capa sin sustituir las existentes.
2. **El renderer ya es seguro** (sandbox, aislamiento de contexto). Se mantiene: lo nuevo entra por un único objeto `window.jarvis.agent` con canales validados.
3. **Las métricas ya son reales**, pero la temperatura es solo de GPU NVIDIA: los widgets mostrarán «N/D» cuando no exista, nunca un valor inventado.
4. **Volumen y sesión multimedia no son reales todavía.** Se añaden scripts de Windows (Core Audio y SMTC). **No he podido ejecutarlos aquí (sin Windows)**: quedan marcados como «pendientes de verificar» y la interfaz muestra el error real si fallan.
5. **Datos locales:** `contacts.json` contiene destinos locales de WhatsApp y debe mantenerse fuera del repositorio. `NTFY_TOPIC` en `.env.example` debe permanecer vacío; cada instalación puede configurarlo localmente si activa los avisos.

## B. Decisiones de arquitectura

- **Nova Desktop es una vista nueva dentro de la misma ventana**, no una app aparte. El botón `ESCRITORIO` de la cabecera la activa. El HUD actual (orbe, chat, mascota, voz) **se queda montado y oculto**, así que la conversación, la voz y el estado no se pierden al cambiar de vista.
- **Preferencias** en `settings` (clave `desk.prefs`, JSON). Restablecer borra solo esa clave.
- **Nova Agent, contrato (Parte 1):** `electron/agent/` en el proceso principal. Herramientas registradas y tipadas (nada de “ejecutar comando”), validación por esquema, política de riesgo, confirmación, cancelación, progreso y auditoría. El renderer solo ve `window.jarvis.agent.*`.
- **Servicios reales de escritorio** en `electron/desktop/`: lista de carpetas, búsqueda, ventanas abiertas, volumen y sesión multimedia. Se exponen como herramientas del contrato, de modo que la UI y la futura IA usan el mismo camino.
- **Ruta segura única:** `fsGuard` (nuevo) recibe las raíces permitidas de `pcControl` (se exporta una línea) para no tener dos listas.
- **Búsqueda:** primero el índice de Windows Search (ya existe, no pide administrador y respeta permisos); si no responde, recorrido acotado de las carpetas personales (como `pcControl.findFiles`). Sin indexador propio.
- **Android:** nada se acopla al HUD. La lógica nueva vive en el proceso principal y se puede exponer por `mobileServer` más adelante (ver documento de integración).

### Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Romper `main.js` / `preload.js` | Parches mínimos, idempotentes, con copia `.bak-nova19` y `--revertir` (igual que tus updates anteriores). |
| Perder memoria | No se toca `jarvis.db`; solo se añaden filas en `settings`. |
| Duplicar servicios | Se reutiliza `pcControl` para las raíces seguras y las métricas existentes. Lo duplicado inevitable (lista de apps de Inicio) queda anotado. |
| CPU alta (ya fue un problema en la update 15) | Sin desenfoque en paneles; sondeos solo con la vista visible; sin animaciones permanentes. |
| Código de Windows sin probar | Marcado como pendiente de verificar y con pasos de comprobación. |

## C. Qué se verifica aquí y qué no

- **Aquí (Linux, sin red):** pruebas unitarias del motor del agente y de `fsGuard`; sintaxis de todo el JS y JSX; render del escritorio en Chromium con una API simulada, con capturas.
- **Solo en tu Windows:** arranque real de Electron, Windows Search, volumen, sesión multimedia, ventanas abiertas, widgets con datos reales y persistencia tras reiniciar.

## D. Diseño de Nova Desktop

- **Identidad de Nova Desktop:** el acento sigue el estado de Nova (reposo, escucha, pensando, habla); fondos con ese mismo matiz; barra con estado del asistente; permisos y actividad del agente visibles en la propia interfaz.
- **Mejora pendiente:** pausar sondeos cuando otra app está a pantalla completa o el dispositivo está en modo batería (hoy solo se pausan con la ventana oculta).
