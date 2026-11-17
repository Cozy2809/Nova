# Nova
Asistente de escritorio local con Electron 33, React 18, Vite 6, Tailwind, Ollama, SQLite, Whisper.cpp, Piper y Brave Search.

## Requisitos
Node 20+, Python 3.10+, Ollama, (Windows: Visual Studio Build Tools / Linux: `build-essential python3-dev libportaudio2 libsndfile1`).

## Instalación
```bash
cp .env.example .env        # (Windows: copy .env.example .env)
npm install
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
ollama pull qwen3:4b && ollama serve
npm run dev
```
## Voz
- STT: pywhispercpp descarga el modelo `base` solo la primera vez.
- TTS: descarga Piper (github.com/rhasspy/piper) y una voz .onnx + .json a `voices/`; ajusta PIPER_BIN y PIPER_MODEL en `.env`.
## Búsqueda
Pon tu BRAVE_SEARCH_API_KEY en `.env`.
## Producción
`npm run build && npm run electron`
## Datos locales
Para conservar los datos de instalaciones anteriores, Nova mantiene memoria y preferencias en `%APPDATA%\jarvis-clone` en Windows.
## Seguridad
contextIsolation + sandbox, preload mínimo, claves solo en main, lista blanca de apps y confirmación nativa para abrir apps / borrar archivos.
## Pendiente / ideas
Proveedores OpenAI/Anthropic/Gemini (añadir módulo en electron/providers), control de medios con pyautogui, modos panel lateral.
