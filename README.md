# Nova

Nova es un asistente de escritorio para Windows con chat, voz opcional y herramientas para trabajar con el PC. Usa Ollama como proveedor de IA predeterminado y guarda la memoria y las preferencias en el equipo. La aplicación incluye una vista de escritorio propia; no sustituye el Explorador ni la barra de tareas de Windows.

## Qué puedes hacer

- **Hablar con Nova:** conversar por texto o voz, elegir el modelo y ajustar la personalidad, la voz y el rendimiento desde **Ajustes**. La configuración inicial permite elegir un perfil y descargar el modelo desde Ollama.
- **Usar Nova Desktop:** abrir **ESCRITORIO** para acceder a su espacio de trabajo, explorador, dock, ventanas y widgets. La integración con Windows se configura desde sus ajustes.
- **Pedir acciones del PC:** Nova ofrece operaciones acotadas con aplicaciones, archivos y funciones del sistema. Algunas acciones requieren confirmación; no es una terminal para ejecutar comandos arbitrarios.
- **Consultar documentos:** la biblioteca puede aportar documentos como contexto cuando haces preguntas relacionadas.
- **Conectar servicios opcionales:** búsqueda web mediante una clave de Brave, avisos móviles mediante ntfy, acceso desde el teléfono mediante el panel **MÓVIL** y envío de archivos con Croc. Cada servicio necesita su propia configuración y conexión.

La app móvil que acompaña al proyecto es una interfaz web para conectarse al Nova que está ejecutándose en el PC; no es una aplicación Android independiente. Para acceder desde el teléfono, configura Tailscale en ambos dispositivos y sigue las instrucciones del panel **MÓVIL**. Para usar el micrófono del teléfono se necesita HTTPS. No expongas el puerto del servicio mediante el router.

## Requisitos

- Windows y Node.js 20 o posterior.
- Ollama instalado y un modelo disponible. El perfil recomendado usa `qwen3:4b`; también hay perfiles de menor y mayor consumo. Puedes descargar el modelo desde la configuración inicial o desde **Ajustes**.
- Python 3.10 o posterior y los paquetes de `requirements.txt` si quieres usar las funciones de voz.
- En Windows, Visual Studio Build Tools con herramientas de C++ puede ser necesario para compilar dependencias nativas durante la instalación. En Linux se requieren, entre otras, `build-essential`, `python3-dev`, `libportaudio2` y `libsndfile1`; varias funciones de integración descritas aquí son específicas de Windows y no se han verificado en Linux.

## Instalación y primer inicio

Desde la carpeta del proyecto, abre PowerShell:

```powershell
npm install
Copy-Item .env.example .env
```

Instala Ollama y déjalo ejecutándose. Si quieres que Nova escuche y hable, instala las dependencias de voz en un entorno virtual y ejecuta la aplicación desde esa misma sesión:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
npm run dev
```

Si no necesitas voz, puedes omitir la creación del entorno virtual y la instalación de `requirements.txt`. En ese caso, inicia Nova con `npm run dev`. Para compilar y abrir la aplicación empaquetada localmente, usa `npm run build` y después `npm run electron`.

En el primer inicio, completa **Configuración inicial**. Si Ollama no está instalado o iniciado, configura ese servicio y vuelve a Nova; podrás descargar el modelo elegido desde el asistente o desde **Ajustes → IA**. Los controles para la voz están en **Ajustes → VOZ**.

## Configuración opcional

Normalmente puedes cambiar las preferencias desde la interfaz; `.env` se reserva para ajustes de integración:

- `BRAVE_SEARCH_API_KEY`: habilita la búsqueda web; las consultas usan el servicio de Brave.
- `NTFY_TOPIC`: tema propio para avisos móviles. ntfy.sh es público: el nombre del tema no cifra los mensajes; no envíes información sensible.
- `PIPER_BIN` y `PIPER_MODEL`: ubicación del motor y del modelo de voz si necesitas configurarlos manualmente.
- `PC_CONTROL=off`: desactiva las funciones de control del PC documentadas por esta opción.

No publiques `.env`, claves ni archivos personales. La memoria y las preferencias se guardan en el almacenamiento local de la aplicación. Algunas funciones opcionales sí se conectan a servicios externos: por ejemplo, Brave para búsqueda, ntfy para avisos y Croc para transferencias.

## Ayuda y límites

- Si el chat no responde, comprueba que Ollama está ejecutándose y que el modelo seleccionado aparece instalado en **Ajustes → IA**.
- Si falla la voz, comprueba la instalación de `requirements.txt`, el micrófono seleccionado y las opciones de **Ajustes → VOZ**.
- Si el teléfono no conecta, deja Nova abierta, revisa el estado del panel **MÓVIL** y la conexión Tailscale. El micrófono del navegador requiere HTTPS.
- La disponibilidad de algunas integraciones depende de Windows y de servicios externos configurados por cada usuario. Esta guía describe el proyecto y sus controles, pero no certifica esos servicios en cada equipo.

## Documentación técnica

Para desarrollo e implementación, consulta [el contrato del agente](docs/CONTRATO-NOVA-AGENT.md), [la integración de Nova Agent](docs/NOVA_AGENT_INTEGRATION.md), [la preparación para Android](docs/NOVA_ANDROID.md) y [la auditoría técnica](docs/NOVA_AUDITORIA_Y_PLAN.md). Las guías de instalación de versiones anteriores se conservan, claramente marcadas como históricas, en [el archivo de actualizaciones](docs/historico/actualizaciones/ARCHIVO.md); no son instrucciones para instalar la versión actual.
