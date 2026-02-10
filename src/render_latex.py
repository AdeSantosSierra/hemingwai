import json
import os
import re
import ast
from jinja2 import Environment, FileSystemLoader, select_autoescape
from datetime import datetime
from dotenv import load_dotenv
import glob
import subprocess
import sys
import time
import socket

# --- Unicode Character Handling ---
def strip_or_replace_problematic_unicode(text):
    if not isinstance(text, str):
        return text

    # Reemplazos específicos de algunos emojis comunes
    replacements = {
        '\u26A0': '[Atención]',  # ⚠ Warning sign
        '\u2B50': '[Estrella]',  # ⭐ Star
        '\u1F6A9': '[Bandera]', # 🚩 Triangular Flag
        # Comillas tipográficas y angulares a comillas rectas
        '"': '"', '"': '"', '„': '"', '‟': '"',
        ''': "'", ''': "'", '‚': "'", '‛': "'",
        '«': '"', '»': '"',
        '‹': "'", '›': "'",
    }
    for char_unicode, replacement_text in replacements.items():
        text = text.replace(char_unicode, replacement_text)

    # Eliminar solo emojis y símbolos fuera de los rangos de texto común (mantener letras acentuadas, ñ, etc.)
    def is_allowed(char):
        code = ord(char)
        if (0x20 <= code <= 0x7E) or (0xA1 <= code <= 0xFF) or (0x100 <= code <= 0x17F):
            return True
        if code in (0x0A, 0x0D, 0x09):  # \n, \r, \t
            return True
        return False
    return ''.join(c if is_allowed(c) else '' for c in text)

# --- LaTeX Special Character Escaping ---
CORE_TEX_SPECIAL_CHARS_NO_BS = {
    "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#", "_": r"\_",
    "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
    "|": r"\textbar{}",
    "à": r"\`{a}", "á": r"\'{a}", "â": r"\^{a}", "ä": r"\"{a}",
    "è": r"\`{e}", "é": r"\'{e}", "ê": r"\^{e}", "ë": r"\"{e}",
    "ì": r"\`{i}", "í": r"\'{i}", "î": r"\^{i}", "ï": r"\"{i}",
    "ò": r"\`{o}", "ó": r"\'{o}", "ô": r"\^{o}", "ö": r"\"{o}",
    "ù": r"\`{u}", "ú": r"\'{u}", "û": r"\^{u}", "ü": r"\"{u}",
    "À": r"\`{A}", "Á": r"\'{A}", "Â": r"\^{A}", "Ä": r"\"{A}",
    "È": r"\`{E}", "É": r"\'{E}", "Ê": r"\^{E}", "Ë": r"\"{E}",
    "Ì": r"\`{I}", "Í": r"\'{I}", "Î": r"\^{I}", "Ï": r"\"{I}",
    "Ò": r"\`{O}", "Ó": r"\'{O}", "Ô": r"\^{O}", "Ö": r"\"{O}",
    "Ù": r"\`{U}", "Ú": r"\'{U}", "Û": r"\^{U}", "Ü": r"\"{U}",
    "ñ": r"\~{n}", "Ñ": r"\~{N}", "¿": r"?`", "¡": r"!`",
}
UNIQUE_PARAGRAPH_BREAK_STRING = "UNIQUEPARABREAKSTRING"

def escape_tex_chars_in_plain_text_segment(text_segment):
    if not text_segment: return ""
    text_segment = strip_or_replace_problematic_unicode(text_segment)
    processed_segment = text_segment.replace("\\", r"\textbackslash{}")
    return "".join(CORE_TEX_SPECIAL_CHARS_NO_BS.get(char, char) for char in processed_segment)

def escape_tex_inline(text_content):
    r"""For content *inside* LaTeX commands like \textbf{...} or item labels."""
    if not isinstance(text_content, str):
        text_content = str(text_content)
    text_content = strip_or_replace_problematic_unicode(text_content)
    def replace_double_quotes_latex(s):
        return re.sub(r'"([^"]+)"', r"``\1''", s)
    text_content = replace_double_quotes_latex(text_content)
    processed_content = re.sub(r"\s*\n\s*", " ", text_content).strip()
    return escape_tex_chars_in_plain_text_segment(processed_content)

