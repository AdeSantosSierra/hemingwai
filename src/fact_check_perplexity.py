# -*- coding: utf-8 -*-
import os
import sys
import json
import re
import time
from openai import OpenAI
from dotenv import load_dotenv
from bson import ObjectId

# --- Configuración de directorios ---
# Añadir el directorio src al sys.path para permitir importaciones locales
SRC_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SRC_DIR)
sys.path.append(SRC_DIR)

# --- Importar módulos locales ---
# Se importa después de haber añadido SRC_DIR al path
from MongoDB import MongoDBService
from env_config import (
    get_env_bool,
    get_env_first,
    get_env_int,
    validate_required,
    validate_required_any,
)

# --- Cargar variables de entorno ---
dotenv_path = os.path.join(ROOT_DIR, '.env')
if not os.path.exists(dotenv_path):
    print(f"Error: El archivo .env no se encuentra en {ROOT_DIR}")
    sys.exit(1)
load_dotenv(dotenv_path=dotenv_path)

# --- Configuración de variables ---
PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")
PERPLEXITY_BASE_URL = os.getenv("PERPLEXITY_BASE_URL", "https://api.perplexity.ai")
PERPLEXITY_MODEL_FACT_CHECK = os.getenv("PERPLEXITY_MODEL_FACT_CHECK", "sonar-deep-research")
PERPLEXITY_MAX_TOKENS = get_env_int("PERPLEXITY_MAX_TOKENS", 1000)
PERPLEXITY_TIMEOUT_SECONDS = get_env_int("PERPLEXITY_TIMEOUT_SECONDS", 120)
PERPLEXITY_RETRIES = get_env_int("PERPLEXITY_RETRIES", 2)
PERPLEXITY_RETRY_BASE_SECONDS = get_env_int("PERPLEXITY_RETRY_BASE_SECONDS", 2)
FEATURE_ENABLE_PERPLEXITY = get_env_bool("FEATURE_ENABLE_PERPLEXITY", True)
FEATURE_FAIL_OPEN_PERPLEXITY = get_env_bool("FEATURE_FAIL_OPEN_PERPLEXITY", False)
MONGO_URI = get_env_first(("MONGO_WRITE_URI", "NEW_MONGODB_URI", "MONGODB_URI"))
DB_NAME = os.getenv("MONGO_DB_NAME", "Base_de_datos_noticias")
COLLECTION_NAME = os.getenv("MONGO_COLLECTION_NAME", "Noticias")

# --- Validar configuración ---
try:
    validate_required_any(
        {"mongo_write_uri": ("MONGO_WRITE_URI", "NEW_MONGODB_URI", "MONGODB_URI")},
        active=FEATURE_ENABLE_PERPLEXITY,
        context="fact_check_perplexity",
    )
    validate_required(
        ["PERPLEXITY_API_KEY"],
        active=FEATURE_ENABLE_PERPLEXITY and not FEATURE_FAIL_OPEN_PERPLEXITY,
        context="fact_check_perplexity",
    )
except RuntimeError as e:
    print(f"Error: {e}")
    sys.exit(1)


def _build_perplexity_step(status: str, error: str = None, ok: bool = False) -> dict:
    from datetime import datetime, timezone
    step = {
        "ok": bool(ok),
        "at": datetime.now(timezone.utc).isoformat(),
        "provider": "perplexity",
        "status": status,
        "artifact": "output_temporal/fact_check_analisis.json",
    }
    if error:
        step["error"] = str(error)[:1000]
    return step


def _persist_perplexity_step(collection, obj_id, status: str, error: str = None, ok: bool = False, analisis: str = None, fuentes=None):
    if collection is None or obj_id is None:
        return
    fuentes = fuentes or []
    step = _build_perplexity_step(status=status, error=error, ok=ok)
    update_doc = {
        "pipeline.steps.perplexity": step,
        "pipeline.steps.fact_check": step,  # compatibilidad con consumidores actuales
    }
    if analisis is not None:
        update_doc["fact_check_analisis"] = analisis
    if fuentes is not None:
        update_doc["fact_check_fuentes"] = fuentes
    if ok:
        update_doc["pipeline.status"] = "fact_checked"
    collection.update_one({"_id": obj_id}, {"$set": update_doc})

