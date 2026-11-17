# Nova update 27 — Croc y personalidad

Esta primera entrega añade el envío de un archivo con Croc desde el chat o la voz de Nova y ajusta su prompt para que responda con más calidez y chispa cuando la conversación sea de broma. Las transferencias siempre requieren confirmación nativa de Windows; el código de Croc se genera en el proceso, no se construye un comando de shell con texto de la IA.

## Antes de instalar

1. Instala Croc desde su [página oficial de versiones](https://github.com/schollz/croc/releases/latest). En Windows de 64 bits, descarga el ZIP Windows-64bit, extrae `croc.exe` y colócalo en una carpeta incluida en `PATH`.
2. En PowerShell comprueba `Get-Command croc`. Si Nova ya estaba abierta mientras instalabas Croc, ciérrala por completo y vuelve a iniciarla para que lea el `PATH` actualizado.
3. Si prefieres dejar `croc.exe` en otra ubicación, añade `CROC_PATH=C:\ruta\a\croc.exe` al archivo `.env` de Nova y reinicia la aplicación.

## Instalar la actualización

Cierra Nova. En PowerShell:

```powershell
Set-Location '.'
$backup = "..\Nova-backup-nova27-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
robocopy . $backup /E /XD node_modules dist venv .git
if ($LASTEXITCODE -gt 7) { throw 'La copia de seguridad no terminó correctamente.' }
Expand-Archive -LiteralPath "$HOME\Downloads\nova-update27.zip" -DestinationPath . -Force
python tools\instalar_nova27.py
npm run build
```

El instalador solo reemplaza cuatro archivos, conserva copias `.bak-nova27` y comprueba que la versión base coincide antes de escribir. No toca la memoria, `.env`, dependencias ni `package.json`. Si la comprobación detecta una versión distinta, se detiene sin aplicar cambios.

## Pruebas manuales

- Pide: «Pasa el archivo `archivo-prueba.txt` por Croc». Nova debe localizarlo y mostrar primero el diálogo de confirmación de Windows.
- Pulsa **Denegar**. Nova debe decir que no lo envió y no debe aparecer una clave.
- Repite y pulsa **Permitir**. Debe devolver una clave de Croc y dejar el envío esperando al otro ordenador. En este, ejecuta `croc <clave>` en PowerShell; comprueba que llega el archivo y que coincide.
- Mientras espera, di «cancela la transferencia Croc». Nova debe detener el proceso de envío.
- Pide enviar un archivo con un nombre ambiguo. Nova debe mostrar varios resultados y pedirte que elijas, sin iniciar ninguna transferencia.
- Di en tono de broma «¿te gusta esta función nueva?». Nova debe contestar de forma cálida y juguetona, sin la respuesta automática de «como asistente de IA…». Si indicas que el tema es serio, debe dejar el humor.

La clave es necesaria para recibir el archivo; compártela únicamente con la persona destinataria. Croc debe estar instalado y disponible en `PATH` para que la función opere.

## Alcance de esta entrega

Esta es la fase inicial, centrada en Croc y personalidad. No incluye todavía el nuevo conjunto de widgets, selección de monitor, geolocalización/mapa, barra superior secundaria, cambios de notificaciones ni presencia Rich Presence en Discord. El escritorio de Nova ya tiene widgets movibles dentro de su propio entorno y una bandeja del sistema, pero integrar las nuevas funciones solicitadas requiere trabajo adicional en ventanas nativas, permisos de ubicación y configuración de Discord. No sustituye ni parchea la barra de tareas de Windows.

## Reversión

Con Nova cerrada, ejecuta:

```powershell
Set-Location '.'
python tools\instalar_nova27.py --revertir
npm run build
```