def escape_tex_special_chars(text):
    """For general text blocks that might contain markdown and newlines."""
    if not isinstance(text, str): return text

    text = strip_or_replace_problematic_unicode(text)
    text = text.replace("\r\n", "\n")
    text_with_placeholders = re.sub(r"\n\s*\n+", UNIQUE_PARAGRAPH_BREAK_STRING, text)
    text_with_spaces = text_with_placeholders.replace("\n", " ")

    md_regex = re.compile(r'(\*{2}(?:.|\n)+?\*{2})|(\*(?:.|\n)+?\*)|(_(?:.|\n)+?_)')
    parts = md_regex.split(text_with_spaces)

    processed_parts = []
    for part in parts:
        if part is None: continue
        is_bold = part.startswith("**") and part.endswith("**")
        is_italic1 = part.startswith("*") and part.endswith("*") and not (part.startswith("**") and len(part) > 2 and part[1] == '*')
        is_italic2 = part.startswith("_") and part.endswith("_")

        if is_bold:
            content = part[2:-2]
            processed_parts.append(r"\textbf{" + escape_tex_inline(content) + "}")
        elif is_italic1:
            content = part[1:-1]
            processed_parts.append(r"\textit{" + escape_tex_inline(content) + "}")
        elif is_italic2:
            content = part[1:-1]
            processed_parts.append(r"\textit{" + escape_tex_inline(content) + "}")
        else:
            processed_parts.append(escape_tex_chars_in_plain_text_segment(part))

    final_text_segments = "".join(processed_parts)
    final_text = final_text_segments.replace(UNIQUE_PARAGRAPH_BREAK_STRING, "\n\\par\\medskip\n")
    return final_text

def format_analysis_text(text):
    """
    Filtro de Jinja2 para formatear el texto del análisis de Perplexity.
    - Escapa caracteres especiales de LaTeX.
    - Convierte los títulos de markdown (## Título) a secciones de LaTeX.
    - Mantiene los saltos de párrafo.
    """
    if not isinstance(text, str):
        return ""

    # 1. Escapar caracteres especiales de LaTeX
    text = escape_tex_chars_in_plain_text_segment(text)

    # 2. Convertir títulos markdown a \subsection*
    # Usamos una función de reemplazo para escapar el contenido del título
    def replace_heading(match):
        title_content = escape_tex_inline(match.group(1))
        return f"\\subsection*{{{title_content}}}"
    text = re.sub(r'##\s*(.*)', replace_heading, text)

    # 3. Convertir saltos de línea dobles en párrafos de LaTeX
    text = text.replace('\n\n', '\n\\par\\medskip\n')
    
    return text

def sanitize_and_format_fact_check(text):
    """
    A more robust filter specifically for the fact-checking analysis text.
    - Preserves markdown-like structures like lists and bolding.
    - Wraps list items in a valid LaTeX itemize environment to prevent compiler hangs.
    - Escapes LaTeX special characters.
    """
    if not isinstance(text, str):
        return ""

    # 1. Basic cleaning, LaTeX escaping, and bolding
    text = text.strip().replace("\r\n", "\n")
    escaped_text = escape_tex_chars_in_plain_text_segment(text)
    escaped_text = re.sub(r'\*\*(.*?)\*\*', r'\\textbf{\1}', escaped_text)

    # 2. Process lines to handle lists correctly
    lines = escaped_text.split('\n')
    processed_lines = []
    in_list = False
    list_item_pattern = re.compile(r'^\s*[\*\-]\s+(.*)')

    for line in lines:
        match = list_item_pattern.match(line)
        if match:
            # Line is a list item
            if not in_list:
                processed_lines.append('\\begin{itemize}')
                in_list = True
            processed_lines.append(f'\\item {match.group(1)}')
        else:
            # Line is not a list item
            if in_list:
                processed_lines.append('\\end{itemize}')
                in_list = False
            processed_lines.append(line)
    
    # If the text ends with a list, close the environment
    if in_list:
        processed_lines.append('\\end{itemize}')

    # 3. Reassemble text and handle paragraph breaks
    reassembled_text = '\n'.join(processed_lines)
    # Split into paragraphs and join with LaTeX paragraph command. This is safer than a complex re.sub.
    paragraphs = re.split(r'\n(?:\s*\n)+', reassembled_text)
    final_text = '\n\\par\\medskip\n'.join(p for p in paragraphs if p) # Join non-empty paragraphs

    return final_text

