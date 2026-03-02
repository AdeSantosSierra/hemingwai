from typing import Any, Dict
import unicodedata

VALID_SEVERITIES = ("low", "medium", "high")
VALID_CATEGORIES = ("fiabilidad", "adecuacion", "claridad", "profundidad", "enfoque")
VALID_ORIGINS = ("model", "engine")

ALLOWED_ALERT_CODES_MODEL = (
    "UNVERIFIED_CLAIM",
    "WEAK_SOURCE",
    "MISSING_ATTRIBUTION",
    "NUMERIC_CLAIM_NO_SUPPORT",
    "OPINION_AS_FACT",
    "LOADED_LANGUAGE",
    "IMPLIED_CAUSALITY",
    "VAGUE_REFERENCES",
    "AMBIGUOUS_SUBJECT",
    "STRUCTURE_BREAK",
    "NO_CONTEXT_WHEN_NEEDED",
    "MISSING_IMPLICATIONS",
    "SENSATIONALISM",
    "MISPLACED_FOCUS",
)

ALLOWED_ALERT_CODES_ENGINE = (
    "INPUT_EMPTY_BODY",
    "INPUT_TOO_SHORT",
    "MODEL_OUTPUT_INVALID_SCHEMA",
    "MODEL_SCORE_OUT_OF_RANGE",
    "SCORE_ALERT_INCONSISTENCY",
    "RESERVA_EPISTEMICA_FA",
)

ALERT_DEFS: Dict[str, Dict[str, str]] = {
    "UNKNOWN_ALERT": {
        "default_category": "fiabilidad",
        "default_severity": "medium",
        "default_message": "Alerta no catalogada.",
    },
    "UNVERIFIED_CLAIM": {
        "default_category": "fiabilidad",
        "default_severity": "high",
        "default_message": "Afirmación importante sin verificación o fuente clara.",
    },
    "WEAK_SOURCE": {
        "default_category": "fiabilidad",
        "default_severity": "medium",
        "default_message": "La fuente usada es débil para sostener la afirmación.",
    },
    "MISSING_ATTRIBUTION": {
        "default_category": "fiabilidad",
        "default_severity": "high",
        "default_message": "Falta atribución explícita de afirmaciones clave.",
    },
    "NUMERIC_CLAIM_NO_SUPPORT": {
        "default_category": "fiabilidad",
        "default_severity": "high",
        "default_message": "Cifra o dato numérico sin respaldo identificable.",
    },
    "OPINION_AS_FACT": {
        "default_category": "adecuacion",
        "default_severity": "high",
        "default_message": "Opinión presentada como hecho.",
    },
    "LOADED_LANGUAGE": {
        "default_category": "adecuacion",
        "default_severity": "medium",
        "default_message": "Lenguaje cargado que introduce sesgo narrativo.",
    },
    "IMPLIED_CAUSALITY": {
        "default_category": "adecuacion",
        "default_severity": "medium",
        "default_message": "Se sugiere causalidad sin respaldo suficiente.",
    },
    "VAGUE_REFERENCES": {
        "default_category": "claridad",
        "default_severity": "medium",
        "default_message": "Referencias vagas reducen precisión del texto.",
    },
    "AMBIGUOUS_SUBJECT": {
        "default_category": "claridad",
        "default_severity": "low",
        "default_message": "Sujeto o agente ambiguo en afirmaciones relevantes.",
    },
    "STRUCTURE_BREAK": {
        "default_category": "claridad",
        "default_severity": "low",
        "default_message": "Ruptura de estructura dificulta comprensión.",
    },
    "NO_CONTEXT_WHEN_NEEDED": {
        "default_category": "profundidad",
        "default_severity": "medium",
        "default_message": "Falta contexto necesario para interpretar el hecho.",
    },
    "MISSING_IMPLICATIONS": {
        "default_category": "profundidad",
        "default_severity": "low",
        "default_message": "No se explican implicaciones relevantes.",
    },
    "SENSATIONALISM": {
        "default_category": "enfoque",
        "default_severity": "high",
        "default_message": "Enfoque sensacionalista por encima de lo informativo.",
    },
    "MISPLACED_FOCUS": {
        "default_category": "enfoque",
        "default_severity": "medium",
        "default_message": "Se prioriza lo accesorio frente a lo central.",
    },
    "INPUT_EMPTY_BODY": {
        "default_category": "fiabilidad",
        "default_severity": "high",
        "default_message": "El cuerpo de la noticia está vacío.",
    },
    "INPUT_TOO_SHORT": {
        "default_category": "claridad",
        "default_severity": "medium",
        "default_message": "El cuerpo es demasiado corto para análisis robusto.",
    },
    "MODEL_OUTPUT_INVALID_SCHEMA": {
        "default_category": "fiabilidad",
        "default_severity": "high",
        "default_message": "La salida del modelo no cumple el esquema esperado.",
    },
    "MODEL_SCORE_OUT_OF_RANGE": {
        "default_category": "fiabilidad",
        "default_severity": "high",
        "default_message": "Se detectó una puntuación fuera de rango [0,10].",
    },
    "SCORE_ALERT_INCONSISTENCY": {
        "default_category": "fiabilidad",
        "default_severity": "medium",
        "default_message": "Inconsistencia entre alerta crítica y puntuación alta.",
    },
    "RESERVA_EPISTEMICA_FA": {
        "default_category": "fiabilidad",
        "default_severity": "medium",
        "default_message": "Reserva epistémica por debilidad en fiabilidad/adecuación.",
    },
}


def severity_rank(severity: str) -> int:
    mapping = {"low": 0, "medium": 1, "high": 2}
    return mapping.get((severity or "").lower(), 1)


def strip_accents(value: str) -> str:
    text = str(value or "").strip().lower()
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def normalize_alert_shape(alert: Dict[str, Any]) -> Dict[str, Any]:
    alert = dict(alert or {})
    raw_code = str(alert.get("code") or "").strip()
    code = raw_code if raw_code in ALERT_DEFS else "UNKNOWN_ALERT"
    definition = ALERT_DEFS.get(code, ALERT_DEFS["UNKNOWN_ALERT"])

    category = strip_accents(alert.get("category") or definition.get("default_category") or "fiabilidad")
    if category not in VALID_CATEGORIES:
        category = definition.get("default_category", "fiabilidad")

    severity = strip_accents(alert.get("severity") or definition.get("default_severity") or "medium")
    if severity not in VALID_SEVERITIES:
        severity = definition.get("default_severity", "medium")

    origin = strip_accents(alert.get("origin") or "model")
    if origin not in VALID_ORIGINS:
        origin = "model"

    message = str(alert.get("message") or definition.get("default_message") or code).strip()
    evidence_refs = alert.get("evidence_refs")
    if not isinstance(evidence_refs, list):
        evidence_refs = []

    cleaned = []
    seen = set()
    for item in evidence_refs:
        text = str(item).strip()
        if not text:
            continue
        text = text[:240]
        if text not in seen:
            seen.add(text)
            cleaned.append(text)
        if len(cleaned) >= 3:
            break

    return {
        "code": code,
        "origin": origin,
        "category": category,
        "severity": severity,
        "message": message,
        "evidence_refs": cleaned,
    }
