#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import json
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv
import openai


def get_mongodb_collection():
    """Conecta a MongoDB y devuelve la colección de noticias."""
    load_dotenv()
    new_mongo_uri = os.getenv("NEW_MONGODB_URI")
    if not new_mongo_uri:
        raise ValueError("La variable de entorno NEW_MONGODB_URI es necesaria.")
    
    client = MongoClient(new_mongo_uri)
    db = client.get_database("Base_de_datos_noticias")
    return db.get_collection("Noticias")


def get_news_by_id(news_id):
    """Busca una noticia por su ID en la base de datos."""
    if not ObjectId.is_valid(news_id):
        return None
    
    collection = get_mongodb_collection()
    return collection.find_one({"_id": ObjectId(news_id)})


def build_system_prompt(news_data):
    """
    Construye el system prompt para el modelo de IA con un contexto detallado.
    Prioriza el análisis frente al cuerpo de la noticia a la hora de recortar.
    """

    # Puntuaciones numéricas
    scores_y_criterios = {
        "puntuacion_global": news_data.get("puntuacion"),
        "puntuaciones_individuales": news_data.get("puntuacion_individual"),
    }

    # Campos principales de la noticia
    body = news_data.get("cuerpo", "") or ""
    titular = news_data.get("titulo", "") or ""

    # Análisis del titular: confirmas que la estructura es { valoracion_titular: { titular: "..." } }
    analisis_titular_obj = news_data.get("valoracion_titular") or {}
    analisis_titular = analisis_titular_obj.get("titular", "No disponible")

    # Análisis de veracidad y valoración general
    analisis_veracidad = news_data.get("fact_check_analisis") or "No disponible"
    valoracion_general = news_data.get("valoracion_general") or "No disponible"

    # Análisis detallado por criterio (lo tratamos como oro, intentamos no recortarlo)
    valoraciones_dict = news_data.get("valoraciones") or {}
    analisis_por_criterio = ""
    nombres_criterios = {
        '1': 'Interpretación del periodista',
        '2': 'Opiniones',
        '3': 'Cita de fuentes',
        '4': 'Confiabilidad de fuentes',
        '5': 'Trascendencia',
        '6': 'Relevancia de los datos',
        '7': 'Precisión y claridad',
        '8': 'Enfoque',
        '9': 'Contexto',
        '10': 'Ética'
    }
    for key, texto in valoraciones_dict.items():
        nombre_legible = nombres_criterios.get(key, f"Criterio {key}")
        analisis_por_criterio += f"\n--- {nombre_legible} ---\n{texto}\n"

    # ---------- LÓGICA DE RECORTE INTELIGENTE ----------

    # Construimos primero todas las secciones sin recorte
    secciones = {
        "body": body,
        "analisis_titular": analisis_titular,
        "analisis_veracidad": analisis_veracidad,
        "valoracion_general": valoracion_general,
        "analisis_por_criterio": analisis_por_criterio,
    }

    # Longitud total aproximada (en caracteres)
    total_chars = sum(len(t) for t in secciones.values())

    # Límite total aproximado de caracteres para el contexto
    # (ajusta si quieres más/menos contexto; 20000 ~ 4–5k tokens aprox.)
    MAX_TOTAL_CHARS = 20000

    if total_chars > MAX_TOTAL_CHARS:
        # 1) Recortamos primero SOLO el cuerpo de la noticia
        exceso = total_chars - MAX_TOTAL_CHARS
        body = secciones["body"]
        min_body_chars = 2000  # deja al menos un cuerpo razonable

        if len(body) > min_body_chars and exceso > 0:
            reducible = len(body) - min_body_chars
            a_reducir = min(exceso, reducible)
            nuevo_len_body = len(body) - a_reducir
            body = body[:nuevo_len_body] + "... (cuerpo truncado para ajustar contexto)"
            secciones["body"] = body

        # Recalculamos longitud total
        total_chars = sum(len(t) for t in secciones.values())

        # 2) Si aún nos pasamos, aplicamos un factor global
        #    pero intentando NO tocar el análisis por criterio.
        if total_chars > MAX_TOTAL_CHARS:
            factor = MAX_TOTAL_CHARS / float(total_chars)

            nuevas_secciones = {}
            for nombre, texto in secciones.items():
                if not texto:
                    nuevas_secciones[nombre] = texto
                    continue

                # No recortamos analisis_por_criterio si podemos evitarlo
                if nombre == "analisis_por_criterio":
                    nuevas_secciones[nombre] = texto
                    continue

                nuevo_len = int(len(texto) * factor)

                # Nunca recortes a algo ridículamente pequeño si antes era grande
                if nuevo_len < 1000 and len(texto) > 1500:
                    nuevo_len = 1000

                if nuevo_len < len(texto):
                    nuevas_secciones[nombre] = texto[:nuevo_len] + "... (contenido truncado para ajustar contexto)"
                else:
                    nuevas_secciones[nombre] = texto

            # Si tras esto seguimos PASADOS, entonces sí recortamos también analisis_por_criterio
            total_chars_nuevo = sum(len(t) for t in nuevas_secciones.values()) + len(secciones["analisis_por_criterio"])
            if total_chars_nuevo > MAX_TOTAL_CHARS:
                restante_para_criterios = MAX_TOTAL_CHARS - sum(len(t) for t in nuevas_secciones.values())
                texto_criterios = secciones["analisis_por_criterio"]
                if restante_para_criterios > 1000 and len(texto_criterios) > restante_para_criterios:
                    texto_criterios = texto_criterios[:restante_para_criterios] + "... (análisis por criterio truncado para ajustar contexto)"
                nuevas_secciones["analisis_por_criterio"] = texto_criterios
            else:
                nuevas_secciones["analisis_por_criterio"] = secciones["analisis_por_criterio"]

            secciones = nuevas_secciones

    # Recuperamos las secciones (ya recortadas o no)
    body = secciones["body"]
    analisis_titular = secciones["analisis_titular"]
    analisis_veracidad = secciones["analisis_veracidad"]
    valoracion_general = secciones["valoracion_general"]
    analisis_por_criterio = secciones["analisis_por_criterio"]

    # ---------- PROMPT FINAL ----------

    system_prompt = f"""
Eres un asistente especializado en explicar y comentar una única noticia periodística.
Solo puedes usar la información que aparece a continuación.
Si el usuario pregunta algo que no tenga relación con esta noticia o con su evaluación periodística,
responde que solo puedes hablar de esta noticia.

=== TITULAR DE LA NOTICIA ===
{titular}

=== CUERPO DE LA NOTICIA (PUEDE ESTAR RESUMIDO) ===
{body}

=== ANÁLISIS DEL TITULAR ===
{analisis_titular}

=== ANÁLISIS DE VERACIDAD (FACT-CHECKING) ===
{analisis_veracidad}

=== VALORACIÓN GENERAL ===
{valoracion_general}

=== ANÁLISIS DETALLADO POR CRITERIO ===
{analisis_por_criterio}

=== PUNTUACIONES NUMÉRICAS ===
{json.dumps(scores_y_criterios, ensure_ascii=False, indent=2)}
"""
    return system_prompt.strip()


