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
MONGODB_URI = os.getenv("MONGODB_URI")

def procesar_noticia_individual_worker(doc_data_tuple):
    """
    Worker function to process a single news article.
    This function will be executed in a separate process.
    """
    doc_id, titulo, noticia, anthropic_key_worker, openai_key_worker, mongodb_uri_worker = doc_data_tuple

    try:
        # Initialize clients within the worker process
        # Note: OpenAI client v1.0+ uses env var OPENAI_API_KEY by default if api_key is not passed.
        # If openai_key_worker is None, it will rely on the environment variable.
        anthropic_client = anthropic.Anthropic(api_key=anthropic_key_worker)
        openai_client = openai.OpenAI(api_key=openai_key_worker if openai_key_worker else None)
        
        # MongoDB client for this worker (not strictly needed if updates are done in main process from results)
        # However, if worker needs to read/write intermediate states, it might be useful.
        # For this refactor, we'll only return data to main process for DB update.

        # Core processing logic (from the original loop)
        # print(f"WORKER {os.getpid()}: Processing noticia: {titulo}") # Optional: for debugging
        
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
                            puntuacion_individual[ks] = None # Ensure invalid scores are None
                else: # resultado_data is not a dict
                    valoraciones_texto[ks] = "Error: Formato de datos de criterio incorrecto."
                    puntuacion_individual[ks] = None
        else: # resultados_analisis_noticia is not a dict
            # Handle case where initial analysis failed significantly
            return {'doc_id': doc_id, 'status': 'error', 'message': 'Main analysis did not return a dictionary.', 'titulo': titulo}

        
        puntuacion_global = int(sum(puntuaciones_list) / len(puntuaciones_list)) if puntuaciones_list else None
        
        # Assuming openai_client is correctly initialized for these utility functions
        texto_referencia = Utils.generar_texto_referencia(openai_client, titulo, noticia, resultados_analisis_noticia)
        texto_referencia_diccionario = Utils.crear_diccionario_citas(texto_referencia)
        valoracion_general = Utils.obtener_valoracion_general(openai_client, titulo, noticia, resultados_analisis_noticia)
        
        valoraciones_html = {}
        if isinstance(valoraciones_texto, dict):
            for key_html, md_text in valoraciones_texto.items(): 
                valoraciones_html[key_html] = Utils.convertir_markdown_a_html(md_text)
        
        # print(f"WORKER {os.getpid()}: Processing titular: {titulo}") # Optional: for debugging
        resultados_titular = Utils.analizar_titular(anthropic_client, openai_client, titulo)
        
        titular_reformulado = None
        es_clickbait = False
        valoracion_del_titular_info = "Análisis del titular no disponible."

        if isinstance(resultados_titular, dict):
            titular_reformulado = resultados_titular.get("titular_reformulado")
            es_clickbait = resultados_titular.get("es_clickbait_evaluado", False) 
            # Storing the whole dict as per instructions
            valoracion_del_titular_info = resultados_titular
        else: # resultados_titular is not a dict
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
            "puntuacion": puntuacion_global # Can be None
        }
        if titular_reformulado:
            update_fields["titulo_reformulado"] = titular_reformulado
        else:
            update_fields["titulo_reformulado"] = None # Ensure field is present or nullified

        safe_fields = Utils.sanitize(update_fields)
        
        return {'doc_id': doc_id, 'status': 'success', 'fields_to_update': safe_fields, 'titulo': titulo}

    except Exception as e:
        # Log the full traceback for detailed error diagnosis from the worker
        error_message = f"Error in worker for doc ID {doc_id} ({titulo}): {e}\nTraceback: {traceback.format_exc()}"
        print(error_message) # Print error in worker for visibility if logs aren't centralized
        return {'doc_id': doc_id, 'status': 'error', 'message': error_message, 'titulo': titulo}


def procesar_noticias():
    if not all([ANTHROPIC_API_KEY, MONGODB_URI]): # OPENAI_API_KEY is checked by client
        print("FATAL: Essential environment variables (ANTHROPIC_API_KEY, MONGODB_URI) are not set. Exiting.")
        return

    try:
        # Initialize MongoDB client in the main process for querying and final updates
        mongo_client = MongoClient(MONGODB_URI, server_api=ServerApi('1'))
        db = mongo_client['Base_de_datos_noticias']
        collection = db['Noticias']
        
        # Fetch documents to process
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
        # Fetch necessary fields from documents. Convert cursor to list.
        # Limiting for development; remove .limit() for production.
        documents_to_process_cursor = collection.find(query).limit(os.cpu_count() * 2 if os.cpu_count() else 4) # Example limit
        documents_data = []
        for doc in documents_to_process_cursor:
            if doc.get("titulo") and doc.get("cuerpo"):
                documents_data.append((
                    doc["_id"], 
                    doc.get("titulo"), 
                    doc.get("cuerpo"),
                    ANTHROPIC_API_KEY, # Pass API key
                    OPENAI_API_KEY,    # Pass API key (or None if relying on env var in worker)
                    MONGODB_URI        # Pass URI (though worker doesn't use it in this version)
                ))
            else:
                print(f"INFO: Document {doc.get('_id')} skipped due to missing title or body before processing.")

        if not documents_data:
            print("INFO: No valid documents found to process after initial filtering.")
            return

        num_processes = min(len(documents_data), os.cpu_count() if os.cpu_count() else 2) # Adjust as needed
        print(f"INFO: Starting parallel processing with {num_processes} workers for {len(documents_data)} documents.")

        # Create a multiprocessing Pool
        with multiprocessing.Pool(processes=num_processes) as pool:
            # Use pool.map to apply the worker function to the list of document data
            results = pool.map(procesar_noticia_individual_worker, documents_data)

        # Process results
        successful_updates = 0
        failed_updates = 0
        for result in results:
            if result and result.get('status') == 'success':
                try:
                    collection.update_one({"_id": result['doc_id']}, {"$set": result['fields_to_update']})
                    print(f"SUCCESS: Document ID {result['doc_id']} ('{result.get('titulo', 'N/A')[:50]}...') updated in MongoDB.")
                    successful_updates +=1
                except Exception as e_mongo_update:
                    print(f"ERROR: MongoDB update failed for Doc ID {result['doc_id']}: {e_mongo_update}")
                    failed_updates +=1
            elif result: # Implies status is 'error' or result is malformed
                print(f"ERROR_REPORT: Processing failed for Doc ID {result.get('doc_id')} ('{result.get('titulo', 'N/A')[:50]}...'): {result.get('message', 'Unknown error')}")
                failed_updates +=1
            else: # Should not happen if worker always returns a dict
                print(f"ERROR: Malformed result from worker: {result}")
                failed_updates +=1
        
        print(f"INFO: Parallel processing finished. Successful updates: {successful_updates}, Failed updates: {failed_updates}.")
        mongo_client.close()

    except pymongo.errors.ConnectionFailure as e_conn:
        print(f"FATAL: MongoDB Connection Error in main process: {e_conn}")
    except Exception as e_main:
        print(f"FATAL: An unexpected error occurred in the main procesar_noticias function: {e_main}")
        traceback.print_exc()

if __name__ == "__main__":
    # Ensure multiprocessing context is set up correctly, especially for macOS/Windows
    # multiprocessing.set_start_method('spawn', force=True) # May be needed on some OS
    procesar_noticias()
```
