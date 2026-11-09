"""Servicio de voz local: Whisper.cpp (STT) y Piper (TTS). JSON por líneas por stdin/stdout.
Habla frase a frase en segundo plano (cola), se puede callar al instante y aplica el efecto Jarvis.
Emite eventos: {"event":"level","v":0..1}, {"event":"speech","state":"start|end"}, {"event":"error"}."""
import json, os, queue, re, subprocess, sys, tempfile, threading, time, unicodedata
import numpy as np
from whisper_bridge import listen_and_transcribe, warmup, cancel_listen, start_loopback, stop_loopback, loopback_running, set_speaking_probe
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

PIPER_BIN = os.environ.get("PIPER_BIN", "piper")
PIPER_MODEL = os.environ.get("PIPER_MODEL", "voices/es_ES-davefx-medium.onnx")
NO_WINDOW = 0x08000000 if os.name == "nt" else 0

out_lock = threading.Lock()
state_lock = threading.Lock()
gen = 0            # se incrementa al callar: lo pendiente de generaciones antiguas se descarta
outstanding = 0    # frases que aún no han terminado de sonar
speaking = False
text_q, audio_q = queue.Queue(), queue.Queue()

def emit(o):
    with out_lock:
        print(json.dumps(o), flush=True)

def level(v, mode):
    emit({"event": "level", "v": round(float(v), 3), "mode": mode})

def limpiar(texto):
    # Quita emojis, formato y símbolos; deja "?" para la entonación
    texto = re.sub(r"[\U00010000-\U0010ffff\u2600-\u27bf]", "", texto)
    texto = re.sub(r"[*_#`~<>\[\]{}|^\"«»]", " ", texto)
    texto = texto.replace("¿", "").replace("¡", "")
    texto = re.sub(r"[()…—–:;/\\]", ", ", texto)
    texto = unicodedata.normalize("NFC", texto)
    return re.sub(r"\s+", " ", texto).strip()

OUTDIR = os.path.join(tempfile.gettempdir(), "jarvis_piper")
PERSISTENTE = True  # Piper queda abierto con el modelo cargado; si falla, vuelve al modo simple

def log(msg):
    sys.stderr.write(msg + "\n"); sys.stderr.flush()

class PiperProc:
    """Un único proceso de Piper que sigue vivo (carga el modelo una sola vez)."""
    def __init__(self):
        self.p, self.speed, self.q = None, None, queue.Queue()

    def _reader(self, p, q):
        for line in p.stdout:
            q.put(line.decode("utf-8", "ignore").strip())

    def start(self, speed):
        self.stop()
        os.makedirs(OUTDIR, exist_ok=True)
        ls = round(1.0 / max(0.5, min(1.6, speed)), 3)  # length_scale: >1 = más lento
        self.q = queue.Queue()
        self.p = subprocess.Popen([PIPER_BIN, "--model", PIPER_MODEL, "--json-input", "--output_dir", OUTDIR, "--length_scale", str(ls)],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, creationflags=NO_WINDOW)
        threading.Thread(target=self._reader, args=(self.p, self.q), daemon=True).start()
        self.speed = speed

    def stop(self):
        if self.p and self.p.poll() is None:
            self.p.kill()
        self.p = None

    def synth(self, frase, speed):
        if self.p is None or self.p.poll() is not None or self.speed != speed:
            self.start(speed)
        self.p.stdin.write((json.dumps({"text": frase}, ensure_ascii=False) + "\n").encode("utf-8"))
        self.p.stdin.flush()
        path = self.q.get(timeout=40)
        if not os.path.isfile(path):
            raise RuntimeError("Piper no devolvió un archivo: " + path[:80])
        return path

piper = PiperProc()

