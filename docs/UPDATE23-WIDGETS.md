# Nova Update 23 — interacción y personalización de widgets

Actualización incremental para Nova Update 22. Mantiene el escritorio de Nova y el panel de widgets de Windows.

## Cambios

- Las zonas vacías de los widgets internos de Nova y los fondos de tarjetas del panel Windows dejan pasar clics a las ventanas o aplicaciones de detrás. Botones, campos, calendario, ajustes y la barra del panel siguen siendo interactivos.
- Notas ahora tiene un botón **Añadir**, muestra errores y conserva el guardado con Enter.
- El botón de ajustes del panel Windows permite cambiar transparencia, posición izquierda/derecha y tamaño compacto/normal/ancho.
- El panel sigue compartiendo tema y widgets activados en Ajustes del escritorio de Nova.
- No añade dependencias ni modifica bases de datos.

## Instalar

Cierra Nova. Descarga el ZIP en Descargas y pega estos comandos en PowerShell, uno por uno:

```powershell
$project = (Get-Location).Path
```

```powershell
$zip = "$env:USERPROFILE\Downloads\nova-update23-widgets.zip"
```

```powershell
Set-Location -LiteralPath $project
```

```powershell
$backup = "$project-backup-nova23-$(Get-Date -Format yyyyMMdd-HHmmss)"; robocopy $project $backup /E /XD node_modules .git dist /XF *.zip; if ($LASTEXITCODE -ge 8) { throw 'Falló la copia de seguridad' }
```

```powershell
Expand-Archive -LiteralPath $zip -DestinationPath $project -Force
```

```powershell
npm run build
```

El ZIP contiene rutas relativas a la raíz del proyecto y no crea una carpeta contenedora adicional.

## Usar y probar

1. Abre Nova con el acceso directo habitual.
2. En Escritorio de Nova, prueba el botón de calendario, guardar una nota, un acceso rápido y los controles de música con una sesión compatible activa.
3. En el panel Windows, abre los ajustes con el engranaje y cambia transparencia, posición y tamaño.
4. Comprueba que un clic en una zona transparente del panel llega a la ventana o aplicación de detrás; los controles propios del widget siguen respondiendo.

## Revertir

Sustituye el valor de `$backup` por la carpeta creada durante la copia:

```powershell
$project = (Get-Location).Path
$backup = 'Join-Path $project 'backup''
robocopy $backup $project src\desktop\prefs.js src\desktop\widgets\Widgets.jsx src\desktop\desktop.css src\desktop\WindowsWidgets.jsx electron\desktop\index.js electron\preload.js /COPY:DAT /R:2 /W:1
Set-Location -LiteralPath $project
npm run build
```

La reversión repone los archivos de código respaldados; no elimina datos personales ni la base.

## Inventario

**Modificados (6):** `src/desktop/prefs.js`, `src/desktop/widgets/Widgets.jsx`, `src/desktop/desktop.css`, `src/desktop/WindowsWidgets.jsx`, `electron/desktop/index.js`, `electron/preload.js`.

**Añadidos:** ninguno. **Eliminados:** ninguno. **Dependencias nuevas:** ninguna.

## Validación

41 pruebas automáticas pasan; `node --check` pasa para los módulos de Electron modificados. El build Vite y el comportamiento gráfico de paso de clics deben verificarse en el Windows donde se instala.
