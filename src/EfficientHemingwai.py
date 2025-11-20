import anthropic
import openai
import os
import pymongo
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from Utils import Utils
import multiprocessing # For parallel processing
import traceback # For detailed error logging in worker
from dotenv import load_dotenv
load_dotenv()

# Global constants for API keys and URI (loaded once in the main process)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") # OpenAI client typically picks this up if set
OLD_MONGODB_URI = os.getenv("OLD_MONGODB_URI")
NEW_MONGODB_URI = os.getenv("NEW_MONGODB_URI")

def procesar_noticia_individual_worker(doc_data_tuple):
    doc_id, titulo, noticia, anthropic_key_worker, openai_key_worker = doc_data_tuple
    try:
        anthropic_client = anthropic.Anthropic(api_key=anthropic_key_worker)
        openai_client = openai.OpenAI(api_key=openai_key_worker if openai_key_worker else None)
        resultados_analisis_noticia = Utils.analizar_noticia(anthropic_client, openai_client, titulo, noticia)
        valoraciones_texto = {}
        puntuacion_individual = {}
        puntuaciones_list = [] 
        if isinstance(resultados_analisis_noticia, dict):
            for key_id, resultado_data in resultados_analisis_noticia.items():
                ks = str(key_id) 
                if isinstance(resultado_data, dict):
                    valoraciones_texto[ks] = resultado_data.get("analisis", "Análisis no disponible")
                    punt = resultado_data.get("puntuacion")
                    puntuacion_individual[ks] = punt
                    if punt is not None:
                        try:
                            puntuaciones_list.append(int(punt))
                        except (ValueError, TypeError):
                            puntuacion_individual[ks] = None
                else:
                    valoraciones_texto[ks] = "Error: Formato de datos de criterio incorrecto."
                    puntuacion_individual[ks] = None
        else:
            return {'doc_id': doc_id, 'status': 'error', 'message': 'Main analysis did not return a dictionary.', 'titulo': titulo}
        puntuacion_global = int(sum(puntuaciones_list) / len(puntuaciones_list)) if puntuaciones_list else None
        texto_referencia = Utils.generar_texto_referencia(openai_client, titulo, noticia, resultados_analisis_noticia)
        texto_referencia_diccionario = Utils.crear_diccionario_citas(texto_referencia)
        valoracion_general = Utils.obtener_valoracion_general(openai_client, titulo, noticia, resultados_analisis_noticia)
        valoraciones_html = {}
        if isinstance(valoraciones_texto, dict):
            for key_html, md_text in valoraciones_texto.items(): 
                valoraciones_html[key_html] = Utils.convertir_markdown_a_html(md_text)
        resultados_titular = Utils.analizar_titular(anthropic_client, openai_client, titulo)
        titular_reformulado = None
        es_clickbait = False
        valoracion_del_titular_info = "Análisis del titular no disponible."
        if isinstance(resultados_titular, dict):
            titular_reformulado = resultados_titular.get("titular_reformulado")
            es_clickbait = resultados_titular.get("es_clickbait_evaluado", False) 
            valoracion_del_titular_info = resultados_titular
        else:
            print(f"WARN: Worker {os.getpid()} - Titular analysis for '{titulo}' did not return a dict.")
        update_fields = {
            "valoraciones": valoraciones_texto, 
            "puntuacion_individual": puntuacion_individual, 
            "texto_referencia": texto_referencia,
            "texto_referencia_diccionario": texto_referencia_diccionario,
            "valoracion_titular": valoracion_del_titular_info, 
            "valoracion_general": valoracion_general,
            "valoraciones_html": valoraciones_html, 
            "es_clickbait": es_clickbait,
            "puntuacion": puntuacion_global
        }
        if titular_reformulado:
            update_fields["titulo_reformulado"] = titular_reformulado
        else:
            update_fields["titulo_reformulado"] = None
        safe_fields = Utils.sanitize(update_fields)
        return {'doc_id': doc_id, 'status': 'success', 'fields_to_update': safe_fields, 'titulo': titulo}
    except Exception as e:
        error_message = f"Error in worker for doc ID {doc_id} ({titulo}): {e}\nTraceback: {traceback.format_exc()}"
        print(error_message)
        return {'doc_id': doc_id, 'status': 'error', 'message': error_message, 'titulo': titulo}

