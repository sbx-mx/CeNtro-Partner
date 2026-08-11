#!/usr/bin/env python3
"""Valida y sincroniza de forma atómica el Excel motor de CeNtro Partner."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import tempfile
from pathlib import Path

from validate_workbook import audit_workbook


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Nuevo archivo .xlsx")
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()

    source = args.source.resolve()
    if source.suffix.casefold() != ".xlsx" or not source.is_file():
        raise SystemExit("El origen debe ser un archivo .xlsx existente.")

    report = audit_workbook(source)
    if report["issueCount"]:
        raise SystemExit(f"Sincronización cancelada: {report['issueCount']} errores bloqueantes.")

    data_dir = args.project.resolve() / "public" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    destination = data_dir / "Base_CeNtro Partner.xlsx"
    audit_destination = data_dir / "workbook-audit.json"

    with tempfile.NamedTemporaryFile(dir=data_dir, suffix=".xlsx", delete=False) as temporary:
        temporary_path = Path(temporary.name)
    try:
        shutil.copy2(source, temporary_path)
        os.replace(temporary_path, destination)
    finally:
        temporary_path.unlink(missing_ok=True)

    audit_destination.write_text(
        json.dumps(report, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    directory_audit = next(item for item in report["sheets"] if item["sheet"] == "Directorio")
    print(json.dumps({
        "updated": str(destination),
        "stores": directory_audit["validCeCos"],
        "warnings": report["warningCount"],
        "sha256": report["sha256"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
