#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import json
from decimal import Decimal, ROUND_HALF_UP
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv


def round_half_up(value, ndigits):
    quant = Decimal("1").scaleb(-ndigits)
    return float(Decimal(str(value)).quantize(quant, rounding=ROUND_HALF_UP))


def enrich_global_scores(noticia):
    """
    Normaliza los campos de score global para consumidores API/UI:
    - global_score_raw: máxima precisión disponible
    - global_score_2dp: nota principal de salida
    - global_score_1dp: display legacy opcional
    También mantiene `puntuacion` sincronizada con global_score_2dp para compatibilidad.
    """
    if not isinstance(noticia, dict):
        return noticia

    eval_result = noticia.get("evaluation_result") or {}
    extras = eval_result.get("extras") or {}
    derived = eval_result.get("derived") or {}

    raw = (
        noticia.get("global_score_raw")
        if noticia.get("global_score_raw") is not None
        else extras.get("raw_global_score")
    )
    if raw is None:
        raw = extras.get("global_score_raw")
    if raw is None:
        raw = derived.get("global_score_raw")

    score_2dp = noticia.get("global_score_2dp")
    if score_2dp is None:
        score_2dp = extras.get("global_score_2dp")
    if score_2dp is None:
        score_2dp = derived.get("global_score_2dp")
    if score_2dp is None and raw is not None:
        score_2dp = round_half_up(raw, 2)
    if score_2dp is None and derived.get("global_score") is not None:
        score_2dp = round_half_up(derived.get("global_score"), 2)
    if score_2dp is None and noticia.get("puntuacion") is not None:
        score_2dp = round_half_up(noticia.get("puntuacion"), 2)

    score_1dp = noticia.get("global_score_1dp")
    if score_1dp is None:
        score_1dp = extras.get("global_score_1dp")
    if score_1dp is None:
        score_1dp = derived.get("global_score_1dp")
    if score_1dp is None and score_2dp is not None:
        score_1dp = round_half_up(score_2dp, 1)

    if raw is not None:
        noticia["global_score_raw"] = float(raw)
    if score_2dp is not None:
        noticia["global_score_2dp"] = float(score_2dp)
        noticia["puntuacion"] = float(score_2dp)
    if score_1dp is not None:
        noticia["global_score_1dp"] = float(score_1dp)

    return noticia

def buscar_noticia(identificador, solo_antigua=False):
    """
    Busca una noticia por su URL o ID.
    Por defecto, busca en la BD nueva y luego en la antigua.
    Si solo_antigua es True, busca únicamente en la antigua.
    
    Args:
        identificador (str): URL o ID de la noticia.
        solo_antigua (bool): Si es True, busca solo en la BD antigua.

    Returns:
        dict: Los datos de la noticia encontrada o None.
    """
    # Cargar variables de entorno
    load_dotenv()
    old_mongo_uri = os.getenv("OLD_MONGODB_URI")
    new_mongo_uri = os.getenv("NEW_MONGODB_URI")

    if not all([old_mongo_uri, new_mongo_uri]):
        print(json.dumps({"error": "Las variables de entorno OLD_MONGODB_URI y NEW_MONGODB_URI son necesarias."}), file=sys.stderr)
        sys.exit(1)

    # Conexión a las bases de datos
    try:
        new_client = MongoClient(new_mongo_uri)
        new_db = new_client.get_database("Base_de_datos_noticias")
        new_collection = new_db.get_collection("Noticias")

        old_client = MongoClient(old_mongo_uri)
        old_db = old_client.get_database("Base_de_datos_noticias")
        old_collection = old_db.get_collection("Noticias")
    except Exception as e:
        print(json.dumps({"error": f"Error al conectar a MongoDB: {e}"}), file=sys.stderr)
        sys.exit(1)

    # Preparar la consulta
    query = {}
    if ObjectId.is_valid(identificador):
        query = {"_id": ObjectId(identificador)}
    else:
        query = {"url": identificador}
        
    # 🌟 PROYECCIÓN: Excluir el campo 'embedding' del resultado
    projection = {"embedding": 0}

    # Búsqueda condicional
    if not solo_antigua:
        noticia = new_collection.find_one(query, projection)
        if noticia:
            noticia["_id"] = str(noticia["_id"])
            return enrich_global_scores(noticia)

    # Búsqueda en la antigua base de datos
    noticia = old_collection.find_one(query, projection)
    if noticia:
        noticia["_id"] = str(noticia["_id"])
        return enrich_global_scores(noticia)

    return None

if __name__ == "__main__":
    if len(sys.argv) < 2 or len(sys.argv) > 3:
        usage = "Uso: ./buscar_noticia.py <URL_o_ID> [--solo-antigua]"
        print(json.dumps({"error": usage}), file=sys.stderr)
        sys.exit(1)

    identificador_noticia = sys.argv[1]
    solo_antigua_flag = len(sys.argv) == 3 and sys.argv[2] == '--solo-antigua'
    
    resultado = buscar_noticia(identificador_noticia, solo_antigua=solo_antigua_flag)

    if resultado:
        print(json.dumps(resultado, indent=4, ensure_ascii=False))
    else:
        print(json.dumps({"mensaje": "Noticia no encontrada."}))
