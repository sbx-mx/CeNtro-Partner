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

EXCEL_PATHS = (
    "public/data/Base_CeNtro Partner.xlsx",
    "docs/data/Base_CeNtro Partner.xlsx",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_output(name: str, value: str) -> None:
    if "\n" in value or "\r" in value:
        raise ValueError("Salida de GitHub inválida.")
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with Path(output).open("a", encoding="utf-8") as target:
            target.write(f"{name}={value}\n")
    print(json.dumps({name: value}, ensure_ascii=False))


def resolve_excel(project: Path) -> str:
    candidates: list[tuple[int, int, str]] = []
    for relative in EXCEL_PATHS:
        path = project / relative
        if not path.is_file():
            continue
        try:
            issues = audit_workbook(path)["issueCount"]
        except (OSError, ValueError):
            issues = 1_000_000
        completed = subprocess.run(
            ["git", "log", "-1", "--format=%ct", "--", relative],
            cwd=project,
            check=False,
            capture_output=True,
            text=True,
        )
        timestamp = int(completed.stdout.strip() or 0)
        candidates.append((issues, -timestamp, relative))
    if not candidates:
        raise SystemExit("No se encontró un Excel motor candidato.")
    candidates.sort()
    best = candidates[0]
    tied = [item for item in candidates if item[:2] == best[:2]]
    if len(tied) > 1:
        hashes = {sha256(project / item[2]) for item in tied}
        if len(hashes) > 1:
            raise SystemExit("Los Excel candidatos difieren y no puede determinarse cuál es el más reciente.")
    if best[0]:
        raise SystemExit("Ningún Excel motor candidato supera la validación.")
    return best[2]


def detect(before: str, after: str, force: bool, project: Path) -> None:
    if force:
        write_output("excel_source", resolve_excel(project))
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
    workbook_changes = changed.intersection(EXCEL_PATHS)
    excel_only = bool(workbook_changes) and changed == workbook_changes
    source = ""
    if excel_only:
        if len(workbook_changes) == 1:
            source = next(iter(workbook_changes))
        else:
            source = resolve_excel(project)
        report = audit_workbook(project / source)
        if report["issueCount"]:
            raise SystemExit(f"Actualización cancelada: {report['issueCount']} errores bloqueantes en {source}.")
        write_output("excel_source", source)
    write_output("excel_only", "true" if excel_only else "false")


def release_metadata(report: dict, index: Path, output: Path) -> dict:
    metadata = {
        "schemaVersion": 1,
        "excelSha256": report["sha256"],
        "indexSha256": sha256(index),
        "stores": next(item["validCeCos"] for item in report["sheets"] if item["sheet"] == "Directorio"),
        "latestPeriod": report["periodCoverage"]["latestPeriod"],
        "warningCount": report["warningCount"],
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


def stage(project: Path, output: Path, excel: Path) -> None:
    project = project.resolve()
    source_site = project / "docs"
    source_excel = (project / excel).resolve() if not excel.is_absolute() else excel.resolve()
    output = (project / output).resolve() if not output.is_absolute() else output.resolve()

    if not source_site.joinpath("index.html").is_file():
        raise SystemExit("No existe docs/index.html para conservar la interfaz publicada.")
    allowed_sources = {(project / relative).resolve() for relative in EXCEL_PATHS}
    if source_excel not in allowed_sources or not source_excel.is_file():
        raise SystemExit("El Excel debe ser uno de los orígenes autorizados del proyecto.")
    if output in {project, source_site.resolve(), (project / "public").resolve()} or project not in output.parents:
        raise SystemExit("La salida seleccionada no es segura.")
    if any(path.is_symlink() for path in source_site.rglob("*")):
        raise SystemExit("Seguridad: docs contiene enlaces simbólicos.")

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
        backup = output.with_name(f".{output.name}.backup")
        if backup.exists():
            shutil.rmtree(backup)
        if output.exists():
            os.replace(output, backup)
        try:
            os.replace(staged, output)
        except BaseException:
            if backup.exists() and not output.exists():
                os.replace(backup, output)
            raise
        else:
            if backup.exists():
                shutil.rmtree(backup)

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
    detect_parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    resolve_parser = commands.add_parser("resolve")
    resolve_parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    stage_parser = commands.add_parser("stage")
    stage_parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    stage_parser.add_argument("--output", type=Path, default=Path("dist"))
    stage_parser.add_argument("--excel", type=Path, required=True)
    metadata_parser = commands.add_parser("metadata")
    metadata_parser.add_argument("--excel", type=Path, required=True)
    metadata_parser.add_argument("--index", type=Path, required=True)
    metadata_parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if args.command == "detect":
        detect(args.before, args.after, args.force, args.project.resolve())
    elif args.command == "resolve":
        write_output("excel_source", resolve_excel(args.project.resolve()))
    elif args.command == "stage":
        stage(args.project, args.output, args.excel)
    else:
        metadata(args.excel, args.index, args.output)


if __name__ == "__main__":
    main()
