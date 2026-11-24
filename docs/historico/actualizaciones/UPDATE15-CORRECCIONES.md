> **Archivo histórico:** esta receta corresponde a una actualización antigua, no a la instalación actual. Consulta la [guía principal](../../../README.md).

# Update 15 — Nova: arreglos de las updates 13 y 14
Requiere las updates 13 y 14.

## Instalar
```powershell
cd .
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force
Expand-Archive -Path "$env:USERPROFILE\Downloads\nova-update15.zip" -DestinationPath . -Force
python tools\instalar_nova15.py
```
Deshacer: `python tools\instalar_nova15.py --revertir` y `npm run build`.

## Qué arregla
- **Botón VENTANA**: el menú se abría pero quedaba tapado por el contenido, por eso «no hacía nada».
- **AJUSTES**: ahora ocupan la columna central con scroll y el orbe se oculta mientras están abiertos.
- **CPU alta**: quita el desenfoque de los paneles y el filtro del orbe (caros de dibujar) y el orbe baja a 30 fps en espera.
- **Micrófono**: el estado «escuchando» incluía el tiempo que Whisper tarda en transcribir. Ahora ves «transcribiendo» (color violeta); si el micrófono no responde en 45 s se cancela y se reinicia el servicio de voz. Descarta transcripciones sin letras y mejora el aviso a Whisper (Nova / Jarvis).
- **Avisos al móvil**: ahora Nova dice el **tema** al que ntfy aceptó el mensaje (o el motivo del error), y guarda un registro en `notify.log` (carpeta de datos de la app).

## Si el aviso no llega al móvil
1. Nova envía al tema que pone en tu `.env` (`NTFY_TOPIC`). La app ntfy del móvil debe estar **suscrita exactamente a ese tema** (servidor ntfy.sh).
2. Aísla el problema: abre `https://ntfy.sh/app`, suscríbete a ese tema en el navegador del PC y di «mándame al móvil que prueba». Si aparece ahí, Nova funciona y el fallo está en el móvil.
3. En el móvil: ntfy → notificaciones permitidas, batería «Sin restricciones» para ntfy, y sin «No molestar».
4. Prueba directa: `node electron\notify.js "prueba"` en PowerShell dentro de Nova.
