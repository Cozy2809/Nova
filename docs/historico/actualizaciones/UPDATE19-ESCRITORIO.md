> **Archivo histórico:** esta receta corresponde a una actualización antigua, no a la instalación actual. Consulta la [guía principal](../../../README.md).

# Update 19 — Nova Desktop (Parte 1) + contrato de Nova Agent

**Qué es:** un escritorio dentro de Nova (botón `ESCRITORIO` en la cabecera) con dock, barra superior, inicio y búsqueda, explorador de archivos, widgets, centro multimedia, panel de sistema, actividad del agente y ajustes; y, por debajo, el contrato de herramientas con permisos, confirmación, cancelación y auditoría que usará la Parte 2.
**No toca:** el asistente, el chat, la voz, la memoria (`jarvis.db`), los proveedores de IA, el servidor móvil ni las métricas. El HUD sigue montado (oculto) mientras usas el escritorio.

## 1. Copia de seguridad (antes de instalar)

```powershell
cd .
robocopy . ..\Nova-backup-nova18 /E /XD node_modules .git dist /XF *.zip /NFL /NDL /NJH /NJS
# Memoria de Nova (la base de datos vive en AppData, no en el proyecto):
Copy-Item "$env:APPDATA\jarvis-clone\jarvis.db" "$env:USERPROFILE\Desktop\jarvis.db.backup-nova18" -ErrorAction SilentlyContinue
```
(Si tu base de datos está en otra carpeta de `%APPDATA%`, busca `jarvis.db`; la update no la modifica.)

## 2. Instalación

El ZIP **no contiene ningún archivo que ya exista**: se descomprime encima sin sobrescribir nada. Los 5 cambios en archivos existentes los hace el script (con copia `.bak-nova19`).

```powershell
cd .
Expand-Archive -Path "$env:USERPROFILE\Downloads\nova-update19-desktop.zip" -DestinationPath . 
python tools\instalar_nova19.py
```
El script aplica los parches, ejecuta `node --test` y `npm run build`. Opciones: `--sin-pruebas`, `--sin-build`. Es repetible (la segunda vez dice «YA ESTABA»).
**No hay dependencias nuevas** (no se toca `package.json` salvo el script `npm test`).

Parches (únicos cambios en archivos existentes):
- `electron/main.js`: 2 líneas (arrancar `./desktop` y pasarle las métricas).
- `electron/preload.js`: bloque `agent: {…}` (API mínima, sin Node).
- `electron/pcControl.js`: exporta `_roots` (la lista de carpetas permitidas).
- `src/App.jsx`: botón ESCRITORIO, vista y `startInDesktop`.
- `package.json`: script `test`.

## 3. Verificación (en tu Windows)

