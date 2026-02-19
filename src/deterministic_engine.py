from typing import Dict, Any, Optional
from datetime import datetime, timezone

from alerts_catalog import ALERT_DEFS, normalize_alert_shape
from Utils import Utils

# --- Constants & Configuration ---
# Optional MongoDB indexes for querying: pipeline.run_id, evaluation_meta.evaluated_at,
# evaluation_result.status.label (add via migration or shell if needed).

ENGINE_VERSION = "v2.0.0"
CATEGORIES_V2 = ["fiabilidad", "adecuacion", "claridad", "profundidad", "enfoque"]

WEIGHTS = {
    "fiabilidad": 0.25,
    "adecuacion": 0.20,
    "claridad": 0.15,
    "profundidad": 0.20,
    "enfoque": 0.20,
}

STATUS_LABELS = {
    "desinformativa": "Desinformativa",
    "confusa": "Confusa",
    "irrelevante": "Irrelevante",
    "valiosa": "Valiosa",
    "excelente": "Excelente",
}


def clamp(value: float, min_val: float = 0.0, max_val: float = 10.0) -> float:
    return max(min_val, min(value, max_val))


def _default_scores() -> Dict[str, Any]:
    return {c: {"value": 0.0, "justification": ""} for c in CATEGORIES_V2}


def _make_alert(code: str, origin: str, category: Optional[str] = None, severity: Optional[str] = None, message: Optional[str] = None, evidence_refs=None) -> Dict[str, Any]:
    definition = ALERT_DEFS.get(code, {})
    return normalize_alert_shape(
        {
            "code": code,
            "origin": origin,
            "category": category or definition.get("default_category", "fiabilidad"),
            "severity": severity or definition.get("default_severity", "medium"),
            "message": message or definition.get("default_message", code),
            "evidence_refs": evidence_refs or [],
        }
    )


