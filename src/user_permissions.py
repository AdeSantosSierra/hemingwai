#!/usr/bin/env python
# -*- coding: utf-8 -*-

import threading
from datetime import datetime, timezone

from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING

from MongoDB import MongoDBService
from env_config import get_env_first


DB_NAME = "Base_de_datos_noticias"
COLLECTION_NAME = "user_permissions"
_indexes_ensured = False
_indexes_lock = threading.Lock()


def _resolve_mongo_uri():
    load_dotenv()
    return get_env_first(
        ("MONGO_WRITE_URI", "NEW_MONGODB_URI", "MONGO_READ_URI", "OLD_MONGODB_URI", "MONGODB_URI")
    )


def _normalize_user_id(user_id):
    if user_id is None:
        raise ValueError("El campo 'userId' es requerido.")
    value = str(user_id).strip()
    if not value:
        raise ValueError("El campo 'userId' es requerido.")
    return value


def _normalize_email(email):
    if email is None:
        return None
    value = str(email).strip()
    return value if value else None


def _normalize_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "y", "on"}:
            return True
        if lowered in {"0", "false", "no", "n", "off"}:
            return False
    raise ValueError("El campo 'canUseChatbot' debe ser booleano.")


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
        collection.create_index([("userId", ASCENDING)], unique=True, name="ux_user_permissions_userId")
        collection.create_index([("updatedAt", DESCENDING)], name="ix_user_permissions_updatedAt_desc")
        _indexes_ensured = True


def _safe_permission_payload(user_id, doc):
    return {
        "ok": True,
        "userId": user_id,
        "canUseChatbot": bool((doc or {}).get("canUseChatbot") is True),
        "email": (doc or {}).get("email"),
    }


def get_chatbot_permission(user_id, email=None, bootstrap_if_missing=True):
    try:
        normalized_user_id = _normalize_user_id(user_id)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    normalized_email = _normalize_email(email)
    mongo_service = None

    try:
        mongo_service, collection = _open_collection()
        ensure_indexes(collection)

        projection = {"_id": 0, "userId": 1, "canUseChatbot": 1, "email": 1}
        doc = collection.find_one({"userId": normalized_user_id}, projection)
        now_utc = datetime.now(timezone.utc)

        if doc is None and bootstrap_if_missing:
            set_on_insert = {
                "userId": normalized_user_id,
                "canUseChatbot": False,
                "createdAt": now_utc,
            }

            set_fields = {"updatedAt": now_utc}
            if normalized_email:
                set_fields["email"] = normalized_email

            collection.update_one(
                {"userId": normalized_user_id},
                {"$setOnInsert": set_on_insert, "$set": set_fields},
                upsert=True,
            )
            doc = collection.find_one({"userId": normalized_user_id}, projection)
        elif doc and normalized_email and doc.get("email") != normalized_email:
            collection.update_one(
                {"userId": normalized_user_id},
                {"$set": {"email": normalized_email, "updatedAt": now_utc}},
            )
            doc = collection.find_one({"userId": normalized_user_id}, projection)

        return _safe_permission_payload(normalized_user_id, doc)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    finally:
        if mongo_service:
            mongo_service.close()


def set_chatbot_permission(user_id, can_use_chatbot, email=None):
    try:
        normalized_user_id = _normalize_user_id(user_id)
        normalized_can_use = _normalize_bool(can_use_chatbot)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    normalized_email = _normalize_email(email)
    mongo_service = None

    try:
        mongo_service, collection = _open_collection()
        ensure_indexes(collection)

        now_utc = datetime.now(timezone.utc)
        update_fields = {
            "canUseChatbot": normalized_can_use,
            "updatedAt": now_utc,
        }
        if normalized_email is not None:
            update_fields["email"] = normalized_email

        collection.update_one(
            {"userId": normalized_user_id},
            {
                "$set": update_fields,
                "$setOnInsert": {
                    "userId": normalized_user_id,
                    "createdAt": now_utc,
                },
            },
            upsert=True,
        )

        projection = {"_id": 0, "userId": 1, "canUseChatbot": 1, "email": 1}
        doc = collection.find_one({"userId": normalized_user_id}, projection)
        return _safe_permission_payload(normalized_user_id, doc)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    finally:
        if mongo_service:
            mongo_service.close()
