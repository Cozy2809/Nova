# Nova Update 22 — widgets funcionales

Esta actualización va sobre Nova Update 21. Mantiene el escritorio de Nova y mejora el panel de widgets de Windows.

## Cambios

- Corrige `Origen no permitido`: el IPC del agente reconoce el renderer local del panel, pero sigue rechazando renderers ajenos. Por eso red, multimedia, accesos rápidos y otras herramientas vuelven a responder en el panel.
- El calendario permite cambiar de mes, seleccionar días y volver a Hoy.
- Añade al panel Actividad de Nova, Notas y Accesos rápidos (los dos últimos aparecen si están activados en Ajustes del escritorio; Accesos rápidos usa fijados de aplicaciones/archivos).
- Hace las tarjetas más transparentes, con desenfoque y colores adecuados al tema.
- Reutiliza la misma preferencia y servicios de Nova; no crea otra base de datos ni añade dependencias.

## Instalar

Cierra Nova. Descarga el ZIP en Descargas, abre PowerShell y ejecuta una línea cada vez:

```powershell
$project = (Get-Location).Path
$zip = "$env:USERPROFILE\Downloads\nova-update22-widgets.zip"
$backup = "$project-backup-nova22-$(Get-Date -Format yyyyMMdd-HHmmss)"
```

```powershell
Set-Location -LiteralPath $project
```

```powershell
$files = @('electron\agent\ipc.js','electron\desktop\index.js','src\desktop\widgets\Widgets.jsx','src\desktop\WindowsWidgets.jsx','src\desktop\desktop.css','docs\NOVA_AGENT_INTEGRATION.md','test\ipc.test.js'); New-Item -ItemType Directory -Path $backup | Out-Null; foreach ($file in $files) { $target = Join-Path $project $file; $dest = Join-Path $backup $file; New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null; Copy-Item -LiteralPath $target -Destination $dest }
```

```powershell
Expand-Archive -LiteralPath $zip -DestinationPath $project -Force
```

```powershell
npm run build
```

No instales dependencias ni ejecutes migraciones.

## Probar

Abre Nova con tu acceso directo. Pulsa **WIDGETS WINDOWS**. Comprueba que desapareció el error rojo en Red y Música, que los botones multimedia controlan una reproducción compatible, que el calendario cambia de mes/selecciona días y que Notas/Actividad muestran información. Accesos rápidos aparece si activas su widget en Ajustes del escritorio y fijas aplicaciones/archivos.

## Revertir

Sustituye la ruta de `$backup` por la carpeta de respaldo creada durante la instalación:

```powershell
$project = (Get-Location).Path
$backup = 'Join-Path $project 'backup''
$files = @('electron\agent\ipc.js','electron\desktop\index.js','src\desktop\widgets\Widgets.jsx','src\desktop\WindowsWidgets.jsx','src\desktop\desktop.css','docs\NOVA_AGENT_INTEGRATION.md','test\ipc.test.js'); foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $backup $file) -Destination (Join-Path $project $file) -Force }
Set-Location -LiteralPath $project
npm run build
```

La reversión repone esos archivos; no elimina datos personales ni la base.

## Inventario

**Modificados (7):** `electron/agent/ipc.js`, `electron/desktop/index.js`, `src/desktop/widgets/Widgets.jsx`, `src/desktop/WindowsWidgets.jsx`, `src/desktop/desktop.css`, `docs/NOVA_AGENT_INTEGRATION.md`, `test/ipc.test.js`.

**Añadidos:** ninguno. **Eliminados:** ninguno. **Dependencias nuevas:** ninguna.

## Estado de verificación

41 pruebas automáticas pasan; `node --check` pasa para los módulos principales de Electron. El build Vite y el funcionamiento gráfico del panel deben verificarse en el Windows de instalación. El panel es una ventana normal sin marco: otras aplicaciones pueden cubrirlo, aunque muestra sus widgets sobre el escritorio de Windows cuando queda visible.