def replace_tex_special_chars_for_url(text):
    if not isinstance(text, str): text = str(text)
    text = strip_or_replace_problematic_unicode(text)
    text = text.replace("\\", r"\textbackslash{}")
    text = text.replace("{", r"\{").replace("}", r"\}")
    text = text.replace("%", r"\%").replace("#", r"\#")
    text = text.replace("&", r"\&").replace("_", r"\_")
    text = text.replace("~", r"\textasciitilde{}")
    return text

def format_date_for_latex(date_str):
    if not date_str: return "N/A"
    try:
        dt_object = datetime.fromisoformat(date_str.split("T")[0])
        return dt_object.strftime("%d de %B de %Y")
    except ValueError: return date_str

# --- Jinja Environment Setup ---
env = Environment(
    loader=FileSystemLoader(os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))),
    autoescape=select_autoescape(['html', 'xml']),
    trim_blocks=True, lstrip_blocks=True
)
env.filters['escape_tex_special_chars'] = escape_tex_special_chars
env.filters['escape_tex_inline'] = escape_tex_inline
env.filters['replace_tex_special_chars'] = replace_tex_special_chars_for_url
env.filters['format_date'] = format_date_for_latex
env.filters['sanitize_fact_check'] = sanitize_and_format_fact_check
env.filters['format_analysis'] = format_analysis_text

def render_template(template_name, output_filename, context):
    try:
        template = env.get_template(template_name)
        rendered_content = template.render(context)
        with open(output_filename, "w", encoding="utf-8") as f:
            f.write(rendered_content)
        print(f"Successfully rendered '{template_name}' to '{output_filename}'")
    except Exception as e:
        print(f"Error rendering template {template_name}: {e}")
        raise