def main():
    if len(sys.argv) != 4:
        print(json.dumps({"error": "Uso: ./chat_with_news.py <news_id> '<message>' '<history_json>'"}), file=sys.stderr)
        sys.exit(1)

    news_id = sys.argv[1]
    user_message = sys.argv[2]

    # Historial de conversación
    try:
        history = json.loads(sys.argv[3])
        if not isinstance(history, list):
            raise ValueError("El historial debe ser una lista.")
    except Exception:
        print(json.dumps({"error": "El historial debe ser un JSON array válido."}), file=sys.stderr)
        sys.exit(1)

    try:
        # Cargar la clave de API (usas PERPLEXITY_API_KEY en tu entorno)
        load_dotenv()
        api_key = os.getenv("PERPLEXITY_API_KEY")
        if not api_key:
            raise ValueError("La variable de entorno PERPLEXITY_API_KEY no está configurada.")

        client = openai.OpenAI(api_key=api_key)

        # 1. Obtener la noticia
        news_data = get_news_by_id(news_id)
        if not news_data:
            print(json.dumps({"error": f"No se encontró ninguna noticia con el ID: {news_id}"}), file=sys.stderr)
            sys.exit(1)

        # 2. Construir el prompt del sistema
        system_prompt = build_system_prompt(news_data)

        # 3. Preparar los mensajes para la API
        messages = [
            {"role": "system", "content": system_prompt},
            *history,
            {"role": "user", "content": user_message}
        ]

        # 4. Llamar al modelo de OpenAI
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.3,
            max_tokens=500
        )

        answer = completion.choices[0].message.content

        # 5. Devolver la respuesta por stdout
        print(json.dumps({"answer": answer}))

    except Exception as e:
        print(json.dumps({"error": f"Ha ocurrido un error: {str(e)}"}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
