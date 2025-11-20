# -*- coding: utf-8 -*-
import os
import sys
import json
import re
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

# --- Cargar variables de entorno ---
dotenv_path = os.path.join(ROOT_DIR, '.env')
if not os.path.exists(dotenv_path):
    print(f"Error: El archivo .env no se encuentra en {ROOT_DIR}")
    sys.exit(1)
load_dotenv(dotenv_path=dotenv_path)

# --- Configuración de variables ---
PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")
MONGO_URI = os.getenv("NEW_MONGODB_URI")
DB_NAME = "Base_de_datos_noticias"
COLLECTION_NAME = "Noticias"

# --- Validar configuración ---
if not PERPLEXITY_API_KEY or not MONGO_URI:
    print("Error: Las variables de entorno PERPLEXITY_API_KEY y MONGO_URI deben estar definidas en .env")
    sys.exit(1)

def verificar_noticia(noticia_id: str) -> dict:
    """
    Obtiene una noticia de MongoDB y utiliza Perplexity AI para verificar su veracidad.

    Args:
        noticia_id (str): El ID de la noticia a verificar.

    Returns:
        dict: Un diccionario con el análisis y las fuentes, o un diccionario de error.
    """
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

    cuerpo_noticia = noticia_doc["cuerpo"]
    print("Noticia encontrada. Procediendo a la verificación de hechos.")

    # --- Cliente de Perplexity AI ---
    try:
        client = OpenAI(
            api_key=PERPLEXITY_API_KEY,
            base_url="https://api.perplexity.ai"
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
        response = client.chat.completions.create(
            model="sonar-deep-research",
            messages=messages,
        )
        
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
        
        # Guardar el análisis y las fuentes en MongoDB
        try:
            update_result = collection.update_one(
                {"_id": obj_id},
                {"$set": {
                    "fact_check_analisis": analisis,
                    "fact_check_fuentes": fuentes
                }}
            )
            if update_result.modified_count > 0:
                print("Análisis y fuentes guardados exitosamente en MongoDB.")
            else:
                print("Advertencia: No se modificó ningún documento en MongoDB.")
        except Exception as e:
            print(f"Error al guardar en MongoDB: {e}")


        return {"analisis": analisis, "fuentes": fuentes}
        
    except Exception as e:
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

    # --- Imprimir el análisis en la terminal para mantener la retroalimentación ---
    analisis_texto = resultado_dict.get("analisis", "No se encontró análisis en el resultado.")
    print("\n" + "="*50)
    print(" ANÁLISIS DE VERACIDAD DE LA NOTICIA")
    print("="*50)
    print(analisis_texto)
    print("="*50 + "\n")
