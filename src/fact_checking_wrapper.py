import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from env_config import get_env_bool, get_env_first


FACT_CHECK_PLACEHOLDER_MESSAGE = "Fact-checking no disponible."
FACT_CHECK_ARTIFACT = "fact_check_analisis.json"

ENABLE_FACT_CHECKING_DEFAULT = get_env_bool(
    "ENABLE_FACT_CHECKING",
    get_env_bool("FEATURE_ENABLE_PERPLEXITY", True),
)
MONGO_WRITE_URI = get_env_first(("MONGO_WRITE_URI", "NEW_MONGODB_URI", "MONGODB_URI"))
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "Base_de_datos_noticias")
MONGO_COLLECTION_NAME = os.getenv("MONGO_COLLECTION_NAME", "Noticias")
MONGO_SERVER_API_VERSION = os.getenv("MONGO_SERVER_API_VERSION", "1")


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _decode_output(raw: bytes) -> str:
    blob = raw or b""
    try:
        return blob.decode("utf-8", errors="replace")
    except Exception:
        return blob.decode("latin1", errors="replace")


def _is_objectid(candidate: str) -> bool:
    return bool(re.fullmatch(r"[a-fA-F0-9]{24}", str(candidate or "")))


def _normalize_sources(value: Any) -> list:
    if not isinstance(value, list):
        return []
    sources = []
    for item in value:
        s = str(item or "").strip()
        if s:
            sources.append(s)
    return sources


def _classify_reason(raw_text: str, returncode: Optional[int] = None, timed_out: bool = False) -> str:
    if timed_out:
        return "timeout"

    text = str(raw_text or "").strip().lower()

    if "402" in text:
        return "insufficient_credits"
    if ("insufficient" in text or "agotado" in text) and (
        "credit" in text or "saldo" in text or "quota" in text or "billing" in text
    ):
        return "insufficient_credits"

    if "429" in text or "rate limit" in text or "too many requests" in text:
        return "rate_limited"

    if "401" in text or "unauthorized" in text or "invalid api key" in text:
        return "http_401"

    if "403" in text or "forbidden" in text:
        return "http_403"

    if "timeout" in text or "timed out" in text:
        return "timeout"

    if ("json" in text and "decode" in text) or "json invalido" in text or "invalid json" in text:
        return "invalid_json"

    if "connection" in text or "network" in text or "dns" in text or "ssl" in text:
        return "connection_error"

    if "missing_api_key" in text:
        return "missing_api_key"

    if "disabled_by_flag" in text or "feature_disabled" in text:
        return "disabled_by_flag"

    if returncode not in (None, 0):
        return "provider_error"

    return "unknown"


def _fact_check_message(status: str) -> str:
    if status == "available":
        return "Fact-checking disponible."
    return FACT_CHECK_PLACEHOLDER_MESSAGE


