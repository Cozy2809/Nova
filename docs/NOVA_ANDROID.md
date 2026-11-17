# Nova en Android (Galaxy S25 Ultra) — preparación de la arquitectura

No hay app Android en esta update. Esto documenta cómo se evita que el diseño actual la impida.

## Qué se ha hecho
- **La lógica nueva no vive en el HUD ni en el renderer.** El agente (`electron/agent/*`) y los servicios (`electron/desktop/*`) funcionan en el proceso principal y se prueban sin Electron: se pueden exponer a otro cliente sin tocar la interfaz de escritorio.
- **El renderer solo ve `window.jarvis.agent`.** Un cliente móvil usaría el mismo contrato (`tools`, `run`, `answer`, `cancel`, eventos).
- **Confirmación desacoplada:** `createAgent({ confirm })` admite un confirmador remoto; así el móvil puede aprobar o denegar.
- **El origen es parte del contrato:** `origin: 'remote'` sube el riesgo (como `ai`) y no hereda permisos de sesión.

## Qué se puede compartir con Android
Contrato de herramientas (JSON: nombre, descripción, riesgo, esquema), estados y códigos de error, política de permisos, formato de auditoría, `persona.js` y el formato de prompts (`toolParser.js`) y el esquema SQLite (`messages`, `settings`, `items`).

## Qué necesita implementación propia en Android
Voz (Piper/Whisper → servicios del sistema o modelos en el móvil), IA (Ollama en el PC por red, o un modelo local), notificaciones, apertura de apps (Intents), archivos (almacenamiento con alcance), multimedia (MediaSession) y volumen (AudioManager). Las herramientas de Windows (`ps/*.ps1`) no se portan: en Android serían herramientas con el mismo nombre y esquema pero otra implementación.

## Comunicación entre dispositivos (ya existente y recomendada)
- `electron/mobileServer.js`: HTTP solo en `127.0.0.1` y en las IP de **Tailscale** (red privada cifrada), token Bearer con freno de intentos y CSP estricta. **No se abre ningún puerto a Internet.** Esta update no toca ese servidor.
- Para acciones remotas del PC desde el móvil: añadir un endpoint que llame a `core.agent.submit({ origin: 'remote' })` y reutilice el patrón de «permiso en el móvil» que ya usa `pcControl.runRemote` (la confirmación llega al móvil, no a una ventana del PC desatendido).
- Recomendación: acciones `high` nunca desde remoto salvo confirmación reforzada en el propio móvil.

## Memoria
- No se sincroniza nada. La memoria del móvil puede ser independiente (opción por defecto) o compartida de forma **opcional y explícita** (el usuario elige qué se comparte).
- Nova Desktop guarda sus preferencias en `settings` (`desk.prefs`); no es memoria personal y no hace falta sincronizarla.
