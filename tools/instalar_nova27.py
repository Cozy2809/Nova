from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

FILES = [
    "electron/pcControl.js",
    "src/utils/intents_extra.js",
    "src/utils/pcTasks.js",
    "src/utils/persona.js",
]


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description="Instalador seguro de Nova update 27")
    ap.add_argument("--revertir", action="store_true", help="restaura las copias .bak-nova27")
    ap.add_argument("--project", type=Path, default=Path.cwd(), help="carpeta del proyecto Nova")
    args = ap.parse_args()
    project = args.project.resolve()
    package = Path(__file__).resolve().parents[1]
    manifest_file = package / "tools" / "nova27_base_hashes.json"

    if args.revertir:
        for rel in reversed(FILES):
            target = project / rel
            backup = target.with_name(target.name + ".bak-nova27")
            if backup.exists():
                shutil.copy2(backup, target)
                print("Restaurado:", rel)
            else:
                print("Sin copia:", rel)
        return 0

    if not manifest_file.exists():
        print("Falta el manifiesto de esta actualización.", file=sys.stderr)
        return 2
    base = json.loads(manifest_file.read_text(encoding="utf-8-sig"))
    # Comprueba todos los destinos antes de cambiar ninguno.
    for rel in FILES:
        target, source = project / rel, package / rel
        if not target.is_file() or not source.is_file():
            print("Falta un archivo requerido:", rel, file=sys.stderr)
            return 2
        current = digest(target)
        if current not in {base[rel], digest(source)}:
            print("Versión inesperada; no se aplicó ningún cambio:", rel, file=sys.stderr)
            return 3

    for rel in FILES:
        target, source = project / rel, package / rel
        if digest(target) == digest(source):
            print("Ya estaba actualizado:", rel)
            continue
        backup = target.with_name(target.name + ".bak-nova27")
        if not backup.exists():
            shutil.copy2(target, backup)
        temp = target.with_name(target.name + ".nova27.tmp")
        shutil.copy2(source, temp)
        temp.replace(target)
        print("Actualizado:", rel)
    print("Update 27 aplicada. Ejecuta npm run build y reinicia Nova.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
