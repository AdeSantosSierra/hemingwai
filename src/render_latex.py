"""
render_latex.py: Genera PDF desde noticia + fact-check y sube a MEGA.

Dependencias:
  - TeX Live (pdflatex) o equivalente.
  - MEGA: se usa mega-cmd (CLI). Instalación recomendada: snap install mega-cmd
  - No se usa mega.py (incompatibilidades con Python 3.11+ en algunos entornos).

Variables de entorno:
  - MEGA_EMAIL, MEGA_PASSWORD: credenciales MEGA.
  - LATEX_BUILD_TIMEOUT: segundos máximos para pdflatex (default 60).
  - NEW_MONGODB_URI: opcional, para actualizar pipeline.steps.pdf.

Prueba local:
  1. Poner un JSON de noticia válido en output_temporal/retrieved_news_item.txt
  2. Opcional: output_temporal/fact_check_analisis.json con analisis/fuentes
  3. Desde repo root: .venv/bin/python src/render_latex.py
  4. PDF en output_temporal/<titulo_safe>.pdf; log en output_temporal/latex_build.log
"""
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
from datetime import datetime
from dotenv import load_dotenv
from jinja2 import Environment, FileSystemLoader, select_autoescape

# --- Unicode Character Handling ---
# Emojis/símbolos: reemplazo por texto o eliminación. Comillas tipográficas -> ASCII.
# Códigos explícitos para evitar bugs de escape (\U para codepoints > U+FFFF).
_UNICODE_REPLACEMENTS = (
    ("\u26A0", "[Atención]"),       # ⚠
    ("\u2B50", "[Estrella]"),       # ⭐
    ("\U0001F6A9", "[Bandera]"),    # 🚩 (correct: \U0001F6A9, not \u1F6A9)
    ("\u20AC", " EUR"),             # €
    ("\u2014", "-"),                # — (em dash)
    ("\u2013", "-"),                # – (en dash)
    ("\u2026", "..."),              # … (ellipsis)
    ("\u2022", "-"),                # • (bullet)
    ("\u201C", '"'), ("\u201D", '"'), ("\u201E", '"'), ("\u201F", '"'),  # left/right double
    ("\u2018", "'"), ("\u2019", "'"), ("\u201A", "'"), ("\u201B", "'"),  # left/right single
    ("\u00AB", '"'), ("\u00BB", '"'), ("\u2039", "'"), ("\u203A", "'"), # « » ‹ ›
)

def strip_or_replace_problematic_unicode(text):
    """Normaliza Unicode, aplica reemplazos (emojis, comillas) y elimina caracteres no imprimibles/problemáticos para LaTeX."""
    if not isinstance(text, str):
        return text
    text = unicodedata.normalize("NFKC", text)
    for char, replacement in _UNICODE_REPLACEMENTS:
        text = text.replace(char, replacement)
    # Permitir: ASCII imprimible, Latin-1 supplement, Latin Extended-A, saltos de línea/tab
    def is_allowed(char):
        code = ord(char)
        if (0x20 <= code <= 0x7E) or (0xA0 <= code <= 0xFF) or (0x100 <= code <= 0x17F):
            return True
        if code in (0x0A, 0x0D, 0x09):
            return True
        return False
    return "".join(c if is_allowed(c) else "" for c in text)


def _run_unicode_sanity_tests():
    """Tests mínimos para strip_or_replace_problematic_unicode (ñ, acentos, comillas, emojis)."""
    samples = [
        ("ñaño", "ñaño"),
        ("café", "café"),
        ("Über", "Über"),
        ("¿Qué? ¡Sí!", "¿Qué? ¡Sí!"),
        ("\u201Cfoo\u201D and \u2018bar\u2019", "\"foo\" and 'bar'"),
        ("«guillemets»", '"guillemets"'),
        ("\U0001F6A9 flag", "[Bandera] flag"),
        ("\u26A0 warn \u2B50", "[Atención] warn [Estrella]"),
        ("Precio: 30€", "Precio: 30 EUR"),
        ("A — B – C", "A - B - C"),
        ("Hola…", "Hola..."),
        ("• item", "- item"),
    ]
    for input_s, expected in samples:
        got = strip_or_replace_problematic_unicode(input_s)
        assert got == expected, "Unicode test: %r -> %r != %r" % (input_s, got, expected)
    print("Unicode sanity tests OK.")

