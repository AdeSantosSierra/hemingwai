import json
import os
import re
import ast
from jinja2 import Environment, FileSystemLoader, select_autoescape
from datetime import datetime
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, RegularPolygon
from matplotlib.path import Path
from matplotlib.projections.polar import PolarAxes
from matplotlib.projections import register_projection
from matplotlib.spines import Spine
from matplotlib.transforms import Affine2D
from mega import Mega
from dotenv import load_dotenv

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
        '“': '"', '”': '"', '„': '"', '‟': '"',
        '‘': "'", '’': "'", '‚': "'", '‛': "'",
        '«': '"', '»': '"',
        '‹': "'", '›': "'",
    }
    for char_unicode, replacement_text in replacements.items():
        text = text.replace(char_unicode, replacement_text)

    # Eliminar solo emojis y símbolos fuera de los rangos de texto común (mantener letras acentuadas, ñ, etc.)
    # Unicode ranges: https://unicode-table.com/en/
    # Español: U+0020-U+007E (ASCII), U+00A1-U+00FF (acentos, ñ, ü, ¿, ¡), U+0100-U+017F (letras latinas extendidas)
    # Eliminar solo si es un símbolo, pictograma, o caracter de control
    def is_allowed(char):
        code = ord(char)
        # Caracteres imprimibles comunes y letras latinas extendidas
        if (0x20 <= code <= 0x7E) or (0xA1 <= code <= 0xFF) or (0x100 <= code <= 0x17F):
            return True
        # Saltar caracteres de control
        if code in (0x0A, 0x0D, 0x09):  # \n, \r, \t
            return True
        return False
    # Reemplazar solo los no permitidos
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
UNIQUE_PARAGRAPH_BREAK_STRING = "UNIQUEPARABREAKSTRING"  # Changed Placeholder Name

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
    # Reemplazo de comillas dobles rectas por comillas tipográficas de LaTeX
    # Solo reemplazar pares de comillas, no comillas sueltas
    def replace_double_quotes_latex(s):
        # Reemplaza "texto" por ``texto''
        return re.sub(r'"([^"]+)"', r"``\1''", s)
    text_content = replace_double_quotes_latex(text_content)
    processed_content = re.sub(r"\s*\n\s*", " ", text_content).strip()
    return escape_tex_chars_in_plain_text_segment(processed_content)

def escape_tex_special_chars(text):
    """For general text blocks that might contain markdown and newlines."""
    if not isinstance(text, str): return text

    text = strip_or_replace_problematic_unicode(text)

    text = text.replace("\r\n", "\n")
    # Use the new placeholder name here
    text_with_placeholders = re.sub(r"\n\s*\n+", UNIQUE_PARAGRAPH_BREAK_STRING, text)
    text_with_spaces = text_with_placeholders.replace("\n", " ")

    # The splitting by PARAGRAPH_PLACEHOLDER previously was problematic.
    # New strategy: process markdown, then TeX escape, then replace placeholder.

    md_regex = re.compile(r'(\*{2}(?:.|\n)+?\*{2})|(\*(?:.|\n)+?\*)|(_(?:.|\n)+?_)')
    parts = md_regex.split(text_with_spaces) # text_with_spaces still contains UNIQUE_PARAGRAPH_BREAK_STRING

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
        else: # Plain text segment (could contain UNIQUE_PARAGRAPH_BREAK_STRING)
            processed_parts.append(escape_tex_chars_in_plain_text_segment(part))

    final_text_segments = "".join(processed_parts)

    # Now replace the placeholder. Since UNIQUE_PARAGRAPH_BREAK_STRING has no TeX special chars,
    # its escaped form (via escape_tex_chars_in_plain_text_segment) is itself.
    final_text = final_text_segments.replace(UNIQUE_PARAGRAPH_BREAK_STRING, "\n\\par\\medskip\n")

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

