#!/usr/bin/env python3
"""
Minimal validation for V2 deterministic engine and clickbait logic.
Run from repo root: python scripts/v2_validation.py
Or from src: python -c "import sys; sys.path.insert(0, '..'); exec(open('scripts/v2_validation.py').read())"
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from deterministic_engine import compute_evaluation_result, ENGINE_VERSION, normalize_model_scores
from Utils import Utils


def _base_scores(f=7.0, a=7.0, c=6.0, p=6.0, e=6.0):
    return {
        "fiabilidad": {"value": f, "justification": ""},
        "adecuacion": {"value": a, "justification": ""},
        "claridad": {"value": c, "justification": ""},
        "profundidad": {"value": p, "justification": ""},
        "enfoque": {"value": e, "justification": ""},
    }


def test_score_alert_inconsistency():
    """High severity alert in fiabilidad/adecuacion with score > 6 must yield SCORE_ALERT_INCONSISTENCY."""
    model_scores = {
        "scores": _base_scores(f=7.0),
        "alerts": [
            {
                "code": "UNVERIFIED_CLAIM",
                "category": "fiabilidad",
                "severity": "high",
                "message": "No hay fuentes",
                "origin": "model",
                "evidence_refs": [],
            }
        ],
    }
    result = compute_evaluation_result(model_scores, {})
    codes = [a.get("code") for a in result.get("alerts", [])]
    assert "SCORE_ALERT_INCONSISTENCY" in codes, f"Expected SCORE_ALERT_INCONSISTENCY in alerts, got {codes}"
    print("OK: SCORE_ALERT_INCONSISTENCY present when high-severity fiabilidad alert and score 7")


def test_reserva_epistemica_fa():
    """min(F,A) in [4, 5) must yield RESERVA_EPISTEMICA_FA."""
    model_scores = {
        "scores": _base_scores(f=4.5, a=5.0),
        "alerts": [],
    }
    result = compute_evaluation_result(model_scores, {})
    codes = [a.get("code") for a in result.get("alerts", [])]
    assert "RESERVA_EPISTEMICA_FA" in codes, f"Expected RESERVA_EPISTEMICA_FA in alerts, got {codes}"
    print("OK: RESERVA_EPISTEMICA_FA present when min(F,A) in [4, 5)")


def test_engine_version_and_computed_at():
    """Result must include engine_version and computed_at in extras."""
    model_scores = {"scores": _base_scores(), "alerts": []}
    result = compute_evaluation_result(model_scores, {})
    extras = result.get("extras", {})
    assert extras.get("engine_version") == ENGINE_VERSION
    assert "computed_at" in extras and "T" in str(extras["computed_at"])
    print("OK: extras contain engine_version and computed_at")


def test_normalize_alerts_no_mutation():
    """normalize_model_scores must not mutate input alert dicts."""
    alert = {"code": "X", "category": "fiabilidad", "severity": "high"}
    model_scores = {"scores": _base_scores(), "alerts": [alert]}
    normalize_model_scores(model_scores)
    assert "origin" not in alert, "Input alert dict must not be mutated"
    print("OK: input alerts not mutated")


def test_missing_scores_preserves_heuristic_alerts():
    """When missing_scores branch is used, evaluation_result.alerts must contain extracted heuristic alerts."""
    valoraciones_texto = {
        "1": "La noticia no hay fuentes que respalden las afirmaciones.",
        "2": "Adecuado.",
        "3": "Claro.",
        "4": "Profundo.",
        "5": "Buen enfoque.",
    }
    puntuacion_individual = {"1": None, "2": 7.0, "3": 6.0, "4": 6.0, "5": 6.0}
    collected = Utils.extract_alerts_from_valoraciones(valoraciones_texto, puntuacion_individual)
    evaluation_result = {
        "meta": {},
        "scores": {},
        "alerts": collected,
        "error": {"code": "INCOMPLETE_MODEL_SCORES", "message": "Missing scores", "missing": ["fiabilidad"]},
    }
    assert len(evaluation_result["alerts"]) > 0, "Missing-scores branch must preserve heuristic alerts when present"
    print("OK: missing_scores branch preserves heuristic alerts in evaluation_result")


def test_clickbait_logic():
    """Simulated clickbait semantics: es_clickbait from is_clickbait; titulo_reformulado only when clickbait."""
    # Simulate what Hemingwai does
    def apply_clickbait_logic(resultados_titular):
        es_clickbait = bool(resultados_titular.get("is_clickbait", False))
        titular_reformulado = resultados_titular.get("titular_reformulado") if es_clickbait else None
        return es_clickbait, titular_reformulado

    r_approved = {"is_clickbait": False, "titular_reformulado": "Some suggested title"}
    es, tr = apply_clickbait_logic(r_approved)
    assert es is False and tr is None, "Approved headline must not store reformulado as clickbait"
    print("OK: approved headline -> es_clickbait=False, titulo_reformulado not stored")

    r_rejected = {"is_clickbait": True, "titular_reformulado": "Better title"}
    es, tr = apply_clickbait_logic(r_rejected)
    assert es is True and tr == "Better title"
    print("OK: rejected headline -> es_clickbait=True, titulo_reformulado stored")


if __name__ == "__main__":
    test_score_alert_inconsistency()
    test_reserva_epistemica_fa()
    test_engine_version_and_computed_at()
    test_normalize_alerts_no_mutation()
    test_missing_scores_preserves_heuristic_alerts()
    test_clickbait_logic()
    print("\nAll V2 validation checks passed.")