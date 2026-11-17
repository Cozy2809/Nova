# Update 13 — NOVA (nombre, interfaz, mascota y móvil)

## Instalar (2 minutos)
1. Cierra Jarvis/Nova.
2. Descomprime este zip **dentro de `Nova`** (se añaden `tools\instalar_nova.py`, `tools\payload_nova\` y esta guía).
3. En la carpeta `Nova`: `python tools\instalar_nova.py`
   (copia `.bak-nova` de todo lo que cambia y recompila solo; si `npm` falla, ejecuta `npm run build`).
4. Abre Nova. Para deshacer todo: `python tools\instalar_nova.py --revertir` y `npm run build`.

## Qué cambia
- **Nombre: Nova** (título, mensajes, personalidad en femenino, notificaciones, bandeja). Sigue llamándote «Señor». Se le puede llamar «Nova, …» o «Jarvis, …» al principio de una frase. Tu memoria e historial se conservan.
- **Interfaz nueva**: cristal oscuro, sin cuadrícula ni scanlines, el **orbe es el protagonista** (270 px, espectro degradado, anillo de pulso con la voz) y **todo el color de la app cambia con su estado** (espera, escucha, piensa, habla). Botones de ventana agrupados en un menú.
- **Mascota**: antena que se balancea, orejitas luminosas, mejillas y cejas, **partículas** (corazones, chispas, notas), dos juegos nuevos (**baila** y **mira las estrellas**) y **puedes pulsarla** para hacerle cariño.
- **Control del PC** (de la update 12) mejorado: ahora entiende «busca la foto de la playa», «busca informe.pdf» y «busca este archivo» (te pregunta el nombre). Ignora «de/la/el…» al buscar.
- **Nova en el móvil** (abajo).

## Nova en tu S25 Ultra (web app por Tailscale)
Es la misma Nova del PC: **misma memoria, mismas notas, mismo modelo** y puedes darle órdenes al PC. **Solo funciona con el PC encendido y Nova abierta.**

### Configuración (una vez)
1. Instala **Tailscale** en el PC y en el móvil e inicia sesión con la **misma cuenta**.
2. Abre Nova en el PC: en la columna derecha, panel **MÓVIL**, verás la dirección (`http://100.x.y.z:8787`) y el **código de acceso** (VER CÓDIGO).
3. En el móvil abre esa dirección en Chrome, escribe el código (o usa **COPIAR ENLACE**, que ya lo lleva) y, en el menú ⋮ de Chrome, «Añadir a pantalla de inicio».

### Para poder usar el micrófono (recomendado)
Chrome solo deja usar el micro en páginas HTTPS. Con Tailscale es fácil:
1. En https://login.tailscale.com/admin/dns activa **MagicDNS** y **HTTPS Certificates**.
2. En PowerShell del PC: `tailscale serve --bg 8787` y luego `tailscale serve status` para ver la dirección `https://…ts.net`.
3. Abre esa dirección https en el móvil (añade `/#t=TU_CODIGO` la primera vez).
> No he podido probar Tailscale desde mi entorno. Si tu versión es antigua y el comando falla, actualiza Tailscale. Sin HTTPS la app funciona igual, pero escribiendo.
> Con `tailscale serve` tampoco necesitas tocar el Firewall de Windows. Si usas la dirección http directa y Windows pregunta, permite Electron en red **privada**.

### Cómo funciona la voz en el móvil
Nova habla con la **voz del propio teléfono** (la voz Piper vive en el PC). Botón 🎤 para hablar, **CHARLA** para conversación continua, atajos rápidos bajo el chat. Puedes quitar la voz en el menú ⋯.

### Seguridad
- El servidor escucha **solo en 127.0.0.1 y en las IP de Tailscale**; nunca en tu Wi-Fi.
- Todo `/api` exige el **código** (16 caracteres, generado al azar; hay freno de intentos). Nada viaja a internet.
- Las acciones que modifican algo (crear, abrir, borrar a la Papelera…) **piden permiso en el móvil** (ventana Denegar/Permitir; sin respuesta en 2 min = denegado). Se guardan en `pc-actions.log` como «(móvil)».
- Desde el móvil **no** se puede borrar la memoria.
- Apagar todo: `NOVA_MOBILE=off` en `.env`. Solo bloquear el PC desde el móvil: `NOVA_MOBILE_PC=off`.
- Código nuevo: borra `mobileToken` de la base o define `NOVA_MOBILE_TOKEN=` en `.env`.

## Probar
Móvil: «¿qué hora es?», «busca el archivo informe en descargas», «redacta la historia de Roma en un .txt» (te pedirá permiso en el móvil y el archivo aparecerá en el Escritorio del PC), «sube el volumen».