# --- Spider Chart recomendado ---
# Usar solo la función generar_grafico_arania para gráficos de araña (radar).
# La función avanzada generate_spider_chart y la proyección personalizada han sido eliminadas para evitar confusiones.

# --- Jinja Environment Setup ---
env = Environment(
    loader=FileSystemLoader("."),
    autoescape=select_autoescape(['html', 'xml']),
    trim_blocks=True, lstrip_blocks=True
)
env.filters['escape_tex_special_chars'] = escape_tex_special_chars
env.filters['escape_tex_inline'] = escape_tex_inline
env.filters['replace_tex_special_chars'] = replace_tex_special_chars_for_url
env.filters['format_date'] = format_date_for_latex

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

def generar_grafico_arania(valores, etiquetas, nombre_archivo):
    N = len(etiquetas)
    valores_escalados = [v / 10 for v in valores]
    valores_escalados += valores_escalados[:1]
    angulos = np.linspace(0, 2 * np.pi, N, endpoint=False).tolist()
    angulos += angulos[:1]
    fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(polar=True))
    ax.plot(angulos, valores_escalados, color='blue', linewidth=2)
    ax.fill(angulos, valores_escalados, color='skyblue', alpha=0.4)
    ax.set_xticks(angulos[:-1])
    ax.set_xticklabels(etiquetas, fontsize=10)
    ax.set_ylim(0, 10)
    ax.set_yticks([0, 2, 4, 6, 8, 10])
    ax.set_yticklabels(['0', '2', '4', '6', '8', '10'])
    ax.set_title("Puntuaciones Individuales", size=15, pad=20)
    plt.tight_layout()
    plt.savefig(nombre_archivo)
    plt.close()