def _run_url_tests():
    """Tests para detección y formateo de URLs."""
    samples = [
        ("Visita https://google.com para más.", r"Visita \url{https://google.com} para m\'{a}s."),
        ("Click https://example.org.", r"Click \url{https://example.org}."),
        ("Mira (https://site.com/foo)", r"Mira (\url{https://site.com/foo})"),
        ("https://simple.com", r"\url{https://simple.com}"),
        ("Text https://a.com, https://b.com end", r"Text \url{https://a.com}, \url{https://b.com} end"),
        # New robust tests
        ("https://a.com/x_y", r"\url{https://a.com/x_y}"), # No italic
        ("**https://a.com**", r"\textbf{\url{https://a.com}}"), # Bold url
        ("Check https://a.com/foo.", r"Check \url{https://a.com/foo}."),
        ("Check https://a.com/foo;", r"Check \url{https://a.com/foo};"),
        ("(https://a.com/foo)", r"(\url{https://a.com/foo})"),
        ("https://a.com/foo)", r"\url{https://a.com/foo})"), # Unbalanced ) stripped
        ("[https://a.com/foo]", r"[\url{https://a.com/foo}]"),
        ("https://a.com/foo]", r"\url{https://a.com/foo}]"), # Unbalanced ] stripped
        ("https://a.com/foo?q=1&b=2", r"\url{https://a.com/foo?q=1&b=2}"), # Query params
        # Our regex strictly stops at {, }, <, >, ", ', so URLs cannot contain braces at all.
        ("https://a.com/foo{bar}", r"\url{https://a.com/foo}\{bar\}"), 
    ]
    for input_s, expected in samples:
        got = escape_tex_special_chars(input_s)
        assert got == expected, "URL test: %r -> %r != %r" % (input_s, got, expected)
    print("URL tests OK.")


def _run_format_tests():
    """Tests mínimos para format_analysis_text (headings con acentos, párrafos con doble salto)."""
    # Heading con acentos
    t1 = "## Análisis rápido\n\nPárrafo uno.\n\nPárrafo dos."
    out1 = format_analysis_text(t1)
    assert "\\subsection*{" in out1, "Debe haber subsection"
    assert "\\par" in out1 or "medskip" in out1, "Párrafos con \\par\\medskip"
    # Solo párrafos
    t2 = "A\n\nB"
    out2 = format_analysis_text(t2)
    assert "\\par" in out2 or "medskip" in out2, "Doble salto preservado"
    print("Format/analysis tests OK.")


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
# Stable token without underscores/asterisks to avoid triggering markdown parser (bold/italic)
UNIQUE_PARAGRAPH_BREAK_STRING = "PARABREAKTOKENXYZ123"

def escape_tex_chars_in_plain_text_segment(text_segment):
    if not text_segment: return ""
    # Note: URLs are already extracted/replaced by placeholders before calling this.
    text_segment = strip_or_replace_problematic_unicode(text_segment)
    processed_segment = text_segment.replace("\\", r"\textbackslash{}")
    return "".join(CORE_TEX_SPECIAL_CHARS_NO_BS.get(char, char) for char in processed_segment)