1. `npm run electron` (o tu acceso directo) → pulsa **ESCRITORIO**.
2. El chat anterior sigue ahí al volver con el icono de Nova del dock; `Ctrl+M` y la voz siguen funcionando.
3. Barra superior: CPU y RAM con valores reales. Archivos: abre Documentos, busca algo, crea una carpeta (te pide permiso), envía un archivo de prueba a la Papelera (permiso reforzado).
4. Cambia el tema y la posición del dock, cierra Nova del todo y ábrela: deben mantenerse.
5. **Comprobaciones que solo se pueden hacer en Windows** (no pude ejecutarlas al preparar la update). Pega la salida si algo falla:
```powershell
cd .
$ps = "powershell -NoProfile -ExecutionPolicy Bypass -File"
iex "$ps electron\desktop\ps\volume.ps1 -Action get"
iex "$ps electron\desktop\ps\media.ps1 -Action status"      # con música sonando
iex "$ps electron\desktop\ps\windows.ps1 -Action list"
iex "$ps electron\desktop\ps\search.ps1 -Query redes -Scopes `"$env:USERPROFILE\Documents`" -Mode name -Limit 5"
```
Cada una debe imprimir una línea JSON. Si el índice de Windows Search no responde, Nova usa el recorrido de carpetas y lo indica en pantalla.
6. Mira el consumo de CPU de Nova en el Administrador de tareas con el escritorio abierto (en la update 15 la CPU fue un problema); si sube, dímelo con la cifra.

## 4. Reversión

```powershell
cd .
python tools\instalar_nova19.py --revertir
npm run build
```
Restaura los 5 archivos desde `.bak-nova19` y borra los archivos nuevos (lista en [`tools/nova19_manifest.txt`](../../../tools/nova19_manifest.txt); el instalador y el manifiesto se quedan en `tools/`). Tu memoria y tus ajustes no se tocan. Si algo más fallara, la copia de la sección 1 es la red de seguridad.

## 5. Estado

**Terminado y verificado aquí** (Linux, sin red; 40 pruebas automáticas + interfaz real en Chromium con el motor real):
- Motor del agente: registro, validación estricta, permisos por riesgo, confirmación normal y reforzada (el proceso principal exige la casilla), cancelación, tiempo límite, verificación del resultado, dryRun, auditoría con redacción, origen IA/remoto más restrictivo, contenido no fiable.
- Archivos: listar, buscar por nombre/extensión, crear carpeta, copiar, mover, renombrar y Papelera, siempre dentro de carpetas personales, sin sobrescribir, con comprobación en disco.
- Interfaz: dock (fijados, carpetas, archivos, accesos marcados si el destino desaparece), barra superior, inicio y búsqueda global con teclado, explorador, ventanas con arrastrar/redimensionar/maximizar/ajustar a bordes/mosaico/cascada, ajustes, tema oscuro y claro, 4 fondos, acento fijo o ligado al estado de Nova, preferencias persistentes y restablecer, diálogos de confirmación, actividad y auditoría.
- Errores reales visibles: cuando algo no está disponible se muestra el motivo, no datos inventados.

**Parcial: escrito, pero sin poder probarse aquí (necesita tu Windows):**
- Búsqueda con el índice de Windows Search y por contenido (`ps/search.ps1`).
- Ventanas abiertas y traerlas al frente, iconos del dock (`ps/windows.ps1`, `desktop:icon`).
- Multimedia: título, artista, progreso y controles de la sesión (`ps/media.ps1`).
- Volumen real y silencio (`ps/volume.ps1`).
- Aplicaciones de Inicio, documentos recientes, procesos que más consumen.
- Arranque real en Electron (el portal del escritorio, el preload y los parches) y consumo de CPU.
- Temperatura: solo existe la de GPU NVIDIA; el resto sale como «N/D».

**Pendiente (no está hecho):**
- Parte 2: planificar órdenes, escribir documentos desde una orden, teclado/ratón, apps externas, migrar `pcControl`, `tool:run` y `app:launch` al registro único (ver `docs/NOVA_AGENT_INTEGRATION.md`, sección 7).
- Barra para hablar con Nova desde el escritorio (hoy: el icono Nova del dock vuelve al asistente).
- Fondos con imagen propia, arrastrar y soltar archivos, volumen por aplicación, pausar sondeos con otra app a pantalla completa.
- App Android (solo preparación: `docs/NOVA_ANDROID.md`).
- Los vídeos de TikTok no pude verlos.

## 6. Documentos
- [`docs/NOVA_AUDITORIA_Y_PLAN.md`](../../NOVA_AUDITORIA_Y_PLAN.md) — auditoría del proyecto real, decisiones y riesgos.
- [`docs/NOVA_AGENT_INTEGRATION.md`](../../NOVA_AGENT_INTEGRATION.md) — **punto de partida para ChatGPT (Parte 2).**
- [`docs/NOVA_ANDROID.md`](../../NOVA_ANDROID.md) — preparación para el S25 Ultra.
- [`docs/NOVA19_INVENTARIO.md`](../../NOVA19_INVENTARIO.md) — archivos añadidos y modificados.

## 7. Cosas de tu proyecto que conviene saber
- `contacts.json` contiene destinos locales de WhatsApp; mantenlo fuera del repositorio.
- `NTFY_TOPIC` en `.env.example` está vacío. Configura un tema propio en `.env` solo si activas avisos móviles.
- `@qwen-code/sdk` está en `package.json` pero no se usa en ningún archivo.
