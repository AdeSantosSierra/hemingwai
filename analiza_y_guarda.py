import subprocess
import re
import os
import sys
import json

VENV_PYTHON = os.path.abspath(os.path.join('venv', 'bin', 'python'))
HEMINGWAI_DIR = os.path.dirname(os.path.abspath(__file__))
RETRIEVED_FILE = os.path.join(HEMINGWAI_DIR, 'retrieved_news_item.txt')

# 1. Ejecutar Hemingwai.py y capturar el ID de la noticia procesada
print("Ejecutando análisis de noticia con Hemingwai.py...")
proc = subprocess.run([
    VENV_PYTHON, "src/Hemingwai.py"
], cwd=HEMINGWAI_DIR, capture_output=True, text=True)
output = proc.stdout + proc.stderr
print(output)

# Buscar el ID de la noticia en el output
match = re.search(r"ID de la noticia a analizar: ([a-fA-F0-9]{24})", output)
if not match:
    print("No se pudo encontrar el ID de la noticia procesada. Abortando.")
    sys.exit(1)
noticia_id = match.group(1)
print(f"ID de la noticia procesada: {noticia_id}")

# 2. Ejecutar fetch_news_item.py con ese ID
print("Extrayendo noticia procesada...")
proc2 = subprocess.run([
    VENV_PYTHON, "fetch_news_item.py", noticia_id
], cwd=HEMINGWAI_DIR, capture_output=True, text=True)
print(proc2.stdout + proc2.stderr)

# Verificar que el archivo se ha generado y contiene los campos clave
if not os.path.exists(RETRIEVED_FILE):
    print(f"No se encontró el archivo {RETRIEVED_FILE}. Abortando.")
    sys.exit(1)
with open(RETRIEVED_FILE, "r", encoding="utf-8") as f:
    news_item = json.load(f)
# Comprobar campos clave
CAMPOS_CLAVE = ["puntuacion", "texto_referencia", "valoracion_general"]
for campo in CAMPOS_CLAVE:
    if campo not in news_item or not news_item[campo]:
        print(f"El campo '{campo}' no está presente o está vacío en el archivo de la noticia. Abortando.")
        sys.exit(1)
print("Todos los campos clave están presentes en la noticia extraída.")

# 3. Ejecutar render_latex.py para generar y subir el PDF
print("Generando y subiendo PDF...")
proc3 = subprocess.run([
    VENV_PYTHON, "render_latex.py"
], cwd=HEMINGWAI_DIR, capture_output=True, text=True)
print(proc3.stdout + proc3.stderr)

# Verificar que el PDF se ha generado
from glob import glob
output_dir = os.path.join(HEMINGWAI_DIR, "output_temporal")
pdfs = glob(os.path.join(output_dir, "*.pdf"))
if not pdfs:
    print("No se generó ningún PDF. Abortando.")
    sys.exit(1)
else:
    print(f"PDF generado: {pdfs[0]}")

# 4. Buscar y mostrar el enlace de Mega si está disponible
match_link = re.search(r"Link: (https://mega\\.nz/\\S+)", proc3.stdout + proc3.stderr)
if match_link:
    print(f"Enlace de Mega: {match_link.group(1)}")
else:
    print("Subida a Mega completada correctamente.") 