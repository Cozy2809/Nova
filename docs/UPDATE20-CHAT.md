# Nova Update 20 — chat integrado en el escritorio

## Qué cambia

- Añade una ventana **Hablar con Nova** accesible desde el dock del escritorio.
- Usa el hook `useAI` y los servicios de chat, memoria, órdenes y voz ya presentes en Nova. No crea servicios ni dependencias nuevas.
- Al entrar en escritorio, oculta y desmonta la vista de chat principal para evitar dos conversaciones activas simultáneamente. El chat principal se conserva al volver a la vista de Nova y el historial del asistente continúa usando la memoria existente.
- Si el sistema devuelve un icono inválido para una aplicación abierta, el dock muestra su inicial como alternativa.

## Instalación sobre Nova19

Cierra Nova. Ajusta `$project` a tu ruta real. La copia conserva los cinco archivos existentes que modifica y crea una carpeta de respaldo con marca de tiempo fuera del proyecto.

```powershell
$project = (Get-Location).Path
$backup = "$project-backup-nova20-$(Get-Date -Format yyyyMMdd-HHmmss)"
$files = @(
  'src\App.jsx',
  'src\desktop\DesktopShell.jsx',
  'src\desktop\Dock.jsx',
  'src\desktop\windows.js',
  'src\desktop\desktop.css'
)
New-Item -ItemType Directory -Path $backup | Out-Null
foreach ($file in $files) {
  $target = Join-Path $project $file
  $dest = Join-Path $backup $file
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item -LiteralPath $target -Destination $dest
}
Set-Location $project
$zip = "$env:USERPROFILE\Downloads\nova-update20-chat.zip"
Expand-Archive -LiteralPath $zip -DestinationPath $project -Force
npm run build
```

El ZIP añade un archivo (`src\desktop\apps\AssistantChat.jsx`) y actualiza los cinco archivos del respaldo. No elimina archivos, toca `.env` ni modifica la base de datos. No requiere migraciones.

## Verificación

Abre Nova, entra en **ESCRITORIO**, pulsa **Hablar con Nova** en el dock y envía un mensaje. Puedes escribir o usar el botón del micrófono (también `Ctrl+M`). Comprueba que Nova responde y, con VOZ activada, que lee las respuestas. El primer icono circular del dock sigue volviendo a la vista principal.

Para los iconos de aplicaciones, deja que aparezca una ventana abierta en el dock; si el icono nativo no se carga debe verse la inicial de la aplicación.

## Reversión

Usa el respaldo creado durante la instalación (sustituye la ruta por su nombre exacto):

```powershell
$project = (Get-Location).Path
$backup = 'Join-Path $project 'backup''
Copy-Item -LiteralPath "$backup\src\App.jsx" -Destination "$project\src\App.jsx" -Force
Copy-Item -LiteralPath "$backup\src\desktop\DesktopShell.jsx" -Destination "$project\src\desktop\DesktopShell.jsx" -Force
Copy-Item -LiteralPath "$backup\src\desktop\Dock.jsx" -Destination "$project\src\desktop\Dock.jsx" -Force
Copy-Item -LiteralPath "$backup\src\desktop\windows.js" -Destination "$project\src\desktop\windows.js" -Force
Copy-Item -LiteralPath "$backup\src\desktop\desktop.css" -Destination "$project\src\desktop\desktop.css" -Force
Remove-Item -LiteralPath "$project\src\desktop\apps\AssistantChat.jsx"
Set-Location $project
npm run build
```

## Inventario

**Añadido:** `src/desktop/apps/AssistantChat.jsx`.

**Modificados:** `src/App.jsx`, `src/desktop/DesktopShell.jsx`, `src/desktop/Dock.jsx`, `src/desktop/windows.js`, `src/desktop/desktop.css`.

**Eliminados:** ninguno. **Dependencias nuevas:** ninguna.

El build debe ejecutarse en el proyecto instalado con `npm run build`; esta copia aislada no contiene `node_modules`, por lo que no declaro el build de esta iteración como verificado aquí.
