import subprocess
import re
import os
import sys
import json
from env_config import get_env_bool, get_env_int
from fact_checking_wrapper import run_fact_checking


# Definir directorios base para que el script sea robusto
SRC_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SRC_DIR)


def _resolve_path(path_value, default_path):
    candidate = path_value if path_value else default_path
    if os.path.isabs(candidate):
        return candidate
    return os.path.join(ROOT_DIR, candidate)


# Construir rutas basadas en los directorios base
OUTPUT_DIR = _resolve_path(os.getenv("PATH_OUTPUT_DIR"), os.path.join(ROOT_DIR, "output_temporal"))
RETRIEVED_FILE = _resolve_path(os.getenv("PATH_RETRIEVED_FILE"), os.path.join(OUTPUT_DIR, "retrieved_news_item.txt"))
VENV_DIR = _resolve_path(os.getenv("PATH_VENV_DIR"), os.path.join(ROOT_DIR, ".venv"))
VENV_PYTHON = os.path.join(VENV_DIR, "bin", "python")
SUBPROCESS_TIMEOUT_SECONDS = get_env_int("PATH_SUBPROCESS_TIMEOUT_SECONDS", 0)
ENABLE_FACT_CHECKING = get_env_bool(
    "ENABLE_FACT_CHECKING",
    get_env_bool("FEATURE_ENABLE_PERPLEXITY", True),
)

# --- Preparar directorio de salida ---
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)
else:
    # Limpiar el directorio para asegurar que solo contiene artefactos de esta ejecución
    print(f"Limpiando directorio: {OUTPUT_DIR}")
    for f in os.listdir(OUTPUT_DIR):
        try:
            os.remove(os.path.join(OUTPUT_DIR, f))
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
    env=env_utf8,
    timeout=(SUBPROCESS_TIMEOUT_SECONDS if SUBPROCESS_TIMEOUT_SECONDS > 0 else None),
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
], cwd=SRC_DIR, capture_output=True, text=False, env=env_utf8, timeout=(SUBPROCESS_TIMEOUT_SECONDS if SUBPROCESS_TIMEOUT_SECONDS > 0 else None))
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

# 3. Ejecutar fact-checking robusto (nunca tumba el pipeline)
print("Ejecutando paso de fact-checking...")
try:
    fact_check_exec = run_fact_checking(
        {
            "noticia_id": noticia_id,
            "output_dir": OUTPUT_DIR,
            "src_dir": SRC_DIR,
            "venv_python": VENV_PYTHON,
            "env": env_utf8,
            "timeout_seconds": (SUBPROCESS_TIMEOUT_SECONDS if SUBPROCESS_TIMEOUT_SECONDS > 0 else None),
            "enable_fact_checking": ENABLE_FACT_CHECKING,
        }
    )
except Exception as e:
    fact_check_exec = {
        "fact_checking": {
            "status": "unavailable",
            "provider": "perplexity",
            "reason": "wrapper_error",
            "message": "Fact-checking no disponible.",
        }
    }
    fallback_fact_check_file = os.path.join(OUTPUT_DIR, "fact_check_analisis.json")
    try:
        with open(fallback_fact_check_file, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "noticia_id": noticia_id,
                    "analisis": "Fact-checking no disponible.",
                    "fuentes": [],
                    "status": "unavailable",
                    "reason": "wrapper_error",
                    "warning": f"{type(e).__name__}",
                },
                f,
                ensure_ascii=False,
                indent=2,
            )
    except Exception as write_err:
        print(f"Warning: no se pudo escribir placeholder de fact-check ({type(write_err).__name__}).")
    print(f"Warning: fact-checking wrapper error ({type(e).__name__}). Continuando.")

fact_check_block = fact_check_exec.get("fact_checking") or {}
print(
    "Paso fact-checking finalizado "
    f"status={fact_check_block.get('status')} reason={fact_check_block.get('reason')}"
)



# 4. Ejecutar render_latex.py para generar y subir el PDF
print("Generando y subiendo PDF...")
proc3 = subprocess.run([
    VENV_PYTHON, "render_latex.py"
], cwd=SRC_DIR, capture_output=True, text=False, env=env_utf8, timeout=(SUBPROCESS_TIMEOUT_SECONDS if SUBPROCESS_TIMEOUT_SECONDS > 0 else None))
out3 = (proc3.stdout or b"") + (proc3.stderr or b"")
try:
    out3 = out3.decode("utf-8", errors="replace")
except Exception:
    out3 = out3.decode("latin1", errors="replace")
print(out3)

# Verificar que el PDF se ha generado
from glob import glob
pdfs = glob(os.path.join(OUTPUT_DIR, "*.pdf"))
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
