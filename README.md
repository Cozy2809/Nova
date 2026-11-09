# Nova

Nova es un proyecto de asistente personal para Windows hecho con Electron y React. Puede conversar mediante modelos locales de Ollama e incluye una interfaz de escritorio propia, widgets, controles del sistema, biblioteca de documentos y una interfaz móvil opcional.

## Configuración y personalización

La primera vez que se abre, Nova muestra un asistente de configuración y un tutorial que se puede omitir. Permite elegir entre los perfiles Lite, Nova, Premium y Analizar mi PC, configurar el nombre con el que te habla y personalizar su personalidad.

Los perfiles seleccionan un modelo de Ollama. “Analizar mi PC” es una recomendación basada en la memoria RAM y los procesadores lógicos; no realiza benchmarks ni mide el rendimiento de la GPU. La descarga del modelo se inicia cuando la persona la solicita.

La personalización se guarda en el equipo de cada usuario, no en este repositorio. No descargues ni compartas la carpeta de datos de Nova si contiene conversaciones, ajustes o información personal.

## Requisitos

- Windows 10 u 11 de 64 bits.
- Node.js LTS para instalar las dependencias y ejecutar la aplicación.
- Git para clonar el repositorio.
- Ollama para conversar con un modelo local.
- Python 3.12 y las dependencias de `requirements.txt` para las funciones de voz/audio.
- Tailscale y ntfy son opcionales.

## Instalación

Instala primero las herramientas que necesites. Si ya las tienes, puedes omitir ese paso:

```powershell
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Python.Python.3.12 -e
winget install --id Git.Git -e
irm https://ollama.com/install.ps1 | iex
