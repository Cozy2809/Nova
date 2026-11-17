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
