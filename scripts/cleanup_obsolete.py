#!/usr/bin/env python3
"""Elimina únicamente archivos explícitos, con vista previa como valor predeterminado."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ALLOWED_PREFIXES = ("docs/assets/", "docs/data/")
PROTECTED_NAMES = {"Base_CeNtro Partner.xlsx", "campaign.json", "workbook-audit.json"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--manifest", type=Path, default=Path("scripts/obsolete-files.json"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    root = args.root.resolve()
    manifest = json.loads((root / args.manifest).read_text(encoding="utf-8"))
    candidates = manifest.get("obsoleteFiles", [])
    approved: list[tuple[str, Path]] = []

    for raw in candidates:
        relative = Path(str(raw))
        normalized = relative.as_posix()
        if relative.is_absolute() or ".." in relative.parts:
            raise SystemExit(f"Ruta insegura: {raw}")
        if not normalized.startswith(ALLOWED_PREFIXES) or relative.name in PROTECTED_NAMES:
            raise SystemExit(f"Ruta fuera del alcance permitido: {raw}")
        target = (root / relative).resolve()
        if root not in target.parents:
            raise SystemExit(f"Ruta fuera del repositorio: {raw}")
        if target.is_dir():
            raise SystemExit(f"Solo se permiten archivos, no carpetas: {raw}")
        approved.append((normalized, target))

    removed: list[str] = []
    for normalized, target in approved:
        if args.apply and target.is_file():
            target.unlink()
            removed.append(normalized)

    print(json.dumps({
        "mode": "apply" if args.apply else "dry-run",
        "candidates": [item[0] for item in approved],
        "removed": removed,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
