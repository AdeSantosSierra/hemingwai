#!/usr/bin/env python
# -*- coding: utf-8 -*-

import argparse
import os
from decimal import Decimal, ROUND_HALF_UP

from dotenv import load_dotenv
from pymongo import MongoClient


def round_half_up(value, ndigits):
    quant = Decimal("1").scaleb(-ndigits)
    return float(Decimal(str(value)).quantize(quant, rounding=ROUND_HALF_UP))


def to_number(value):
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def resolve_best_raw_score(doc):
    evaluation = doc.get("evaluation_result") or {}
    extras = evaluation.get("extras") or {}
    derived = evaluation.get("derived") or {}

    # Priority requested by user:
    # 1) extras.raw_global_score
    # 2) fallback to available legacy values
    candidates = [
        extras.get("raw_global_score"),
        extras.get("global_score_raw"),
        derived.get("global_score_raw"),
        derived.get("global_score"),
        doc.get("global_score_raw"),
        doc.get("puntuacion"),
    ]

    for value in candidates:
        n = to_number(value)
        if n is not None:
            return n
    return None


def build_set_fields(doc):
    raw = resolve_best_raw_score(doc)
    if raw is None:
        return None

    score_2dp = round_half_up(raw, 2)
    score_1dp = round_half_up(raw, 1)

    return {
        "global_score_raw": raw,
        "global_score_2dp": score_2dp,
        "global_score_1dp": score_1dp,
        "puntuacion": score_2dp,
        "evaluation_result.derived.global_score_raw": raw,
        "evaluation_result.derived.global_score_2dp": score_2dp,
        "evaluation_result.derived.global_score_1dp": score_1dp,
        "evaluation_result.derived.global_score": score_2dp,
        "evaluation_result.extras.raw_global_score": raw,
        "evaluation_result.extras.global_score_raw": raw,
        "evaluation_result.extras.global_score_2dp": score_2dp,
        "evaluation_result.extras.global_score_1dp": score_1dp,
    }


def main():
    parser = argparse.ArgumentParser(description="Migra global score a raw + 2dp (ROUND_HALF_UP).")
    parser.add_argument("--db", default=os.getenv("MONGO_DB_NAME", "Base_de_datos_noticias"))
    parser.add_argument("--collection", default=os.getenv("MONGO_COLLECTION_NAME", "Noticias"))
    parser.add_argument("--dry-run", action="store_true", help="No escribe cambios, solo imprime resumen.")
    args = parser.parse_args()

    load_dotenv()
    mongo_uri = (
        os.getenv("MONGO_WRITE_URI")
        or os.getenv("NEW_MONGODB_URI")
        or os.getenv("MONGODB_URI")
    )
    if not mongo_uri:
        raise RuntimeError("Falta MONGO_WRITE_URI/NEW_MONGODB_URI/MONGODB_URI en entorno.")

    client = MongoClient(mongo_uri)
    col = client[args.db][args.collection]

    query = {
        "$or": [
            {"global_score_raw": {"$exists": False}},
            {"global_score_2dp": {"$exists": False}},
            {"global_score_raw": None},
            {"global_score_2dp": None},
        ]
    }

    scanned = 0
    updated = 0
    skipped = 0

    for doc in col.find(query, {"evaluation_result": 1, "global_score_raw": 1, "global_score_2dp": 1, "puntuacion": 1}):
        scanned += 1
        set_fields = build_set_fields(doc)
        if not set_fields:
            skipped += 1
            continue

        if not args.dry_run:
            col.update_one({"_id": doc["_id"]}, {"$set": set_fields})
        updated += 1

    print(
        f"Migration finished | dry_run={args.dry_run} | scanned={scanned} | "
        f"updated={updated} | skipped_no_source={skipped}"
    )
    client.close()


if __name__ == "__main__":
    main()
