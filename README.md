# Nova — asistente local para Windows

Nova es un proyecto personal de escritorio basado en Electron y React. Incluye chat con modelos locales de Ollama, voz opcional, utilidades de escritorio, widgets, biblioteca de documentos y una interfaz web móvil que se puede usar dentro de una tailnet de Tailscale.

Esta distribución de GitHub está limpia: no lleva conversaciones, preferencias del autor, base de datos, contactos, claves, `.env`, voces descargadas ni modelos de IA. En el primer inicio, cada persona elige su perfil, nombre de trato, personalidad y módulos. Los ajustes y la memoria quedan en su propio perfil local de Windows.

## Perfiles de rendimiento

Los perfiles viven en una sola compilación; no son tres instaladores distintos.

| Perfil | Modelo inicial | Para quién |
|---|---|---|
| Nova Lite | `qwen2.5:3b` | PC con recursos modestos |
| Nova | `qwen3:4b` | Equilibrio para la mayoría |
| Nova Premium | `qwen3:8b` | PC con más memoria disponible |
| Analizar mi PC | Selección recomendada | Heurística local según RAM y procesadores lógicos; la persona confirma antes de descargar |

Los tamaños, velocidad y calidad varían según la versión del modelo y el hardware. La detección no mide GPU, temperatura, carga actual ni benchmarks. La persona puede elegir otro perfil desde Ajustes. La descarga se inicia al pulsar el botón, no en segundo plano sin aviso.

## Requisitos

- Windows 10 u 11 de 64 bits.
- Node.js LTS y Git para instalar/compilar.
- Python 3.12 para voz y audio; la aplicación principal y el chat local no necesitan que se descargue una voz.
- Ollama para modelos locales.
- Espacio libre según el modelo elegido y espacio adicional para voces/modelos de voz opcionales.

## Instalación rápida en PowerShell

Si no tienes las herramientas, instala Node, Python y Git con WinGet:

```powershell
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Python.Python.3.12 -e
winget install --id Git.Git -e
```

Instala Ollama desde su instalador oficial:

```powershell
irm https://ollama.com/install.ps1 | iex
```

Cierra y vuelve a abrir PowerShell después de instalar. Clona el repositorio y prepara el proyecto:

```powershell
git clone https://github.com/TU-USUARIO/TU-REPOSITORIO.git
Set-Location .\TU-REPOSITORIO
Copy-Item .env.example .env
npm ci
py -3.12 -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
ollama pull qwen2.5:3b
npm run build
npm run electron
```

Reemplaza `TU-USUARIO/TU-REPOSITORIO` con la URL real del repositorio. Si PowerShell no reconoce `py -3.12`, abre el instalador de Python y habilita el lanzador `py`. `npm ci` y `pip install` necesitan Internet. Si Windows pregunta por permisos de firewall para la función móvil, revisa el alcance antes de permitirla.

Si Ollama no responde, abre la aplicación Ollama desde Inicio. Si el servicio no está activo, ejecuta `ollama serve` en otra ventana de PowerShell y vuelve a Nova.

## Seleccionar o descargar un modelo

El asistente inicial recomienda un perfil. También puedes descargarlo directamente:

```powershell
ollama pull qwen2.5:3b
# o Nova estándar
ollama pull qwen3:4b
# o Nova Premium
ollama pull qwen3:8b
```

Después, abre Nova y elige el modelo en el asistente inicial o en Ajustes. Los comandos `ollama pull` consumen espacio y ancho de banda, así que ejecuta solo el del modelo que deseas. La lista y los tamaños actuales están en [Ollama Library](https://ollama.com/library).

## Personalizar tu Nova

En el primer inicio puedes elegir cómo te llama, la personalidad, longitud de respuesta, voz, uso de la biblioteca y perfil de rendimiento. Desde Ajustes puedes volver a abrir el asistente o restablecer los valores predeterminados.

La personalidad también se edita en `nova-personalizacion.txt`, que Nova crea en su carpeta de datos de usuario y abre desde Ajustes. La app añade su contenido, limitado a 4.000 caracteres, a las instrucciones de personalidad. No escribas claves, contraseñas ni instrucciones para cambiar los permisos del sistema.

Los datos no se guardan en el ZIP ni en esta carpeta de código. En Windows, SQLite y los ajustes se guardan en el directorio de datos de usuario de Electron, normalmente bajo `%APPDATA%\jarvis-clone`. No compartas ese directorio si contiene tus conversaciones.

## Usar Nova desde el móvil

### Tailscale

1. Instala Tailscale en el PC y en el teléfono desde [Tailscale Downloads](https://tailscale.com/download/).
2. Inicia sesión en ambos con la cuenta que administra tu tailnet.
3. Mantén Nova abierta y abre el apartado Móvil.
4. Abre el enlace de Tailscale mostrado por Nova. Para usar el micrófono, activa HTTPS con el botón de Nova.

La conexión está pensada para dispositivos de tu tailnet. Nova usa Tailscale Serve, no Tailscale Funnel; no configures una redirección de puertos del router. La primera activación de HTTPS puede pedir habilitar certificados en el panel DNS de tu tailnet. Consulta la [guía oficial de Serve](https://tailscale.com/docs/features/tailscale-serve).

### Avisos por ntfy (opcional)

1. En la configuración inicial, genera un tema y activa avisos si los deseas.
2. Instala ntfy en el móvil y suscríbete al mismo nombre de tema.

Los temas de `ntfy.sh` son públicos y los mensajes quedan temporalmente almacenados por el servidor. Un nombre largo y aleatorio reduce la posibilidad de que alguien lo adivine, pero no es cifrado, autenticación ni privacidad. No envíes mensajes sensibles; para privacidad fuerte usa un servidor ntfy propio y configura su dirección en `.env`.

## Controles y privacidad

- La integración del agente tiene una lista de herramientas y permisos; las acciones que modifican archivos piden confirmación.
- Las claves opcionales se guardan solo en `.env`, que está ignorado por Git.
- La plantilla `.env.example` no tiene claves y deja ntfy desactivado.
- La lectura de documentos depende de lo que la persona elija en la biblioteca.
- El tema ntfy no se comparte entre las instalaciones limpias.
- Las funciones que dependen de Windows, Tailscale, Ollama, una GPU o un reproductor multimedia muestran sus limitaciones cuando no están disponibles.

## Compilar y probar

```powershell
npm test
npm run build
npm run electron
```

## Publicar una personalización propia

Empieza por editar `nova-personalizacion.txt` desde Ajustes; ese archivo se guarda en el perfil de Windows y no se incluye en GitHub. Si quieres publicar una variante de código, revisa antes `git status` y confirma que no aparecen `.env`, bases de datos, registros, `contacts.json`, voces ni archivos personales.

Consulta [docs/PUBLICAR-EN-GITHUB.md](docs/PUBLICAR-EN-GITHUB.md) para una descripción lista para la publicación, comandos de Git y una lista de revisión.

## Estado del proyecto

- Terminado en esta entrega: asistente inicial, perfiles, tutorial omitible, personalización por TXT, valores predeterminados, widgets y agente del proyecto.
- Parcial: el perfil automático usa CPU/RAM como heurística y necesita confirmación; no es una prueba de rendimiento.
- Depende del equipo y requiere prueba manual: voz, reproducción multimedia, captura de hardware, ntfy y conexión móvil.

## Documentación

- [Instalación, configuración y limitaciones](docs/CONFIGURACION.md)
- [Contrato Nova Agent](docs/CONTRATO-NOVA-AGENT.md)
- [Texto y comandos para publicar en GitHub](docs/PUBLICAR-EN-GITHUB.md)
