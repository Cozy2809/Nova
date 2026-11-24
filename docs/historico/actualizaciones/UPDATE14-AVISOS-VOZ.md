> **Archivo histórico:** esta receta corresponde a una actualización antigua, no a la instalación actual. Consulta la [guía principal](../../../README.md).

# Update 14 — Nova: control del PC, avisos y voz en el móvil
Requiere la update 13 ya instalada.

## Instalar
```powershell
cd .
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force
Expand-Archive -Path "$env:USERPROFILE\Downloads\nova-update14.zip" -DestinationPath . -Force
python tools\instalar_nova14.py
```
Deshacer: `python tools\instalar_nova14.py --revertir` y `npm run build`.
> No ejecutes `parche-notify\aplicar.py`: esta update ya incluye ese parche (con el nombre Nova) y ese script lo pisaría.

## Voz de Nova en el móvil (lo que sale en el LEEME de la 13)
Chrome solo deja usar el micrófono en páginas **HTTPS**. Pasos:
1. En https://login.tailscale.com/admin/dns activa **MagicDNS** y **HTTPS Certificates**.
2. En Nova (PC), panel **MÓVIL** → botón **ACTIVAR HTTPS (MICRÓFONO)**. Si Tailscale pide habilitar «Serve» te mostrará un enlace: ábrelo, acepta y vuelve a pulsar el botón.
3. Pulsa **COPIAR ENLACE HTTPS** y ábrelo en Chrome del móvil (ya lleva el código). Acepta el permiso del micrófono.
4. Menú ⋮ → «Añadir a pantalla de inicio» con esa dirección https.
Después: 🎤 para una orden o **CHARLA** para conversación continua. Si sigues en http, la app te avisa con un recuadro amarillo.
(Equivale a `tailscale serve --bg 8787` en PowerShell.)

## Novedades
- **Avisos al móvil (ntfy)** integrados: «avísame al móvil en 10 minutos de…», «a las 18:30», «mándame al móvil que…», «cancela los avisos», «prueba la notificación al móvil». Los avisos viven en el proceso principal (no se congelan). Solo dice «enviado» si ntfy contestó bien. Respeta `NTFY_AUTO=false`. Prueba rápida: `node electron\notify.js "Hola desde Nova"`.
- **Órdenes libres del PC**: si dices algo sobre archivos que no encaja con las frases fijas («ponme el pdf del contrato», «dónde dejé las fotos del viaje», «escríbeme algo sobre los volcanes en el bloc de notas»), el modelo lo traduce a una acción de una **lista cerrada** (buscar, abrir, leer, resumir, redactar, crear carpeta, papelera, abrir carpeta). El modelo no ejecuta nada: la acción pasa por los mismos permisos y rutas validadas.
- **Investigación real**: para redactar, Nova busca, **lee hasta 4 páginas públicas** (recorta cada una a ~1400 caracteres) y escribe solo con esos datos. Al final del documento añade **«Fuentes consultadas»** con las direcciones. No visita direcciones locales ni redes sociales.
- **Escritura en directo**: abre el **Bloc de notas**, escribe a la vista (de ~4 palabras en ~4 palabras) y lo **guarda en el Escritorio**. Mientras lo hace, **no toques teclado ni ratón**. Si pierde el foco, se detiene y guarda el documento completo directamente. Usa el portapapeles (lo restaura al terminar). Apagar: `PC_LIVE_TYPING=off` en `.env`.
- **Contexto del modelo a 4096** (`OLLAMA_NUM_CTX`) para que quepan las fuentes en textos largos.

## Qué NO hace (a propósito)
Sigue sin haber control libre de ratón y teclado sobre cualquier ventana. Solo escribe en el Bloc de notas que abre él mismo y comprueba antes de cada trozo que es la ventana activa.

## Probar
- «Redacta la historia del descubrimiento de América en un .txt» (verás las páginas leídas, el permiso y el Bloc de notas escribiendo).
- «Avísame al móvil en 2 minutos de probar Nova».
- «Ponme el archivo informe» / «dónde dejé las fotos de Roma».
