import subprocess
import re
import os
import sys
import json


# Definir directorios base para que el script sea robusto
SRC_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SRC_DIR)

# Construir rutas basadas en los directorios base
RETRIEVED_FILE = os.path.join(ROOT_DIR, 'output_temporal', 'retrieved_news_item.txt')
VENV_DIR = os.path.join(ROOT_DIR, ".venv")
VENV_PYTHON = os.path.join(VENV_DIR, "bin", "python")

# --- Preparar directorio de salida ---
output_dir = os.path.join(ROOT_DIR, "output_temporal")
if not os.path.exists(output_dir):
    os.makedirs(output_dir)
else:
    # Limpiar el directorio para asegurar que solo contiene artefactos de esta ejecución
    print(f"Limpiando directorio: {output_dir}")
    for f in os.listdir(output_dir):
        try:
            os.remove(os.path.join(output_dir, f))
        except Exception as e:
            print(f"No se pudo eliminar {f}: {e}")

# --- Configuración del entorno para subprocesos ---
env_utf8 = os.environ.copy()
env_utf8["LC_ALL"] = "C.UTF-8"
env_utf8["LANG"] = "C.UTF-8"

# --- 1. Ejecutar Hemingwai.py y capturar el ID de la noticia procesada ---

# Preparar los argumentos para Hemingwai.py
hemingwai_args = [VENV_PYTHON, "Hemingwai.py"]
if len(sys.argv) > 1:
    noticia_id_arg = sys.argv[1]
    if not re.match(r"^[a-fA-F0-9]{24}$", noticia_id_arg):
        print(f"El ID proporcionado '{noticia_id_arg}' no parece un ObjectId válido. Abortando.")
        sys.exit(1)
    print(f"Analizando noticia con ID específico: {noticia_id_arg}")
    hemingwai_args.append(noticia_id_arg)
else:
    print("Ejecutando análisis de la próxima noticia disponible...")

# Ejecutar el subproceso
proc = subprocess.run(
    hemingwai_args,
    cwd=SRC_DIR,
    capture_output=True,
    text=False,
    env=env_utf8
)
output = (proc.stdout or b"") + (proc.stderr or b"")
try:
    output = output.decode("utf-8", errors="replace")
except Exception:
    output = output.decode("latin1", errors="replace")
print(output)

# Buscar el ID de la noticia en el output para confirmar que se procesó
match = re.search(r"ID de la noticia a analizar: ([a-fA-F0-9]{24})", output)
if not match:
    print("No se pudo encontrar el ID de la noticia procesada en la salida de Hemingwai. Abortando.")
    sys.exit(1)
noticia_id = match.group(1)
print(f"ID de la noticia procesada: {noticia_id}")

# 2. Ejecutar fetch_news_item.py con ese ID
print("Extrayendo noticia procesada...")
proc2 = subprocess.run([
    VENV_PYTHON, "fetch_news_item.py", noticia_id
], cwd=SRC_DIR, capture_output=True, text=False, env=env_utf8)
out2 = (proc2.stdout or b"") + (proc2.stderr or b"")
try:
    out2 = out2.decode("utf-8", errors="replace")
except Exception:
    out2 = out2.decode("latin1", errors="replace")
print(out2)

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

# 3. Ejecutar fact_check_perplexity.py con el ID de la noticia
print("Ejecutando verificación de hechos con Perplexity AI...")
proc_fact_check = subprocess.run([
    VENV_PYTHON, "fact_check_perplexity.py", noticia_id
], cwd=SRC_DIR, capture_output=True, text=False, env=env_utf8)
output_fact_check = (proc_fact_check.stdout or b"") + (proc_fact_check.stderr or b"")
try:
    output_fact_check = output_fact_check.decode("utf-8", errors="replace")
except Exception:
    output_fact_check = output_fact_check.decode("latin1", errors="replace")
print(output_fact_check)

# Verificar que el archivo de análisis se ha generado
fact_check_file = os.path.join(output_dir, "fact_check_analisis.json")
if not os.path.exists(fact_check_file):
    print(f"No se encontró el archivo {fact_check_file}. El análisis de Perplexity puede haber fallado. Abortando.")
    sys.exit(1)
print("Verificación de hechos completada y archivo de análisis generado.")



# 4. Ejecutar render_latex.py para generar y subir el PDF
print("Generando y subiendo PDF...")
proc3 = subprocess.run([
    VENV_PYTHON, "render_latex.py"
], cwd=SRC_DIR, capture_output=True, text=False, env=env_utf8)
out3 = (proc3.stdout or b"") + (proc3.stderr or b"")
try:
    out3 = out3.decode("utf-8", errors="replace")
except Exception:
    out3 = out3.decode("latin1", errors="replace")
print(out3)

# Verificar que el PDF se ha generado
from glob import glob
output_dir = os.path.join(ROOT_DIR, "output_temporal")
pdfs = glob(os.path.join(output_dir, "*.pdf"))
if not pdfs:
    print("No se generó ningún PDF. Abortando.")
    sys.exit(1)
else:
    print(f"PDF generado: {pdfs[0]}")

# 4. Buscar y mostrar el enlace de Mega si está disponible
match_link = re.search(r"Link: (https://mega\\.nz/\\S+)", out3)
if match_link:
    print(f"Enlace de Mega: {match_link.group(1)}")
else:
    print("Error: no se obtuvo enlace de Mega en la salida. La subida no se considera correcta.")
    print("Salida de render_latex.py (recortada):")
    print(out3[-2000:])
    sys.exit(1)