def sintetizar(frase, speed):
    global PERSISTENTE
    import soundfile as sf
    t0 = time.time()
    frase = frase.replace("!", ".")
    data = None
    if PERSISTENTE:
        try:
            wav = piper.synth(frase, speed)
            data, sr = sf.read(wav, dtype="float32")
            os.remove(wav)
        except Exception as e:
            PERSISTENTE = False; piper.stop()
            log("[voz] Piper persistente falló (" + str(e) + "); uso el modo simple")
    if data is None:
        wav = os.path.join(tempfile.gettempdir(), "jarvis_tts.wav")
        ls = round(1.0 / max(0.5, min(1.6, speed)), 3)
        p = subprocess.run([PIPER_BIN, "--model", PIPER_MODEL, "--output_file", wav, "--length_scale", str(ls)],
                           input=frase.encode("utf-8"), capture_output=True, creationflags=NO_WINDOW)
        if p.returncode != 0:
            raise RuntimeError("Piper falló: " + p.stderr.decode(errors="ignore")[:200])
        data, sr = sf.read(wav, dtype="float32")
    log("[voz] %.1f s (%s) para: %s" % (time.time() - t0, "persistente" if PERSISTENTE else "simple", frase[:40]))
    return (data if data.ndim == 1 else data.mean(axis=1)), sr

def warm_piper():
    try:
        sintetizar("Listo.", 1.0)
    except Exception as e:
        log("[voz] precarga de Piper fallida: " + str(e))

def efecto(audio, sr, e):
    """Efecto Jarvis (e de 0 a 1): voz algo más grave y pausada (reproduce a menor frecuencia) + eco corto."""
    if e <= 0:
        return audio, sr
    sr2 = int(sr * (1 - 0.08 * e))
    out = np.concatenate([audio, np.zeros(int(sr2 * 0.25), dtype=np.float32)])
    for d, g in ((0.045, 0.22), (0.09, 0.14), (0.15, 0.08)):
        n = int(sr2 * d)
        out[n:n + len(audio)] += audio * g * e
    pico = float(np.max(np.abs(out))) or 1.0
    if pico > 1.0:
        out = out / pico
    return out.astype(np.float32), sr2

def finish(g):
    global outstanding, speaking
    with state_lock:
        if g != gen:
            return
        outstanding = max(0, outstanding - 1)
        if outstanding == 0 and speaking:
            speaking = False
            emit({"event": "speech", "state": "end"})

def synth_worker():
    while True:
        it = text_q.get(); g = it["gen"]
        if g != gen:
            continue
        try:
            texto = limpiar(it["text"])
            if not texto:
                finish(g); continue
            frases = re.split(r"(?<=[.!?])\s+", texto) if "!" in texto else [texto]
            partes, sr = [], 22050
            for f in frases:
                data, sr = sintetizar(f, it["speed"])
                if f.rstrip().endswith("!"):
                    data = np.clip(data * 1.25, -1.0, 1.0)  # un poquito más fuerte
                partes.append(data)
            audio, sr2 = efecto(np.concatenate(partes), sr, it["effect"])
            audio_q.put({"gen": g, "audio": np.clip(audio * it["volume"], -1.0, 1.0), "sr": sr2})
        except Exception as e:
            emit({"event": "error", "message": str(e)}); finish(g)

def player_worker():
    global speaking
    import sounddevice as sd
    while True:
        it = audio_q.get(); g = it["gen"]
        if g != gen:
            continue
        audio, sr = it["audio"], it["sr"]
        try:
            with state_lock:
                if g != gen:
                    continue
                if not speaking:
                    speaking = True
                    emit({"event": "speech", "state": "start"})
            sd.play(audio, sr)
            paso, t0, i = int(sr * 0.05), time.time(), 0
            while i < len(audio):
                if g != gen:
                    sd.stop(); break
                seg = audio[i:i + paso]
                level(min(1.0, float(np.sqrt(np.mean(seg ** 2))) * 5), "tts")
                i += paso
                time.sleep(max(0.0, t0 + i / sr - time.time()))
            else:
                sd.wait()
        except Exception as e:
            emit({"event": "error", "message": "Audio: " + str(e)})
        level(0, "tts")
        finish(g)

def set_voice(v):
    global PIPER_MODEL
    v = v.replace("\\", "/")
    full = os.path.abspath(v)
    if v == PIPER_MODEL or not full.startswith(os.path.abspath("voices")) or not full.endswith(".onnx") or not os.path.isfile(full):
        return
    PIPER_MODEL = v
    piper.stop()
    log("[voz] voz cambiada a " + v)

def say(req):
    if req.get("voice"):
        set_voice(str(req.get("voice")))
    global outstanding
    with state_lock:
        outstanding += 1
        g = gen
    text_q.put({"gen": g, "text": str(req.get("text", "")),
                "speed": float(req.get("speed", 1.0)), "volume": float(req.get("volume", 1.0)),
                "effect": max(0.0, min(1.0, float(req.get("effect", 0)) / 100.0))})

