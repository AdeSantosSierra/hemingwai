import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "src")
if SRC not in sys.path:
    sys.path.insert(0, SRC)

from section_summaries import FALLBACK_SUMMARY, normalize_section_summaries_output  # noqa: E402


def run_selfcheck() -> None:
    sections_analysis = {
        "fiabilidad": "x" * 120,
        "adecuacion": "y" * 120,
        "claridad": "z" * 120,
        "profundidad": "w" * 120,
        "enfoque": "q" * 20,
    }
    raw = {
        "fiabilidad": "Linea 1\nLinea 2",
        "adecuacion": "Linea 1\nLinea 2\nLinea 3\nLinea 4\nLinea 5",
        "claridad": "- item 1\n- item 2",
        "profundidad": "Una sola linea",
        "enfoque": "Linea 1\nLinea 2",
    }

    out = normalize_section_summaries_output(sections_analysis, raw)

    assert out["fiabilidad"] == "Linea 1\nLinea 2"
    assert out["adecuacion"] == "Linea 1\nLinea 2\nLinea 3\nLinea 4"
    assert out["claridad"] == "item 1\nitem 2"
    assert out["profundidad"] == FALLBACK_SUMMARY
    assert out["enfoque"] == FALLBACK_SUMMARY

    print("OK: section_summaries validation self-check passed")


if __name__ == "__main__":
    run_selfcheck()
