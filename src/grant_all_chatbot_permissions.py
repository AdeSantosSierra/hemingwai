#!/usr/bin/env python
# -*- coding: utf-8 -*-

import json
import sys
from datetime import datetime, timezone

from pymongo import MongoClient

from env_config import get_env_first


DB_NAME = "Base_de_datos_noticias"
COLLECTION_NAME = "user_permissions"


def _resolve_mongo_uri():
    return get_env_first(("NEW_MONGODB_URI", "MONGO_WRITE_URI", "MONGODB_URI"))


def main():
    mongo_uri = _resolve_mongo_uri()
    if not mongo_uri:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "No se encontró NEW_MONGODB_URI/MONGO_WRITE_URI/MONGODB_URI en el entorno.",
                },
                ensure_ascii=False,
                indent=2,
            ),
            file=sys.stderr,
        )
        return 1

    client = MongoClient(mongo_uri)

    try:
        collection = client[DB_NAME][COLLECTION_NAME]
        now_utc = datetime.now(timezone.utc)

        result = collection.update_many(
            {"canUseChatbot": False},
            {"$set": {"canUseChatbot": True, "updatedAt": now_utc}},
        )

        print(
            json.dumps(
                {
                    "ok": True,
                    "database": DB_NAME,
                    "collection": COLLECTION_NAME,
                    "matchedCount": result.matched_count,
                    "modifiedCount": result.modified_count,
                    "updatedAt": now_utc.isoformat(),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
