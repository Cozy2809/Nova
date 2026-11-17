# Nova Update25 — interacción y ajuste de compilación

Actualización incremental preparada desde `nova-lean-v19.zip`. Aplica sobre una copia del proyecto con el escritorio Widgets Windows de Nova.

## Qué cambia
- Los eventos de paso de clic se administran en la zona completa de tarjetas, en vez de activar/desactivar la ventana al entrar y salir de cada botón. Esto reduce los cambios de estado del modo click-through al pasar entre controles y mantiene el espacio fuera de tarjetas interactivo con Windows.
- `postcss.config.js` usa CommonJS, que es el formato predeterminado del proyecto Electron. El build anterior hacía una segunda interpretación ESM y mostraba `MODULE_TYPELESS_PACKAGE_JSON`; la compilación verificada ya no muestra esa advertencia.

## Auditoría y verificación
- `npm test -- --test-reporter=dot`: 41 pruebas aprobadas.
- `npm run build`: correcto; Vite transformó 84 módulos y generó las entradas principal, móvil y widgets.
- `node --check electron/desktop/index.js` y `node --check electron/preload.js`: correctos.
- La instalación de dependencias de auditoría se hizo solo en la copia aislada, con `npm ci --ignore-scripts`; no se agregan dependencias a Nova.

## Inventario
- Modificados: `src/desktop/WindowsWidgets.jsx`, `postcss.config.js`.
- Añadidos al proyecto: ninguno.
- Eliminados del proyecto: ninguno.
- Dependencias nuevas: ninguna.
- Migraciones: ninguna. No se cambian ni eliminan bases de datos, ajustes o datos personales.

## Instalación en PowerShell
Cierra Nova antes de pegar los comandos. Si la carpeta o ubicación del ZIP difieren, ajusta las dos primeras variables.

```powershell
$project = (Get-Location).Path
$zip = "$env:USERPROFILE\Downloads\nova-update25-quality.zip"
Set-Location $project
$backup = Join-Path $project ("backup-update25-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item (Join-Path $project 'src\desktop\WindowsWidgets.jsx') $backup
Copy-Item (Join-Path $project 'postcss.config.js') $backup
Expand-Archive -LiteralPath $zip -DestinationPath $project -Force
npm run build
```

Si el build termina sin errores, abre Nova con el acceso directo habitual.

## Comprobación en el equipo
1. Abre “Widgets Windows” y usa los botones del encabezado y el panel de ajustes.
2. Cambia transparencia, posición y tamaño; confirma que la ventana sigue los ajustes.
3. Prueba calendario, música, accesos rápidos y notas. La reproducción multimedia depende de la fuente activa.
4. Mueve el puntero entre controles, tarjetas y huecos; en los huecos debe poder recibirse el clic de la ventana subyacente.
5. Comprueba que las preferencias siguen presentes al cerrar y volver a abrir Nova.

## Reversión
Cierra Nova y reemplaza los dos archivos por sus copias de `backup-update25-*`:

```powershell
Copy-Item (Join-Path $backup 'WindowsWidgets.jsx') (Join-Path $project 'src\desktop\WindowsWidgets.jsx') -Force
Copy-Item (Join-Path $backup 'postcss.config.js') (Join-Path $project 'postcss.config.js') -Force
Set-Location $project
npm run build
```

## Estado funcional
- Terminado y compilado: gestión continua del click-through en la zona de widgets y formato explícito compatible de PostCSS.
- Verificado automáticamente: suite existente (41 pruebas), compilación web y comprobación sintáctica de IPC/preload.
- Pendiente de validar en el PC: respuesta real del puntero en ventanas superpuestas, click-through en las aplicaciones del usuario y controles según sus fuentes activas.
- No se afirma que los controles multimedia externos funcionen en cualquier aplicación.