def procesar_noticias():
    if not all([ANTHROPIC_API_KEY, OLD_MONGODB_URI, NEW_MONGODB_URI]):
        print("FATAL: Essential environment variables (ANTHROPIC_API_KEY, OLD_MONGODB_URI, NEW_MONGODB_URI) are not set. Exiting.")
        return
    try:
        # Leer de la base antigua
        old_client = MongoClient(OLD_MONGODB_URI, server_api=ServerApi('1'))
        old_db = old_client['Base_de_datos_noticias']
        old_collection = old_db['Noticias']
        # Guardar en la base nueva
        new_client = MongoClient(NEW_MONGODB_URI, server_api=ServerApi('1'))
        new_db = new_client['Base_de_datos_noticias']
        new_collection = new_db['Noticias']
        query = {
            "$and": [
                {'fuente': {"$exists": True}},
                {"$or": [
                    {"puntuacion": {"$exists": False}},
                    {"puntuacion": None},
                    {"valoraciones": {"$exists": False}},
                    {"valoracion_titular": {"$exists": False}}
                ]}
            ]
        }
        documents_to_process_cursor = old_collection.find(query).limit(os.cpu_count() * 2 if os.cpu_count() else 4)
        documents_data = []
        for doc in documents_to_process_cursor:
            if doc.get("titulo") and doc.get("cuerpo"):
                documents_data.append((
                    doc["_id"], 
                    doc.get("titulo"), 
                    doc.get("cuerpo"),
                    ANTHROPIC_API_KEY, # Pass API key
                    OPENAI_API_KEY    # Pass API key (or None if relying on env var in worker)
                ))
            else:
                print(f"INFO: Document {doc.get('_id')} skipped due to missing title or body before processing.")
        if not documents_data:
            print("INFO: No valid documents found to process after initial filtering.")
            return
        num_processes = min(len(documents_data), os.cpu_count() if os.cpu_count() else 2)
        print(f"INFO: Starting parallel processing with {num_processes} workers for {len(documents_data)} documents.")
        with multiprocessing.Pool(processes=num_processes) as pool:
            results = pool.map(procesar_noticia_individual_worker, documents_data)
        successful_updates = 0
        failed_updates = 0
        for idx, result in enumerate(results):
            if result and result.get('status') == 'success':
                try:
                    # Copiar campos básicos antes de procesar la noticia
                    Utils.copy_basic_fields_to_new_db(doc, old_collection, new_collection)
                    # Guardar en la base de datos nueva
                    new_collection.update_one({"_id": result['doc_id']}, {"$set": result['fields_to_update']}, upsert=True)
                    print(f"SUCCESS: Document ID {result['doc_id']} ('{result.get('titulo', 'N/A')[:50]}...') updated in NEW MongoDB.")
                    successful_updates +=1
                except Exception as e_mongo_update:
                    print(f"ERROR: MongoDB update failed for Doc ID {result['doc_id']}: {e_mongo_update}")
                    failed_updates +=1
            elif result:
                print(f"ERROR_REPORT: Processing failed for Doc ID {result.get('doc_id')} ('{result.get('titulo', 'N/A')[:50]}...'): {result.get('message', 'Unknown error')}")
                failed_updates +=1
            else:
                print(f"ERROR: Malformed result from worker: {result}")
                failed_updates +=1
        print(f"INFO: Parallel processing finished. Successful updates: {successful_updates}, Failed updates: {failed_updates}.")
        old_client.close()
        new_client.close()
    except pymongo.errors.ConnectionFailure as e_conn:
        print(f"FATAL: MongoDB Connection Error in main process: {e_conn}")
    except Exception as e_main:
        print(f"FATAL: An unexpected error occurred in the main procesar_noticias function: {e_main}")
        traceback.print_exc()

if __name__ == "__main__":
    procesar_noticias()