def _build_fact_checking_block(status: str, reason: str, result: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    block = {
        "status": status,
        "provider": "perplexity",
        "reason": str(reason or "unknown"),
        "message": _fact_check_message(status),
        "created_at": _utcnow_iso(),
    }

    if status == "available" and isinstance(result, dict):
        analysis = str(result.get("analysis") or "").strip()
        sources = _normalize_sources(result.get("sources", []))
        block["result"] = {
            "analysis": analysis,
            "sources": sources,
        }

    return block


def _build_fact_checking_step(block: Dict[str, Any], duration_ms: int) -> Dict[str, Any]:
    status = str(block.get("status") or "unavailable")
    if status == "available":
        step_status = "success"
        ok = True
    elif status == "skipped":
        step_status = "skipped"
        ok = False
    else:
        step_status = "unavailable"
        ok = False

    return {
        "ok": ok,
        "status": step_status,
        "reason": str(block.get("reason") or "unknown"),
        "duration_ms": int(max(duration_ms, 0)),
        "at": _utcnow_iso(),
    }


def _legacy_perplexity_step(step: Dict[str, Any]) -> Dict[str, Any]:
    status = str(step.get("status") or "unavailable")
    legacy_status = {
        "success": "ok",
        "unavailable": "degraded",
        "skipped": "skipped",
    }.get(status, "degraded")

    legacy = {
        "ok": bool(step.get("ok")),
        "at": step.get("at") or _utcnow_iso(),
        "provider": "perplexity",
        "status": legacy_status,
        "reason": str(step.get("reason") or "unknown"),
        "duration_ms": int(step.get("duration_ms") or 0),
        "artifact": f"output_temporal/{FACT_CHECK_ARTIFACT}",
    }
    if not legacy["ok"]:
        legacy["error"] = legacy["reason"]
    return legacy


def _extract_block_from_payload(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return None

    explicit_status = str(payload.get("status") or "").strip().lower()
    explicit_reason = str(payload.get("reason") or "").strip().lower()
    if explicit_status in {"unavailable", "skipped"}:
        return _build_fact_checking_block(explicit_status, explicit_reason or "provider_unavailable")

    warning = str(payload.get("warning") or "").strip()
    if warning:
        return _build_fact_checking_block("unavailable", _classify_reason(warning))

    result_obj = payload.get("result")
    if isinstance(result_obj, dict):
        analysis = str(result_obj.get("analysis") or "").strip()
        sources = _normalize_sources(result_obj.get("sources", []))
        if analysis:
            return _build_fact_checking_block("available", "ok", {"analysis": analysis, "sources": sources})

    analysis = str(payload.get("analisis") or "").strip()
    sources = _normalize_sources(payload.get("fuentes", []))
    if analysis:
        return _build_fact_checking_block("available", "ok", {"analysis": analysis, "sources": sources})

    return None


def _load_fact_check_artifact(path: str) -> Optional[Dict[str, Any]]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return None

    return _extract_block_from_payload(data)


def _write_fact_check_artifact(output_dir: str, noticia_id: str, block: Dict[str, Any], logger=print) -> None:
    os.makedirs(output_dir, exist_ok=True)
    result = block.get("result") if isinstance(block.get("result"), dict) else {}
    analysis = str(result.get("analysis") or "").strip() if block.get("status") == "available" else FACT_CHECK_PLACEHOLDER_MESSAGE
    sources = _normalize_sources(result.get("sources", [])) if block.get("status") == "available" else []

    payload = {
        "noticia_id": noticia_id,
        "analisis": analysis,
        "fuentes": sources,
        "status": block.get("status"),
        "provider": block.get("provider"),
        "reason": block.get("reason"),
        "message": block.get("message"),
        "created_at": block.get("created_at"),
    }

    output_file = os.path.join(output_dir, FACT_CHECK_ARTIFACT)
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger(f"fact_checking artifact_write_failed err={type(e).__name__}")


def _persist_fact_checking_mongo(noticia_id: str, block: Dict[str, Any], step: Dict[str, Any], logger=print) -> None:
    try:
        from bson import ObjectId
        from pymongo.mongo_client import MongoClient
        from pymongo.server_api import ServerApi
    except Exception:
        logger("fact_checking mongo_skip reason=missing_pymongo_or_bson")
        return

    if not MONGO_WRITE_URI:
        logger("fact_checking mongo_skip reason=missing_mongo_write_uri")
        return

    if not _is_objectid(noticia_id):
        logger("fact_checking mongo_skip reason=invalid_object_id")
        return

    result = block.get("result") if isinstance(block.get("result"), dict) else {}
    legacy_analysis = str(result.get("analysis") or "").strip() if block.get("status") == "available" else FACT_CHECK_PLACEHOLDER_MESSAGE
    legacy_sources = _normalize_sources(result.get("sources", [])) if block.get("status") == "available" else []
    legacy_step = _legacy_perplexity_step(step)

    update_doc = {
        "evaluation_result.fact_checking": block,
        "pipeline.steps.fact_checking": step,
        "pipeline.steps.perplexity": legacy_step,
        "pipeline.steps.fact_check": legacy_step,
        "fact_check_analisis": legacy_analysis,
        "fact_check_fuentes": legacy_sources,
    }

    client = None
    try:
        client = MongoClient(MONGO_WRITE_URI, server_api=ServerApi(MONGO_SERVER_API_VERSION))
        collection = client[MONGO_DB_NAME][MONGO_COLLECTION_NAME]
        collection.update_one({"_id": ObjectId(noticia_id)}, {"$set": update_doc}, upsert=False)
    except Exception as e:
        logger(f"fact_checking mongo_persist_failed doc_id={noticia_id} err={type(e).__name__}")
    finally:
        if client is not None:
            client.close()


def run_fact_checking(payload: Dict[str, Any]) -> Dict[str, Any]:
    noticia_id = str(payload.get("noticia_id") or "").strip()
    output_dir = payload.get("output_dir") or "output_temporal"
    src_dir = payload.get("src_dir") or os.path.dirname(os.path.abspath(__file__))
    venv_python = payload.get("venv_python") or "python"
    env = payload.get("env") or os.environ.copy()
    timeout_seconds = payload.get("timeout_seconds")
    logger = payload.get("logger") or print
    executor = payload.get("executor") or subprocess.run
    persist_to_mongo = bool(payload.get("persist_to_mongo", True))
    write_artifact = bool(payload.get("write_artifact", True))

    enable_fact_checking = payload.get("enable_fact_checking")
    if enable_fact_checking is None:
        enable_fact_checking = ENABLE_FACT_CHECKING_DEFAULT
    enable_fact_checking = bool(enable_fact_checking)

    perplexity_api_key = payload.get("perplexity_api_key")
    if perplexity_api_key is None:
        perplexity_api_key = os.getenv("PERPLEXITY_API_KEY")

    start = time.perf_counter()
    returncode = None
    raw_output = ""

    block = None
    if not enable_fact_checking:
        block = _build_fact_checking_block("skipped", "disabled_by_flag")
    elif not str(perplexity_api_key or "").strip():
        block = _build_fact_checking_block("unavailable", "missing_api_key")
    else:
        command = [venv_python, "fact_check_perplexity.py", noticia_id]
        artifact_path = os.path.join(output_dir, FACT_CHECK_ARTIFACT)

        try:
            proc = executor(
                command,
                cwd=src_dir,
                capture_output=True,
                text=False,
                env=env,
                timeout=(timeout_seconds if timeout_seconds and timeout_seconds > 0 else None),
            )
            returncode = getattr(proc, "returncode", 1)
            raw_output = _decode_output((getattr(proc, "stdout", b"") or b"") + (getattr(proc, "stderr", b"") or b""))
        except subprocess.TimeoutExpired as e:
            returncode = None
            raw_output = str(e)
            block = _build_fact_checking_block("unavailable", "timeout")
        except Exception as e:
            returncode = None
            raw_output = str(e)
            block = _build_fact_checking_block("unavailable", _classify_reason(str(e)))

        if block is None:
            loaded = _load_fact_check_artifact(artifact_path)
            if loaded is not None:
                block = loaded
            else:
                reason = "invalid_json" if os.path.exists(artifact_path) else _classify_reason(raw_output, returncode=returncode)
                if reason == "unknown" and returncode == 0:
                    reason = "missing_artifact"
                block = _build_fact_checking_block("unavailable", reason)

    duration_ms = int((time.perf_counter() - start) * 1000)
    step = _build_fact_checking_step(block, duration_ms)

    if write_artifact:
        _write_fact_check_artifact(output_dir, noticia_id, block, logger=logger)
    if persist_to_mongo:
        _persist_fact_checking_mongo(noticia_id, block, step, logger=logger)

    logger(
        "fact_checking "
        f"doc_id={noticia_id} status={block.get('status')} reason={block.get('reason')} "
        f"duration_ms={duration_ms} returncode={returncode} output_len={len(raw_output)}"
    )

    return {
        "fact_checking": block,
        "pipeline_step": step,
        "returncode": returncode,
    }