def _extract_and_replace_urls(text):
    """
    Finds URLs, replaces them with a safe placeholder, and returns (processed_text, url_map).
    Stops at whitespace or < > " ' { } \
    Handles trailing punctuation intelligently.
    """
    if not text: return text, {}
    
    # Regex stops at whitespace or specific delimiters.
    # We capture the full candidate URL string.
    # Added * to delimiters so markdown bold/italic (**...**) isn't consumed.
    url_pattern = re.compile(r"(https?://[^\s<>\"'\{\}\\\*]+)")
    
    url_map = {}
    
    def replacer(match):
        raw_url = match.group(0)
        
        # 1. Strip safe trailing punctuation always
        # .,;: are almost never end of URL in this context; * stripped defensively
        clean_url = raw_url.rstrip(".,;:*")
        trailing = raw_url[len(clean_url):]
        
        # 2. Handle trailing ) - strip if unbalanced
        if clean_url.endswith(")"):
            if clean_url.count("(") < clean_url.count(")"):
                clean_url = clean_url[:-1]
                trailing = ")" + trailing
        
        # 3. Handle trailing ] - strip if unbalanced
        if clean_url.endswith("]"):
            if clean_url.count("[") < clean_url.count("]"):
                clean_url = clean_url[:-1]
                trailing = "]" + trailing

        # Create placeholder
        placeholder = f"URLPLACEHOLDER{len(url_map)}URLPLACEHOLDER"
        url_map[placeholder] = clean_url
        
        return placeholder + trailing

    return url_pattern.sub(replacer, text), url_map

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

    # 1. Extract URLs first to prevent markdown interference (e.g. underscores in URLs)
    text, url_map = _extract_and_replace_urls(text)

    # 2. Normalize unicode and handle newlines/paragraphs
    text = strip_or_replace_problematic_unicode(text)
    text = text.replace("\r\n", "\n")
    text_with_placeholders = re.sub(r"\n\s*\n+", UNIQUE_PARAGRAPH_BREAK_STRING, text)
    text_with_spaces = text_with_placeholders.replace("\n", " ")

    # 3. Split by Markdown (bold/italic)
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
    
    # 4. Restore paragraph breaks
    final_text = final_text_segments.replace(UNIQUE_PARAGRAPH_BREAK_STRING, "\n\\par\\medskip\n")
    
    # 5. Restore URLs (wrapped in \url{})
    # Iterate over map to replace placeholders.
    # Note: placeholders are plain alphanumeric, so regex replacement is safe.
    for placeholder, raw_url in url_map.items():
        # raw_url is put inside \url{} directly; standard LaTeX \url handles chars like % # _ & etc.
        # We ensure it doesn't contain unbalanced braces via our extraction logic.
        final_text = final_text.replace(placeholder, f"\\url{{{raw_url}}}")
        
    return final_text

def format_analysis_text(text):
    """
    Filtro de Jinja2 para formatear el texto del análisis de Perplexity.
    Detecta ## heading línea a línea (antes de tocar saltos), convierte a \\subsection*{...}.
    El resto se escapa con escape_tex_special_chars por párrafos (sin escapar las líneas de subsection).
    """
    if not isinstance(text, str):
        return ""
    # Evitar strip() completo para no comerse saltos iniciales relevantes, pero limpiar final
    text = text.replace("\r\n", "\n").rstrip()
    lines = text.split("\n")

    # 1. Separar en bloques: cada bloque es o bien una línea ## (heading) o bien líneas de texto
    blocks = []
    current_para = []
    for line in lines:
        heading_match = re.match(r"^##\s*(.*)$", line)
        if heading_match:
            if current_para:
                blocks.append(("\n".join(current_para), "para"))
                current_para = []
            title_content = escape_tex_inline(heading_match.group(1).strip())
            blocks.append(("\\subsection*{%s}" % title_content, "raw"))
        else:
            current_para.append(line)
    if current_para:
        blocks.append(("\n".join(current_para), "para"))

    # 2. Escapar solo los bloques de párrafo (conservar \par\medskip); raw se deja tal cual
    out = []
    for content, kind in blocks:
        if kind == "raw":
            out.append(content)
        else:
            out.append(escape_tex_special_chars(content))
    return "\n\n".join(out)

