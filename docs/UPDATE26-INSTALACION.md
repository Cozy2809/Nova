# Nova Update26 — configuración guiada y controles de escritorio

## Resumen
Update26 añade una configuración inicial reutilizable con cuatro perfiles (Lite, Nova, Premium y analizar PC), personalización, voz, escritorio, biblioteca y ntfy; después muestra un tutorial que se puede omitir. Ajustes permite volver a abrir el asistente y restaurar valores predeterminados. Se conservan el TXT de personalidad y la configuración ntfy al restablecer.

En Nova Desktop, las tarjetas de widgets reciben posiciones predeterminadas separadas. Una migración de preferencias en memoria solo recoloca posiciones antiguas que coincidan exactamente con valores de fábrica; posiciones movidas por la persona se conservan. Los menús de distribución explican cuando no hay ventanas que ordenar y Widgets Windows comunica errores de apertura.

La personalidad se guarda en `%APPDATA%\jarvis-clone\nova-personalizacion.txt` (se abre desde Ajustes) y se aplica al prompt con un límite de 4.000 caracteres. El proyecto público deja vacío el tema ntfy genérico y desactiva avisos automáticos inicialmente; cada persona puede generar un nombre único. Los temas de ntfy.sh siguen siendo públicos.

## Inventario del ZIP
- Añadidos: `src/components/InitialSetup.jsx`, `docs/UPDATE26-INSTALACION.md` y `docs/CONTRATO-NOVA-AGENT.md`.
- Modificados: `.gitignore`, `.env.example`, `postcss.config.js`, `electron/main.js`, `electron/novaIpc.js`, `electron/notify.js`, `src/App.jsx`, `src/components/Settings.jsx`, `src/desktop/TopBar.jsx`, `src/desktop/DesktopShell.jsx`, `src/desktop/prefs.js`, `src/desktop/apps/DeskSettings.jsx`, `src/styles/hud.css`, `src/utils/persona.js`, `src/desktop/WindowsWidgets.jsx`.
- Eliminados: ninguno.
- Dependencias nuevas: ninguna.
- Migración SQL: ninguna. Se conservan base de datos, conversaciones, memoria y archivos.

## Instalación PowerShell
Cierra Nova. Descarga el ZIP a Descargas, copia las líneas una por una y comprueba que `$project` apunta a tu instalación.

```powershell
$project = (Get-Location).Path
$zip = "$env:USERPROFILE\Downloads\nova-update26.zip"
$files = @('.gitignore','.env.example','postcss.config.js','electron\main.js','electron\novaIpc.js','electron\notify.js','src\App.jsx','src\components\InitialSetup.jsx','src\components\Settings.jsx','src\desktop\TopBar.jsx','src\desktop\DesktopShell.jsx','src\desktop\prefs.js','src\desktop\apps\DeskSettings.jsx','src\desktop\WindowsWidgets.jsx','src\styles\hud.css','src\utils\persona.js')
Set-Location $project
$backup = Join-Path $project ("backup-update26-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
foreach ($file in $files) { $from = Join-Path $project $file; $to = Join-Path $backup $file; New-Item -ItemType Directory -Force -Path (Split-Path $to) | Out-Null; if (Test-Path $from) { Copy-Item -LiteralPath $from -Destination $to -Force } }
Expand-Archive -LiteralPath $zip -DestinationPath $project -Force
npm run build
```

Si el build acaba correctamente, abre Nova con tu acceso directo. No se requiere migración de base de datos ni reinstalar paquetes.

## Verificación manual
1. Inicia Nova; rellena o conserva los valores precargados y comprueba que el tutorial aparece.
2. Prueba “Omitir tutorial” y “Configuración inicial” desde Ajustes.
3. Cambia los valores de personalidad, modelo y voz; envía un mensaje para ver que la personalidad se aplica.
4. Abre el TXT desde Ajustes, añade una preferencia y vuelve a enviar un mensaje.
5. En Nova Desktop, prueba la barra, dock, menú Ventanas, botón para widgets y Ajustes. Activa todas las tarjetas para verificar que no se tapan; usa “Recolocar widgets sin superponer”.
6. En la configuración de notificaciones, comprueba que no hay tema genérico y que la activación automática es optativa.
7. Desde Móvil, revisa enlace por Tailscale y HTTPS. No se habilita Tailscale Funnel ni se abren puertos del router.

## Pruebas ejecutadas
- `npm test -- --test-reporter=dot`: 41 pruebas aprobadas.
- `npm run build`: exitoso; Vite transformó 85 módulos y generó escritorio, móvil y widgets.
- `node --check`: main, novaIpc, notify y preload sin errores de sintaxis.
- No se ejecutó una ventana Electron real contra tu base de datos; los controles y enlaces externos requieren verificación en el equipo.

## Reversión
Restaura los archivos guardados en la carpeta `backup-update26-*` usando el mismo array `$files` de arriba:

```powershell
foreach ($file in $files) { $from = Join-Path $backup $file; $to = Join-Path $project $file; if (Test-Path $from) { New-Item -ItemType Directory -Force -Path (Split-Path $to) | Out-Null; Copy-Item -LiteralPath $from -Destination $to -Force } }
Set-Location $project
npm run build
```

La reversión afecta solo al código; no borres `jarvis.db`, archivos del usuario ni `.env`.

## Estado real
- Terminado y compilado: asistente de configuración, tutorial omitible, botón de valores predeterminados, TXT aplicado al prompt, perfiles y selector auto basado en CPU/RAM, tema ntfy no genérico, reordenamiento de widgets por defecto y feedback en controles.
- Parcial: el perfil automático es una heurística de RAM y procesadores lógicos; no mide GPU, velocidad real ni carga actual. La descarga del modelo requiere pulsar el botón; no baja varios GB silenciosamente.
- Pendiente de verificación física: controles del PC, ntfy y Tailscale/HTTPS, reproducción multimedia de cada fuente y clic-through en ventanas reales.
