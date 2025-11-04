#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import json
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

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
            return noticia

    # Búsqueda en la antigua base de datos
    noticia = old_collection.find_one(query, projection)
    if noticia:
        noticia["_id"] = str(noticia["_id"])
        return noticia

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