def verificar_noticia(noticia_id: str) -> dict:
    """
    Obtiene una noticia de MongoDB y utiliza Perplexity AI para verificar su veracidad.

    Args:
        noticia_id (str): El ID de la noticia a verificar.

    Returns:
        dict: Un diccionario con el análisis y las fuentes, o un diccionario de error.
    """
    if not FEATURE_ENABLE_PERPLEXITY:
        return {
            "noticia_id": noticia_id,
            "analisis": "Fact-check deshabilitado por configuración.",
            "fuentes": [],
            "warning": "feature_disabled",
        }

    # --- Conexión a MongoDB ---
    print(f"Conectando a MongoDB en la base de datos '{DB_NAME}'...")
    try:
        mongo_service = MongoDBService(MONGO_URI, db_name=DB_NAME)
        collection = mongo_service.get_collection(COLLECTION_NAME)
    except Exception as e:
        return {"error": f"Error al conectar con MongoDB: {e}"}

    # --- Obtener el cuerpo de la noticia ---
    print(f"Buscando la noticia con ID: {noticia_id}...")
    try:
        obj_id = ObjectId(noticia_id)
        noticia_doc = collection.find_one({"_id": obj_id})
    except Exception as e:
        mongo_service.close()
        return {"error": f"Error al buscar la noticia. ID inválido o problema de base de datos: {e}"}

    if not noticia_doc or "cuerpo" not in noticia_doc:
        mongo_service.close()
        return {"error": f"Error: No se encontró la noticia con ID '{noticia_id}' o no tiene campo 'cuerpo'."}

    run_id = (noticia_doc.get("pipeline") or {}).get("run_id")
    cuerpo_noticia = noticia_doc["cuerpo"]
    print("Noticia encontrada. Procediendo a la verificación de hechos.")

    # --- Cliente de Perplexity AI ---
    try:
        if not PERPLEXITY_API_KEY:
            if FEATURE_FAIL_OPEN_PERPLEXITY:
                _persist_perplexity_step(collection, obj_id, status="degraded", error="missing_api_key", ok=False, analisis="Fact-check no disponible por falta de credenciales.", fuentes=[])
                result = {
                    "noticia_id": noticia_id,
                    "analisis": "Fact-check no disponible por falta de credenciales.",
                    "fuentes": [],
                    "warning": "missing_api_key",
                }
                if run_id:
                    result["run_id"] = run_id
                return result
            raise RuntimeError("Missing PERPLEXITY_API_KEY")

        client = OpenAI(
            api_key=PERPLEXITY_API_KEY,
            base_url=PERPLEXITY_BASE_URL
        )

        messages = [
            {
                "role": "system",
                "content": (
                    "Eres un verificador de hechos altamente cualificado y objetivo. Tu tarea es analizar la siguiente noticia y determinar su veracidad. "
                    "Verifica puntualmente todos los datos numéricos y afirmaciones concretas (cifras, fechas, lugares, nombres) consultando fuentes fiables. "
                    "Señala explícitamente cualquier dato inexacto o contradictorio, proporcionando las correcciones fundamentadas. "
                    "Incluye en la evaluación la precisión de dichos datos y cómo impactan en la comprensión global de la noticia. "
                    "Es vital confrontar las formulaciones de la noticia con declaraciones o comunicados oficiales y comparar cómo se expresan en medios de referencia, detectando rápidamente cambios de sentido en verbos y expresiones clave. "
                    "Basa tu análisis únicamente en las fuentes que la API devuelve en el campo 'search_results'. "
                    "Es crucial que cites estas fuentes en tu respuesta usando marcadores numéricos (ej. [1], [2]). "
                    "¡MUY IMPORTANTE! Solo debes incluir un marcador de cita si corresponde a una de las URLs proporcionadas en los resultados de búsqueda de la API. No inventes citas ni uses información externa a las fuentes proporcionadas. "
                    "Si no se devuelven fuentes, indica claramente al final de tu análisis: 'No se encontraron fuentes para este análisis.'. "
                    "Evita las expresiones “hecho objetivo”, “dato objetivo”, “interpretación subjetiva”, “verdad objetiva”, “neutral”. Utiliza, en cambio, “hecho”, “dato”, “interpretación”, “verdad”, “imparcial”, “ecuánime”, “adecuado”. "
                    "La respuesta solo puede ser texto plano, sin emoticonos ni tablas."
                )
            },
            {
                "role": "user",
                "content": f"Por favor, verifica la siguiente noticia:\n\n{cuerpo_noticia}"
            }
        ]

        # --- Llamada a la API ---
        print("Enviando la noticia a Perplexity AI para su análisis...")
        response = None
        last_error = None
        attempts = max(1, PERPLEXITY_RETRIES)
        for attempt in range(attempts):
            try:
                response = client.chat.completions.create(
                    model=PERPLEXITY_MODEL_FACT_CHECK,
                    messages=messages,
                    max_tokens=PERPLEXITY_MAX_TOKENS,
                    timeout=PERPLEXITY_TIMEOUT_SECONDS,
                )
                break
            except Exception as e:
                last_error = e
                if attempt < attempts - 1:
                    time.sleep((2 ** attempt) * PERPLEXITY_RETRY_BASE_SECONDS)
        if response is None:
            if FEATURE_FAIL_OPEN_PERPLEXITY:
                _persist_perplexity_step(collection, obj_id, status="degraded", error=f"provider_unavailable: {last_error}", ok=False, analisis="Fact-check no disponible por error del proveedor Perplexity.", fuentes=[])
                return {
                    "noticia_id": noticia_id,
                    "analisis": "Fact-check no disponible por error del proveedor Perplexity.",
                    "fuentes": [],
                    "warning": f"Perplexity unavailable: {last_error}",
                }
            raise RuntimeError(f"Perplexity unavailable: {last_error}")
        
        # Convertir la respuesta a un diccionario para un acceso seguro
        response_dict = response.model_dump()
        
        # Extraer análisis y citas de la respuesta
        analisis_bruto = response_dict.get("choices", [{}])[0].get("message", {}).get("content", "")
        # Limpiar el análisis de cualquier bloque de "pensamiento" interno del modelo
        analisis = re.sub(r'<think>.*?</think>', '', analisis_bruto, flags=re.DOTALL).strip()
        
        # El campo correcto es 'search_results'. Extraemos la URL de cada resultado.
        search_results = response_dict.get("search_results", [])
        fuentes = [result.get("url") for result in search_results if result.get("url")]
        
        print("Análisis recibido correctamente.")

        # Imprimir las fuentes en la terminal si se encontraron
        if fuentes:
            print("\n--- Fuentes Encontradas ---")
            for i, fuente in enumerate(fuentes, 1):
                print(f"[{i}] {fuente}")
            print(" --\n")
        else:
            print("No se encontraron fuentes en la respuesta de la API.")
        
        # Guardar el análisis y las fuentes en MongoDB y actualizar pipeline.steps
        try:
            _persist_perplexity_step(collection, obj_id, status="ok", ok=True, analisis=analisis, fuentes=fuentes)
            print("Análisis y estado de Perplexity guardados exitosamente en MongoDB.")
        except Exception as e:
            print(f"Error al guardar en MongoDB: {e}")

        result = {"noticia_id": noticia_id, "analisis": analisis, "fuentes": fuentes}
        if run_id:
            result["run_id"] = run_id
        return result
        
    except Exception as e:
        if FEATURE_FAIL_OPEN_PERPLEXITY:
            if 'collection' in locals() and 'obj_id' in locals():
                _persist_perplexity_step(collection, obj_id, status="degraded", error=f"fact_check_error: {e}", ok=False, analisis="Fact-check no disponible por error inesperado.", fuentes=[])
            return {
                "noticia_id": noticia_id,
                "analisis": "Fact-check no disponible por error inesperado.",
                "fuentes": [],
                "warning": f"fact_check_error: {e}",
            }
        return {"error": f"Error al contactar con la API de Perplexity: {e}"}
    finally:
        # Asegurarse de cerrar la conexión a MongoDB
        if 'mongo_service' in locals() and mongo_service:
            mongo_service.close()
            print("Conexión a MongoDB cerrada.")

