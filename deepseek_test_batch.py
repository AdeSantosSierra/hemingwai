from transformers import AutoModelForCausalLM, AutoTokenizer
import torch
from src.Utils import Utils
import os
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.server_api import ServerApi

# Cargar variables de entorno
load_dotenv()

model_name = "deepseek-ai/deepseek-coder-1.3b-base"
device = "cpu"

print("Cargando modelo y tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(model_name, torch_dtype=torch.float32).to(device)

# Conexión a MongoDB
uri = os.getenv("MONGODB_URI")
client = MongoClient(uri, server_api=ServerApi('1'))
collection = client['Base_de_datos_noticias']['Noticias']

print("Introduce el _id de la noticia a analizar:")
noticia_id = input().strip()

# Buscar la noticia por _id (puede ser ObjectId o string)
from bson import ObjectId
try:
    query = {"_id": ObjectId(noticia_id)}
except Exception:
    query = {"_id": noticia_id}

doc = collection.find_one(query)

if not doc:
    print("No se encontró ninguna noticia con ese _id.")
    exit(1)

titulo = doc.get("titulo", "")
if isinstance(titulo, list):
    titulo = ", ".join(titulo)
noticia = doc.get("cuerpo", "")
if isinstance(noticia, list):
    noticia = " ".join(noticia)

print(f"Analizando noticia: {titulo}\n")

# Mostrar progreso por criterio
criterios = list(Utils.criterios.keys())
total = len(criterios)

# Redefinir la función para mostrar progreso y formatear la salida
from functools import partial

def analizar_noticia_deepseek_verbose(model, tokenizer, titulo, noticia):
    import re
    import torch
    valoraciones_deepseek = {}
    puntuacion_individual_deepseek = {}
    puntuaciones = []
    device = next(model.parameters()).device
    for idx, (key, criterio) in enumerate(Utils.criterios.items(), 1):
        nombre_criterio = criterio["nombre"]
        instruccion_criterio = criterio["instruccion"]
        print(f"\n{'='*60}\n[{idx}/{total}] Analizando criterio: \033[1;34m{nombre_criterio}\033[0m\n{'='*60}")
        prompt = f"""
Para esta noticia:

{noticia}

Clasifícala cualitativamente (Óptima, Positiva, Regular, Negativa, Desinformativa) en base a la siguiente instrucción y justifica tu decisión escribiendo en qué partes del texto te basas para tomar estas conclusiones. Si no se señalan las partes del texto en que se basan las conclusiones la respuesta no es válida. Menciona las áreas a mejorar y justifica detalladamente tu respuesta:

{instruccion_criterio}

Se requiere que la respuesta que se proporcione sea sin valoraciones interpretativas, sin instrucciones de cómo debe de ser una noticia. Siempre que se emita un juicio este no será moral en ningún caso e irá acompañado de una justificación. Se centrará solamente en el carácter informativo de la noticia. Las palabras seleccionadas se harán rigurosa y meticulosamente para evitar el mal uso del lenguaje como pueda ser la redundancia o el empleo de un término inapropiado como pueda ser la palabra "neutralidad" para referirse a la verdad, ya que la verdad no puede ser neutra, en todo caso sería imparcial. La conclusión debería citar, al menos, la afirmación incorrecta más relevante de las que aparecen en la noticia y la más dañina de todas y no solo lanzar adjetivos descalificativos. La redacción sería: “incorrectas como..." y "dañiñas como por ejemplo...".

Ejemplos de salida pueden ser:

1º La noticia es sobresaliente porque ofrece un relato ordenado y veraz en el que las afirmaciones del periodista están sustentadas en datos y/o declaraciones relevantes y suficientes para la comprensión del acontecimiento.

2º La noticia es aceptable porque ofrece datos y declaraciones ciertas pero insuficientes para una contextualización y comprensión adecuada del acontecimiento.

3º La noticia es deficiente porque ofrece interpretaciones explícitas y afirmaciones sesgadas del periodista sin fundamento en los datos de la realidad, ofrece datos y declaraciones irrelevantes que descontextualizan la relevancia y comprensión del acontecimiento.

4º La noticia es desinformativa porque ofrece datos y/o declaraciones falsas, contiene interpretaciones explícitas sin fundamento en la realidad, datos insuficientes, irrelevantes y descontextualizadores que deforman la realidad y desinforman al público.
"""
        inputs = tokenizer(prompt, return_tensors="pt").to(device)
        outputs = model.generate(**inputs, max_new_tokens=300)
        respuesta = tokenizer.decode(outputs[0], skip_special_tokens=True)
        print(f"\033[1;32mValoración DeepSeek:\033[0m\n{respuesta}\n")
        valoraciones_deepseek[nombre_criterio] = respuesta
        # Segunda llamada: obtener puntuación individual
        prompt_puntuacion = f"""
Considera la siguiente noticia:
Título: {titulo}
Noticia: {noticia}

Y la valoración final:
{respuesta}

Asigna una puntuación numérica entre 1 y 100 a la calidad informativa de la noticia según este criterio, donde 1 es la más baja y 100 la más alta.
Responde únicamente con el número.
"""
        inputs_punt = tokenizer(prompt_puntuacion, return_tensors="pt").to(device)
        outputs_punt = model.generate(**inputs_punt, max_new_tokens=10)
        respuesta_punt = tokenizer.decode(outputs_punt[0], skip_special_tokens=True)
        match = re.search(r"\b(\d{1,3})\b", respuesta_punt)
        if match and 1 <= int(match.group(1)) <= 100:
            punt = int(match.group(1))
        else:
            punt = None
        print(f"\033[1;33mPuntuación individual: {punt}\033[0m\n")
        puntuacion_individual_deepseek[nombre_criterio] = punt
        if punt is not None:
            puntuaciones.append(punt)
    puntuacion_global_deepseek = int(sum(puntuaciones) / len(puntuaciones)) if puntuaciones else None

    # Tercer prompt: resumen general de las valoraciones
    valoracion_general_prompt = "Para las siguientes valoraciones obtenidas:\n\n"
    for key, valoracion in valoraciones_deepseek.items():
        valoracion_general_prompt += f"{key}: {valoracion}\n"
    valoracion_general_prompt += f"""
Realiza una breve síntesis de lo anterior para generar una valoración general de la noticia titulada '{titulo}'. La valoración debe resumir los puntos clave y ser concisa."""
    print(f"\n{'='*60}\n\033[1;36mGenerando valoración general DeepSeek...\033[0m\n{'='*60}")
    inputs_resumen = tokenizer(valoracion_general_prompt, return_tensors="pt").to(device)
    outputs_resumen = model.generate(**inputs_resumen, max_new_tokens=300)
    valoracion_general_deepseek = tokenizer.decode(outputs_resumen[0], skip_special_tokens=True)
    print(f"\033[1;36mValoración general DeepSeek:\033[0m\n{valoracion_general_deepseek}\n")

    return {
        "valoraciones": valoraciones_deepseek,
        "puntuacion_individual": puntuacion_individual_deepseek,
        "puntuacion_global": puntuacion_global_deepseek,
        "valoracion_general_deepseek": valoracion_general_deepseek
    }

resultado = analizar_noticia_deepseek_verbose(model, tokenizer, titulo, noticia)

print("\nValoraciones por criterio:")
for criterio, valoracion in resultado["valoraciones"].items():
    print(f"- {criterio}:\n{valoracion}\n")

print("Puntuación individual por criterio:")
for criterio, punt in resultado["puntuacion_individual"].items():
    print(f"- {criterio}: {punt}")

print(f"\nPuntuación global (media): {resultado['puntuacion_global']}")

def valoracion_final_con_deepseek(model, tokenizer, titulo, noticia, valoracion_general_deepseek, valoracion_general_otra):
    device = next(model.parameters()).device
    prompt = f"""
Considera la siguiente noticia:
Título: {titulo}
Noticia: {noticia}

Tienes dos valoraciones generales de la noticia:
1. Valoración general DeepSeek:
{valoracion_general_deepseek}

2. Valoración general de otro modelo:
{valoracion_general_otra}

Compara ambas valoraciones, sintetiza los puntos clave de cada una y emite una valoración final integradora, justificando tu decisión. La respuesta debe ser concisa, clara y centrada en el carácter informativo de la noticia.
"""
    print(f"\n{'='*60}\n\033[1;36mGenerando valoración final integradora con DeepSeek...\033[0m\n{'='*60}")
    inputs = tokenizer(prompt, return_tensors="pt").to(device)
    outputs = model.generate(**inputs, max_new_tokens=300)
    valoracion_final = tokenizer.decode(outputs[0], skip_special_tokens=True)
    print(f"\033[1;36mValoración final integradora DeepSeek:\033[0m\n{valoracion_final}\n")
    return valoracion_final

# Al final del script, después de obtener resultado:
# (Simulamos que tienes 'valoracion_general' de OpenAI/Anthropic)
valoracion_general_otra = input("\nIntroduce la valoración general de OpenAI/Anthropic para esta noticia (puedes pegarla):\n").strip()
valoracion_final_con_deepseek(
    model, tokenizer, titulo, noticia,
    resultado["valoracion_general_deepseek"],
    valoracion_general_otra
) 