"""Micrófono + Whisper.cpp (pywhispercpp): calibra el ruido ambiente, detecta el final de la frase y transcribe."""
import os, re, threading, time
import numpy as np

SR = 16000
_model = None
_lock = threading.Lock()
_cancel = threading.Event()

def cancel_listen():
    _cancel.set()

def _get_model():
    global _model
    with _lock:
        if _model is None:
            from pywhispercpp.model import Model
            name = os.environ.get("WHISPER_MODEL", "base")
            try:
                _model = Model(name, n_threads=int(os.environ.get("WHISPER_THREADS", "6")))
            except Exception:
                _model = Model(name)
        return _model

_tr_lock = threading.Lock()  # whisper.cpp no es seguro entre hilos: una transcripcion a la vez

def _transcribe(audio, prompt=None):
    with _tr_lock:
        model = _get_model()
        try:
            segs = model.transcribe(audio, language="es", initial_prompt=prompt) if prompt else model.transcribe(audio, language="es")
        except TypeError:
            segs = model.transcribe(audio, language="es")
        return " ".join(s.text for s in segs).strip()

def warmup():
    _get_model()

def record(on_level=None, max_s=15, silence_s=1.0, wait_s=6):
    import sounddevice as sd
    dev = os.environ.get("MIC_DEVICE", "")
    dev = int(dev) if dev.isdigit() else None
    _cancel.clear()
    blk = SR // 20  # bloques de 50 ms
    chunks, noise, thr, started, quiet = [], [], None, False, 0
    t0 = time.time()
    with sd.InputStream(samplerate=SR, channels=1, dtype="float32", device=dev, blocksize=blk) as st:
        while time.time() - t0 < max_s:
            if _cancel.is_set():
                return None
            data, _ = st.read(blk)
            b = data[:, 0]
            rms = float(np.sqrt(np.mean(b ** 2)))
            if on_level:
                on_level(min(1.0, rms * 12))
            chunks.append(b.copy())
            if thr is None:  # 0,4 s iniciales: mide el ruido de fondo
                noise.append(rms)
                if len(noise) >= 8:
                    thr = max(0.012, float(np.percentile(noise, 30)) * 3.0)
                continue
            if rms > thr:
                started, quiet = True, 0
            elif started:
                quiet += 1
                if quiet * 0.05 >= silence_s:
                    break
            elif time.time() - t0 > wait_s:
                return None  # nadie habló
    return np.concatenate(chunks) if started else None

_ALUCINACIONES = re.compile(r"subt[ií]tulos|amara\.org|gracias por ver|suscr[ií]b", re.I)

def listen_and_transcribe(on_level=None):
    try:
        audio = record(on_level)
    except Exception as e:
        raise RuntimeError("No se pudo acceder al micrófono: " + str(e))
    if on_level:
        on_level(0)
    if audio is None:
        return ""
    text = _transcribe(audio, "Conversación en español con Jarvis, el asistente del Señor.")
    return "" if _ALUCINACIONES.search(text) else text

# ---------- Modo Discord: captura del audio de SALIDA de Windows (WASAPI loopback) con 'soundcard' ----------
_lb_thread, _lb_stop = None, threading.Event()
_speaking_probe = lambda: False

def set_speaking_probe(fn):
    """fn() -> True mientras Jarvis habla (para no transcribir su propia voz)."""
    global _speaking_probe
    _speaking_probe = fn

def loopback_running():
    return _lb_thread is not None and _lb_thread.is_alive()

def start_loopback(on_text, on_error):
    global _lb_thread
    if loopback_running():
        return
    _lb_stop.clear()
    _lb_thread = threading.Thread(target=_lb_loop, args=(on_text, on_error), daemon=True)
    _lb_thread.start()

def stop_loopback():
    _lb_stop.set()

def _lb_loop(on_text, on_error):
    import queue
    import soundcard as sc
    q = queue.Queue()

    def worker():  # transcribe aparte para no perder audio mientras Whisper trabaja
        while not (_lb_stop.is_set() and q.empty()):
            try:
                audio = q.get(timeout=0.3)
            except queue.Empty:
                continue
            try:
                t = _transcribe(audio)
                if len(t) >= 3 and not _ALUCINACIONES.search(t):
                    on_text(t)
            except Exception as e:
                on_error(str(e))

    threading.Thread(target=worker, daemon=True).start()
    try:
        spk = sc.default_speaker()
        mic = sc.get_microphone(id=str(spk.name), include_loopback=True)
        thr = float(os.environ.get("LOOPBACK_THRESHOLD", "0.01"))
        chunks, started, quiet, tainted = [], False, 0, False
        with mic.recorder(samplerate=48000) as rec:  # todos los canales (grabar 1 canal en WASAPI puede dar basura)
            while not _lb_stop.is_set():
                data = rec.record(numframes=4800)  # bloques de 0,1 s
                if data is None or len(data) == 0:
                    time.sleep(0.05)
                    continue
                x = data.mean(axis=1) if data.ndim > 1 else data
                n = len(x) // 3 * 3
                x = x[:n].reshape(-1, 3).mean(axis=1).astype(np.float32)  # 48 kHz -> 16 kHz
                rms = float(np.sqrt(np.mean(x ** 2))) if len(x) else 0.0
                if rms > thr:
                    started, quiet = True, 0
                elif started:
                    quiet += 1
                if not started:
                    tainted = False
                    continue
                chunks.append(x)
                if _speaking_probe():
                    tainted = True  # lo que suena es Jarvis: se descarta
                if quiet >= 8 or len(chunks) >= 120:  # 0,8 s de silencio o 12 s máx.
                    audio = np.concatenate(chunks)
                    chunks, started, quiet = [], False, 0
                    if not tainted and len(audio) > SR * 0.6:
                        q.put(audio)
                    tainted = False
    except Exception as e:
        on_error("no se pudo capturar el audio del sistema: " + str(e))
    finally:
        _lb_stop.set()
