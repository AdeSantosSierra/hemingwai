import subprocess
import re
import os

# 1. Ejecutar Hemingwai.py y capturar el ID de la noticia procesada
print("Ejecutando análisis de noticia con Hemingwai.py...")
proc = subprocess.run([
    "python3", "src/Hemingwai.py"
], cwd="hemingwai", capture_output=True, text=True)
output = proc.stdout + proc.stderr
print(output)

# Buscar el ID de la noticia en el output
match = re.search(r"ID de la noticia a analizar: ([a-fA-F0-9]{24})", output)
if not match:
    print("No se pudo encontrar el ID de la noticia procesada. Abortando.")
    exit(1)
noticia_id = match.group(1)
print(f"ID de la noticia procesada: {noticia_id}")

# 2. Ejecutar fetch_news_item.py con ese ID
print("Extrayendo noticia procesada...")
proc2 = subprocess.run([
    "python3", "fetch_news_item.py", noticia_id
], cwd="hemingwai", capture_output=True, text=True)
print(proc2.stdout + proc2.stderr)

# 3. Ejecutar render_latex.py para generar y subir el PDF
print("Generando y subiendo PDF...")
proc3 = subprocess.run([
    "python3", "render_latex.py"
], cwd="hemingwai", capture_output=True, text=True)
print(proc3.stdout + proc3.stderr)

# 4. Buscar y mostrar el enlace de Mega si está disponible
match_link = re.search(r"Link: (https://mega\.nz/\S+)", proc3.stdout + proc3.stderr)
if match_link:
    print(f"Enlace de Mega: {match_link.group(1)}")
else:
    print("No se encontró enlace de Mega en la salida.") 