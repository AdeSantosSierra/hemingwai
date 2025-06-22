import json
import os
import re
import ast
from jinja2 import Environment, FileSystemLoader, select_autoescape
from datetime import datetime

# --- Unicode Character Handling ---
def strip_or_replace_problematic_unicode(text):
    if not isinstance(text, str):
        return text

    replacements = {
        '\u26A0': '[Atención]',  # ⚠ Warning sign
        '\u2B50': '[Estrella]',  # ⭐ Star
        '\u1F6A9': '[Bandera]', # 🚩 Triangular Flag
    }
    for char_unicode, replacement_text in replacements.items():
        text = text.replace(char_unicode, replacement_text)

    try:
        text_latin1_safe = text.encode('latin-1', 'replace').decode('latin-1')
        text = text_latin1_safe.replace('\ufffd', '[?]')
    except Exception:
        text = re.sub(r'[^\x00-\x7F\xC0-\xFF]', '[?]', text)
    return text

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
    if not isinstance(text_content, str): text_content = str(text_content)
    text_content = strip_or_replace_problematic_unicode(text_content)
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

if __name__ == "__main__":
    news_data_file = "retrieved_news_item.txt"
    latex_template_file = "news_template.tex.j2"
    output_tex_file = "news_report.tex"

    try:
        with open(news_data_file, "r", encoding="utf-8") as f:
            news_item_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: News data file '{news_data_file}' not found."); exit(1)
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from '{news_data_file}'."); exit(1)

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

    context = {"news_item": news_item_data}
    try:
        render_template(latex_template_file, output_tex_file, context)
    except Exception:
        exit(1)

    print(f"\nTo compile the LaTeX file, run: pdflatex {output_tex_file}")