def normalize_model_scores(model_scores: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ensures the input model_scores dictionary has the expected structure
    and values are within valid ranges.
    Raises ValueError if required categories are missing or values are invalid.
    """
    normalized_scores = {}
    raw_scores = model_scores.get("scores", {})

    for category in CATEGORIES_V2:
        entry = raw_scores.get(category)

        # 1. Missing Category Check
        if entry is None:
            raise ValueError(f"Missing required category: {category}")

        # 1b. Entry Type Check
        if not isinstance(entry, dict):
            raise ValueError(f"Invalid score entry for category {category}: expected dict")

        # 2. Value Existence Check
        if "value" not in entry:
            raise ValueError(f"Missing 'value' for category: {category}")

        val = entry.get("value")

        # 3. Type Conversion Check
        try:
            val_float = float(val)
        except (ValueError, TypeError):
            raise ValueError(f"Invalid score value for category {category}: {val}")

        # 4. Clamp (Allowed)
        normalized_scores[category] = {
            "value": clamp(val_float),
            "justification": str(entry.get("justification", "")),
        }

    # Normalize alerts (copy dicts to avoid mutating input)
    normalized_alerts = []
    raw_alerts = model_scores.get("alerts", [])
    if isinstance(raw_alerts, list):
        for alert in raw_alerts:
            if isinstance(alert, dict):
                alert_copy = dict(alert)
                if "origin" not in alert_copy:
                    alert_copy["origin"] = "model"
                normalized_alerts.append(normalize_alert_shape(alert_copy))

    return {"scores": normalized_scores, "alerts": normalized_alerts}


def compute_evaluation_result(
    model_scores: Dict[str, Any],
    meta: Optional[Dict[str, str]] = None,
    raw_body: Optional[str] = None,
    min_body_chars: int = 400,
) -> Dict[str, Any]:
    """
    Core function of the Deterministic Engine (V2).
    Calculates derived metrics, checks gates, determines status, and generates audit trail.
    """
    audit = {
        "decision_path": [],
        "rules_fired": [],
        "inconsistencies": [],
        "inconsistencies_details": [],
    }
    engine_alerts = []

    # 0. Input sanity checks (raw body)
    body_text = "" if raw_body is None else str(raw_body)
    if not body_text.strip():
        engine_alerts.append(_make_alert("INPUT_EMPTY_BODY", "engine", category="fiabilidad", severity="high"))
        audit["rules_fired"].append("RULE:INPUT_EMPTY_BODY:fiabilidad")
        audit["decision_path"].append("Body is empty -> INPUT_EMPTY_BODY")
    elif len(body_text.strip()) < int(min_body_chars):
        engine_alerts.append(_make_alert("INPUT_TOO_SHORT", "engine", category="claridad", severity="medium"))
        audit["rules_fired"].append("RULE:INPUT_TOO_SHORT:claridad")
        audit["decision_path"].append(f"Body length < {int(min_body_chars)} -> INPUT_TOO_SHORT")

    # 1. Validate model output schema before normalization
    schema_errors = []
    raw_scores = model_scores.get("scores") if isinstance(model_scores, dict) else None
    if not isinstance(raw_scores, dict):
        schema_errors.append("scores missing or invalid")
    else:
        for category in CATEGORIES_V2:
            entry = raw_scores.get(category)
            if not isinstance(entry, dict):
                schema_errors.append(f"{category}: missing dict entry")
                continue

            if "value" not in entry:
                schema_errors.append(f"{category}: missing value")
            else:
                try:
                    raw_val = float(entry.get("value"))
                    if raw_val < 0.0 or raw_val > 10.0:
                        engine_alerts.append(
                            _make_alert(
                                "MODEL_SCORE_OUT_OF_RANGE",
                                "engine",
                                category=category,
                                severity="high",
                                message=f"Score fuera de rango en {category}: {raw_val}",
                            )
                        )
                        audit["rules_fired"].append(f"RULE:MODEL_SCORE_OUT_OF_RANGE:{category}")
                except (TypeError, ValueError):
                    schema_errors.append(f"{category}: non-numeric value")

    if schema_errors:
        engine_alerts.append(
            _make_alert(
                "MODEL_OUTPUT_INVALID_SCHEMA",
                "engine",
                category="fiabilidad",
                severity="high",
                message="Salida de modelo inválida: " + "; ".join(schema_errors[:4]),
                evidence_refs=schema_errors[:3],
            )
        )
        audit["rules_fired"].append("RULE:MODEL_OUTPUT_INVALID_SCHEMA:fiabilidad")

    # 2. Normalize model inputs (strict -> fallback)
    try:
        data = normalize_model_scores(model_scores)
        scores = data["scores"]
        model_alerts = data["alerts"]
    except ValueError as err:
        raw_alerts = model_scores.get("alerts", []) if isinstance(model_scores, dict) else []
        model_alerts = [normalize_alert_shape(a) for a in raw_alerts if isinstance(a, dict)]
        scores = _default_scores()
        engine_alerts.append(
            _make_alert(
                "MODEL_OUTPUT_INVALID_SCHEMA",
                "engine",
                category="fiabilidad",
                severity="high",
                message=f"No se pudo normalizar model_scores: {err}",
            )
        )
        audit["rules_fired"].append("RULE:MODEL_OUTPUT_INVALID_SCHEMA:fiabilidad")
        audit["decision_path"].append("normalize_model_scores failed -> fallback scores=0")

    # Extract values for calculation
    F = scores["fiabilidad"]["value"]
    A = scores["adecuacion"]["value"]
    C = scores["claridad"]["value"]
    P = scores["profundidad"]["value"]
    E = scores["enfoque"]["value"]

    # 3. Calculate Derived Metrics
    G_raw = sum(scores[c]["value"] * WEIGHTS[c] for c in CATEGORIES_V2)
    m_min_fa = min(F, A)
    T_raw = (E + P) / 2

    derived = {
        "global_score": round(G_raw, 1),
        "tripod": {"m_min_fa": round(m_min_fa, 2), "T_transcendence": round(T_raw, 2)},
        "gates": {"hard_triggered": False, "soft_cap_triggered": False},
    }

    # 4. Check Inconsistencies (Model Alert vs Score)
    for alert in model_alerts:
        if alert.get("origin") == "model" and alert.get("severity") == "high":
            cat = alert.get("category")
            if cat in ["fiabilidad", "adecuacion"]:
                current_score = scores.get(cat, {}).get("value", 0)
                evidence_refs = alert.get("evidence_refs") or []
                if current_score > 6.0 and len(evidence_refs) > 0:
                    message = f"high {alert.get('code')} but score_{cat}={current_score:.1f}"
                    audit["inconsistencies"].append(message)
                    audit["inconsistencies_details"].append(
                        {
                            "category": cat,
                            "score_value": current_score,
                            "alert_code": alert.get("code"),
                            "severity": "high",
                            "message": alert.get("message"),
                        }
                    )
                    engine_alerts.append(
                        _make_alert(
                            "SCORE_ALERT_INCONSISTENCY",
                            "engine",
                            category=cat,
                            severity="medium",
                            message=f"Inconsistencia detectada: alerta crítica en {cat} pero puntuación alta ({current_score:.1f}).",
                        )
                    )
                    audit["rules_fired"].append(f"RULE:SCORE_ALERT_INCONSISTENCY:{cat}")
                    audit["decision_path"].append(
                        f"Inconsistency found in {cat} (score {current_score:.1f} > 6 with high model alert)"
                    )

    # 5. Check Soft Gate (Epistemic Reserve)
    if 4.0 <= m_min_fa < 5.0:
        derived["gates"]["soft_cap_triggered"] = True
        engine_alerts.append(
            _make_alert(
                "RESERVA_EPISTEMICA_FA",
                "engine",
                category="fiabilidad",
                severity="medium",
                message="La noticia presenta debilidades en fiabilidad o adecuación (score 4.0-5.0). Se activa Reserva Epistémica.",
            )
        )
        audit["rules_fired"].append("RULE:RESERVA_EPISTEMICA_FA:fiabilidad")

    # 6. Determine Status (Strict Decision Tree)
    status_label = "irrelevante"

    if m_min_fa < 4.0:
        status_label = "desinformativa"
        derived["gates"]["hard_triggered"] = True
        audit["decision_path"].append(f"m_min_fa ({m_min_fa:.2f}) < 4.0 -> desinformativa")
        audit["rules_fired"].append("RULE:GATE_HARD_MIN_FA_LT_4:fiabilidad")
    elif G_raw < 4.0:
        status_label = "desinformativa"
        audit["decision_path"].append(f"G_raw ({G_raw:.3f}) < 4.0 -> desinformativa")
        audit["rules_fired"].append("RULE:STATUS_DESINFORMATIVA_G_LT_4:fiabilidad")
    elif C < 5.0:
        status_label = "confusa"
        audit["decision_path"].append(f"C ({C:.2f}) < 5.0 -> confusa")
        audit["rules_fired"].append("RULE:STATUS_CONFUSA_C_LT_5:claridad")
    elif T_raw < 5.5:
        status_label = "irrelevante"
        audit["decision_path"].append(f"T ({T_raw:.2f}) < 5.5 -> irrelevante")
        audit["rules_fired"].append("RULE:STATUS_IRRELEVANTE_T_LT_5_5:profundidad")
    elif m_min_fa >= 7.0 and C >= 6.5 and T_raw >= 7.0 and G_raw >= 8.5:
        status_label = "excelente"
        audit["decision_path"].append("m_min_fa>=7 & C>=6.5 & T>=7 & G>=8.5 -> excelente")
        audit["rules_fired"].append("RULE:STATUS_EXCELENTE_CONDITIONS_MET:fiabilidad")
    elif m_min_fa >= 5.0 and C >= 5.0 and T_raw >= 5.5:
        status_label = "valiosa"
        audit["decision_path"].append("m_min_fa>=5 & C>=5 & T>=5.5 -> valiosa")
        audit["rules_fired"].append("RULE:STATUS_VALIOSA_CONDITIONS_MET:fiabilidad")
    else:
        status_label = "irrelevante"
        audit["decision_path"].append("No specific condition met -> irrelevante")
        audit["rules_fired"].append("RULE:STATUS_FALLBACK_IRRELEVANTE:fiabilidad")

    # 7. Construct Final Object
    final_alerts = model_alerts + engine_alerts
    final_alerts = Utils.dedupe_alerts(final_alerts)
    final_alerts = Utils.sort_alerts(final_alerts)

    if meta is None:
        meta = {}
    final_meta = {
        "url": meta.get("url", ""),
        "title": meta.get("title", ""),
        "date": meta.get("date", ""),
        "source": meta.get("source", ""),
        "author": meta.get("author", ""),
    }

    computed_at = datetime.now(timezone.utc).isoformat()
    extras = {
        "raw_global_score": G_raw,
        "engine_version": ENGINE_VERSION,
        "computed_at": computed_at,
    }

    return {
        "meta": final_meta,
        "scores": scores,
        "derived": derived,
        "status": {
            "label": status_label,
            "short_text": STATUS_LABELS.get(status_label, status_label.capitalize()),
        },
        "alerts": final_alerts,
        "alerts_summary": Utils.build_alerts_summary(final_alerts),
        "recommendations": {"items": []},
        "audit": {
            "rules_fired": list(audit.get("rules_fired", [])),
            "inconsistencies": list(audit.get("inconsistencies", [])),
            "inconsistencies_details": list(audit.get("inconsistencies_details", [])),
            "decision_path": list(audit.get("decision_path", [])),
        },
        "extras": extras,
    }