def clean_dict_recursive(obj):
    if isinstance(obj, dict):
        return {k: clean_dict_recursive(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_dict_recursive(v) for v in obj]
    elif isinstance(obj, str):
        return strip_or_replace_problematic_unicode(obj)
    else:
        return obj

def subir_a_mega_mejorado(pdf_path, email, password, carpeta_destino="HemingwAI/PDF hemingwAI"):
    """
    Sube un archivo a MEGA usando mega-cmd con manejo robusto de errores y verificación.
    
    Args:
        pdf_path: Ruta al archivo PDF a subir
        email: Email de MEGA
        password: Contraseña de MEGA
        carpeta_destino: Ruta de la carpeta en MEGA (formato: "Carpeta/Subcarpeta")
    
    Returns:
        str: Link del archivo subido o None si falla
    """
    print("\n" + "="*60)
    print("INICIANDO SUBIDA A MEGA.NZ")
    print("="*60)

    # Verificar que el archivo existe
    if not os.path.exists(pdf_path):
        print(f"❌ ERROR: El archivo {pdf_path} no existe")
        return None

    file_size = os.path.getsize(pdf_path)
    print(f"📄 Archivo: {os.path.basename(pdf_path)}")
    print(f"📊 Tamaño: {file_size / 1024:.2f} KB")

    # Función para ejecutar comandos de mega-cmd
    def run_mega_cmd(command, args=None, input_data=None):
        try:
            cmd = ['snap', 'run', f'mega-cmd.{command}']
            if args:
                cmd.extend(args)
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            stdout, stderr = process.communicate(input=input_data)
            return stdout, stderr, process.returncode
        except FileNotFoundError:
            return None, "Comando snap no encontrado. Verifica que snapd esté instalado.", 1
        except Exception as e:
            return None, f"Error ejecutando comando: {e}", 1

    for intento in range(3):
        print(f"\n🔄 Intento {intento + 1}/3")
        try:
            # Verifica si mega-cmd está disponible
            stdout, stderr, rc = run_mega_cmd("mega-version")
            if rc != 0:
                print(f"❌ Error: No se pudo ejecutar mega-cmd: {stderr}")
                return None

            print(f"✅ mega-cmd detectado! Versión: {stdout.strip()}")

            # Verifica si hay una sesión activa
            stdout, stderr, rc = run_mega_cmd("mega-whoami")
            if rc != 0 or email not in stdout:
                # Cierra cualquier sesión existente
                stdout, stderr, rc_logout = run_mega_cmd("mega-logout")
                if rc_logout == 0 or "Not logged in" in stderr:
                    print("Sesión anterior cerrada o no existía.")
                else:
                    print(f"❌ Error al cerrar sesión: {stderr}")
                    return None

                # Intenta login
                stdout, stderr, rc = run_mega_cmd("mega-login", args=[email, password])
                if rc != 0:
                    print(f"❌ Error en login: {stderr}")
                    return None
                print("✅ Login exitoso!")
            else:
                print(f"✅ Sesión ya activa para {email}")

            # Crear carpeta destino si no existe
            print(f"\n🔍 Creando/verificando carpeta: {carpeta_destino}")
            carpeta_parts = carpeta_destino.split("/")
            current_path = ""
            for carpeta in carpeta_parts:
                if not carpeta:
                    continue
                current_path = f"{current_path}/{carpeta}" if current_path else carpeta
                stdout, stderr, rc = run_mega_cmd("mega-ls", args=[current_path])
                if rc != 0:
                    print(f"   ⚠️ Carpeta '{current_path}' no existe, creándola...")
                    stdout, stderr, rc = run_mega_cmd("mega-mkdir", args=[current_path])
                    if rc != 0:
                        print(f"   ❌ Error al crear carpeta {current_path}: {stderr}")
                        return None
                    print(f"   ✅ Carpeta creada: {current_path}")
                else:
                    print(f"   ✅ Carpeta encontrada: {current_path}")

            # Subir el archivo
            print(f"\n⬆️ Subiendo archivo a MEGA...")
            print(f"   Destino: {carpeta_destino}")
            stdout, stderr, rc = run_mega_cmd("mega-put", args=[pdf_path, carpeta_destino])
            if rc != 0:
                print(f"❌ Error al subir archivo: {stderr}")
                return None
            print("✅ Archivo subido correctamente")

            # Obtener el enlace público
            print("\n🔗 Generando enlace público...")
            stdout, stderr, rc = run_mega_cmd("mega-export", args=["-a", f"{carpeta_destino}/{os.path.basename(pdf_path)}"])
            if rc != 0:
                print(f"❌ Error al generar enlace: {stderr}")
                return None
            
            # Extraer el enlace real del output (ej: "Exported ...: https://mega.nz/file/...#key")
            link_match = re.search(r'https://mega\.nz/[^ ]+', stdout.strip())
            if link_match:
                link = link_match.group(0)
            else:
                print(f"❌ No se pudo extraer el enlace del output: {stdout.strip()}")
                return None
            
            if not link.startswith("https://mega.nz"):
                print(f"❌ Enlace inválido: {link}")
                return None
            
            print("✅ Enlace generado")

            # Verificación final
            print("\n🔍 Verificando que el archivo existe en MEGA...")
            stdout, stderr, rc = run_mega_cmd("mega-ls", args=[f"{carpeta_destino}/{os.path.basename(pdf_path)}"])
            if rc != 0:
                print(f"❌ Error: El archivo no aparece en MEGA: {stderr}")
                return None
            print(f"✅ Archivo verificado en MEGA: {carpeta_destino}/{os.path.basename(pdf_path)}")

            print("\n" + "="*60)
            print("✅ SUBIDA COMPLETADA EXITOSAMENTE")
            print("="*60)
            print(f"Link: {link}")
            print("="*60 + "\n")
            return link

        except Exception as e:
            print(f"\n❌ ERROR en intento {intento + 1}: {e}")
            if intento < 2:
                wait_time = 2 ** intento
                print(f"⏳ Esperando {wait_time} segundos antes de reintentar...")
                time.sleep(wait_time)
            else:
                print("\n❌ Todos los intentos fallaron")
                import traceback
                print("\n📋 Detalles del error:")
                traceback.print_exc()
                return None

if __name__ == "__main__":
    # Definir el directorio raíz del proyecto (un nivel arriba de 'src')
    ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    
    # Cargar variables de entorno desde el .env en el directorio raíz
    load_dotenv(os.path.join(ROOT_DIR, ".env"))
    
    # Construir rutas basadas en ROOT_DIR
    output_dir = os.path.join(ROOT_DIR, "output_temporal")
    news_data_file = os.path.join(output_dir, "retrieved_news_item.txt")
    latex_template_file = "news_template.tex.j2"
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # Cargar y limpiar news_item_data
    try:
        with open(news_data_file, "r", encoding="utf-8") as f:
            news_item_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: News data file '{news_data_file}' not found.")
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from '{news_data_file}'.")
        sys.exit(1)
    
    news_item_data = clean_dict_recursive(news_item_data)

    # Cargar el análisis de fact-checking y las fuentes desde el archivo JSON
    fact_check_file = os.path.join(output_dir, "fact_check_analisis.json")
    fact_check_analisis = ""
    fact_check_fuentes = []
    try:
        with open(fact_check_file, "r", encoding="utf-8") as f:
            fact_check_data = json.load(f)
            fact_check_analisis = fact_check_data.get("analisis", "")
            fact_check_fuentes = fact_check_data.get("fuentes", [])
    except FileNotFoundError:
        print(f"Advertencia: El archivo de análisis de fact-checking '{fact_check_file}' no fue encontrado.")
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error al leer o decodificar el archivo de análisis de fact-checking: {e}")

    # Mapear campos para la plantilla LaTeX
    if "texto_referencia_diccionario" in news_item_data:
        news_item_data["texto_referencia_direct_dict_data"] = news_item_data["texto_referencia_diccionario"]
    if "texto_referencia" in news_item_data:
        news_item_data["texto_referencia_parsed_content"] = news_item_data["texto_referencia"]

    # Obtener el titular y generar un nombre de archivo seguro
    def safe_filename(s, maxlen=60):
        s = re.sub(r'[^\w\- ]', '', s)
        s = s.replace(' ', '_')
        return s[:maxlen]
    
    titulo = news_item_data.get('titulo', 'noticia')
    filename_base = safe_filename(titulo)
    output_tex_file = os.path.join(output_dir, f"{filename_base}.tex")
    output_pdf_file = os.path.join(output_dir, f"{filename_base}.pdf")

    context = {
        "news_item": news_item_data,
        "fact_check_analisis": fact_check_analisis,
        "fact_check_fuentes": fact_check_fuentes
    }
    
    try:
        render_template(latex_template_file, output_tex_file, context)
    except Exception:
        sys.exit(1)

    print(f"\nTo compile the LaTeX file, run: pdflatex {output_tex_file}")

    # Compilar el PDF automáticamente
    try:
        subprocess.run([
            "pdflatex",
            "-output-directory", output_dir,
            output_tex_file
        ], check=True)
        print(f"PDF generado: {output_pdf_file}")
    except Exception as e:
        print(f"Error al compilar el PDF: {e}")
        sys.exit(1)

    # Subir el PDF a Mega.nz automáticamente
    MEGA_EMAIL = os.getenv("MEGA_EMAIL")
    MEGA_PASSWORD = os.getenv("MEGA_PASSWORD")
    MEGA_FOLDER_PATH = "HemingwAI/PDF hemingwAI"
    
    if MEGA_EMAIL and MEGA_PASSWORD:
        link = subir_a_mega_mejorado(output_pdf_file, MEGA_EMAIL, MEGA_PASSWORD, MEGA_FOLDER_PATH)
        
        if link:
            # IMPORTANTE: Formato específico para que analiza_y_guarda.py pueda capturarlo
            print(f"\n✅ PDF subido exitosamente a Mega.nz")
            print(f"Link: {link}")
            # Salir con código 0 (éxito)
            sys.exit(0)
        else:
            print(f"\n❌ No se pudo subir el PDF a Mega.nz")
            sys.exit(1)
    else:
        print("⚠️ Credenciales de Mega.nz no encontradas en el .env. No se subió el PDF.")
        sys.exit(1)