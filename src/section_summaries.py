import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

SECTION_KEYS: Tuple[str, ...] = (
    "fiabilidad",
    "adecuacion",
    "claridad",
    "profundidad",
    "enfoque",
)

LEGACY_SECTION_KEYS = {
    "1": "fiabilidad",
    "2": "adecuacion",
    "3": "claridad",
    "4": "profundidad",
    "5": "enfoque",
}

FALLBACK_SUMMARY = "\u2014"
LIST_LINE_RE = re.compile(r"^\s*(?:[-*\u2022]+|\d+[.)])\s+")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
MIN_ANALYSIS_CHARS = 60


SECTION_SUMMARIES_JSON_SCHEMA = {
    "name": "section_summaries",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "summaries": {
                "type": "object",
                "additionalProperties": False,
                "properties": {k: {"type": "string"} for k in SECTION_KEYS},
                "required": list(SECTION_KEYS),
            }
        },
        "required": ["summaries"],
    },
}


def default_section_summaries() -> Dict[str, str]:
    return {key: FALLBACK_SUMMARY for key in SECTION_KEYS}


def build_section_summaries_meta(model: str, version: str = "v1") -> Dict[str, str]:
    return {
        "model": str(model or ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "version": str(version or "v1"),
    }


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _has_sufficient_analysis(value: Any) -> bool:
    text = _clean_text(value)
    return len(text) >= MIN_ANALYSIS_CHARS


def extract_sections_analysis(
    evaluation_result: Dict[str, Any],
    valoraciones_texto: Dict[str, Any] = None,
) -> Dict[str, str]:
    out = {key: "" for key in SECTION_KEYS}

    if isinstance(evaluation_result, dict):
        scores = evaluation_result.get("scores")
        if isinstance(scores, dict):
            for key in SECTION_KEYS:
                entry = scores.get(key)
                if isinstance(entry, dict):
                    out[key] = _clean_text(entry.get("justification"))

    if isinstance(valoraciones_texto, dict):
        for old_key, new_key in LEGACY_SECTION_KEYS.items():
            if out[new_key]:
                continue
            out[new_key] = _clean_text(valoraciones_texto.get(old_key))

    return out


def _extract_json_payload(raw_text: str) -> Dict[str, Any]:
    text = _clean_text(raw_text)
    if not text:
        return {}

    try:
        return json.loads(text)
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except Exception:
            return {}

    return {}


def _extract_text_from_responses_output(response: Any) -> str:
    output_text = getattr(response, "output_text", None)
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    output_items = getattr(response, "output", None)
    if not isinstance(output_items, list):
        return ""

    for item in output_items:
        contents = getattr(item, "content", None)
        if not isinstance(contents, list):
            continue
        for content in contents:
            text = getattr(content, "text", None)
            if isinstance(text, str) and text.strip():
                return text
            if isinstance(text, dict):
                nested = text.get("value")
                if isinstance(nested, str) and nested.strip():
                    return nested
    return ""


def _responses_api_text(
    openai_client: Any,
    model: str,
    system_prompt: str,
    user_prompt: str,
    timeout_seconds: int,
) -> str:
    response = openai_client.responses.create(
        model=model,
        temperature=0,
        timeout=timeout_seconds,
        input=[
            {
                "role": "system",
                "content": [{"type": "input_text", "text": system_prompt}],
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": user_prompt}],
            },
        ],
        text={"format": {"type": "json_schema", **SECTION_SUMMARIES_JSON_SCHEMA}},
    )
    return _extract_text_from_responses_output(response)


def _chat_api_text(
    openai_client: Any,
    model: str,
    system_prompt: str,
    user_prompt: str,
    timeout_seconds: int,
) -> str:
    response = openai_client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0,
        timeout=timeout_seconds,
        response_format={
            "type": "json_schema",
            "json_schema": SECTION_SUMMARIES_JSON_SCHEMA,
        },
    )
    if not response or not response.choices:
        return ""
    return _clean_text(response.choices[0].message.content)


def _chat_api_text_json_object(
    openai_client: Any,
    model: str,
    system_prompt: str,
    user_prompt: str,
    timeout_seconds: int,
) -> str:
    response = openai_client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0,
        timeout=timeout_seconds,
        response_format={"type": "json_object"},
    )
    if not response or not response.choices:
        return ""
    return _clean_text(response.choices[0].message.content)


