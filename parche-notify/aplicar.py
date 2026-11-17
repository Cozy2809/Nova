# -*- coding: utf-8 -*-
"""Aplica (o revierte) el parche de notificaciones de J.A.R.V.I.S.

Uso (desde la carpeta jarvis-clone):
    python parche-notify\\aplicar.py            # aplicar
    python parche-notify\\aplicar.py --revertir # deshacer con la última copia
"""
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = Path.cwd()
MARK = "// parche-notify"
LINE = "require('./notify.js').install(); " + MARK
NEW_FILES = ["electron/notify.js", "electron/notifyIntents.js"]
BACKUP_GLOB = ".backup-notify-*"


def fail(msg):
    print("ERROR:", msg)
    sys.exit(1)


def read(p):
    with open(p, "r", encoding="utf-8", newline="") as f:
        return f.read()


def write(p, s):
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(s)


def node_check(p):
    try:
        r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True, shell=False)
    except FileNotFoundError:
        print("  (node no encontrado, me salto la comprobación de sintaxis)")
        return True
    if r.returncode != 0:
        print(r.stderr.strip())
        return False
    return True


def revert():
    backups = sorted(ROOT.glob(BACKUP_GLOB))
    if not backups:
        fail("No hay copias .backup-notify-* en esta carpeta.")
    b = backups[0]  # la más antigua = tu código original
    print("Restaurando desde", b.name)
    for rel in ["electron/main.js", "electron/notify.js"]:
        src = b / rel
        if src.exists():
            shutil.copy2(src, ROOT / rel)
            print("  restaurado", rel)
    if not (b / "electron/notifyIntents.js").exists():
        (ROOT / "electron/notifyIntents.js").unlink(missing_ok=True)
        print("  eliminado electron/notifyIntents.js")
    for extra in backups:
        shutil.rmtree(extra, ignore_errors=True)
    print("Hecho. Copias de seguridad eliminadas. Reinicia la app.")


def apply():
    main = ROOT / "electron" / "main.js"
    if not main.exists():
        fail("No encuentro electron\\main.js. Ejecuta esto desde la carpeta jarvis-clone.")
    for rel in NEW_FILES:
        if not (HERE / "files" / rel).exists():
            fail(f"Falta {rel} dentro de parche-notify\\files. ¿Descomprimiste el zip entero?")

    src = read(main)
    lines = src.splitlines(keepends=True)
    head = "".join(lines[:80])
    if any(l.lstrip().startswith("import ") and " from " in l for l in lines[:80]) and "require(" not in head:
        fail("main.js parece ESM (import ... from). Este parche espera CommonJS; no he tocado nada.")

    # 1) Copia de seguridad (solo la primera vez: así siempre guarda tu código original)
    if MARK in src:
        print("El parche ya estaba aplicado: actualizo archivos sin nueva copia de seguridad")
    else:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        bdir = ROOT / f".backup-notify-{stamp}"
        for rel in ["electron/main.js", "electron/notify.js", "electron/notifyIntents.js"]:
            p = ROOT / rel
            if p.exists():
                (bdir / rel).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(p, bdir / rel)
        bdir.mkdir(exist_ok=True)
        print("Copia de seguridad en", bdir.name)

    # 2) Archivos nuevos
    for rel in NEW_FILES:
        shutil.copy2(HERE / "files" / rel, ROOT / rel)
        print("  copiado", rel)

    # 3) Una línea al principio de main.js (antes de cualquier ipcMain.handle)
    if MARK in src:
        print("  main.js ya tenía el parche, no lo toco")
    else:
        nl = "\r\n" if "\r\n" in src else "\n"
        i = 0
        if lines and lines[0].startswith("\ufeff"):
            lines[0] = lines[0][1:]
        if lines and lines[0].startswith("#!"):
            i = 1
        if i < len(lines) and lines[i].strip().strip(";") in ("'use strict'", '"use strict"'):
            i += 1
        lines.insert(i, LINE + nl)
        write(main, "".join(lines))
        print("  añadida 1 línea a electron/main.js (línea", i + 1, ")")

    # 4) Comprobación de sintaxis
    ok = all(node_check(ROOT / rel) for rel in ["electron/main.js"] + NEW_FILES)
    if not ok:
        print("Sintaxis incorrecta: revierto automáticamente.")
        revert()
        sys.exit(1)

    env = ROOT / ".env"
    if env.exists() and "NTFY_TOPIC" not in read(env):
        print("\nAviso: .env no tiene NTFY_TOPIC; configura un tema propio antes de enviar avisos.")
    print("\nParche aplicado. Prueba ahora:  node electron\\notify.js \"Hola desde JARVIS\"")


if __name__ == "__main__":
    revert() if "--revertir" in sys.argv else apply()
