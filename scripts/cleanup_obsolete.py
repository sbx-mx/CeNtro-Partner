#!/usr/bin/env python3
"""Elimina únicamente archivos explícitos, con vista previa como valor predeterminado."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ALLOWED_PREFIXES = ("docs/assets/", "docs/data/", "public/assets/")
ALLOWED_ROOT_FILES = {
    "excelService.ts",
    "index.css",
    "pages/RankingPage.tsx",
    "tsconfig.app.tsbuildinfo",
    "tsconfig.node.tsbuildinfo",
}
PROTECTED_NAMES = {"Base_CeNtro Partner.xlsx", "campaign.json", "workbook-audit.json"}
MAX_CANDIDATES = 100


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--manifest", type=Path, default=Path("scripts/obsolete-files.json"))
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--check-clean", action="store_true")
    parser.add_argument("--print-candidates", action="store_true")
    args = parser.parse_args()

    root = args.root.resolve()
    manifest = json.loads((root / args.manifest).read_text(encoding="utf-8"))
    candidates = manifest.get("obsoleteFiles", [])
    if not isinstance(candidates, list) or any(not isinstance(item, str) for item in candidates):
        raise SystemExit("El manifiesto debe contener una lista de rutas en obsoleteFiles")
    if len(candidates) != len(set(candidates)):
        raise SystemExit("El manifiesto contiene rutas duplicadas")
    if len(candidates) > MAX_CANDIDATES:
        raise SystemExit(f"El manifiesto supera el máximo seguro de {MAX_CANDIDATES} archivos")
    approved: list[tuple[str, Path]] = []

    for raw in candidates:
        relative = Path(str(raw))
        normalized = relative.as_posix()
        if relative.is_absolute() or ".." in relative.parts:
            raise SystemExit(f"Ruta insegura: {raw}")
        allowed_workbox = bool(re.fullmatch(r"docs/workbox-[A-Za-z0-9_-]+\.js", normalized))
        allowed_root = normalized in ALLOWED_ROOT_FILES
        if (not normalized.startswith(ALLOWED_PREFIXES) and not allowed_workbox and not allowed_root) or relative.name in PROTECTED_NAMES:
            raise SystemExit(f"Ruta fuera del alcance permitido: {raw}")
        unresolved_target = root / relative
        if unresolved_target.is_symlink():
            raise SystemExit(f"No se permiten enlaces simbólicos: {raw}")
        target = unresolved_target.resolve()
        if root not in target.parents:
            raise SystemExit(f"Ruta fuera del repositorio: {raw}")
        if target.is_dir():
            raise SystemExit(f"Solo se permiten archivos, no carpetas: {raw}")
        approved.append((normalized, target))

    if args.print_candidates:
        print("\n".join(item[0] for item in approved))
        return

    removed: list[str] = []
    for normalized, target in approved:
        if args.apply and target.is_file():
            target.unlink()
            removed.append(normalized)

    remaining = [normalized for normalized, target in approved if target.is_file()]

    print(json.dumps({
        "mode": "apply" if args.apply else "dry-run",
        "candidates": [item[0] for item in approved],
        "removed": removed,
        "remaining": remaining,
    }, ensure_ascii=False))
    if args.check_clean and remaining:
        raise SystemExit(f"Persisten {len(remaining)} archivos obsoletos")


if __name__ == "__main__":
    main()
