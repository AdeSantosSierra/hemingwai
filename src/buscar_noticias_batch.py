#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import json
from urllib.parse import urlparse, urlunparse
from pymongo import MongoClient
from dotenv import load_dotenv
from bson import ObjectId

def normalize_url(url):
    """
    Normaliza una URL eliminando query parameters y fragmentos (hash).
    Mantiene scheme, netloc y path.
    """
    try:
        parsed = urlparse(url)
        # Reconstruir URL usando solo scheme, netloc y path
        # urlunparse espera: (scheme, netloc, path, params, query, fragment)
        # Dejamos params, query y fragment vacíos.
        normalized = urlunparse((parsed.scheme, parsed.netloc, parsed.path, '', '', ''))
        return normalized
    except Exception:
        return url

def buscar_noticias_batch(urls):
    """
    Busca múltiples noticias por URL en la BD.
    
    Args:
        urls (list): Lista de URLs a buscar.

    Returns:
        dict: Resultado con la lista de objetos encontrados o estado de no analizado.
    """
    # Cargar variables de entorno
    load_dotenv()
    old_mongo_uri = os.getenv("OLD_MONGODB_URI")
    new_mongo_uri = os.getenv("NEW_MONGODB_URI")

    if not all([old_mongo_uri, new_mongo_uri]):
        return {"error": "Las variables de entorno OLD_MONGODB_URI y NEW_MONGODB_URI son necesarias."}

    # Conexión a las bases de datos
    try:
        new_client = MongoClient(new_mongo_uri)
        new_db = new_client.get_database("Base_de_datos_noticias")
        new_collection = new_db.get_collection("Noticias")

        old_client = MongoClient(old_mongo_uri)
        old_db = old_client.get_database("Base_de_datos_noticias")
        old_collection = old_db.get_collection("Noticias")
    except Exception as e:
        return {"error": f"Error al conectar a MongoDB: {e}"}

    # 1. Normalizar URLs y eliminar duplicados para la búsqueda
    # Map: normalized_url -> original_url (para referencia, aunque devolveremos normalized)
    unique_normalized_urls = set()
    url_map = {} # normalized -> list of original urls (si quisiéramos mapear exacto, pero devolveremos por normalized)
    
    for url in urls:
        norm = normalize_url(url)
        unique_normalized_urls.add(norm)
        # Podríamos guardar la original, pero la búsqueda es por la normalizada almacenada en DB
    
    lista_busqueda = list(unique_normalized_urls)
    
    # 2. Proyección para optimizar (solo campos necesarios)
    projection = {
        "url": 1,
        "puntuacion": 1, 
        "puntuacion_global": 1,
        "puntuacionTotal": 1,
        "resumen_valoracion": 1, 
        "resumen_global": 1,
        "resumen_valoracion_titular": 1,
        "valoracion_titular": 1
    }

    resultados_map = {} # normalized_url -> data

    # 3. Buscar en BD Nueva
    cursor_new = new_collection.find({"url": {"$in": lista_busqueda}}, projection)
    for doc in cursor_new:
        url_encontrada = doc.get("url")
        if url_encontrada:
            resultados_map[url_encontrada] = doc

    # 4. Identificar faltantes
    faltantes = [url for url in lista_busqueda if url not in resultados_map]

    # 5. Buscar en BD Antigua (solo los faltantes)
    if faltantes:
        cursor_old = old_collection.find({"url": {"$in": faltantes}}, projection)
        for doc in cursor_old:
            url_encontrada = doc.get("url")
            if url_encontrada:
                resultados_map[url_encontrada] = doc

    # 6. Construir respuesta
    output_list = []
    
    # Iteramos sobre las URLs ÚNICAS solicitadas (normalizadas)
    for norm_url in lista_busqueda:
        doc = resultados_map.get(norm_url)
        
        if doc:
            # Normalizar campos de salida
            puntuacion = doc.get("puntuacion") or doc.get("puntuacion_global") or doc.get("puntuacionTotal")
            
            resumen = doc.get("resumen_valoracion") or doc.get("resumen_global")
            
            resumen_titular = doc.get("resumen_valoracion_titular")
            if not resumen_titular and isinstance(doc.get("valoracion_titular"), dict):
                resumen_titular = doc.get("valoracion_titular").get("resumen")
            
            output_list.append({
                "url": norm_url,
                "analizado": True,
                "id": str(doc["_id"]),
                "puntuacion": puntuacion,
                "resumen_valoracion": resumen,
                "resumen_valoracion_titular": resumen_titular
            })
        else:
            output_list.append({
                "url": norm_url,
                "analizado": False
            })

    return {"resultados": output_list}

if __name__ == "__main__":
    # Leer JSON desde stdin
    try:
        input_data = sys.stdin.read()
        if not input_data:
             # Si no hay stdin, intentar leer argumento (fallback)
             if len(sys.argv) > 1:
                 input_data = sys.argv[1]
             else:
                 print(json.dumps({"error": "Se requiere una lista de URLs en formato JSON via stdin."}))
                 sys.exit(1)
                 
        data = json.loads(input_data)
        urls = data.get("urls", [])
        
        if not isinstance(urls, list):
            print(json.dumps({"error": "El campo 'urls' debe ser una lista."}))
            sys.exit(1)
            
        resultado = buscar_noticias_batch(urls)
        print(json.dumps(resultado, ensure_ascii=False))
        
    except json.JSONDecodeError:
        print(json.dumps({"error": "Entrada inválida. Se espera JSON."}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"Error inesperado: {str(e)}"}))
        sys.exit(1)
