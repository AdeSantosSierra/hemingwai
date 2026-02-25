#!/usr/bin/env python
# -*- coding: utf-8 -*-

import time
import threading
from datetime import datetime, timezone

from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING

from MongoDB import MongoDBService
from env_config import get_env_first


DEFAULT_LIMIT = 4
MAX_LIMIT = 4
DB_NAME = "base_de_datos_noticia"
COLLECTION_NAME = "user_history"
_indexes_ensured = False
_indexes_lock = threading.Lock()


def _resolve_mongo_uri():
    load_dotenv()
    return get_env_first(
        ("MONGO_WRITE_URI", "NEW_MONGODB_URI", "MONGO_READ_URI", "OLD_MONGODB_URI", "MONGODB_URI")
    )


def _normalize_limit(limit):
    try:
        parsed = int(limit)
    except (TypeError, ValueError):
        parsed = DEFAULT_LIMIT
    return max(1, min(parsed, MAX_LIMIT))


def _normalize_string_or_none(value):
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _normalize_query(value):
    query = _normalize_string_or_none(value)
    if not query:
        raise ValueError("El campo 'query' es requerido.")
    return query


def _normalize_timestamp(value, fallback):
    try:
        parsed = int(value)
        if parsed > 0:
            return parsed
    except (TypeError, ValueError):
        pass
    return int(fallback)


def _normalize_item(item, fallback_timestamp):
    if not isinstance(item, dict):
        raise ValueError("El campo 'item' debe ser un objeto.")

    return {
        "query": _normalize_query(item.get("query")),
        "title": _normalize_string_or_none(item.get("title")),
        "url": _normalize_string_or_none(item.get("url")),
        "timestamp": _normalize_timestamp(item.get("timestamp"), fallback_timestamp),
    }


def _sanitize_items(items, limit=None):
    if not isinstance(items, list):
        return []

    now_ms = int(time.time() * 1000)
    seen_queries = set()
    cleaned = []

    for raw in items:
        if not isinstance(raw, dict):
            continue

        query = _normalize_string_or_none(raw.get("query"))
        if not query or query in seen_queries:
            continue

        seen_queries.add(query)
        cleaned.append(
            {
                "query": query,
                "title": _normalize_string_or_none(raw.get("title")),
                "url": _normalize_string_or_none(raw.get("url")),
                "timestamp": _normalize_timestamp(raw.get("timestamp"), now_ms),
            }
        )

    if limit is None:
        return cleaned
    return cleaned[:limit]


def _open_collection():
    uri = _resolve_mongo_uri()
    if not uri:
        raise RuntimeError(
            "No se encontró URI de MongoDB. Configura MONGO_WRITE_URI/NEW_MONGODB_URI/MONGO_READ_URI/OLD_MONGODB_URI/MONGODB_URI."
        )
    service = MongoDBService(uri=uri, db_name=DB_NAME)
    return service, service.get_collection(COLLECTION_NAME)


def ensure_indexes(collection):
    global _indexes_ensured
    if _indexes_ensured:
        return

    with _indexes_lock:
        if _indexes_ensured:
            return
        collection.create_index([("userId", ASCENDING)], unique=True)
        collection.create_index([("updatedAt", DESCENDING)])
        _indexes_ensured = True


def get_user_history(user_id, limit=DEFAULT_LIMIT):
    if not user_id:
        return {"ok": False, "error": "El campo 'userId' es requerido."}

    effective_limit = _normalize_limit(limit)
    mongo_service = None
    try:
        mongo_service, collection = _open_collection()
        ensure_indexes(collection)

        doc = collection.find_one({"userId": str(user_id)}, {"_id": 0, "items": 1})
        items = _sanitize_items((doc or {}).get("items", []), effective_limit)
        return {"ok": True, "items": items}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    finally:
        if mongo_service:
            mongo_service.close()


def upsert_user_history_item(user_id, item, limit=DEFAULT_LIMIT):
    if not user_id:
        return {"ok": False, "error": "El campo 'userId' es requerido."}

    effective_limit = _normalize_limit(limit)
    now_ms = int(time.time() * 1000)

    try:
        new_item = _normalize_item(item, fallback_timestamp=now_ms)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    mongo_service = None
    try:
        mongo_service, collection = _open_collection()
        ensure_indexes(collection)

        doc = collection.find_one({"userId": str(user_id)}, {"_id": 0, "items": 1}) or {}
        items = _sanitize_items(doc.get("items", []), limit=None)
        items = [new_item] + [existing for existing in items if existing.get("query") != new_item["query"]]
        items = items[:effective_limit]

        collection.update_one(
            {"userId": str(user_id)},
            {"$set": {"items": items, "updatedAt": datetime.now(timezone.utc)}},
            upsert=True,
        )

        stored_doc = collection.find_one({"userId": str(user_id)}, {"_id": 0, "items": 1}) or {}
        stored_items = _sanitize_items(stored_doc.get("items", []), effective_limit)

        return {"ok": True, "items": stored_items}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    finally:
        if mongo_service:
            mongo_service.close()
