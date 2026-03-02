import json
import os
import subprocess
import tempfile

from fact_checking_wrapper import run_fact_checking


DOC_ID = "64b7d5f9a9f31d9a4f8b1234"


def _assert(cond, msg):
    if not cond:
        raise AssertionError(msg)


def _fake_executor_insufficient(*args, **kwargs):
    return subprocess.CompletedProcess(
        args=args[0],
        returncode=1,
        stdout=b"",
        stderr=b"HTTP 402 insufficient credits",
    )


def _fake_executor_available_factory(output_dir):
    def _executor(*args, **kwargs):
        payload = {
            "noticia_id": DOC_ID,
            "analisis": "Analisis de prueba.",
            "fuentes": ["https://example.com/source"],
        }
        out = os.path.join(output_dir, "fact_check_analisis.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        return subprocess.CompletedProcess(args=args[0], returncode=0, stdout=b"ok", stderr=b"")

    return _executor


def run_selfcheck():
    with tempfile.TemporaryDirectory() as tmpdir:
        # Caso 1: deshabilitado por flag
        skipped = run_fact_checking(
            {
                "noticia_id": DOC_ID,
                "output_dir": tmpdir,
                "src_dir": tmpdir,
                "venv_python": "python3",
                "enable_fact_checking": False,
                "persist_to_mongo": False,
                "write_artifact": False,
                "logger": lambda *_args, **_kwargs: None,
            }
        )
        _assert(skipped["fact_checking"]["status"] == "skipped", "Debe quedar skipped")
        _assert(skipped["fact_checking"]["reason"] == "disabled_by_flag", "Reason skipped inválido")

        # Caso 2: proveedor KO (402 / créditos)
        unavailable = run_fact_checking(
            {
                "noticia_id": DOC_ID,
                "output_dir": tmpdir,
                "src_dir": tmpdir,
                "venv_python": "python3",
                "enable_fact_checking": True,
                "perplexity_api_key": "test-key",
                "executor": _fake_executor_insufficient,
                "persist_to_mongo": False,
                "write_artifact": False,
                "logger": lambda *_args, **_kwargs: None,
            }
        )
        _assert(unavailable["fact_checking"]["status"] == "unavailable", "Debe quedar unavailable")
        _assert(
            unavailable["fact_checking"]["reason"] == "insufficient_credits",
            "Reason unavailable inválido",
        )

        # Caso 3: proveedor OK
        available = run_fact_checking(
            {
                "noticia_id": DOC_ID,
                "output_dir": tmpdir,
                "src_dir": tmpdir,
                "venv_python": "python3",
                "enable_fact_checking": True,
                "perplexity_api_key": "test-key",
                "executor": _fake_executor_available_factory(tmpdir),
                "persist_to_mongo": False,
                "write_artifact": False,
                "logger": lambda *_args, **_kwargs: None,
            }
        )
        _assert(available["fact_checking"]["status"] == "available", "Debe quedar available")
        _assert(available["pipeline_step"]["status"] == "success", "Pipeline step debe quedar success")

    print("OK: fact_checking self-check passed")


if __name__ == "__main__":
    run_selfcheck()