def sanitize_and_format_fact_check(text):
    """
    Filter for fact-checking analysis: bold **...** (contenido escapado con escape_tex_inline),
    listas -/* en itemize balanceado, resto escapado. No genera LaTeX inválido por _ % # \\ dentro de bold.
    """
    if not isinstance(text, str):
        return ""

    text = text.strip().replace("\r\n", "\n")

    # 1. Bold: partir por **...**; escapar solo los segmentos (bold con escape_tex_inline, resto con plain)
    parts = re.split(r"\*\*(.*?)\*\*", text, flags=re.DOTALL)
    built = []
    for i, seg in enumerate(parts):
        if i % 2 == 1:
            built.append("\\textbf{" + escape_tex_inline(seg) + "}")
        else:
            built.append(escape_tex_chars_in_plain_text_segment(seg))
    escaped_text = "".join(built)

    # 2. Process lines: listas en itemize balanceado
    lines = escaped_text.split("\n")
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
    """
    Used by the Jinja template (news_template.tex.j2) for main article and source URLs.
    Escapes special LaTeX characters.
    """
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


def compile_latex_to_pdf(tex_path, output_dir, log_path, timeout_sec=60):
    """
    Compila .tex a PDF con pdflatex. No bloquea: timeout y flags -interaction=nonstopmode -halt-on-error.
    Escribe stdout/stderr en log_path. Opcionalmente ejecuta dos pasadas para referencias.
    Returns (success: bool, error_message: str or None).
    """
    if not os.path.isfile(tex_path):
        return False, f"Archivo no encontrado: {tex_path}"
    pdflatex_cmd = [
        "pdflatex",
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-file-line-error",
        "-output-directory", output_dir,
        os.path.abspath(tex_path),
    ]
    log_lines = []
    try:
        with open(log_path, "w", encoding="utf-8") as logf:
            for run in (1, 2):
                logf.write(f"\n--- pdflatex pass {run} ---\n")
                try:
                    result = subprocess.run(
                        pdflatex_cmd,
                        capture_output=True,
                        text=True,
                        timeout=timeout_sec,
                        encoding="utf-8",
                        errors="replace",
                    )
                except subprocess.TimeoutExpired:
                    logf.write(f"TIMEOUT after {timeout_sec}s\n")
                    log_lines.append(f"TIMEOUT after {timeout_sec}s")
                    return False, f"pdflatex se colgó (timeout {timeout_sec}s). Ver {log_path}"
                except FileNotFoundError:
                    return False, "pdflatex no encontrado. Instala TeX Live (o equivalente)."
                out, err = result.stdout or "", result.stderr or ""
                logf.write(out)
                logf.write(err)
                log_lines.extend((out + err).splitlines())
                if result.returncode != 0:
                    # Intento de extraer el error específico de LaTeX
                    print("--- Análisis de error LaTeX ---")
                    for idx, line in enumerate(log_lines):
                        if "! LaTeX Error:" in line:
                            print(line)
                            # Buscar contexto de línea (l. <num>) en las siguientes líneas
                            for offset in range(1, 10):
                                if idx + offset < len(log_lines):
                                    next_l = log_lines[idx + offset]
                                    if next_l.strip().startswith("l."):
                                        print(next_l)
                                        break
                            break
                    print("-----------------------------")

                    tail = "\n".join(log_lines[-80:]) if len(log_lines) > 80 else "\n".join(log_lines)
                    print("--- Error pdflatex (últimas líneas del log) ---")
                    print(tail)
                    print("---")
                    return False, f"pdflatex falló (código {result.returncode}). Ver {log_path}"
        return True, None
    except OSError as e:
        return False, f"No se pudo escribir log o ejecutar pdflatex: {e}"