def do_stop():
    global gen, outstanding, speaking
    import sounddevice as sd
    with state_lock:
        gen += 1; outstanding = 0
        for q in (text_q, audio_q):
            try:
                while True:
                    q.get_nowait()
            except queue.Empty:
                pass
        was, speaking = speaking, False
    try:
        sd.stop()
    except Exception:
        pass
    level(0, "tts")
    if was:
        emit({"event": "speech", "state": "end"})

_music_stop = threading.Event()
_music_thread = None

def music_running():
    return _music_thread is not None and _music_thread.is_alive() and not _music_stop.is_set()

def _music_loop():
    try:
        import soundcard as sc
        spk = sc.default_speaker()
        mic = sc.get_microphone(id=str(spk.name), include_loopback=True)
        thr = float(os.environ.get("MUSIC_THRESHOLD", "0.006"))
        win, playing, last = [], False, 0.0
        with mic.recorder(samplerate=48000) as rec:
            while not _music_stop.is_set():
                data = rec.record(numframes=12000)  # bloques de 0,25 s
                if data is None or len(data) == 0:
                    time.sleep(0.05); continue
                rms = float(np.sqrt(np.mean(np.square(data))))
                if speaking or outstanding > 0:
                    rms = 0.0  # la voz de Nova no cuenta como musica
                win = (win + [rms])[-8:]
                now_playing = len(win) >= 8 and sum(1 for v in win if v > thr) >= 6  # sonido sostenido durante ~2 s
                if now_playing != playing or time.time() - last > 2.0:
                    playing, last = now_playing, time.time()
                    emit({"event": "music", "playing": playing, "level": round(min(1.0, sum(win) / len(win) * 6), 3)})
    except Exception as e:
        emit({"event": "error", "message": "Modo musica: " + str(e)})
    finally:
        emit({"event": "music", "playing": False, "level": 0.0})
        emit({"event": "musicmode", "state": "off"})

def music_set(on):
    global _music_thread
    if on and not music_running():
        _music_stop.clear()
        _music_thread = threading.Thread(target=_music_loop, daemon=True)
        _music_thread.start()
    elif not on:
        _music_stop.set()
    emit({"event": "musicmode", "state": "on" if on else "off"})
    return on

def handle(req):
    out = {"id": req.get("id")}
    try:
        if req["cmd"] == "listen":
            out["text"] = listen_and_transcribe(lambda v: level(v, "mic"), lambda p: emit({"event": "listen", "state": p}))
        elif req["cmd"] == "warmup":
            warmup(); out["ok"] = True
    except Exception as e:
        out["error"] = str(e)
    emit(out)

def main():
    set_speaking_probe(lambda: speaking or outstanding > 0)  # para que el modo Discord no transcriba a Jarvis
    threading.Thread(target=warm_piper, daemon=True).start()  # carga el modelo de voz al arrancar
    threading.Thread(target=synth_worker, daemon=True).start()
    threading.Thread(target=player_worker, daemon=True).start()
    for line in sys.stdin:
        try:
            req = json.loads(line)
        except Exception:
            continue
        cmd = req.get("cmd")
        try:
            if cmd in ("say", "speak"):
                say(req); emit({"id": req.get("id"), "ok": True})
            elif cmd == "loopback":
                want = req.get("on")
                on = (not loopback_running()) if want is None else bool(want)
                if on:
                    start_loopback(lambda t: emit({"event": "heard", "source": "loopback", "text": t}),
                                   lambda e: emit({"event": "error", "message": "Modo Discord: " + e}))
                else:
                    stop_loopback()
                emit({"event": "loopback", "state": "on" if on else "off"})
                emit({"id": req.get("id"), "ok": True, "on": on})
            elif cmd == "music":
                want = req.get("on")
                on = music_set((not music_running()) if want is None else bool(want))
                emit({"id": req.get("id"), "ok": True, "on": on})
            elif cmd == "cancel":
                cancel_listen(); emit({"id": req.get("id"), "ok": True})
            elif cmd == "stop":
                do_stop(); emit({"id": req.get("id"), "ok": True})
            else:
                threading.Thread(target=handle, args=(req,), daemon=True).start()
        except Exception as e:
            emit({"id": req.get("id"), "error": str(e)})

if __name__ == "__main__":
    main()
