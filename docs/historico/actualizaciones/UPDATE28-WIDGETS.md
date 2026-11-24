> **Archivo histórico:** esta receta corresponde a una actualización antigua, no a la instalación actual. Consulta la [guía principal](../../../README.md).

# Nova update 28 — Widgets Windows

Esta actualización completa la parte de escritorio que faltaba en la update 27. Conserva Croc y la personalidad añadidos por la update anterior. No agrega dependencias.

## Qué incluye

- Panel de widgets con acabado acristalado, transparencia y animaciones configurables; puedes ocultar los módulos que no quieras.
- Orbe de audio reutilizado de la ventana de Nova, con estado y nivel de voz, y un botón para abrir Nova en modo conversación.
- Mapa opcional. Al pulsar «Permitir y mostrar mapa», Nova pide permiso nativo; OpenStreetMap recibe las coordenadas para cargar el mapa. No consulta la ubicación antes de ese permiso.
- Selección de monitor, posición horizontal, tamaño, transparencia y movimiento del panel arrastrando su cabecera. La posición se guarda.
- Barra secundaria opcional en la parte superior del monitor elegido, con estado, hora, accesos a voz/widgets y avisos configurables.
- Avisos recientes en el panel y avisos breves en la barra superior.
- Acceso de Nova en el menú Inicio que Windows permite anclar manualmente a la barra de tareas.
- Estado «Asistente Nova ON» en Discord Rich Presence. Requiere Discord de escritorio abierto, un Application ID de una aplicación tuya en Discord Developer Portal y subir el icono como asset `nova`. La aplicación se configura dentro de Ajustes de los widgets.

El acceso rápido no modifica ni sustituye la barra de tareas de Windows: crea un acceso en Inicio; después, en Windows, busca Nova y pulsa «Anclar a la barra de tareas». El panel de widgets se mueve como conjunto; puedes activar/desactivar cada módulo desde su configuración.

## Instalación

Cierra Nova. Descarga `nova-update28.zip` en Descargas. En PowerShell:

```powershell
Set-Location '.'
$backup = "..\Nova-backup-nova28-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
robocopy . $backup /E /XD node_modules dist venv .git
if ($LASTEXITCODE -gt 7) { throw 'La copia de seguridad no terminó correctamente.' }
Expand-Archive -LiteralPath "$HOME\Downloads\nova-update28.zip" -DestinationPath . -Force
python tools\instalar_nova28.py
npm run build
```

El instalador compara los archivos con la versión de base antes de copiar ninguno. Si detecta diferencias, se detiene sin cambios; conserva respaldos `.bak-nova28`. No cambia `.env`, conversaciones, memoria ni dependencias. Reinicia Nova al terminar.

## Comprobaciones manuales

1. Abre **WIDGETS WINDOWS**, pulsa el engranaje, desactiva Reloj y Red y activa el Mapa. Comprueba que Reloj/Red desaparecen y que el mapa pide permiso antes de consultar tu ubicación.
2. Arrastra la cabecera del panel, cambia la pantalla en el engranaje y reinicia Nova. Debe conservar la posición y el monitor seleccionados.
3. Activa la barra superior y prueba sus botones de voz y widgets. Cambia de pantalla y oculta/restituye la barra.
4. Pulsa «Hablar con Nova»: debe abrirse el asistente en modo conversación. Prueba el orbe mientras Nova escucha o habla.
5. Configura tu Application ID y activa Discord Presence con Discord de escritorio abierto. Debe aparecer «Asistente Nova ON»; si quieres el logo, sube `nova` como asset en el Developer Portal.
6. Pide a Nova que mande un aviso a tu móvil. Debe aparecer en el widget de avisos y brevemente en la barra superior si ambos están activados.
7. Crea el acceso rápido; busca Nova en Inicio, clic derecho y **Anclar a la barra de tareas**.

## Reversión

Con Nova cerrada:

```powershell
Set-Location '.'
python tools\instalar_nova28.py --revertir
npm run build
```