if __name__ == "__main__":
    # --- Validar argumento de entrada ---
    if len(sys.argv) != 2:
        print("Uso: python verificar_noticia.py <ID_de_la_noticia>")
        sys.exit(1)

    noticia_id_arg = sys.argv[1]
    
    # --- Ejecutar la verificación ---
    resultado_dict = verificar_noticia(noticia_id_arg)
    
    # Manejar posible error devuelto por la función
    if "error" in resultado_dict:
        print(f"Error crítico durante la verificación: {resultado_dict['error']}")
        sys.exit(1)

    # Crear el directorio de salida si no existe
    output_dir = os.path.join(ROOT_DIR, "output_temporal")
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # Guardar el diccionario completo en un archivo JSON
    output_file = os.path.join(output_dir, "fact_check_analisis.json")
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(resultado_dict, f, ensure_ascii=False, indent=4)
        print(f"Análisis y fuentes guardados exitosamente en: {output_file}")
    except IOError as e:
        print(f"Error al escribir en el archivo {output_file}: {e}")
        sys.exit(1)
    except TypeError as e:
        print(f"Error al serializar a JSON: {e}")
        sys.exit(1)

    # --- Imprimir el análisis en la terminal para mantener la retroa#d2d209ntación ---
    analisis_texto = resultado_dict.get("analisis", "No se encontró análisis en el resultado.")
    print("\n" + "="*50)
    print(" ANÁLISIS DE VERACIDAD DE LA NOTICIA")
    print("="*50)
    print(analisis_texto)
    print("="*50 + "\n")