def _split_single_line(text: str) -> list:
    sentences = [s.strip() for s in SENTENCE_SPLIT_RE.split(text) if s.strip()]
    if len(sentences) >= 2:
        return sentences

    words = text.split()
    if len(words) >= 12:
        mid = max(1, len(words) // 2)
        return [" ".join(words[:mid]).strip(), " ".join(words[mid:]).strip()]
    return [text.strip()]


def _normalize_summary(summary: Any) -> str:
    text = _clean_text(summary)
    if not text or text == FALLBACK_SUMMARY:
        return FALLBACK_SUMMARY

    lines = [line.strip() for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n") if line.strip()]
    if len(lines) == 1:
        lines = _split_single_line(lines[0])

    # Si el modelo devuelve formato lista, eliminamos el prefijo para conservar el contenido.
    lines = [LIST_LINE_RE.sub("", line).strip() for line in lines if line.strip()]

    if len(lines) > 4:
        lines = lines[:4]
    if len(lines) < 2:
        return FALLBACK_SUMMARY

    return "\n".join(lines)


def normalize_section_summaries_output(
    sections_analysis: Dict[str, str],
    raw_summaries: Dict[str, Any],
) -> Dict[str, str]:
    normalized = default_section_summaries()
    raw_summaries = raw_summaries if isinstance(raw_summaries, dict) else {}

    for key in SECTION_KEYS:
        if not _has_sufficient_analysis(sections_analysis.get(key, "")):
            normalized[key] = FALLBACK_SUMMARY
            continue
        normalized[key] = _normalize_summary(raw_summaries.get(key))

    return normalized


def generate_section_summaries(
    openai_client: Any,
    sections_analysis: Dict[str, str],
    model: str,
    timeout_seconds: int = 60,
) -> Dict[str, str]:
    analyses = {key: _clean_text((sections_analysis or {}).get(key)) for key in SECTION_KEYS}

    if not any(_has_sufficient_analysis(analyses[key]) for key in SECTION_KEYS):
        return default_section_summaries()

    system_prompt = (
        "Eres un asistente de resumen editorial. "
        "Resume solo el contenido proporcionado sin inventar información. "
        "Devuelve exclusivamente JSON válido conforme al schema."
    )
    user_prompt = (
        "Entrada JSON con analisis completos por seccion. "
        "Genera un resumen para cada seccion. "
        "Reglas: 2-4 lineas por seccion separadas por \\n, sin vinetas ni listas. "
        "Si el analisis es insuficiente, devuelve \"\\u2014\" en esa seccion. "
        "No uses texto fuera del JSON.\n\n"
        f"INPUT:\n{json.dumps({'sectionsAnalysis': analyses}, ensure_ascii=False)}"
    )

    raw_text = ""
    errors = []

    if hasattr(openai_client, "responses") and hasattr(openai_client.responses, "create"):
        try:
            raw_text = _responses_api_text(openai_client, model, system_prompt, user_prompt, timeout_seconds)
        except Exception as e:
            errors.append(e)

    if not raw_text and hasattr(openai_client, "chat") and hasattr(openai_client.chat, "completions"):
        try:
            raw_text = _chat_api_text(openai_client, model, system_prompt, user_prompt, timeout_seconds)
        except Exception as e:
            errors.append(e)

    if not raw_text and hasattr(openai_client, "chat") and hasattr(openai_client.chat, "completions"):
        try:
            raw_text = _chat_api_text_json_object(
                openai_client,
                model,
                system_prompt,
                user_prompt,
                timeout_seconds,
            )
        except Exception as e:
            errors.append(e)

    if not raw_text and errors:
        raise errors[-1]
    if not raw_text:
        raise ValueError("openai_client incompatible: falta responses.create o chat.completions.create")

    payload = _extract_json_payload(raw_text)
    summaries = {}
    if isinstance(payload, dict):
        if isinstance(payload.get("summaries"), dict):
            summaries = payload.get("summaries") or {}
        elif all(key in payload for key in SECTION_KEYS):
            summaries = payload
    return normalize_section_summaries_output(analyses, summaries)
