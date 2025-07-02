import anthropic
import openai
import re, os
import pymongo
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from Utils import Utils

from dotenv import load_dotenv
load_dotenv()


def procesar_noticias():
    try:
        anthropic_client = anthropic.Anthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY")
        )
        openai.api_key = os.getenv("OPENAI_API_KEY")
        uri = os.getenv("MONGODB_URI")
        client = MongoClient(uri, server_api=ServerApi('1'))
        collection = client['Base_de_datos_noticias']['Noticias']
        query = {"$or": [{"puntuacion": {"$exists": False}, 'fuente':{"$exists": True}}]}
        for doc in collection.find(query):
            print(f"ID de la noticia a analizar: {doc['_id']}")
            titulo = doc.get("titulo")
            if isinstance(titulo, list):
                titulo = ", ".join(titulo)
            elif titulo is None:
                titulo = ""
            else:
                titulo = str(titulo)
            noticia = doc.get("cuerpo")
            if isinstance(noticia, list):
                noticia = " ".join(noticia)
            elif noticia is None:
                noticia = ""
            else:
                noticia = str(noticia)
            autor = doc.get("autor")
            if isinstance(autor, list):
                autor = ", ".join(autor)
            elif autor is None:
                autor = ""
            else:
                autor = str(autor)
            if not titulo or not noticia:
                continue
            print(f"Procesando noticia: {titulo}")
            resultados = Utils.analizar_noticia(anthropic_client, openai, titulo, noticia)
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
            puntuacion_global = int(sum(puntuaciones) / len(puntuaciones)) if puntuaciones else None
            texto_referencia = Utils.generar_texto_referencia(openai, titulo, noticia, valoraciones_texto)
            texto_referencia_diccionario = Utils.crear_diccionario_citas(texto_referencia)
            valoracion_general = Utils.obtener_valoracion_general(openai, titulo, noticia, valoraciones_texto)
            resumen_valoracion = Utils.obtener_resumen_valoracion(openai, valoracion_general)
            valoraciones_html = {}
            for key, md in valoraciones_texto.items():
                valoraciones_html[key] = Utils.convertir_markdown_a_html(md)
            print(f"Procesando titular: {titulo}")
            resultados_titular = Utils.analizar_titular(anthropic_client, openai, titulo)
            titular_reformulado = resultados_titular.get("titular_reformulado")
            es_clickbait = bool(titular_reformulado)
            resumen_valoracion_titular, _ = Utils.obtener_resumen_valoracion_titular(anthropic_client, resultados_titular)
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
                "es_clickbait": es_clickbait
            }
            if puntuacion_global is not None:
                update_fields["puntuacion"] = puntuacion_global
            if titular_reformulado:
                update_fields["titulo_reformulado"] = titular_reformulado
            safe_fields = Utils.sanitize(update_fields)
            collection.update_one({"_id": doc["_id"]}, {"$set": safe_fields})
            print(
                "Base de datos actualizada:\n"
                f"Noticia: {titulo}\n"
                f"Puntuación global: {puntuacion_global}\n"
                f"Puntuación individual: {puntuacion_individual}\n"
                f"Es clickbait: {es_clickbait}\n"
                f"Título reformulado: {titular_reformulado}\n"
            )
            break
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