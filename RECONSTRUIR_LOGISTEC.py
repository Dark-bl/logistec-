#!/usr/bin/env python3
"""Reconstruct LOGISTEC's source tree from the flat files uploaded to GitHub."""
from pathlib import Path, PurePosixPath
import json
import shutil
import sys

ROOT = Path(__file__).resolve().parent
MAP = ROOT / "MAPA_ARCHIVOS_LOGISTEC.json"
if not MAP.is_file():
    raise SystemExit("ERROR: falta MAPA_ARCHIVOS_LOGISTEC.json")

manifest = json.loads(MAP.read_text(encoding="utf-8"))
entries = manifest.get("files", {})
if not isinstance(entries, dict) or not entries:
    raise SystemExit("ERROR: el mapa no contiene archivos para reconstruir")

missing = []
written = 0
for flat_name, relative_name in entries.items():
    source = ROOT / flat_name
    relative = PurePosixPath(relative_name)
    if relative.is_absolute() or ".." in relative.parts:
        raise SystemExit(f"ERROR: ruta de destino no permitida: {relative_name}")
    if not source.is_file():
        missing.append(flat_name)
        continue
    target = ROOT.joinpath(*relative.parts)
    target.parent.mkdir(parents=True, exist_ok=True)
    if source.resolve() != target.resolve():
        shutil.copy2(source, target)
    written += 1

if missing:
    print("Archivos planos faltantes:")
    for name in missing:
        print(f" - {name}")
    raise SystemExit(2)

required = [
    ROOT / "mobile/package.json",
    ROOT / "mobile/scripts/CONFIGURAR_ANDROID_CI.sh",
    ROOT / "mobile/capacitor.config.ts",
]
missing_required = [str(p.relative_to(ROOT)) for p in required if not p.is_file()]
if missing_required:
    print("No se reconstruyeron los archivos esenciales:")
    for name in missing_required:
        print(f" - {name}")
    raise SystemExit(3)

print(f"LOGISTEC reconstruido correctamente: {written} archivos ubicados en sus carpetas.")
