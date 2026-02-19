import anthropic
import openai
import re
import os
import sys
import uuid
import pymongo
from datetime import datetime, timezone
from bson.objectid import ObjectId
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from Utils import Utils
from dotenv import load_dotenv
load_dotenv()
from MongoDB import MongoDBService
from deterministic_engine import compute_evaluation_result
from llm_alert_extractor import extract_alerts_with_llm

# Pipeline metadata constants (V2 traceability)
ENGINE_VERSION = "v2.0.0"
PIPELINE_VERSION = os.getenv("GIT_SHA", "pipeline.2026-02-15")
try:
    ALERT_MIN_BODY_CHARS = int(os.getenv("ALERT_MIN_BODY_CHARS", "400"))
except ValueError:
    ALERT_MIN_BODY_CHARS = 400


def procesar_noticias():
    try:
        anthropic_client = anthropic.Anthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY")
        )
        openai.api_key = os.getenv("OPENAI_API_KEY")
        old_uri = os.getenv("OLD_MONGODB_URI")
        new_uri = os.getenv("NEW_MONGODB_URI")
        if not old_uri or not new_uri:
            print("Faltan OLD_MONGODB_URI o NEW_MONGODB_URI en el .env")
            return
        # Conexiones
        old_client = MongoClient(old_uri, server_api=ServerApi('1'))
        old_collection = old_client['Base_de_datos_noticias']['Noticias']
        new_client = MongoClient(new_uri, server_api=ServerApi('1'))
        new_collection = new_client['Base_de_datos_noticias']['Noticias']
        
        doc_to_analyze = None

        # Si se pasa un ID, se busca esa noticia, se asegura de que esté en la nueva DB y se procesa.
        if len(sys.argv) > 1:
            noticia_id_str = sys.argv[1]
            if not re.match(r"^[a-fA-F0-9]{24}$", noticia_id_str):
                print(f"El ID proporcionado '{noticia_id_str}' no es válido.")
                return
            
            noticia_id = ObjectId(noticia_id_str)
            
            # Buscar primero en la colección "antigua", que es la fuente de verdad
            doc_from_old = old_collection.find_one({'_id': noticia_id})
            
            if doc_from_old:
                # Si se encuentra, se copia/actualiza en la colección "nueva" para replicar el flujo original
                new_collection.replace_one({'_id': noticia_id}, doc_from_old, upsert=True)
                # El documento a analizar se carga desde la colección "nueva"
                doc_to_analyze = new_collection.find_one({'_id': noticia_id})
            else:
                # Si no está en la antigua, podría estar ya solo en la nueva
                doc_to_analyze = new_collection.find_one({'_id': noticia_id})

            if not doc_to_analyze:
                print(f"No se encontró la noticia con ID {noticia_id_str} en ninguna de las colecciones.")
                return
        else:
            # Si no se pasa ID, se busca la primera noticia sin 'puntuacion'
            for doc in old_collection.find({}):
                _id = doc['_id']
                if ('puntuacion' not in doc or doc['puntuacion'] in (None, '')):
                    doc_nueva = new_collection.find_one({'_id': _id})
                    if not doc_nueva or ('puntuacion' not in doc_nueva or doc_nueva['puntuacion'] in (None, '')):
                        new_collection.replace_one({'_id': _id}, doc, upsert=True)
                        doc_to_analyze = new_collection.find_one({'_id': _id})
                        break # Salir del bucle una vez encontrada
        
        if not doc_to_analyze:
            print("No se encontró ninguna noticia para procesar.")
            return

        # --- Pipeline run metadata (traceability) ---
        RUN_ID = str(uuid.uuid4())
        NOW_ISO = datetime.now(timezone.utc).isoformat()
        print(f"Run ID: {RUN_ID}")

        # --- Lógica de análisis (común para ambos casos) ---
        print(f"ID de la noticia a analizar: {doc_to_analyze['_id']}")
        titulo = doc_to_analyze.get("titulo")
        if isinstance(titulo, list):
            titulo = ", ".join(titulo)
        elif titulo is None:
            titulo = ""
        else:
            titulo = str(titulo)
        noticia = doc_to_analyze.get("cuerpo")
        if isinstance(noticia, list):
            noticia = " ".join(noticia)
        elif noticia is None:
            noticia = ""
        else:
            noticia = str(noticia)
        autor = doc_to_analyze.get("autor")
        if isinstance(autor, list):
            autor = ", ".join(autor)
        elif autor is None:
            autor = ""
        else:
            autor = str(autor)
        if not titulo or not noticia:
            print("Noticia sin título o cuerpo, se omite.")
            # Marcar la noticia como descartada para que no se vuelva a seleccionar
            new_collection.update_one(
                {"_id": doc_to_analyze['_id']},
                {"$set": {"puntuacion": -1}},
                upsert=True # Asegurarse de que el documento se actualice incluso si solo existe en la nueva colección
            )
            return
        print(f"Procesando noticia: {titulo}")
        resultados = Utils.analizar_noticia(anthropic_client, openai, titulo, noticia)
        # --- Generar embedding del cuerpo de la noticia y guardarlo (con reintentos) ---
        import time
        noticia_embedding = None
        for intento in range(3):
            try:
                embedding_response = openai.embeddings.create(
                    input=noticia,
                    model="text-embedding-3-small"
                )
                noticia_embedding = embedding_response.data[0].embedding
                break
            except Exception as e:
                print(f"Error al generar el embedding (intento {intento+1}/3): {e}")
                if intento < 2:
                    time.sleep(2 ** intento)  # 1s, 2s, 4s
        valoraciones_texto = {}
        puntuaciones = []
        puntuacion_individual = {}
        for key, resultado in resultados.items():
            ks = str(key)
            if isinstance(resultado, dict) and "mensaje" in resultado:
                valoraciones_texto[ks] = resultado["mensaje"]
                punt = None
            else:
                valoraciones_texto[ks] = resultado
                punt = Utils.obtener_puntuacion_final(openai, titulo, noticia, resultado)
            puntuacion_individual[ks] = punt
            if punt is not None:
                puntuaciones.append(punt)
        puntuacion_global = round(sum(puntuaciones) / len(puntuaciones), 1) if puntuaciones else None
        texto_referencia = Utils.generar_texto_referencia(openai, titulo, noticia, valoraciones_texto)
        texto_referencia_diccionario = Utils.crear_diccionario_citas(texto_referencia)
        valoracion_general = Utils.obtener_valoracion_general(openai, titulo, noticia, valoraciones_texto)
        resumen_valoracion = Utils.obtener_resumen_valoracion(openai, valoracion_general)
        valoraciones_html = {}
        for key, md in valoraciones_texto.items():
            valoraciones_html[key] = Utils.convertir_markdown_a_html(md)
        
        # --- V2 Deterministic Engine Integration ---
        # Map legacy keys (1-5) to V2 keys
        key_mapping = {
            "1": "fiabilidad",
            "2": "adecuacion",
            "3": "claridad",
            "4": "profundidad",
            "5": "enfoque"
        }
        
        # Construct model_scores for engine
        v2_scores = {}
        missing_scores = []
        for old_key, new_key in key_mapping.items():
            val = puntuacion_individual.get(old_key)
            if val is None:
                missing_scores.append(new_key)
            v2_scores[new_key] = {
                "value": val,
                "justification": valoraciones_texto.get(old_key, "")
            }
            
        collected_alerts = extract_alerts_with_llm(
            openai,
            valoraciones_texto,
            puntuacion_individual,
            Utils.criterios,
            texto_referencia=texto_referencia,
            max_alerts=8,
        )
        collected_alerts = Utils.dedupe_alerts(collected_alerts)
        collected_alerts = Utils.sort_alerts(collected_alerts)
        model_scores = {
            "scores": v2_scores,
            "alerts": collected_alerts
        }
        
        meta_info = {
            "url": doc_to_analyze.get("url", ""),
            "title": titulo,
            "date": str(doc_to_analyze.get("fecha_publicacion", "")),
            "source": doc_to_analyze.get("fuente", ""),
            "author": autor
        }
        
        if missing_scores:
            print(f"Warning: Missing scores for {missing_scores}. Skipping deterministic engine calculation.")
            missing_alerts = Utils.dedupe_alerts(collected_alerts)
            missing_alerts = Utils.sort_alerts(missing_alerts)
            evaluation_result = {
                "meta": meta_info,
                "scores": model_scores["scores"],
                "alerts": missing_alerts,
                "alerts_summary": Utils.build_alerts_summary(missing_alerts),
                "audit": {
                    "rules_fired": [f"RULE:MODEL_OUTPUT_INVALID_SCHEMA:{c}" for c in missing_scores],
                    "inconsistencies": [],
                    "inconsistencies_details": [],
                    "decision_path": ["Missing scores -> deterministic engine skipped"],
                },
                "error": {
                    "code": "INCOMPLETE_MODEL_SCORES",
                    "message": f"Missing numeric score for: {', '.join(missing_scores)}",
                    "missing": missing_scores,
                    "raw_scores_available": [k for k in v2_scores if k not in missing_scores]
                }
            }
            pipeline_status = "scored_with_missing"
            # Keep legacy puntuacion_global (calculated as mean of available scores)
        else:
            evaluation_result = compute_evaluation_result(
                model_scores,
                meta_info,
                raw_body=noticia,
                min_body_chars=ALERT_MIN_BODY_CHARS,
            )
            # Update global score with the V2 derived global score
            puntuacion_global = evaluation_result["derived"]["global_score"]
            pipeline_status = "scored"

        # Ensure consistent alert/audit shape before persistence
        final_alerts = Utils.dedupe_alerts(evaluation_result.get("alerts", []))
        final_alerts = Utils.sort_alerts(final_alerts)
        evaluation_result["alerts"] = final_alerts
        evaluation_result["alerts_summary"] = Utils.build_alerts_summary(final_alerts)
        evaluation_result.setdefault("audit", {})
        evaluation_result["audit"].setdefault("rules_fired", [])
        evaluation_result["audit"].setdefault("inconsistencies", [])
        evaluation_result["audit"].setdefault("inconsistencies_details", [])
        evaluation_result["audit"].setdefault("decision_path", [])

        # Pipeline and evaluation_meta for traceability (always stored)
        pipeline_meta = {
            "run_id": RUN_ID,
            "pipeline_version": PIPELINE_VERSION,
            "engine_version": ENGINE_VERSION,
            "status": pipeline_status,
            "steps": {
                "scoring": {"ok": not bool(missing_scores), "at": NOW_ISO}
            }
        }
        evaluation_meta = {
            "run_id": RUN_ID,
            "evaluated_at": NOW_ISO,
            "engine_version": ENGINE_VERSION,
            "pipeline_version": PIPELINE_VERSION
        }

        print(f"Procesando titular: {titulo}")
        resultados_titular = Utils.analizar_titular(anthropic_client, openai, titulo)
        resumen_valoracion_titular = Utils.obtener_resumen_valoracion_titular(anthropic_client, resultados_titular)
        es_clickbait = bool(resultados_titular.get("is_clickbait", False))
        titular_reformulado = resultados_titular.get("titular_reformulado") if es_clickbait else None

        update_fields = {
            "valoraciones": valoraciones_texto,
            "puntuacion_individual": puntuacion_individual,
            "texto_referencia": texto_referencia,
            "texto_referencia_diccionario": texto_referencia_diccionario,
            "valoracion_titular": resultados_titular,
            "valoracion_general": valoracion_general,
            "resumen_valoracion": resumen_valoracion,
            "resumen_valoracion_titular": resumen_valoracion_titular,
            "valoraciones_html": valoraciones_html,
            "es_clickbait": es_clickbait,
            "embedding": noticia_embedding,
            "evaluation_result": evaluation_result,
            "pipeline": pipeline_meta,
            "evaluation_meta": evaluation_meta
        }
        if puntuacion_global is not None:
            update_fields["puntuacion"] = puntuacion_global
        if titular_reformulado:
            update_fields["titulo_reformulado"] = titular_reformulado
        # Añadir campos básicos al update final (por si acaso)
        basic_fields = [
            'titulo', 'cuerpo', 'url', 'autor', 'fecha_publicacion', 'fuente',
            'fecha_extraccion', 'tags', 'keywords', 'top_image', 'images', 'is_media_news'
        ]
        for field in basic_fields:
            value = doc_to_analyze.get(field)
            if value is not None and value != '':
                update_fields[field] = value
        safe_fields = Utils.sanitize(update_fields)
        # Guardar en la base de datos nueva
        new_collection.update_one({"_id": doc_to_analyze['_id']}, {"$set": safe_fields}, upsert=True)
        print(
            "Base de datos nueva actualizada:\n"
            f"Noticia: {titulo}\n"
            f"Puntuación global: {puntuacion_global}\n"
            f"Puntuación individual: {puntuacion_individual}\n"
            f"Es clickbait: {es_clickbait}\n"
            f"Título reformulado: {titular_reformulado}\n"
        )

    except pymongo.errors.ConnectionFailure as e:
        print(f"Error de conexión a MongoDB: {e}")
    except anthropic.APIError as e:
        print(f"Error de API Anthropic: {e}")
    except openai.OpenAIError as e:
        print(f"Error de API OpenAI: {e}")
    except Exception as e:
        print(f"Error inesperado: {e}")

if __name__ == "__main__":
    procesar_noticias()
