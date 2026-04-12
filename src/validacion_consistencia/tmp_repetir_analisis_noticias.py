#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, Iterable


BASE_DIR = Path(__file__).resolve().parent
SRC_DIR = BASE_DIR.parent
ROOT_DIR = SRC_DIR.parent
JSON_OUTPUT_DIR = BASE_DIR / "json"
PIPELINE_SCRIPT = SRC_DIR / "analiza_y_guarda.py"
RETRIEVED_FILE = ROOT_DIR / "output_temporal" / "retrieved_news_item.txt"
DEFAULT_PYTHON = ROOT_DIR / ".venv" / "bin" / "python"

DEFAULT_PREFIX_BY_ID: Dict[str, str] = {
    "6943d61c8a3fcd3af7663ee3": "A",
    "69b32c88c269d89e0a66620d": "B",
    "69979303c1b938e19e4dcacc": "E",
}

OBJECT_ID_RE = re.compile(r"^[a-f0-9]{24}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Ejecuta varias veces el pipeline existente de analiza_y_guarda.py "
            "para un conjunto fijo de noticias y guarda cada JSON en "
            "src/validacion_consistencia/json con nomenclatura incremental."
        )
    )
    parser.add_argument(
        "--veces",
        type=int,
        default=5,
        help="Número de ejecuciones por noticia. Por defecto: 5.",
    )
    parser.add_argument(
        "--python-bin",
        default=str(DEFAULT_PYTHON),
        help=(
            "Intérprete de Python con el que lanzar analiza_y_guarda.py. "
            "Por defecto usa .venv/bin/python."
        ),
    )
    parser.add_argument(
        "--ids",
        nargs="+",
        default=list(DEFAULT_PREFIX_BY_ID.keys()),
        help=(
            "IDs de noticia a analizar. Por defecto usa los 3 IDs de la "
            "validación de consistencia."
        ),
    )
    return parser.parse_args()


def validate_ids(ids: Iterable[str]) -> None:
    invalid_ids = [news_id for news_id in ids if not OBJECT_ID_RE.fullmatch(news_id)]
    if invalid_ids:
        raise ValueError(f"IDs inválidos: {', '.join(invalid_ids)}")


def extract_saved_id(payload: dict) -> str | None:
    raw_id = payload.get("_id")
    if isinstance(raw_id, str):
        return raw_id
    if isinstance(raw_id, dict):
        oid = raw_id.get("$oid")
        if isinstance(oid, str):
            return oid
    return None


def resolve_prefix(news_id: str) -> str:
    pattern = re.compile(rf"^([A-Z])\d+_{re.escape(news_id)}\.json$")
    existing_prefixes = {
        match.group(1)
        for path in JSON_OUTPUT_DIR.glob(f"*_{news_id}.json")
        if (match := pattern.match(path.name))
    }

    if len(existing_prefixes) > 1:
        raise RuntimeError(
            f"Se han encontrado varios prefijos para {news_id}: "
            f"{', '.join(sorted(existing_prefixes))}"
        )

    if existing_prefixes:
        return next(iter(existing_prefixes))

    prefix = DEFAULT_PREFIX_BY_ID.get(news_id)
    if prefix:
        return prefix

    raise RuntimeError(
        f"No hay un prefijo configurado para {news_id} y tampoco existe historial previo."
    )


def next_sequence_number(prefix: str, news_id: str) -> int:
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)_{re.escape(news_id)}\.json$")
    existing_numbers = []

    for path in JSON_OUTPUT_DIR.glob(f"{prefix}*_{news_id}.json"):
        match = pattern.match(path.name)
        if match:
            existing_numbers.append(int(match.group(1)))

    return (max(existing_numbers) + 1) if existing_numbers else 1


def run_existing_pipeline(python_bin: str, news_id: str) -> None:
    command = [python_bin, str(PIPELINE_SCRIPT), news_id]
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    subprocess.run(command, cwd=ROOT_DIR, env=env, check=True)


def persist_generated_json(destination: Path, expected_news_id: str) -> None:
    if not RETRIEVED_FILE.exists():
        raise FileNotFoundError(
            f"No se encontró el JSON generado por el pipeline en {RETRIEVED_FILE}"
        )

    content = RETRIEVED_FILE.read_text(encoding="utf-8")
    payload = json.loads(content)
    saved_id = extract_saved_id(payload)

    if saved_id != expected_news_id:
        raise RuntimeError(
            "El pipeline devolvió una noticia distinta a la solicitada. "
            f"Esperado={expected_news_id}, obtenido={saved_id}"
        )

    destination.write_text(content, encoding="utf-8")


def main() -> int:
    args = parse_args()
    validate_ids(args.ids)

    python_bin = Path(args.python_bin)
    if not python_bin.exists():
        raise FileNotFoundError(f"No existe el intérprete indicado: {python_bin}")

    if args.veces <= 0:
        raise ValueError("--veces debe ser mayor que 0")

    if not PIPELINE_SCRIPT.exists():
        raise FileNotFoundError(f"No existe el pipeline: {PIPELINE_SCRIPT}")

    JSON_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    generated_files = []
    total_runs = len(args.ids) * args.veces
    current_run = 0

    for news_id in args.ids:
        prefix = resolve_prefix(news_id)
        sequence = next_sequence_number(prefix, news_id)

        print(
            f"\nProcesando noticia {news_id} con prefijo {prefix}. "
            f"La primera salida nueva será {prefix}{sequence}_{news_id}.json"
        )

        for attempt in range(args.veces):
            current_run += 1
            filename = f"{prefix}{sequence + attempt}_{news_id}.json"
            destination = JSON_OUTPUT_DIR / filename

            print(f"\n[{current_run}/{total_runs}] Ejecutando pipeline para {filename}")
            run_existing_pipeline(str(python_bin), news_id)
            persist_generated_json(destination, news_id)
            generated_files.append(destination)
            print(f"Guardado {destination}")

    print("\nProceso completado. Archivos generados:")
    for path in generated_files:
        print(f"- {path}")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nEjecución interrumpida por el usuario.", file=sys.stderr)
        raise SystemExit(130)