if __name__ == "__main__":
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
    news_data_file = "retrieved_news_item.txt"
    latex_template_file = "news_template.tex.j2"

    try:
        with open(news_data_file, "r", encoding="utf-8") as f:
            news_item_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: News data file '{news_data_file}' not found."); exit(1)
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from '{news_data_file}'."); exit(1)

    # Limpiar recursivamente todos los campos del diccionario
    news_item_data = clean_dict_recursive(news_item_data)

    # --- ARREGLO: extraer solo el texto de resumen_valoracion_titular si viene como objeto tipo TextBlock ---
    rvt = news_item_data.get("resumen_valoracion_titular")
    # Ya no es necesario limpiar, siempre es string puro
    # if isinstance(rvt, str):
    #     pass  # ya es string
    # elif isinstance(rvt, dict) and "text" in rvt:
    #     news_item_data["resumen_valoracion_titular"] = rvt["text"]
    # elif isinstance(rvt, str) and rvt.startswith("TextBlock("):
    #     import re
    #     match = re.search(r"text=['\"](.+?)['\"]", rvt)
    #     if match:
    #         news_item_data["resumen_valoracion_titular"] = match.group(1)
    # Si no, dejarlo tal cual

    tr_direct_dict = news_item_data.get("texto_referencia_diccionario")
    if isinstance(tr_direct_dict, dict):
        news_item_data["texto_referencia_direct_dict_data"] = tr_direct_dict
        print("Using 'texto_referencia_diccionario' for 'texto_referencia_direct_dict_data'.")
    else:
        news_item_data["texto_referencia_direct_dict_data"] = None
        print("'texto_referencia_diccionario' not found or not a dictionary for direct use.")

    texto_ref_str = news_item_data.get("texto_referencia")
    if isinstance(texto_ref_str, str):
        try:
            ast.literal_eval(texto_ref_str)
            news_item_data["texto_referencia_parsed_content"] = texto_ref_str
            print(f"'texto_referencia' string is parsable (but will be shown as string).")
        except (ValueError, SyntaxError):
            news_item_data["texto_referencia_parsed_content"] = texto_ref_str
            print(f"Warning: 'texto_referencia' string is not parsable as dict. Will display as raw string.")
    else:
        news_item_data["texto_referencia_parsed_content"] = "Campo 'texto_referencia' no es un string o no disponible."
        print("'texto_referencia' (string for parsing) not found or not a string.")

    if "fuente" not in news_item_data:
        news_item_data["fuente"] = None

    # --- Manejo de carpeta temporal ---
    output_dir = "output_temporal"
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    # Vaciar la carpeta antes de generar nuevos archivos, incluyendo el PDF anterior
    for f in os.listdir(output_dir):
        try:
            os.remove(os.path.join(output_dir, f))
        except Exception as e:
            print(f"No se pudo eliminar {f}: {e}")

    # Obtener el titular y generar un nombre de archivo seguro
    def safe_filename(s, maxlen=60):
        import re
        s = re.sub(r'[^\w\- ]', '', s)
        s = s.replace(' ', '_')
        return s[:maxlen]

    titulo = news_item_data.get('titulo', 'noticia')
    filename_base = safe_filename(titulo)
    output_tex_file = os.path.join(output_dir, f"{filename_base}.tex")
    output_pdf_file = os.path.join(output_dir, f"{filename_base}.pdf")
    spider_chart_file = os.path.join(output_dir, "spider_chart.png")

    # Generate spider chart image if data exists
    puntuacion_individual_data = news_item_data.get("puntuacion_individual")
    if isinstance(puntuacion_individual_data, dict) and puntuacion_individual_data:
        CAMPOS_FIJOS = [
            "Interpretación del periodista", "Opiniones", "Cita de fuentes", "Confiabilidad de las fuentes", "Trascendencia",
            "Relevancia de los datos", "Precisión y claridad", "Enfoque", "Contexto", "Ética"
        ]
        valores = [float(puntuacion_individual_data.get(str(i), 0)) for i in range(1, 11)]
        spider_chart_file = os.path.join(output_dir, "spider_chart.png")
        generar_grafico_arania(valores, CAMPOS_FIJOS, spider_chart_file)
        print(f"Gráfico generado correctamente: {spider_chart_file}")
    else:
        print("No 'puntuacion_individual' data for spider chart.")

    context = {"news_item": news_item_data, "spider_chart_file": spider_chart_file}
    try:
        render_template(latex_template_file, output_tex_file, context)
    except Exception:
        exit(1)

    print(f"\nTo compile the LaTeX file, run: pdflatex {output_tex_file}")

    # Compilar el PDF automáticamente
    try:
        import subprocess
        subprocess.run([
            "pdflatex",
            "-output-directory", output_dir,
            output_tex_file
        ], check=True)
        print(f"PDF generado: {output_pdf_file}")
    except Exception as e:
        print(f"Error al compilar el PDF: {e}")

    # Subir el PDF a Mega.nz automáticamente
    MEGA_EMAIL = os.getenv("MEGA_EMAIL")
    MEGA_PASSWORD = os.getenv("MEGA_PASSWORD")
    MEGA_FOLDER_PATH = "HemingwAI/PDF hemingwAI"
    if MEGA_EMAIL and MEGA_PASSWORD:
        try:
            mega = Mega()
            m = mega.login(MEGA_EMAIL, MEGA_PASSWORD)
            # Buscar la carpeta destino (no crearla si no existe)
            folder = m.find(MEGA_FOLDER_PATH)
            if not folder:
                raise Exception(f"La carpeta destino '{MEGA_FOLDER_PATH}' no existe en tu cuenta de Mega.nz. Por favor, créala manualmente.")
            # Subir el PDF a la carpeta
            file = m.upload(output_pdf_file, folder[0])
            link = m.get_upload_link(file)
            print(f"PDF subido a Mega.nz en {MEGA_FOLDER_PATH}. Link: {link}")
        except Exception as e:
            print(f"Error al subir el PDF a Mega.nz: {e}")
    else:
        print("Credenciales de Mega.nz no encontradas en el .env. No se subió el PDF.")
