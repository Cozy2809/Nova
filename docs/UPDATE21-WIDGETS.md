# Nova Update 21 — controles de música y widgets de Windows

Esta actualización es acumulativa sobre Nova19 e incluye también el chat de Nova dentro del escritorio de Nova20. El escritorio propio se conserva.

## Qué incorpora

- El widget fijo de Música muestra errores devueltos por Windows y detiene el arrastre del widget al pulsar controles.
- Añade **Widgets Windows**, una ventana sin marco ni botón de barra de tareas con reloj, hardware, red y música. Se abre desde el asistente o desde la barra superior del escritorio Nova.
- Lee las preferencias compartidas de widgets/tema; los controles multimedia usan el mismo registro de herramientas de Nova.
- Si ocultas la ventana principal de Nova mientras los widgets están visibles, los widgets siguen abiertos. Al cerrar los widgets con la ventana principal oculta, Nova termina.
- La ventana de widgets usa el orden normal de ventanas de Windows: otra aplicación puede cubrirla. No reemplaza Explorer ni inyecta código en el shell de Windows; el escritorio Nova sigue disponible como antes.
- No añade dependencias, no requiere migraciones y no toca memoria ni archivos personales.

## Instalación

Cierra Nova y ejecuta en PowerShell. La copia de seguridad queda fuera del proyecto. Ajusta `$project` si tu ruta es distinta.

```powershell
$project = (Get-Location).Path
$zip = "$env:USERPROFILE\Downloads\nova-update21-widgets.zip"
$backup = "$project-backup-nova21-$(Get-Date -Format yyyyMMdd-HHmmss)"
$files = @(
  'electron\main.js',
  'electron\preload.js',
  'electron\desktop\index.js',
  'vite.config.js',
  'src\App.jsx',
  'src\desktop\DesktopShell.jsx',
  'src\desktop\Dock.jsx',
  'src\desktop\TopBar.jsx',
  'src\desktop\windows.js',
  'src\desktop\desktop.css',
  'src\desktop\widgets\Widgets.jsx'
)
$newFiles = @('widgets.html','src\desktop\WindowsWidgets.jsx','src\desktop\widgets-entry.jsx','src\desktop\apps\AssistantChat.jsx')
New-Item -ItemType Directory -Path $backup | Out-Null
foreach ($file in $files) {
  $target = Join-Path $project $file
  $dest = Join-Path $backup $file
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item -LiteralPath $target -Destination $dest
}
$present = @()
foreach ($file in $newFiles) {
  $target = Join-Path $project $file
  if (Test-Path -LiteralPath $target) {
    $present += $file
    $dest = Join-Path $backup $file
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Copy-Item -LiteralPath $target -Destination $dest
  }
}
$present | Set-Content -LiteralPath (Join-Path $backup 'preexisting-newfiles.txt') -Encoding UTF8
Set-Location $project
Expand-Archive -LiteralPath $zip -DestinationPath $project -Force
npm run build
```

El ZIP tiene rutas `src\`, `electron\`, `docs\` y `widgets.html` relativas a la raíz del proyecto; no crea una carpeta adicional.

## Uso

1. Abre Nova y pulsa **WIDGETS WINDOWS**. También puedes usar ese control desde la barra superior del escritorio Nova.
2. Los widgets aparecen como una ventana compacta sobre el escritorio real de Windows. El botón `×` la oculta; puedes volver a abrirla desde Nova.
3. Si quieres que permanezca mientras ocultas Nova, usa **Segundo plano** en el menú de ventana. Las aplicaciones que pases al frente pueden cubrir el panel porque no es una ventana siempre encima.
4. Para el chat dentro del escritorio Nova, abre **ESCRITORIO** y pulsa **Hablar con Nova** en el dock. El micrófono tiene botón propio y atajo `Ctrl+M`.

## Reversión

Sustituye la ruta de `$backup` por la carpeta creada durante la instalación:

```powershell
$project = (Get-Location).Path
$backup = 'Join-Path $project 'backup''
$files = @(
  'electron\main.js','electron\preload.js','electron\desktop\index.js','vite.config.js',
  'src\App.jsx','src\desktop\DesktopShell.jsx','src\desktop\Dock.jsx','src\desktop\TopBar.jsx',
  'src\desktop\windows.js','src\desktop\desktop.css','src\desktop\widgets\Widgets.jsx'
)
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $backup $file) -Destination (Join-Path $project $file) -Force }
$newFiles = @('widgets.html','src\desktop\WindowsWidgets.jsx','src\desktop\widgets-entry.jsx','src\desktop\apps\AssistantChat.jsx')
$present = @(Get-Content -LiteralPath (Join-Path $backup 'preexisting-newfiles.txt') -ErrorAction SilentlyContinue)
foreach ($file in $newFiles) {
  $target = Join-Path $project $file
  if ($file -in $present) { Copy-Item -LiteralPath (Join-Path $backup $file) -Destination $target -Force }
  else { Remove-Item -LiteralPath $target -ErrorAction SilentlyContinue }
}
Set-Location $project
npm run build
```

La reversión no borra la base de datos ni las preferencias. Conserva el ZIP y la carpeta de respaldo.

## Inventario

**Añadidos (4):** `widgets.html`, `src/desktop/WindowsWidgets.jsx`, `src/desktop/widgets-entry.jsx`, `src/desktop/apps/AssistantChat.jsx`.

**Modificados (11):** `electron/main.js`, `electron/preload.js`, `electron/desktop/index.js`, `vite.config.js`, `src/App.jsx`, `src/desktop/DesktopShell.jsx`, `src/desktop/Dock.jsx`, `src/desktop/TopBar.jsx`, `src/desktop/windows.js`, `src/desktop/desktop.css`, `src/desktop/widgets/Widgets.jsx`.

**Eliminados:** ninguno. **Dependencias nuevas:** ninguna.

El build final debe ejecutarse en el proyecto del usuario. Las interacciones con la ventana de widgets y la capa de ventanas de Windows requieren una comprobación visual en su sesión de Windows. La reversión restaura `AssistantChat.jsx` si Nova20 ya estaba instalado y lo elimina solo si este ZIP lo añadió.

## Comprobación de esta entrega

- Suite existente: 40 pruebas aprobadas.
- `node --check`: correcto para `electron/main.js`, `electron/preload.js` y `electron/desktop/index.js`.
- No se ejecutó Vite ni se probó la ventana nativa en Windows en esta copia aislada; la comprobación visual debe hacerse en el PC después de instalar.
