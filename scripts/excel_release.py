#!/usr/bin/env python3
"""Detecta cambios exclusivos de Excel y prepara Pages sin alterar index.html."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from validate_workbook import audit_workbook

EXCEL_PATH = "public/data/Base_CeNtro Partner.xlsx"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_output(name: str, value: str) -> None:
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with Path(output).open("a", encoding="utf-8") as target:
            target.write(f"{name}={value}\n")
    print(json.dumps({name: value}, ensure_ascii=False))


def detect(before: str, after: str, force: bool) -> None:
    if force:
        write_output("excel_only", "true")
        return
    if not before or not after or set(before) == {"0"}:
        write_output("excel_only", "false")
        return
    completed = subprocess.run(
        ["git", "diff", "--name-only", before, after],
        check=True,
        capture_output=True,
        text=True,
    )
    changed = {line.strip() for line in completed.stdout.splitlines() if line.strip()}
    write_output("excel_only", "true" if changed == {EXCEL_PATH} else "false")


def release_metadata(report: dict, index: Path, output: Path) -> dict:
    metadata = {
        "schemaVersion": 1,
        "excelSha256": report["sha256"],
        "indexSha256": sha256(index),
        "stores": next(item["validCeCos"] for item in report["sheets"] if item["sheet"] == "Directorio"),
        "createdAt": datetime.now(UTC).isoformat(),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(metadata, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return metadata


def metadata(excel: Path, index: Path, output: Path) -> None:
    report = audit_workbook(excel.resolve())
    if report["issueCount"]:
        raise SystemExit(f"Metadatos cancelados: {report['issueCount']} errores bloqueantes.")
    result = release_metadata(report, index.resolve(), output.resolve())
    print(json.dumps({"status": "ready", **result, "output": str(output.resolve())}, ensure_ascii=False))


def stage(project: Path, output: Path) -> None:
    project = project.resolve()
    source_site = project / "docs"
    source_excel = project / EXCEL_PATH
    output = (project / output).resolve() if not output.is_absolute() else output.resolve()

    if not source_site.joinpath("index.html").is_file():
        raise SystemExit("No existe docs/index.html para conservar la interfaz publicada.")
    if not source_excel.is_file():
        raise SystemExit(f"No existe {EXCEL_PATH}.")
    if output in {project, source_site.resolve(), (project / "public").resolve()}:
        raise SystemExit("La salida seleccionada no es segura.")

    report = audit_workbook(source_excel)
    if report["issueCount"]:
        raise SystemExit(f"Publicación cancelada: {report['issueCount']} errores bloqueantes.")

    index_hash = sha256(source_site / "index.html")
    with tempfile.TemporaryDirectory(prefix="centro-excel-release-", dir=project) as temporary:
        staged = Path(temporary) / "site"
        shutil.copytree(source_site, staged)
        staged_data = staged / "data"
        staged_data.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_excel, staged_data / "Base_CeNtro Partner.xlsx")
        (staged_data / "workbook-audit.json").write_text(
            json.dumps(report, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        release_metadata(report, staged / "index.html", staged_data / "excel-release.json")
        if sha256(staged / "index.html") != index_hash:
            raise SystemExit("Seguridad: index.html cambió durante la preparación.")
        if output.exists():
            shutil.rmtree(output)
        shutil.copytree(staged, output)

    print(json.dumps({
        "status": "ready",
        "output": str(output),
        "excelSha256": report["sha256"],
        "indexSha256": index_hash,
        "warnings": report["warningCount"],
    }, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    detect_parser = commands.add_parser("detect")
    detect_parser.add_argument("--before", default="")
    detect_parser.add_argument("--after", default="")
    detect_parser.add_argument("--force", action="store_true")
    stage_parser = commands.add_parser("stage")
    stage_parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    stage_parser.add_argument("--output", type=Path, default=Path("dist"))
    metadata_parser = commands.add_parser("metadata")
    metadata_parser.add_argument("--excel", type=Path, required=True)
    metadata_parser.add_argument("--index", type=Path, required=True)
    metadata_parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if args.command == "detect":
        detect(args.before, args.after, args.force)
    elif args.command == "stage":
        stage(args.project, args.output)
    else:
        metadata(args.excel, args.index, args.output)


if __name__ == "__main__":
    main()