def detect_mega_cmd():
    """
    Detecta cómo invocar mega-cmd: "direct" (mega-* en PATH) o "snap" (snap run mega-cmd.*).
    Returns (mode: "direct"|"snap", error_message: str or None).
    """
    # 1) Ejecutable directo en PATH
    try:
        r = subprocess.run(
            ["mega-version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if r.returncode == 0:
            return "direct", None
    except FileNotFoundError:
        pass
    except subprocess.TimeoutExpired:
        pass

    # 2) Snap
    try:
        r = subprocess.run(
            ["snap", "run", "mega-cmd.mega-version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if r.returncode == 0:
            return "snap", None
        # snap existe pero mega-cmd falló (permisos, no instalado, etc.)
        err = (r.stderr or r.stdout or "").strip() or "sin salida"
        return None, "snap run mega-cmd falló: %s. Comprueba: snap list mega-cmd y permisos." % err[:200]
    except FileNotFoundError:
        return None, (
            "mega-cmd no encontrado. Instala con: snap install mega-cmd "
            "o añade mega-version al PATH."
        )
    except subprocess.TimeoutExpired:
        return None, "snap run mega-cmd no respondió (timeout). Comprueba que mega-cmd esté instalado."
    except Exception as e:
        return None, "mega-cmd: %s" % e


def run_mega_cmd(mode, command, args=None, timeout=15):
    """
    Ejecuta un comando mega-cmd. mode "direct" -> [command, ...args]; mode "snap" -> [snap, run, mega-cmd.<command>, ...args].
    Returns (stdout, stderr, returncode).
    """
    if mode == "snap":
        cmd = ["snap", "run", "mega-cmd.%s" % command]
    else:
        cmd = [command]
    if args:
        cmd.extend(args)
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )
        return (result.stdout or "", result.stderr or "", result.returncode)
    except subprocess.TimeoutExpired:
        return "", "Timeout después de %ds" % timeout, -1
    except FileNotFoundError:
        return "", "Comando no encontrado (revisa PATH o snap).", -1
    except Exception as e:
        return "", str(e), -1


def subir_a_mega_mejorado(pdf_path, email, password, carpeta_destino="HemingwAI/PDF hemingwAI"):
    """
    Sube un archivo a MEGA usando mega-cmd (CLI). No usa mega.py; compatible con Python 3.11+.
    Requiere mega-cmd instalado (p. ej. snap install mega-cmd).
    """
    print("\n" + "="*60)
    print("INICIANDO SUBIDA A MEGA.NZ")
    print("="*60)

    if not os.path.exists(pdf_path):
        print("ERROR: El archivo no existe:", pdf_path)
        return None

    file_size = os.path.getsize(pdf_path)
    print("Archivo:", os.path.basename(pdf_path), "Tamaño: %.2f KB" % (file_size / 1024))

    mode, detect_err = detect_mega_cmd()
    if mode is None:
        print("ERROR:", detect_err)
        return None

    def run(cmd_name, *a, **kw):
        return run_mega_cmd(mode, cmd_name, args=list(a) if a else None, **kw)

    for intento in range(3):
        print("\nIntento %d/3" % (intento + 1))
        try:
            stdout, stderr, rc = run("mega-version")
            if rc != 0:
                print("ERROR: mega-cmd no respondió:", stderr or stdout or "sin salida")
                return None
            print("mega-cmd OK:", (stdout or "").strip()[:80])

            stdout, stderr, rc = run("mega-whoami")
            logged_in = rc == 0 and email in (stdout or "")

            if not logged_in:
                run("mega-logout")
                stdout, stderr, rc = run("mega-login", email, password, timeout=20)
                if rc != 0:
                    print("ERROR en login MEGA:", stderr or stdout or "sin salida")
                    if intento < 2:
                        time.sleep(2 ** intento)
                        continue
                    return None
                print("Login MEGA OK")
            else:
                print("Sesión MEGA ya activa")

            # Carpetas
            parts = [p for p in carpeta_destino.split("/") if p]
            current = ""
            for p in parts:
                current = (current + "/" + p) if current else p
                stdout, stderr, rc = run("mega-ls", current)
                if rc != 0:
                    stdout, stderr, rc = run("mega-mkdir", current)
                    if rc != 0:
                        print("ERROR al crear carpeta:", current, stderr or stdout)
                        return None

            # Subir
            stdout, stderr, rc = run("mega-put", pdf_path, carpeta_destino, timeout=120)
            if rc != 0:
                print("ERROR al subir archivo:", stderr or stdout)
                return None
            print("Archivo subido OK")

            # Exportar enlace
            remote_path = carpeta_destino.rstrip("/") + "/" + os.path.basename(pdf_path)
            stdout, stderr, rc = run("mega-export", "-a", remote_path, timeout=15)
            if rc != 0:
                print("ERROR al generar enlace:", stderr or stdout)
                return None

            link_match = re.search(r"https://mega\.nz/[^\s\)\]]+", stdout or "")
            if not link_match:
                print("ERROR: no se encontró URL en la salida de mega-export:")
                print(stdout or "(vacío)")
                return None
            link = link_match.group(0).rstrip(".,;")
            if not link.startswith("https://mega.nz/"):
                print("ERROR: enlace inválido:", link)
                return None

            # Verificación
            stdout, stderr, rc = run("mega-ls", remote_path)
            if rc != 0:
                print("Advertencia: no se pudo verificar el archivo en MEGA:", stderr or stdout)

            print("="*60)
            print("SUBIDA COMPLETADA. Link:", link)
            print("="*60)
            return link

        except Exception as e:
            print("ERROR intento %d:" % (intento + 1), e)
            if intento < 2:
                time.sleep(2 ** intento)
            else:
                import traceback
                traceback.print_exc()
                return None

if __name__ == "__main__":
    if os.getenv("RENDER_LATEX_TEST_UNICODE"):
        _run_unicode_sanity_tests()
        sys.exit(0)
    if os.getenv("RENDER_LATEX_TEST_URL"):
        _run_url_tests()
        sys.exit(0)
    if os.getenv("RENDER_LATEX_TEST_FORMAT"):
        _run_format_tests()
        sys.exit(0)

    ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
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

    noticia_id = news_item_data.get("_id", "")
    run_id = (news_item_data.get("pipeline") or {}).get("run_id", "")
    print(f"noticia_id: {noticia_id}  run_id: {run_id}")

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

    # Compilar el PDF con timeout y log (no bloquea)
    latex_log = os.path.join(output_dir, "latex_build.log")
    timeout_sec = int(os.getenv("LATEX_BUILD_TIMEOUT", "60"))
    ok, err = compile_latex_to_pdf(output_tex_file, output_dir, latex_log, timeout_sec=timeout_sec)
    if not ok:
        print(f"Error al compilar el PDF: {err}")
        sys.exit(1)
    print(f"PDF generado: {output_pdf_file}")

    # Subir el PDF a Mega.nz automáticamente
    MEGA_EMAIL = os.getenv("MEGA_EMAIL")
    MEGA_PASSWORD = os.getenv("MEGA_PASSWORD")
    MEGA_FOLDER_PATH = "HemingwAI/PDF hemingwAI"
    
    if MEGA_EMAIL and MEGA_PASSWORD:
        link = subir_a_mega_mejorado(output_pdf_file, MEGA_EMAIL, MEGA_PASSWORD, MEGA_FOLDER_PATH)

        if link:
            # Optional: update MongoDB pipeline step for traceability
            import os as _os
            from pymongo import MongoClient
            from bson import ObjectId
            mongo_uri = _os.getenv("NEW_MONGODB_URI")
            if mongo_uri and noticia_id:
                try:
                    _client = MongoClient(mongo_uri)
                    _col = _client["Base_de_datos_noticias"]["Noticias"]
                    _oid = ObjectId(noticia_id) if isinstance(noticia_id, str) and len(noticia_id) == 24 else noticia_id
                    from datetime import datetime, timezone
                    _col.update_one(
                        {"_id": _oid},
                        {"$set": {
                            "pipeline.status": "pdf_generated",
                            "pipeline.steps.pdf": {
                                "ok": True,
                                "at": datetime.now(timezone.utc).isoformat(),
                                "artifact": output_pdf_file,
                                "mega_link": link
                            }
                        }}
                    )
                    _client.close()
                except Exception as _e:
                    print(f"Advertencia: no se pudo actualizar pipeline en MongoDB: {_e}")

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