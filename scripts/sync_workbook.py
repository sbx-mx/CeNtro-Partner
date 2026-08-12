#!/usr/bin/env python3
"""Valida y sincroniza de forma atómica el Excel motor de CeNtro Partner."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path

from validate_workbook import audit_workbook


@contextmanager
def project_lock(project: Path):
    lock_name = hashlib.sha256(str(project).encode("utf-8")).hexdigest()[:20]
    lock_directory = project / ".git" if (project / ".git").is_dir() else project
    lock_path = lock_directory / f"centro-partner-{lock_name}.lock"
    with lock_path.open("w", encoding="utf-8") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def atomic_write(destination: Path, content: bytes) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{destination.name}.", dir=destination.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Nuevo archivo .xlsx")
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--target", choices=("both", "public", "docs"), default="both")
    args = parser.parse_args()

    source = args.source.resolve()
    if source.suffix.casefold() != ".xlsx" or not source.is_file():
        raise SystemExit("El origen debe ser un archivo .xlsx existente.")

    report = audit_workbook(source)
    if report["issueCount"]:
        raise SystemExit(f"Sincronización cancelada: {report['issueCount']} errores bloqueantes.")

    project = args.project.resolve()
    if not project.is_dir():
        raise SystemExit("El proyecto indicado no existe.")
    target_names = ("public", "docs") if args.target == "both" else (args.target,)
    destinations = [project / name / "data" / "Base_CeNtro Partner.xlsx" for name in target_names]
    audit_destinations = [destination.with_name("workbook-audit.json") for destination in destinations]
    workbook_bytes = source.read_bytes()
    audit_bytes = json.dumps(report, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    with project_lock(project):
        for destination, audit_destination in zip(destinations, audit_destinations, strict=True):
            atomic_write(destination, workbook_bytes)
            atomic_write(audit_destination, audit_bytes)
        for destination in destinations:
            if hashlib.sha256(destination.read_bytes()).hexdigest() != report["sha256"]:
                raise SystemExit(f"Verificación posterior fallida: {destination}")

    directory_audit = next(item for item in report["sheets"] if item["sheet"] == "Directorio")
    print(json.dumps({
        "updated": [str(destination) for destination in destinations],
        "stores": directory_audit["validCeCos"],
        "warnings": report["warningCount"],
        "latestPeriod": report["periodCoverage"]["latestPeriod"],
        "sha256": report["sha256"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
