# -*- coding: utf-8 -*-
import os
import sys
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

def verificar_noticia(noticia_id: str) -> str:
    """
    Obtiene una noticia de MongoDB y utiliza Perplexity AI para verificar su veracidad.

    Args:
        noticia_id (str): El ID de la noticia a verificar.

    Returns:
        str: El análisis de veracidad proporcionado por el modelo.
    """
    # --- Conexión a MongoDB ---
    print(f"Conectando a MongoDB en la base de datos '{DB_NAME}'...")
    try:
        mongo_service = MongoDBService(MONGO_URI, db_name=DB_NAME)
        collection = mongo_service.get_collection(COLLECTION_NAME)
    except Exception as e:
        return f"Error al conectar con MongoDB: {e}"

    # --- Obtener el cuerpo de la noticia ---
    print(f"Buscando la noticia con ID: {noticia_id}...")
    try:
        obj_id = ObjectId(noticia_id)
        noticia_doc = collection.find_one({"_id": obj_id})
    except Exception as e:
        mongo_service.close()
        return f"Error al buscar la noticia. ID inválido o problema de base de datos: {e}"

    if not noticia_doc or "cuerpo" not in noticia_doc:
        mongo_service.close()
        return f"Error: No se encontró la noticia con ID '{noticia_id}' o no tiene campo 'cuerpo'."

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
                    "Eres un verificador de hechos altamente cualificado y objetivo. "
                    "Tu tarea es analizar la siguiente noticia y determinar su veracidad. "
                    "verifica puntualmente todos los datos numéricos y afirmaciones concretas que puedan ser verificadas (como cifras de muertos, número de rehenes, fechas, lugares, nombres) mediante consulta a fuentes confiables actuales. "
                    "Señala explícitamente cualquier dato inexacto, contradictorio o desactualizado, y proporciona las correcciones fundamentadas"
                    "Incluye en la evaluación la precisión de dichos datos y cómo impactan en la comprensión global de la noticia. "
                    "Es vital confrontar las formulaciones de la noticia con declaraciones o comunicados oficiales y comparar cómo se expresan en medios de referencia, detectando rápidamente cambios de sentido en verbos y expresiones clave. "
                    "Basa tu análisis en fuentes fiables y cítalas en tu respuesta. "
                    "¡MUY IMPORTANTE! Evita las expresiones “hecho objetivo”, “dato objetivo” “interpretación subjetiva”, “verdad objetiva”, “neutral”. Utilizar, en cambio solo “hecho”, “dato”, “interpretación”, “verdad”, “imparcial”, “ecuánime”, “adecuado”."
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
            model="sonar-pro",
            messages=messages,
        )
        
        analisis = response.choices[0].message.content
        print("Análisis recibido correctamente.")
        return analisis
        
    except Exception as e:
        return f"Error al contactar con la API de Perplexity: {e}"
    finally:
        # Asegurarse de cerrar la conexión a MongoDB
        mongo_service.close()
        print("Conexión a MongoDB cerrada.")

if __name__ == "__main__":
    # --- Validar argumento de entrada ---
    if len(sys.argv) != 2:
        print("Uso: python verificar_noticia.py <ID_de_la_noticia>")
        sys.exit(1)

    noticia_id_arg = sys.argv[1]
    
    # --- Ejecutar la verificación ---
    resultado_analisis = verificar_noticia(noticia_id_arg)
    
    # --- Imprimir el resultado ---
    print("\n" + "="*50)
    print(" ANÁLISIS DE VERACIDAD DE LA NOTICIA")
    print("="*50)
    print(resultado_analisis)
    print("="*50 + "\n")
