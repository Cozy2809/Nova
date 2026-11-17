# Nova Update24 — controles de widgets

## Alcance
Actualización incremental para el proyecto Nova cuya interfaz incluye “Widgets Windows” y el panel de transparencia, posición y tamaño de las capturas.

## Correcciones
- `WindowsWidgets.jsx` importa `setDeep`, función usada por el panel para cambiar y guardar preferencias. Sin ese import, mover transparencia o cambiar posición/tamaño podía producir `ReferenceError`.
- `desktop.css` permite eventos de puntero en cada tarjeta `.nd-wg`. El contenedor sigue dejando pasar los clics en el espacio vacío para interactuar con ventanas detrás.

## Inventario
- Modificados: `src/desktop/WindowsWidgets.jsx`, `src/desktop/desktop.css`.
- Añadidos/eliminados en el proyecto: ninguno.
- Dependencias nuevas: ninguna.
- Migraciones: ninguna. La actualización no borra ni modifica bases de datos o datos personales.

## Instalación PowerShell
Cierra Nova. Ajusta `$project` si tu proyecto está en otra ruta. El ZIP contiene solo los dos archivos de código y esta documentación.

```powershell
$project = (Get-Location).Path
$zip = "$env:USERPROFILE\Downloads\nova-update24-widget-controls.zip"
$backup = Join-Path $project ("backup-update24-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item (Join-Path $project 'src\desktop\WindowsWidgets.jsx') $backup
Copy-Item (Join-Path $project 'src\desktop\desktop.css') $backup
Expand-Archive -LiteralPath $zip -DestinationPath $project -Force
Set-Location $project
npm run build
```

Si el build termina con código 0, abre Nova como de costumbre; no es obligatorio ejecutar `npm run electron` si tu acceso directo abre la app.

## Verificación
1. Cambia transparencia y confirma que responde y persiste al cerrar/reabrir preferencias.
2. Cambia posición y tamaño y confirma el cambio en el panel.
3. Prueba los clics en tarjetas: calendario, música, accesos rápidos y notas, según estén disponibles.
4. Haz clic en el espacio vacío alrededor: debe alcanzar la aplicación que queda detrás.
5. Confirma que `npm run build` termina correctamente.

La corrección hace que las tarjetas reciban interacción; no garantiza servicios multimedia externos en todas las fuentes/equipos.

## Reversión
Cierra Nova. Desde `backup-update24-*`, restaura `WindowsWidgets.jsx` y `desktop.css` a `src\desktop\`, sobrescribiendo los archivos actuales; después ejecuta `npm run build`. No afecta preferencias ni datos de usuario.

## Estado
- Corregido en código: import que faltaba para guardar preferencias; recepción de puntero en tarjetas; clics en fondo vacío pasan a las ventanas subyacentes.
- Requiere verificación en el equipo: botones individuales, persistencia del aspecto y paso de clics con las ventanas reales.
- Variable por entorno: controles de música dependen del origen y de la integración multimedia de Nova.
