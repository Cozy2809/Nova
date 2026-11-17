from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

FILES = [
    "electron/desktop/index.js",
    "electron/main.js",
    "index.html",
    "src/App.jsx",
    "src/components/AudioOrb.jsx",
    "src/desktop/WindowsWidgets.jsx",
    "src/desktop/desktop.css",
    "src/desktop/prefs.js",
]
NEW_FILES = ["electron/discordPresence.js"]


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Instalador seguro de Nova update 28")
    parser.add_argument("--revertir", action="store_true", help="restaura los respaldos .bak-nova28")
    parser.add_argument("--project", type=Path, default=Path.cwd(), help="carpeta del proyecto Nova")
    args = parser.parse_args()
    project = args.project.resolve()
    package = Path(__file__).resolve().parents[1]
    manifest_path = package / "tools" / "nova28_base_hashes.json"

    if args.revertir:
        for rel in reversed(FILES):
            target = project / rel
            backup = target.with_name(target.name + ".bak-nova28")
            if backup.is_file():
                shutil.copy2(backup, target)
                print("Restaurado:", rel)
        for rel in NEW_FILES:
            target = project / rel
            backup = target.with_name(target.name + ".bak-nova28")
            if backup.is_file():
                shutil.copy2(backup, target)
                print("Restaurado:", rel)
            elif target.is_file() and (package / rel).is_file() and digest(target) == digest(package / rel):
                target.unlink()
                print("Eliminado archivo añadido:", rel)
        return 0

    if not manifest_path.is_file():
        print("Falta el manifiesto de esta actualización.", file=sys.stderr)
        return 2
    base = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    # Preflight completo: evita modificaciones parciales si un archivo no coincide.
    for rel in FILES:
        target, source = project / rel, package / rel
        if not target.is_file() or not source.is_file():
            print("Falta un archivo requerido:", rel, file=sys.stderr)
            return 2
        if digest(target) not in {base[rel], digest(source)}:
            print("Versión inesperada; no se aplicó ningún cambio:", rel, file=sys.stderr)
            return 3
    for rel in NEW_FILES:
        target, source = project / rel, package / rel
        if not source.is_file() or (target.exists() and (not target.is_file() or digest(target) != digest(source))):
            print("El nuevo archivo ya existe con contenido distinto; no se aplicó ningún cambio:", rel, file=sys.stderr)
            return 3

    for rel in FILES + NEW_FILES:
        target, source = project / rel, package / rel
        if target.is_file() and digest(target) == digest(source):
            print("Ya estaba actualizado:", rel)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        backup = target.with_name(target.name + ".bak-nova28")
        if target.exists() and not backup.exists():
            shutil.copy2(target, backup)
        tmp = target.with_name(target.name + ".nova28.tmp")
        shutil.copy2(source, tmp)
        tmp.replace(target)
        print("Actualizado:", rel)
    print("Update 28 aplicada. Ejecuta npm run build y reinicia Nova.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
