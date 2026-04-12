#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Analiza la consistencia de varias ejecuciones JSON de Newscore/HemingwAI.

Uso:
    python analizar_consistencia_json.py
o:
    python analizar_consistencia_json.py --input . --output resultados_consistencia

Qué hace:
- Lee todos los .json de una carpeta.
- Extrae scores, status y alertas.
- Agrupa automáticamente ejecuciones de la misma noticia.
- Calcula métricas de consistencia entre repeticiones.
- Exporta varios CSV con el resumen.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import statistics
from collections import Counter, defaultdict
from html import escape
from pathlib import Path
from typing import Any, Dict, List, Optional


CATEGORIES = ["fiabilidad", "adecuacion", "claridad", "profundidad", "enfoque"]
DEFAULT_BASE_DIR = Path(__file__).resolve().parent
DEFAULT_INPUT_DIR = DEFAULT_BASE_DIR / "json" if (DEFAULT_BASE_DIR / "json").exists() else DEFAULT_BASE_DIR
CHART_COLORS = {
    "ok":      "#22c55e",   # verde luminoso sobre oscuro
    "warn":    "#f59e0b",   # ámbar del design system
    "bad":     "#ef4444",   # rojo saturado
    "accent":  "#f59e0b",   # acento principal = ámbar
    "muted":   "#6b7280",   # gris medio
    "grid":    "#1e293b",   # líneas sobre fondo oscuro
    "bg":      "#0a0a0f",   # fondo oscuro
    "card":    "#111827",   # cards oscuros
    "border":  "#1e293b",   # bordes tenues
    "text":    "#f9fafb",   # texto casi blanco
    "subtext": "#9ca3af",   # subtexto gris
}


def safe_get(obj: Dict[str, Any], *keys: str, default=None):
    """Acceso seguro a diccionarios anidados."""
    current = obj
    for key in keys:
        if not isinstance(current, dict) or key not in current:
            return default
        current = current[key]
    return current


def to_float(value: Any) -> Optional[float]:
    """Convierte a float si es posible."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def first_non_none(*values: Any) -> Any:
    """Devuelve el primer valor no None preservando valores válidos como 0 o cadena vacía."""
    for value in values:
        if value is not None:
            return value
    return None


def normalize_text(value: Any) -> str:
    """Normaliza texto para agrupar noticias aunque cambie un poco el formato."""
    if value is None:
        return ""
    text = str(value).strip().lower()
    text = " ".join(text.split())
    return text


def build_group_key(data: Dict[str, Any], fallback_name: str = "") -> str:
    """
    Crea una clave estable para agrupar 3 ejecuciones de la misma noticia.
    Prioridad:
    1. identificador
    2. url
    3. título
    """
    identificador = data.get("identificador")
    if identificador:
        return f"id::{normalize_text(identificador)}"

    url = data.get("url") or safe_get(data, "evaluation_result", "meta", "url")
    if url:
        return f"url::{normalize_text(url)}"

    title = (
        data.get("titulo")
        or safe_get(data, "evaluation_result", "meta", "title")
        or data.get("title")
    )
    if title:
        return f"title::{normalize_text(title)}"

    if fallback_name:
        return f"file::{normalize_text(fallback_name)}"
    return "unknown::sin_clave"


def extract_meta(data: Dict[str, Any]) -> Dict[str, str]:
    """Extrae metadatos principales."""
    title = (
        data.get("titulo")
        or safe_get(data, "evaluation_result", "meta", "title")
        or data.get("title")
        or ""
    )
    url = data.get("url") or safe_get(data, "evaluation_result", "meta", "url") or ""
    source = (
        data.get("fuente")
        or safe_get(data, "evaluation_result", "meta", "source")
        or ""
    )
    date = (
        data.get("fecha_publicacion")
        or safe_get(data, "evaluation_result", "meta", "date")
        or ""
    )
    identificador = data.get("identificador", "")
    return {
        "title": str(title),
        "url": str(url),
        "source": str(source),
        "date": str(date),
        "identificador": str(identificador),
    }


def extract_scores(data: Dict[str, Any]) -> Dict[str, Optional[float]]:
    """
    Extrae scores desde la estructura nueva o desde campos legacy.
    """
    scores = {}

    # Global
    global_score = first_non_none(
        to_float(data.get("global_score_2dp")),
        to_float(data.get("global_score_raw")),
        to_float(data.get("puntuacion")),
        to_float(safe_get(data, "evaluation_result", "derived", "global_score")),
        to_float(safe_get(data, "evaluation_result", "derived", "global_score_2dp")),
    )
    scores["global_score"] = global_score

    # Categorías desde evaluation_result.scores
    eval_scores = safe_get(data, "evaluation_result", "scores", default={})
    if isinstance(eval_scores, dict):
        for cat in CATEGORIES:
            scores[cat] = to_float(safe_get(eval_scores, cat, "value"))

    # Fallback desde puntuacion_individual / valoraciones antiguas
    if any(scores.get(cat) is None for cat in CATEGORIES):
        legacy_map = {
            "1": "fiabilidad",
            "2": "adecuacion",
            "3": "claridad",
            "4": "profundidad",
            "5": "enfoque",
        }
        legacy_scores = data.get("puntuacion_individual", {})
        if isinstance(legacy_scores, dict):
            for key, cat in legacy_map.items():
                if scores.get(cat) is None:
                    scores[cat] = to_float(legacy_scores.get(key))

    return scores


def extract_status(data: Dict[str, Any]) -> str:
    """Extrae el label del status."""
    status = safe_get(data, "evaluation_result", "status", "label")
    if status is not None:
        return str(status)
    return ""


def extract_alerts(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extrae alertas del bloque nuevo."""
    alerts = safe_get(data, "evaluation_result", "alerts", default=[])
    if isinstance(alerts, list):
        return alerts
    return []


def alert_code_set(alerts: List[Dict[str, Any]]) -> List[str]:
    """Devuelve códigos de alerta ordenados y únicos."""
    codes = []
    for alert in alerts:
        code = alert.get("code")
        if code:
            codes.append(str(code))
    return sorted(set(codes))


def severity_counter(alerts: List[Dict[str, Any]]) -> Dict[str, int]:
    counter = Counter()
    for alert in alerts:
        sev = str(alert.get("severity", "")).lower().strip()
        if sev:
            counter[sev] += 1
    return dict(counter)


def mean_or_none(values: List[Optional[float]]) -> Optional[float]:
    nums = [v for v in values if v is not None]
    if not nums:
        return None
    return sum(nums) / len(nums)


def stdev_or_none(values: List[Optional[float]]) -> Optional[float]:
    nums = [v for v in values if v is not None]
    if len(nums) < 2:
        return 0.0 if len(nums) == 1 else None
    return statistics.stdev(nums)


def min_or_none(values: List[Optional[float]]) -> Optional[float]:
    nums = [v for v in values if v is not None]
    return min(nums) if nums else None


def max_or_none(values: List[Optional[float]]) -> Optional[float]:
    nums = [v for v in values if v is not None]
    return max(nums) if nums else None


def range_or_none(values: List[Optional[float]]) -> Optional[float]:
    mn = min_or_none(values)
    mx = max_or_none(values)
    if mn is None or mx is None:
        return None
    return mx - mn


def jaccard_similarity(sets: List[set]) -> Optional[float]:
    """Similitud Jaccard media contra la unión total."""
    if not sets:
        return None
    union = set().union(*sets)
    if not union:
        return 1.0
    intersections = [len(s & union) / len(union) for s in sets]
    return sum(intersections) / len(intersections)


def consistency_label(range_value: Optional[float]) -> str:
    """
    Etiqueta de variabilidad numérica basada en el rango observado.

    Escala calibrada para scores 0–10 de modelos LLM, donde rangos de hasta
    1.0–1.5 puntos son habituales y no implican necesariamente un fallo del sistema.
    Se distingue de la consistencia decisional (cambio de status), que es más grave.
    """
    if range_value is None:
        return "sin_datos"
    if range_value <= 0.50:
        return "muy_consistente"
    if range_value <= 1.00:
        return "consistente"
    if range_value <= 1.50:
        return "variabilidad_apreciable"
    if range_value <= 2.00:
        return "variabilidad_elevada"
    return "variabilidad_alta"


def consistency_color(range_value: Optional[float], invert: bool = False) -> str:
    """
    Color semántico para estabilidad o variabilidad.

    - invert=False (rango, a menor mejor): verde ≤1.0, ámbar ≤1.75, rojo >1.75
    - invert=True  (Jaccard, a mayor mejor): verde ≥0.65, ámbar ≥0.45, rojo <0.45
    """
    if range_value is None:
        return CHART_COLORS["muted"]

    if invert:
        if range_value >= 0.65:
            return CHART_COLORS["ok"]
        if range_value >= 0.45:
            return CHART_COLORS["warn"]
        return CHART_COLORS["bad"]

    if range_value <= 1.00:
        return CHART_COLORS["ok"]
    if range_value <= 1.75:
        return CHART_COLORS["warn"]
    return CHART_COLORS["bad"]


def load_json_file(path: Path) -> Optional[Dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[ERROR] No se pudo leer {path.name}: {e}")
        return None


def parse_bool(value: Any) -> bool:
    return str(value).strip().lower() == "true"


def short_label(text: str, max_len: int = 44) -> str:
    text = " ".join(str(text).split())
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


def natural_sort_key(text: str) -> List[Any]:
    parts = re.split(r"(\d+)", str(text))
    return [int(part) if part.isdigit() else part.lower() for part in parts]


def format_num(value: Any, digits: int = 2) -> str:
    number = to_float(value)
    if number is None:
        return "n/d"
    return f"{number:.{digits}f}"


def percentile_or_none(values: List[Optional[float]], percentile: float) -> Optional[float]:
    nums = sorted(v for v in values if v is not None)
    if not nums:
        return None
    if len(nums) == 1:
        return nums[0]
    position = clamp((len(nums) - 1) * percentile, 0, len(nums) - 1)
    lower = int(position)
    upper = min(lower + 1, len(nums) - 1)
    weight = position - lower
    return nums[lower] + (nums[upper] - nums[lower]) * weight


def write_text_file(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def discover_json_files(input_dir: Path) -> List[Path]:
    """Busca JSON en la carpeta indicada y, si está vacía, prueba una subcarpeta json/."""
    direct_files = sorted(input_dir.glob("*.json"))
    if direct_files:
        return direct_files

    nested_json_dir = input_dir / "json"
    if nested_json_dir.is_dir():
        nested_files = sorted(nested_json_dir.glob("*.json"))
        if nested_files:
            return nested_files

    return []


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def hex_to_rgb(color: str) -> tuple[int, int, int]:
    color = color.lstrip("#")
    return tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def mix_colors(color_a: str, color_b: str, ratio: float) -> str:
    ratio = clamp(ratio, 0.0, 1.0)
    rgb_a = hex_to_rgb(color_a)
    rgb_b = hex_to_rgb(color_b)
    mixed = tuple(round(a + (b - a) * ratio) for a, b in zip(rgb_a, rgb_b))
    return rgb_to_hex(mixed)


def heat_color(value: Optional[float], max_value: float) -> str:
    if value is None:
        return "#1e293b"
    ratio = clamp((value / max_value) if max_value else 0.0, 0.0, 1.0)
    if ratio <= 0.5:
        return mix_colors(CHART_COLORS["ok"], CHART_COLORS["warn"], ratio / 0.5)
    return mix_colors(CHART_COLORS["warn"], CHART_COLORS["bad"], (ratio - 0.5) / 0.5)


def alert_stability_label(value: Optional[float]) -> str:
    """
    Clasifica la similitud Jaccard media de alertas entre ejecuciones.
    Umbral superior rebajado a 0.65 porque Jaccard en conjuntos pequeños
    suele ser bajo incluso con alertas consistentes.
    """
    if value is None:
        return "sin datos"
    if value >= 0.65:
        return "alta"
    if value >= 0.45:
        return "media"
    return "baja"


def dispersion_label(value: Optional[float]) -> str:
    """
    Etiqueta descriptiva del rango medio entre ejecuciones.
    Escala de 5 niveles calibrada para scores 0–10.
    """
    if value is None:
        return "sin datos"
    if value <= 0.50:
        return "baja"
    if value <= 1.00:
        return "moderada"
    if value <= 1.50:
        return "apreciable"
    if value <= 2.00:
        return "elevada"
    return "alta"


def reproducibility_badge(range_value: Optional[float]) -> str:
    """Badge compacto para cards y visualizaciones."""
    label = consistency_label(range_value)
    mapping = {
        "muy_consistente":         "Muy consistente",
        "consistente":             "Consistente",
        "variabilidad_apreciable": "Var. apreciable",
        "variabilidad_elevada":    "Var. elevada",
        "variabilidad_alta":       "Var. alta",
        "sin_datos":               "sin datos",
    }
    return mapping.get(label, "sin datos")


def reproducibility_level_text(range_value: Optional[float]) -> str:
    """Frase descriptiva para conclusiones automáticas."""
    label = consistency_label(range_value)
    mapping = {
        "muy_consistente":         "muy consistente",
        "consistente":             "consistente",
        "variabilidad_apreciable": "con variabilidad apreciable",
        "variabilidad_elevada":    "con variabilidad elevada",
        "variabilidad_alta":       "con variabilidad alta",
        "sin_datos":               "sin datos",
    }
    return mapping.get(label, "sin datos")


def decisional_consistency_label(summary_row: Dict[str, Any]) -> str:
    """
    Evalúa la consistencia decisional: si el sistema toma las mismas decisiones
    relevantes (status, posición relativa en la escala) entre ejecuciones.

    Esta métrica es más importante que la variabilidad numérica pura:
    un sistema puede oscilar ±1 punto y seguir siendo funcionalmente estable
    si el status y el cuadrante de score no cambian.
    """
    status_consistent = parse_bool(summary_row.get("status_consistente"))
    global_range = to_float(summary_row.get("global_score_rango")) or 0.0

    if status_consistent and global_range <= 1.50:
        return "estable"
    if status_consistent and global_range <= 2.50:
        return "mayormente_estable"
    if not status_consistent and global_range > 2.00:
        return "inestable"
    if not status_consistent:
        return "variable"
    return "dispersión_notable"


def decisional_consistency_note(summary_row: Dict[str, Any]) -> str:
    """Nota breve sobre la consistencia decisional para el panel de noticias."""
    label = decisional_consistency_label(summary_row)
    mapping = {
        "estable":             "Decisión estable",
        "mayormente_estable":  "Mayormente estable",
        "inestable":           "Decisión inestable",
        "variable":            "Status variable",
        "dispersión_notable":  "Dispersión notable",
    }
    return mapping.get(label, "sin datos")


def get_most_unstable_category(summary_row: Dict[str, Any]) -> tuple[str, Optional[float]]:
    pairs = [
        (category, to_float(summary_row.get(f"{category}_rango")))
        for category in CATEGORIES
    ]
    valid_pairs = [pair for pair in pairs if pair[1] is not None]
    if not valid_pairs:
        return "", None
    return max(valid_pairs, key=lambda pair: pair[1] if pair[1] is not None else -1)


def alert_presence_color(ratio: float) -> str:
    return mix_colors("#1a1f2e", CHART_COLORS["accent"], ratio)


def svg_document(width: int, height: int, title: str, body: List[str]) -> str:
    style = f"""
    <style>
      .title {{ font: 700 24px Inter, system-ui, -apple-system, sans-serif; fill: {CHART_COLORS["text"]}; }}
      .subtitle {{ font: 14px Inter, system-ui, -apple-system, sans-serif; fill: {CHART_COLORS["muted"]}; }}
      .label {{ font: 13px Inter, system-ui, -apple-system, sans-serif; fill: {CHART_COLORS["text"]}; }}
      .small {{ font: 12px Inter, system-ui, -apple-system, sans-serif; fill: {CHART_COLORS["muted"]}; }}
      .value {{ font: 700 13px Inter, system-ui, -apple-system, sans-serif; fill: {CHART_COLORS["text"]}; }}
      .axis {{ stroke: {CHART_COLORS["grid"]}; stroke-width: 1; }}
      .panel {{ fill: {CHART_COLORS["card"]}; stroke: {CHART_COLORS["border"]}; stroke-width: 1; }}
    </style>
    """
    return "\n".join([
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">',
        f"<title>{escape(title)}</title>",
        f"<desc>{escape(title)}</desc>",
        style,
        f'<rect width="{width}" height="{height}" rx="18" fill="{CHART_COLORS["card"]}" />',
        *body,
        "</svg>",
    ])


def sort_summary_rows_for_dashboard(summary_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        summary_rows,
        key=lambda row: (
            to_float(row.get("global_score_rango")) if to_float(row.get("global_score_rango")) is not None else 9999,
            row.get("titulo", ""),
        ),
    )


def build_category_summary(summary_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    results = []
    for category in CATEGORIES:
        ranges = [to_float(row.get(f"{category}_rango")) for row in summary_rows]
        stds = [to_float(row.get(f"{category}_std")) for row in summary_rows]
        valid_ranges = [value for value in ranges if value is not None]
        valid_stds = [value for value in stds if value is not None]
        results.append({
            "categoria": category,
            "rango_medio": sum(valid_ranges) / len(valid_ranges) if valid_ranges else None,
            "std_media": sum(valid_stds) / len(valid_stds) if valid_stds else None,
        })
    return sorted(
        results,
        key=lambda row: row["rango_medio"] if row["rango_medio"] is not None else 9999,
    )


def build_global_dispersion_svg(
    summary_rows: List[Dict[str, Any]],
    detailed_rows: List[Dict[str, Any]],
    fixed_scale: bool = False,
) -> str:
    """
    Genera el box plot de dispersión global.

    fixed_scale=False (por defecto): eje dinámico, ampliado al rango de los datos.
    fixed_scale=True: eje fijo 0–10 para mostrar la variabilidad en su verdadera dimensión.
    """
    ordered_rows = sort_summary_rows_for_dashboard(summary_rows)
    grouped_runs: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in detailed_rows:
        grouped_runs[row["grupo_noticia"]].append(row)

    if fixed_scale:
        axis_min = 0.0
        axis_max = 10.0
    else:
        all_scores = [
            to_float(row.get("global_score"))
            for row in detailed_rows
            if to_float(row.get("global_score")) is not None
        ]
        min_score = min(all_scores) if all_scores else 0.0
        max_score = max(all_scores) if all_scores else 1.0
        if max_score == min_score:
            max_score += 1.0
        pad = max((max_score - min_score) * 0.08, 0.35)
        axis_min = max(0.0, min_score - pad)
        axis_max = max_score + pad

    width = 1280
    left = 340
    right = 190
    top = 100
    max_runs = max((len(grouped_runs[row["grupo_noticia"]]) for row in ordered_rows), default=1)
    row_h = max(72, 58 + max_runs * 5)
    height = top + row_h * len(ordered_rows) + 60
    plot_width = width - left - right

    def scale_x(value: float) -> float:
        return left + ((value - axis_min) / (axis_max - axis_min)) * plot_width

    if fixed_scale:
        title_text = "La misma distribución sobre la escala completa 0–10"
        subtitle_text = "Eje fijo 0–10: la variabilidad real suele ser menor de lo que sugiere la vista ampliada anterior."
    else:
        title_text = "Distribución del score global por noticia"
        subtitle_text = "Vista ampliada al rango real de los datos. Consulta la leyenda para identificar cada elemento."

    body = [
        f'<text x="36" y="44" class="title">{escape(title_text)}</text>',
        f'<text x="36" y="68" class="subtitle">{escape(subtitle_text)}</text>',
    ]

    # Leyenda: 2 filas, cada símbolo pegado a su etiqueta
    legend_w = 430
    legend_h = 58
    legend_x = width - legend_w - 22
    legend_y = 32
    lx = legend_x  # alias corto

    body.append(f'<rect x="{lx}" y="{legend_y}" width="{legend_w}" height="{legend_h}" rx="12" fill="#1e293b" stroke="{CHART_COLORS["border"]}" />')

    # ── fila 1 (y+18 línea base, símbolos centrados en y+14) ─────────────
    ry1s = legend_y + 14   # y centro símbolos fila 1
    ry1t = legend_y + 19   # y baseline texto fila 1

    # Item 1: línea whisker min-max
    body.append(f'<line x1="{lx + 12}" y1="{ry1s}" x2="{lx + 38}" y2="{ry1s}" stroke="#94a3b8" stroke-width="3" stroke-linecap="round" />')
    body.append(f'<line x1="{lx + 12}" y1="{ry1s - 7}" x2="{lx + 12}" y2="{ry1s + 7}" stroke="#94a3b8" stroke-width="2" />')
    body.append(f'<line x1="{lx + 38}" y1="{ry1s - 7}" x2="{lx + 38}" y2="{ry1s + 7}" stroke="#94a3b8" stroke-width="2" />')
    body.append(f'<text x="{lx + 44}" y="{ry1t}" class="small">min-max</text>')

    # Item 2: caja IQR
    body.append(f'<rect x="{lx + 126}" y="{ry1s - 8}" width="24" height="16" rx="5" fill="{mix_colors("#ffffff", CHART_COLORS["warn"], 0.18)}" stroke="{CHART_COLORS["warn"]}" stroke-width="1.2" />')
    body.append(f'<text x="{lx + 156}" y="{ry1t}" class="small">IQR (50% central)</text>')

    # Item 3: línea mediana
    body.append(f'<line x1="{lx + 308}" y1="{ry1s - 9}" x2="{lx + 308}" y2="{ry1s + 9}" stroke="{CHART_COLORS["text"]}" stroke-width="2.5" />')
    body.append(f'<text x="{lx + 316}" y="{ry1t}" class="small">mediana</text>')

    # ── fila 2 (y+42 línea base, símbolos centrados en y+38) ─────────────
    ry2s = legend_y + 39   # y centro símbolos fila 2
    ry2t = legend_y + 43   # y baseline texto fila 2

    # Item 4: rombo media
    body.append(f'<polygon points="{lx + 22},{ry2s - 8} {lx + 30},{ry2s} {lx + 22},{ry2s + 8} {lx + 14},{ry2s}" fill="{CHART_COLORS["text"]}" />')
    body.append(f'<text x="{lx + 36}" y="{ry2t}" class="small">media</text>')

    # Item 5: círculo ejecución individual
    body.append(f'<circle cx="{lx + 130}" cy="{ry2s}" r="5" fill="{CHART_COLORS["accent"]}" stroke="{CHART_COLORS["card"]}" stroke-width="1.5" opacity="0.9" />')
    body.append(f'<text x="{lx + 141}" y="{ry2t}" class="small">ejecución individual</text>')

    if fixed_scale:
        # Marcas en valores enteros pares: 0, 2, 4, 6, 8, 10
        axis_ticks = [0, 2, 4, 6, 8, 10]
        for tick in axis_ticks:
            x = scale_x(float(tick))
            body.append(f'<line x1="{x:.1f}" y1="{top - 18}" x2="{x:.1f}" y2="{height - 34}" class="axis" />')
            body.append(f'<text x="{x:.1f}" y="{height - 12}" text-anchor="middle" class="small">{tick}</text>')
    else:
        for step in range(6):
            value = axis_min + (axis_max - axis_min) * step / 5
            x = left + plot_width * step / 5
            body.append(f'<line x1="{x:.1f}" y1="{top - 18}" x2="{x:.1f}" y2="{height - 34}" class="axis" />')
            body.append(f'<text x="{x:.1f}" y="{height - 12}" text-anchor="middle" class="small">{value:.2f}</text>')

    most_stable_key = ordered_rows[0]["grupo_noticia"] if ordered_rows else ""
    least_stable_key = ordered_rows[-1]["grupo_noticia"] if ordered_rows else ""

    for idx, summary in enumerate(ordered_rows):
        row_top = top + idx * row_h
        center_y = row_top + row_h / 2 - 4
        row_runs = sorted(grouped_runs[summary["grupo_noticia"]], key=lambda row: natural_sort_key(row["archivo"]))
        range_value = to_float(summary.get("global_score_rango")) or 0.0
        std_value = to_float(summary.get("global_score_std")) or 0.0
        mean_value = to_float(summary.get("global_score_media")) or 0.0
        min_value = to_float(summary.get("global_score_min")) or mean_value
        max_value = to_float(summary.get("global_score_max")) or mean_value
        median_value = to_float(summary.get("global_score_mediana")) or mean_value
        q1_value = to_float(summary.get("global_score_q1")) or mean_value
        q3_value = to_float(summary.get("global_score_q3")) or mean_value

        # En escala fija no diferenciamos fondo por ranking, todas neutral
        if fixed_scale:
            row_fill = "#0f1117"
            row_badge = ""
        else:
            row_fill = "#0f2a1e" if summary["grupo_noticia"] == most_stable_key else "#2a0f0f" if summary["grupo_noticia"] == least_stable_key else "#0f1117"
            row_badge = "mayor estabilidad" if summary["grupo_noticia"] == most_stable_key else "mayor dispersión" if summary["grupo_noticia"] == least_stable_key else ""
        row_color = consistency_color(range_value)

        body.append(f'<rect x="20" y="{row_top}" width="{width - 40}" height="{row_h - 18}" rx="16" fill="{row_fill}" stroke="{CHART_COLORS["border"]}" />')
        body.append(
            f'<text x="36" y="{row_top + 28}" class="label"><title>{escape(summary["titulo"])}</title>{escape(short_label(summary["titulo"], 46))}</text>'
        )
        body.append(
            f'<text x="36" y="{row_top + 50}" class="small">n={summary["n_ejecuciones"]} | media {format_num(mean_value)} | mediana {format_num(median_value)} | IQR {format_num(summary.get("global_score_iqr"))} | rango {format_num(range_value)}</text>'
        )
        if row_badge:
            badge_fill = "#14532d" if row_badge == "mayor estabilidad" else "#7f1d1d"
            badge_text = CHART_COLORS["ok"] if row_badge == "mayor estabilidad" else CHART_COLORS["bad"]
            body.append(f'<rect x="36" y="{row_top + 56}" width="122" height="16" rx="8" fill="{badge_fill}" />')
            body.append(f'<text x="97" y="{row_top + 68}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="10" font-weight="700" fill="{badge_text}">{row_badge}</text>')

        x_min = scale_x(min_value)
        x_max = scale_x(max_value)
        x_mean = scale_x(mean_value)
        x_median = scale_x(median_value)
        x_q1 = scale_x(q1_value)
        x_q3 = scale_x(q3_value)
        x_std_left = scale_x(max(axis_min, mean_value - std_value))
        x_std_right = scale_x(min(axis_max, mean_value + std_value))
        body.append(f'<line x1="{x_min:.1f}" y1="{center_y:.1f}" x2="{x_max:.1f}" y2="{center_y:.1f}" stroke="#94a3b8" stroke-width="3" stroke-linecap="round" />')
        body.append(f'<line x1="{x_min:.1f}" y1="{center_y - 12:.1f}" x2="{x_min:.1f}" y2="{center_y + 12:.1f}" stroke="#94a3b8" stroke-width="2" />')
        body.append(f'<line x1="{x_max:.1f}" y1="{center_y - 12:.1f}" x2="{x_max:.1f}" y2="{center_y + 12:.1f}" stroke="#94a3b8" stroke-width="2" />')
        body.append(
            f'<rect x="{min(x_q1, x_q3):.1f}" y="{center_y - 13:.1f}" width="{max(abs(x_q3 - x_q1), 2):.1f}" height="26" rx="8" fill="{mix_colors("#ffffff", row_color, 0.18)}" stroke="{row_color}" stroke-width="1.2" />'
        )
        body.append(f'<line x1="{x_median:.1f}" y1="{center_y - 15:.1f}" x2="{x_median:.1f}" y2="{center_y + 15:.1f}" stroke="{CHART_COLORS["text"]}" stroke-width="2" />')
        if std_value > 0:
            body.append(
                f'<rect x="{x_std_left:.1f}" y="{center_y - 4:.1f}" width="{max(x_std_right - x_std_left, 2):.1f}" height="8" rx="4" fill="{mix_colors("#ffffff", row_color, 0.32)}" />'
            )
        body.append(
            f'<polygon points="{x_mean:.1f},{center_y - 10:.1f} {x_mean + 8:.1f},{center_y:.1f} {x_mean:.1f},{center_y + 10:.1f} {x_mean - 8:.1f},{center_y:.1f}" fill="{CHART_COLORS["text"]}" />'
        )

        point_spacing = 5
        point_radius = 4.5
        for point_idx, run in enumerate(row_runs):
            score = to_float(run.get("global_score"))
            if score is None:
                continue
            jitter_x = (point_idx - (len(row_runs) - 1) / 2) * point_spacing
            cx = scale_x(score) + jitter_x
            cy = center_y
            body.append(
                f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{point_radius:.1f}" fill="{CHART_COLORS["accent"]}" stroke="{CHART_COLORS["card"]}" stroke-width="1.5" opacity="0.85"><title>{escape(run["archivo"])}: {format_num(score)}</title></circle>'
            )

        status_fill = "#14532d" if parse_bool(summary.get("status_consistente")) else "#7f1d1d"
        status_text = "status consistente" if parse_bool(summary.get("status_consistente")) else "status variable"
        body.append(f'<rect x="{width - 160}" y="{row_top + 20}" width="124" height="18" rx="9" fill="{status_fill}" />')
        body.append(f'<text x="{width - 98}" y="{row_top + 33}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="11" font-weight="700" fill="{CHART_COLORS["text"]}">{status_text}</text>')

    return svg_document(width, height, "Dispersión global por noticia", body)


def build_category_heatmap_svg(summary_rows: List[Dict[str, Any]]) -> str:
    ordered_rows = sort_summary_rows_for_dashboard(summary_rows)
    width = 820
    left = 280
    top = 142
    cell_w = 96
    cell_h = 56
    height = top + cell_h * len(ordered_rows) + 56
    max_range = max(
        to_float(row.get(f"{category}_rango")) or 0.0
        for row in ordered_rows
        for category in CATEGORIES
    ) or 1.0

    body = [
        f'<text x="36" y="44" class="title">Heatmap de variabilidad por noticia y categoria</text>',
        f'<text x="36" y="68" class="subtitle">Cada celda muestra rango y desviación estándar. Verde indica mayor estabilidad y rojo menor reproducibilidad.</text>',
    ]

    legend_x = 36
    legend_y = 92
    legend_w = 300
    for step in range(30):
        ratio = step / 29
        body.append(
            f'<rect x="{legend_x + step * (legend_w / 30):.1f}" y="{legend_y}" width="{legend_w / 30 + 1:.1f}" height="12" fill="{heat_color(max_range * ratio, max_range)}" />'
        )
    body.append(f'<text x="{legend_x}" y="{legend_y - 6}" class="small">mas estable</text>')
    body.append(f'<text x="{legend_x + legend_w}" y="{legend_y - 6}" text-anchor="end" class="small">menos estable</text>')
    body.append(f'<text x="{legend_x}" y="{legend_y + 28}" class="small">verde ≤ 0.50 | amarillo 0.51-1.00 | rojo > 1.00</text>')

    for idx, category in enumerate(CATEGORIES):
        x = left + idx * cell_w + cell_w / 2
        body.append(f'<text x="{x:.1f}" y="{top - 20}" text-anchor="middle" class="label">{escape(category.title())}</text>')

    for row_idx, summary in enumerate(ordered_rows):
        y = top + row_idx * cell_h
        body.append(
            f'<text x="36" y="{y + 28}" class="label"><title>{escape(summary["titulo"])}</title>{escape(short_label(summary["titulo"], 38))}</text>'
        )
        body.append(
            f'<text x="36" y="{y + 48}" class="small">rango global {format_num(summary.get("global_score_rango"))}</text>'
        )
        for col_idx, category in enumerate(CATEGORIES):
            x = left + col_idx * cell_w
            value = to_float(summary.get(f"{category}_rango"))
            std_value = to_float(summary.get(f"{category}_std"))
            fill = heat_color(value, max_range)
            body.append(f'<rect x="{x}" y="{y}" width="{cell_w - 10}" height="{cell_h - 12}" rx="12" fill="{fill}" stroke="white" stroke-width="2"><title>{escape(summary["titulo"])} | {category}: rango {format_num(value)} | std {format_num(std_value)}</title></rect>')
            body.append(
                f'<text x="{x + (cell_w - 10) / 2:.1f}" y="{y + 22}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="700" fill="#ffffff">{format_num(value)}</text>'
            )
            body.append(
                f'<text x="{x + (cell_w - 10) / 2:.1f}" y="{y + 37}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="10" fill="rgba(255,255,255,0.75)">std {format_num(std_value)}</text>'
            )
        body.append(f'<line x1="24" y1="{y + cell_h - 6}" x2="{width - 24}" y2="{y + cell_h - 6}" stroke="{CHART_COLORS["grid"]}" />')

    return svg_document(width, height, "Heatmap de categorias", body)


def build_category_summary_svg(summary_rows: List[Dict[str, Any]]) -> str:
    category_rows = sorted(
        build_category_summary(summary_rows),
        key=lambda row: row["rango_medio"] if row["rango_medio"] is not None else -1,
        reverse=True,
    )
    width = 760
    left = 210
    right = 120
    top = 98
    row_h = 52
    height = top + row_h * len(category_rows) + 44
    plot_width = width - left - right
    max_value = max(row["rango_medio"] or 0.0 for row in category_rows) or 1.0

    body = [
        f'<text x="28" y="40" class="title">Variabilidad promedio por categoria</text>',
        f'<text x="28" y="64" class="subtitle">Resume en qué dimensión el sistema presenta mayor variabilidad promedio.</text>',
    ]

    for step in range(5):
        x = left + plot_width * step / 4
        value = max_value * step / 4
        body.append(f'<line x1="{x:.1f}" y1="{top - 16}" x2="{x:.1f}" y2="{height - 28}" class="axis" />')
        body.append(f'<text x="{x:.1f}" y="{height - 10}" text-anchor="middle" class="small">{value:.2f}</text>')

    for idx, row in enumerate(category_rows):
        y = top + idx * row_h
        value = row["rango_medio"] or 0.0
        bar_w = (value / max_value) * plot_width if max_value else 0.0
        fill = heat_color(value, max_value)
        body.append(f'<text x="28" y="{y + 20}" class="label">{escape(str(row["categoria"]).title())}</text>')
        body.append(f'<rect x="{left}" y="{y + 6}" width="{plot_width}" height="18" rx="9" fill="#1e293b" />')
        body.append(f'<rect x="{left}" y="{y + 6}" width="{bar_w:.1f}" height="18" rx="9" fill="{fill}" />')
        body.append(f'<text x="{left + plot_width + 12}" y="{y + 20}" class="value">{format_num(value)}</text>')

    return svg_document(width, height, "Variabilidad por categoria", body)


def build_alert_stability_svg(summary_rows: List[Dict[str, Any]]) -> str:
    ordered_rows = sorted(
        summary_rows,
        key=lambda row: (
            -(to_float(row.get("alertas_jaccard_media")) if to_float(row.get("alertas_jaccard_media")) is not None else -1),
            row.get("titulo", ""),
        ),
    )
    width = 860
    left = 280
    right = 120
    top = 98
    row_h = 56
    height = top + row_h * len(ordered_rows) + 44
    plot_width = width - left - right

    body = [
        f'<text x="28" y="40" class="title">Estabilidad de alertas por noticia</text>',
        f'<text x="28" y="64" class="subtitle">La similitud Jaccard resume el grado de persistencia de las alertas entre ejecuciones.</text>',
    ]

    for step in range(6):
        x = left + plot_width * step / 5
        value = step / 5
        body.append(f'<line x1="{x:.1f}" y1="{top - 16}" x2="{x:.1f}" y2="{height - 28}" class="axis" />')
        body.append(f'<text x="{x:.1f}" y="{height - 10}" text-anchor="middle" class="small">{value:.1f}</text>')

    for idx, row in enumerate(ordered_rows):
        y = top + idx * row_h
        value = to_float(row.get("alertas_jaccard_media")) or 0.0
        fill = consistency_color(value, invert=True)
        bar_w = value * plot_width
        label = alert_stability_label(value)
        body.append(
            f'<text x="28" y="{y + 20}" class="label"><title>{escape(row["titulo"])}</title>{escape(short_label(row["titulo"], 34))}</text>'
        )
        body.append(f'<text x="28" y="{y + 39}" class="small">{row["alertas_distintas_totales"]} alertas distintas</text>')
        body.append(f'<rect x="{left}" y="{y + 8}" width="{plot_width}" height="18" rx="9" fill="#1e293b" />')
        body.append(f'<rect x="{left}" y="{y + 8}" width="{bar_w:.1f}" height="18" rx="9" fill="{fill}" />')
        body.append(f'<text x="{left + plot_width + 12}" y="{y + 22}" class="value">{value:.2f}</text>')
        body.append(f'<text x="{left + plot_width + 54}" y="{y + 22}" class="small">{label}</text>')

    return svg_document(width, height, "Estabilidad de alertas", body)


def build_alert_presence_matrix_svg(
    summary_rows: List[Dict[str, Any]],
    detailed_rows: List[Dict[str, Any]],
) -> str:
    ordered_rows = sort_summary_rows_for_dashboard(summary_rows)
    total_runs_by_group = {
        row["grupo_noticia"]: int(row["n_ejecuciones"])
        for row in summary_rows
    }
    code_counts_by_group: Dict[str, Counter] = defaultdict(Counter)
    total_code_counts = Counter()

    for row in detailed_rows:
        codes = [code.strip() for code in str(row.get("codigos_alerta", "")).split("|") if code.strip()]
        unique_codes = set(codes)
        for code in unique_codes:
            code_counts_by_group[row["grupo_noticia"]][code] += 1
            total_code_counts[code] += 1

    relevant_codes = [code for code, _ in total_code_counts.most_common(10)]
    if not relevant_codes:
        relevant_codes = ["sin_alertas"]

    cell_w = 106
    cell_h = 74
    left = 280
    top = 136
    width = left + len(relevant_codes) * cell_w + 36
    height = top + len(ordered_rows) * cell_h + 54

    body = [
        f'<text x="28" y="40" class="title">Matriz de persistencia de alertas</text>',
        f'<text x="28" y="64" class="subtitle">Permite identificar qué códigos persisten en todas las ejecuciones y cuáles aparecen de forma intermitente. Se muestran los códigos más frecuentes.</text>',
    ]

    legend_x = 28
    legend_y = 92
    legend_w = 240
    for step in range(30):
        ratio = step / 29
        body.append(
            f'<rect x="{legend_x + step * (legend_w / 30):.1f}" y="{legend_y}" width="{legend_w / 30 + 1:.1f}" height="12" fill="{alert_presence_color(ratio)}" />'
        )
    body.append(f'<text x="{legend_x}" y="{legend_y - 6}" class="small">aparece a veces</text>')
    body.append(f'<text x="{legend_x + legend_w}" y="{legend_y - 6}" text-anchor="end" class="small">aparece siempre</text>')

    for idx, code in enumerate(relevant_codes):
        x = left + idx * cell_w + cell_w / 2
        body.append(
            f'<text x="{x:.1f}" y="{top - 20}" text-anchor="middle" class="small"><title>{escape(code)}</title>{escape(short_label(code, 14))}</text>'
        )

    for row_idx, summary in enumerate(ordered_rows):
        y = top + row_idx * cell_h
        group_key = summary["grupo_noticia"]
        total_runs = total_runs_by_group.get(group_key, 0)
        body.append(
            f'<text x="28" y="{y + 28}" class="label"><title>{escape(summary["titulo"])}</title>{escape(short_label(summary["titulo"], 34))}</text>'
        )
        body.append(
            f'<text x="28" y="{y + 49}" class="small">Jaccard {format_num(summary.get("alertas_jaccard_media"))}</text>'
        )
        for col_idx, code in enumerate(relevant_codes):
            x = left + col_idx * cell_w
            count = code_counts_by_group[group_key].get(code, 0)
            ratio = (count / total_runs) if total_runs else 0.0
            fill = alert_presence_color(ratio)
            label = f"{count}/{total_runs}" if total_runs else "0/0"
            pct = f"{round(ratio * 100):.0f}%"
            body.append(
                f'<rect x="{x}" y="{y}" width="{cell_w - 10}" height="{cell_h - 12}" rx="12" fill="{fill}" stroke="white" stroke-width="2"><title>{escape(summary["titulo"])} | {code}: {label} ejecuciones ({pct})</title></rect>'
            )
            body.append(
                f'<text x="{x + (cell_w - 10) / 2:.1f}" y="{y + 31}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="16" font-weight="700" fill="#ffffff">{escape(label)}</text>'
            )
            body.append(
                f'<text x="{x + (cell_w - 10) / 2:.1f}" y="{y + 53}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="11" fill="rgba(255,255,255,0.75)">{pct}</text>'
            )

    return svg_document(width, height, "Matriz de alertas", body)


def render_news_cards(summary_rows: List[Dict[str, Any]]) -> str:
    ordered_rows = sort_summary_rows_for_dashboard(summary_rows)
    cards = []
    for row in ordered_rows:
        unstable_category, unstable_value = get_most_unstable_category(row)
        badge_text = reproducibility_badge(to_float(row.get("global_score_rango")))
        badge_color = consistency_color(to_float(row.get("global_score_rango")))
        cards.append(f"""
        <article class="news-card">
          <div class="card-top">
            <span class="card-badge" style="background:{badge_color};">{escape(badge_text)}</span>
          </div>
          <h3 title="{escape(row['titulo'])}">{escape(short_label(row['titulo'], 88))}</h3>
          <div class="metrics-grid">
            <div><span class="metric-label">Ejecuciones</span><strong>{row['n_ejecuciones']}</strong></div>
            <div><span class="metric-label">Media global</span><strong>{format_num(row['global_score_media'])}</strong></div>
            <div><span class="metric-label">Mediana global</span><strong>{format_num(row.get('global_score_mediana'))}</strong></div>
            <div><span class="metric-label">IQR global</span><strong>{format_num(row.get('global_score_iqr'))}</strong></div>
            <div><span class="metric-label">Score máximo observado</span><strong>{format_num(row['global_score_max'])}</strong></div>
            <div><span class="metric-label">Score mínimo observado</span><strong>{format_num(row['global_score_min'])}</strong></div>
            <div><span class="metric-label">Rango global</span><strong>{format_num(row['global_score_rango'])}</strong></div>
            <div><span class="metric-label">Std global</span><strong>{format_num(row['global_score_std'])}</strong></div>
            <div><span class="metric-label">Categoría con mayor variabilidad</span><strong>{escape(unstable_category.title() if unstable_category else "n/d")} {f"({format_num(unstable_value)})" if unstable_value is not None else ""}</strong></div>
            <div><span class="metric-label">Consistencia decisional</span><strong>{decisional_consistency_note(row)}</strong></div>
            <div><span class="metric-label">Alertas distintas</span><strong>{row['alertas_distintas_totales']}</strong></div>
          </div>
        </article>
        """)
    return "\n".join(cards)


def render_summary_table(summary_rows: List[Dict[str, Any]]) -> str:
    ordered_rows = sort_summary_rows_for_dashboard(summary_rows)
    rows_html = []
    for row in ordered_rows:
        rows_html.append(f"""
        <tr>
          <td title="{escape(row['titulo'])}">{escape(short_label(row['titulo'], 64))}</td>
          <td>{row['n_ejecuciones']}</td>
          <td>{format_num(row['global_score_media'])}</td>
          <td>{format_num(row.get('global_score_mediana'))}</td>
          <td>{format_num(row['global_score_rango'])}</td>
          <td>{format_num(row.get('global_score_iqr'))}</td>
          <td>{format_num(row['global_score_std'])}</td>
          <td>{format_num(row.get('alertas_jaccard_media'))}</td>
          <td>{"sí" if parse_bool(row['status_consistente']) else "no"}</td>
        </tr>
        """)
    return """
    <div class="table-wrap">
      <table class="summary-table">
        <thead>
          <tr>
            <th>Noticia</th>
            <th>n</th>
            <th>Media</th>
            <th>Mediana</th>
            <th>Rango</th>
            <th>IQR</th>
            <th>Std</th>
            <th>Jaccard alertas</th>
            <th>Status fijo</th>
          </tr>
        </thead>
        <tbody>
          %s
        </tbody>
      </table>
    </div>
    """ % "\n".join(rows_html)


def build_dashboard_html(
    summary_rows: List[Dict[str, Any]],
    detailed_rows: List[Dict[str, Any]],
) -> tuple[str, Dict[str, str]]:
    ordered_rows = sort_summary_rows_for_dashboard(summary_rows)
    category_rows = build_category_summary(summary_rows)

    most_stable = min(summary_rows, key=lambda row: to_float(row.get("global_score_rango")) or 9999)
    least_stable = max(summary_rows, key=lambda row: to_float(row.get("global_score_rango")) or -1)
    most_stable_category = min(category_rows, key=lambda row: row["rango_medio"] if row["rango_medio"] is not None else 9999)
    least_stable_category = max(category_rows, key=lambda row: row["rango_medio"] if row["rango_medio"] is not None else -1)
    average_alert_stability = sum(to_float(row.get("alertas_jaccard_media")) or 0.0 for row in summary_rows) / len(summary_rows)
    average_global_range = sum(to_float(row.get("global_score_rango")) or 0.0 for row in summary_rows) / len(summary_rows)
    status_consistency_rate = sum(1 for row in summary_rows if parse_bool(row.get("status_consistente"))) / len(summary_rows)

    dot_plot_svg = build_global_dispersion_svg(summary_rows, detailed_rows)
    dot_plot_full_svg = build_global_dispersion_svg(summary_rows, detailed_rows, fixed_scale=True)
    heatmap_svg = build_category_heatmap_svg(summary_rows)
    category_svg = build_category_summary_svg(summary_rows)
    alert_svg = build_alert_stability_svg(summary_rows)
    alert_matrix_svg = build_alert_presence_matrix_svg(summary_rows, detailed_rows)

    # ── Conclusiones: tono descriptivo, no condenatorio ──────────────────────
    disp_label = dispersion_label(average_global_range)
    alert_label = alert_stability_label(average_alert_stability)
    status_pct = round(status_consistency_rate * 100)

    # 1. Visión global: distinguir variabilidad numérica de decisional
    if status_consistency_rate >= 0.67:
        decisional_note = (
            f"El status se ha mantenido constante en el {status_pct}% de las noticias, "
            f"lo que indica estabilidad en la decisión principal del sistema."
        )
    else:
        decisional_note = (
            f"El status varía en algunas noticias ({status_pct}% con status estable), "
            f"lo que puede reflejar casos borderline o sensibilidad al contexto de análisis."
        )
    line_overview = (
        f"La variabilidad numérica media entre ejecuciones es {disp_label} "
        f"(rango medio {format_num(average_global_range)} sobre escala 0–10). "
        + decisional_note
    )

    # 2. Comparativa de noticias: sin sentencia
    most_stable_range = format_num(most_stable["global_score_rango"])
    least_stable_range = format_num(least_stable["global_score_rango"])
    same_news = most_stable["titulo"] == least_stable["titulo"]
    if same_news:
        line_comparison = (
            f'Todas las noticias presentan un nivel de variabilidad similar '
            f'(rango entre {most_stable_range} y {least_stable_range}).'
        )
    else:
        line_comparison = (
            f'La menor dispersión se observa en "{short_label(most_stable["titulo"], 60)}" '
            f'(rango {most_stable_range}). '
            f'La mayor variabilidad corresponde a "{short_label(least_stable["titulo"], 60)}" '
            f'(rango {least_stable_range}); un rango en ese nivel es habitual en LLMs '
            f'y no implica necesariamente una inconsistencia funcional.'
        )

    # 3. Categoría: descriptiva, no acusatoria
    unstable_cat = least_stable_category["categoria"]
    unstable_range = format_num(least_stable_category["rango_medio"])
    stable_cat = most_stable_category["categoria"]
    stable_range = format_num(most_stable_category["rango_medio"])
    line_category = (
        f'La dimensión con mayor variabilidad promedio es {unstable_cat} '
        f'(rango medio {unstable_range}), frente a {stable_cat} '
        f'que es la más consistente (rango medio {stable_range}). '
        f'Una mayor variabilidad en una categoría puede deberse a su sensibilidad '
        f'al contexto del análisis o a ambigüedad inherente en esa dimensión.'
    )

    # 4. Alertas: contextualizar el Jaccard bajo
    if average_alert_stability < 0.45:
        alert_context = (
            "Un Jaccard bajo puede reflejar que el sistema activa alertas adicionales "
            "dependiendo del enfoque de cada ejecución, más que una inconsistencia grave. "
            "Conviene revisar qué alertas son persistentes frente a cuáles son intermitentes."
        )
    elif average_alert_stability < 0.65:
        alert_context = (
            "Existe un núcleo de alertas que se detecta de forma recurrente, "
            "aunque algunos códigos adicionales aparecen de forma intermitente entre ejecuciones."
        )
    else:
        alert_context = (
            "Las alertas más relevantes se detectan de forma consistente entre ejecuciones, "
            "lo que indica robustez en la identificación de los principales problemas."
        )
    line_alerts = (
        f'La similitud Jaccard media de alertas es {format_num(average_alert_stability)} '
        f'({alert_label}). {alert_context}'
    )

    # 5. Síntesis: equilibrada
    if average_global_range <= 1.00 and status_consistency_rate >= 0.67:
        synthesis = (
            "En general, el sistema muestra un comportamiento estable y reproducible "
            "para las noticias analizadas. La variabilidad observada está dentro de "
            "los márgenes esperables para un sistema basado en LLM."
        )
    elif average_global_range <= 1.50 or status_consistency_rate >= 0.67:
        synthesis = (
            "En general, el sistema es funcionalmente consistente: la variabilidad numérica "
            "es apreciable pero no implica cambios en las decisiones principales. "
            "Se recomienda revisar las categorías con mayor dispersión para identificar "
            "posibles áreas de mejora en el prompt o en los criterios de evaluación."
        )
    else:
        synthesis = (
            "La variabilidad observada es elevada y merece atención: tanto la dispersión "
            "numérica como la inestabilidad decisional sugieren que el sistema puede estar "
            "respondiendo de forma inconsistente ante el mismo contenido. "
            "Se recomienda revisar el prompt, los umbrales de evaluación y los casos borderline."
        )
    line_synthesis = synthesis

    conclusion_lines = [line_overview, line_comparison, line_category, line_alerts, line_synthesis]

    # Colores de callout alineados con la nueva escala
    callout_color_category = (
        CHART_COLORS["bad"] if (to_float(least_stable_category.get("rango_medio")) or 0) > 1.75
        else CHART_COLORS["warn"]
    )
    callout_color_summary = consistency_color(average_global_range)
    conclusion_callouts = [
        ("ℹ", CHART_COLORS["warn"],  conclusion_lines[0]),
        ("◈", CHART_COLORS["muted"], conclusion_lines[1]),
        ("△", callout_color_category, conclusion_lines[2]),
        ("⚡", consistency_color(average_alert_stability, invert=True), conclusion_lines[3]),
        ("◎", callout_color_summary,  conclusion_lines[4]),
    ]
    callouts_html = "\n".join(
        f'<div class="callout" style="border-left-color:{color};"><span class="callout-icon">{icono}</span><p class="callout-text">{escape(texto)}</p></div>'
        for icono, color, texto in conclusion_callouts
    )

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <title>Dashboard de consistencia</title>
  <style>
    :root {{
      --bg: {CHART_COLORS["bg"]};
      --card: {CHART_COLORS["card"]};
      --border: {CHART_COLORS["border"]};
      --text: {CHART_COLORS["text"]};
      --subtext: {CHART_COLORS["subtext"]};
      --muted: {CHART_COLORS["muted"]};
      --ok: {CHART_COLORS["ok"]};
      --warn: {CHART_COLORS["warn"]};
      --bad: {CHART_COLORS["bad"]};
      --accent: {CHART_COLORS["accent"]};
      --shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
    }}
    h1, h2, h3 {{
      font-family: 'Playfair Display', Georgia, serif;
    }}
    .wrap {{
      max-width: 1380px;
      margin: 0 auto;
      padding: 28px;
    }}
    .hero {{
      margin-bottom: 22px;
    }}
    h1 {{
      margin: 0 0 8px;
      font-size: 38px;
      line-height: 1.1;
      color: var(--text);
    }}
    .intro {{
      max-width: 950px;
      margin: 0;
      color: var(--subtext);
      font-size: 16px;
      line-height: 1.5;
      font-family: 'Inter', system-ui, sans-serif;
    }}
    .kpis {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 14px;
      margin: 22px 0 28px;
    }}
    .kpi {{
      background: var(--card);
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent);
      border-radius: 18px;
      padding: 20px 22px;
      box-shadow: var(--shadow);
      min-height: 110px;
    }}
    .kpi-label {{
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 10px;
    }}
    .kpi-value {{
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 16px;
      font-weight: 600;
      line-height: 1.3;
      margin-bottom: 4px;
      color: var(--text);
    }}
    .kpi-value--big {{
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 48px;
      font-weight: 700;
      color: var(--accent);
      line-height: 1;
      margin-bottom: 4px;
      display: block;
    }}
    .kpi-meta {{
      color: var(--subtext);
      font-size: 13px;
      font-family: 'Inter', system-ui, sans-serif;
    }}
    .section {{
      margin-bottom: 22px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: var(--shadow);
      padding: 18px 18px 10px;
    }}
    .section h2 {{
      margin: 0 0 6px;
      font-size: 22px;
    }}
    .section p {{
      margin: 0 0 16px;
      color: var(--subtext);
      font-size: 15px;
      line-height: 1.45;
      font-family: 'Inter', system-ui, sans-serif;
    }}
    .two-col {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }}
    .read-box {{
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }}
    .read-card {{
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 16px 18px;
      box-shadow: var(--shadow);
    }}
    .read-card h2 {{
      margin: 0 0 10px;
      font-size: 20px;
    }}
    .read-card ul {{
      margin: 0;
      padding-left: 18px;
      color: var(--subtext);
      line-height: 1.55;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 14px;
    }}
    .legend-list {{
      display: grid;
      gap: 10px;
    }}
    .legend-item {{
      display: grid;
      grid-template-columns: 88px 1fr;
      gap: 12px;
      align-items: center;
      font-size: 14px;
      color: var(--subtext);
      font-family: 'Inter', system-ui, sans-serif;
    }}
    .legend-swatch {{
      height: 14px;
      border-radius: 999px;
      display: inline-block;
    }}
    .viz-wrap {{
      overflow-x: auto;
      overflow-y: hidden;
      padding-bottom: 4px;
    }}
    .viz-wrap svg {{
      min-width: 680px;
    }}
    .table-wrap {{
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--card);
    }}
    .summary-table {{
      width: 100%;
      border-collapse: collapse;
      min-width: 860px;
      font-family: 'Inter', system-ui, sans-serif;
    }}
    .summary-table th,
    .summary-table td {{
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      font-size: 14px;
      vertical-align: top;
    }}
    .summary-table th {{
      position: sticky;
      top: 0;
      background: #0f1117;
      z-index: 1;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 600;
    }}
    .summary-table tbody tr:hover {{
      background: #1a1f2e;
    }}
    .cards-section {{
      margin-top: 24px;
    }}
    .cards-section h2 {{
      margin: 0 0 14px;
      font-size: 26px;
    }}
    .news-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 14px;
    }}
    .news-card {{
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
    }}
    .card-top {{
      display: flex;
      justify-content: flex-end;
      margin-bottom: 10px;
    }}
    .card-badge {{
      display: inline-block;
      padding: 5px 10px;
      border-radius: 999px;
      color: white;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      font-family: 'Inter', system-ui, sans-serif;
    }}
    .news-card h3 {{
      margin: 0 0 12px;
      font-size: 16px;
      line-height: 1.35;
      font-family: 'Inter', system-ui, sans-serif;
      font-weight: 600;
    }}
    .metrics-grid {{
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 14px;
    }}
    .metric-label {{
      display: block;
      font-size: 11px;
      color: var(--muted);
      margin-bottom: 2px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }}
    .metrics-grid strong {{
      font-size: 15px;
      color: var(--text);
    }}
    .conclusions {{
      margin-top: 24px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 18px 20px;
      box-shadow: var(--shadow);
    }}
    .conclusions h2 {{
      margin: 0 0 16px;
      font-size: 22px;
    }}
    .callout {{
      display: flex;
      gap: 14px;
      align-items: flex-start;
      padding: 14px 16px;
      border-left: 4px solid var(--accent);
      border-radius: 0 12px 12px 0;
      background: rgba(255, 255, 255, 0.03);
      margin-bottom: 10px;
    }}
    .callout-icon {{
      font-size: 18px;
      line-height: 1.4;
      flex-shrink: 0;
    }}
    .callout-text {{
      margin: 0;
      color: var(--subtext);
      font-size: 15px;
      line-height: 1.55;
      font-family: 'Inter', system-ui, sans-serif;
    }}
    svg {{
      width: 100%;
      height: auto;
      display: block;
    }}
    #tt {{
      position: fixed;
      background: #1e293b;
      color: #f9fafb;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 13px;
      font-family: 'Inter', system-ui, sans-serif;
      pointer-events: none;
      max-width: 280px;
      line-height: 1.4;
      z-index: 9999;
      display: none;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    }}
    @media (max-width: 980px) {{
      .two-col {{
        grid-template-columns: 1fr;
      }}
      .read-box {{
        grid-template-columns: 1fr;
      }}
      .wrap {{
        padding: 18px;
      }}
      .viz-wrap svg {{
        min-width: 860px;
      }}
    }}
  </style>
</head>
<body>
  <div id="tt" role="tooltip" aria-hidden="true"></div>
  <div class="wrap">
    <header class="hero">
      <h1>Dashboard de reproducibilidad y consistencia</h1>
      <p class="intro">Analiza hasta qué punto varias ejecuciones sobre una misma noticia producen puntuaciones, etiquetas de status y alertas comparables. Se distinguen dos dimensiones: la <strong>consistencia numérica</strong> (dispersión de scores) y la <strong>consistencia decisional</strong> (estabilidad del status y de las alertas más relevantes). La segunda es más importante para evaluar el comportamiento real del sistema.</p>
    </header>

    <section class="kpis">
      <article class="kpi">
        <div class="kpi-label">Menor variabilidad numérica</div>
        <div class="kpi-value" title="{escape(most_stable['titulo'])}">{escape(short_label(most_stable['titulo'], 64))}</div>
        <div class="kpi-meta">Rango {format_num(most_stable['global_score_rango'])} · {reproducibility_badge(to_float(most_stable['global_score_rango']))}</div>
      </article>
      <article class="kpi">
        <div class="kpi-label">Mayor variabilidad numérica</div>
        <div class="kpi-value" title="{escape(least_stable['titulo'])}">{escape(short_label(least_stable['titulo'], 64))}</div>
        <div class="kpi-meta">Rango {format_num(least_stable['global_score_rango'])} · {reproducibility_badge(to_float(least_stable['global_score_rango']))}</div>
      </article>
      <article class="kpi">
        <div class="kpi-label">Categoría más consistente</div>
        <div class="kpi-value">{escape(str(most_stable_category['categoria']).title())}</div>
        <div class="kpi-meta">Rango medio {format_num(most_stable_category['rango_medio'])}</div>
      </article>
      <article class="kpi">
        <div class="kpi-label">Categoría con más variabilidad</div>
        <div class="kpi-value">{escape(str(least_stable_category['categoria']).title())}</div>
        <div class="kpi-meta">Rango medio {format_num(least_stable_category['rango_medio'])}</div>
      </article>
      <article class="kpi">
        <div class="kpi-label">Persistencia de alertas (Jaccard)</div>
        <span class="kpi-value--big">{format_num(average_alert_stability)}</span>
        <div class="kpi-meta">{alert_stability_label(average_alert_stability)} · escala 0–1</div>
      </article>
    </section>

    <section class="read-box">
      <article class="read-card">
        <h2>Guía de lectura</h2>
        <ul>
          <li><strong>Rango e IQR</strong>: el rango mide la distancia entre la ejecución con score más alto y la más baja. El IQR (caja coloreada) describe el 50% central, que es más robusto ante valores extremos. Un rango de ±1 punto en escala 0–10 es habitual en sistemas LLM.</li>
          <li><strong>Consistencia numérica vs. decisional</strong>: puede existir cierta dispersión de scores sin que el status cambie. Esto no es lo mismo que inconsistencia grave. El status estable es el indicador más importante de comportamiento coherente.</li>
          <li>En el heatmap, el número principal es el rango y el secundario la desviación estándar. Verde indica menor variabilidad; rojo, mayor.</li>
          <li>La similitud Jaccard de alertas mide cuántas alertas se repiten entre ejecuciones (1.0 = idénticas). Un Jaccard bajo puede reflejar alertas contextuales, no necesariamente inconsistencia.</li>
        </ul>
      </article>
      <article class="read-card">
        <h2>Escala de variabilidad numérica</h2>
        <div class="legend-list">
          <div class="legend-item"><span class="legend-swatch" style="background:{CHART_COLORS["ok"]};"></span><span>Muy consistente: rango ≤ 0.50</span></div>
          <div class="legend-item"><span class="legend-swatch" style="background:{mix_colors(CHART_COLORS["ok"], CHART_COLORS["warn"], 0.5)};"></span><span>Consistente: rango 0.51 – 1.00</span></div>
          <div class="legend-item"><span class="legend-swatch" style="background:{CHART_COLORS["warn"]};"></span><span>Variabilidad apreciable: rango 1.01 – 1.50</span></div>
          <div class="legend-item"><span class="legend-swatch" style="background:{mix_colors(CHART_COLORS["warn"], CHART_COLORS["bad"], 0.5)};"></span><span>Variabilidad elevada: rango 1.51 – 2.00</span></div>
          <div class="legend-item"><span class="legend-swatch" style="background:{CHART_COLORS["bad"]};"></span><span>Variabilidad alta: rango > 2.00</span></div>
          <div class="legend-item"><span class="legend-swatch" style="background:linear-gradient(90deg, {CHART_COLORS["ok"]}, {CHART_COLORS["warn"]}, {CHART_COLORS["bad"]});"></span><span>En el heatmap, verde = más estable · rojo = más variable.</span></div>
        </div>
      </article>
    </section>

    <section class="section">
      <h2>1. Distribución de scores por noticia</h2>
      <p>Vista ampliada al rango real de los datos para apreciar la estructura interna de cada distribución. La caja coloreada es el IQR (50% central), más robusto que el rango mínimo-máximo ante valores atípicos. Los puntos individuales muestran cada ejecución.</p>
      <div class="viz-wrap">{dot_plot_svg}</div>
    </section>

    <section class="section">
      <h2>1b. La misma distribución en escala completa 0–10</h2>
      <p>Mismo gráfico con eje fijo de 0 a 10 para contextualizar la magnitud real de la variabilidad. Lo que en la vista ampliada parece una dispersión grande puede ser, en la escala completa, un margen moderado y esperado para un sistema LLM.</p>
      <div class="viz-wrap">{dot_plot_full_svg}</div>
    </section>

    <section class="section">
      <h2>2. Resumen comparativo por noticia</h2>
      <p>Tabla con las métricas clave. El IQR y la desviación estándar (Std) son estimadores más robustos de la variabilidad habitual que el rango, que puede estar inflado por una única ejecución atípica.</p>
      {render_summary_table(ordered_rows)}
    </section>

    <section class="section">
      <h2>3. Variabilidad por categoría y noticia</h2>
      <p>El heatmap muestra el rango de cada categoría para cada noticia. Identifica qué dimensiones son más sensibles al contexto. Una categoría con rango elevado no indica necesariamente un error del sistema: puede reflejar que esa dimensión es inherentemente más sensible al análisis.</p>
      <div class="viz-wrap">{heatmap_svg}</div>
    </section>

    <section class="two-col">
      <div class="section">
        <h2>4. Variabilidad media por categoría</h2>
        <p>Resume en qué dimensiones el sistema presenta mayor dispersión promedio entre noticias. Útil para identificar áreas donde revisar el prompt o los criterios de evaluación.</p>
        <div class="viz-wrap">{category_svg}</div>
      </div>
      <div class="section">
        <h2>5. Persistencia de alertas (Jaccard)</h2>
        <p>Mide qué fracción de alertas se repite entre ejecuciones. Un Jaccard bajo puede reflejar alertas contextuales, no necesariamente inconsistencia grave. Analizar junto con la matriz de la sección 6.</p>
        <div class="viz-wrap">{alert_svg}</div>
      </div>
    </section>

    <section class="section">
      <h2>6. Matriz de presencia de alertas</h2>
      <p>Muestra en cuántas ejecuciones aparece cada código de alerta. Distingue alertas estructurales (presentes en casi todas las ejecuciones) de alertas contextuales o intermitentes. Las primeras son las más fiables para el diagnóstico.</p>
      <div class="viz-wrap">{alert_matrix_svg}</div>
    </section>

    <section class="cards-section">
      <h2>Panel por noticia</h2>
      <div class="news-grid">
        {render_news_cards(ordered_rows)}
      </div>
    </section>

    <section class="conclusions">
      <h2>Lectura integrada</h2>
      {callouts_html}
    </section>
  </div>
  <script>
    (function() {{
      var tt = document.getElementById('tt');
      document.addEventListener('mouseover', function(e) {{
        var target = e.target;
        if (!target || !target.closest) {{ tt.style.display = 'none'; return; }}
        var el = target.closest('circle, rect, text, line, polygon');
        if (!el) {{ tt.style.display = 'none'; return; }}
        var titleEl = el.querySelector(':scope > title');
        if (!titleEl || !titleEl.textContent.trim()) {{ tt.style.display = 'none'; return; }}
        tt.textContent = titleEl.textContent;
        tt.style.display = 'block';
      }});
      document.addEventListener('mousemove', function(e) {{
        tt.style.left = (e.clientX + 14) + 'px';
        tt.style.top = (e.clientY - 8) + 'px';
      }});
      document.addEventListener('mouseout', function(e) {{
        var rel = e.relatedTarget;
        if (!rel || !rel.closest || !rel.closest('circle, rect, text, line, polygon')) {{
          tt.style.display = 'none';
        }}
      }});
    }})();
  </script>
</body>
</html>
"""

    svgs = {
        "01_dispersion_global.svg": dot_plot_svg,
        "01b_dispersion_escala_completa.svg": dot_plot_full_svg,
        "02_heatmap_categorias.svg": heatmap_svg,
        "03_variabilidad_por_categoria.svg": category_svg,
        "04_estabilidad_alertas.svg": alert_svg,
        "05_matriz_alertas.svg": alert_matrix_svg,
    }
    return html, svgs


def cleanup_visual_outputs(output_dir: Path) -> None:
    for name in [
        "dashboard_consistencia.html",
        "01_dispersion_global.svg",
        "01b_dispersion_escala_completa.svg",
        "02_heatmap_categorias.svg",
        "03_variabilidad_por_categoria.svg",
        "04_estabilidad_alertas.svg",
        "05_matriz_alertas.svg",
        "grafica_consistencia_global.svg",
        "grafica_variabilidad_categorias.svg",
        "grafica_estabilidad_alertas.svg",
        "grafica_dispersion_ejecuciones.svg",
        "01_consistencia_global_simple.svg",
        "02_consistencia_categorias_simple.svg",
        "03_estabilidad_alertas_simple.svg",
    ]:
        path = output_dir / name
        if path.exists():
            path.unlink()


def generate_visual_reports(
    summary_rows: List[Dict[str, Any]],
    detailed_rows: List[Dict[str, Any]],
    output_dir: Path,
) -> None:
    if not summary_rows:
        return

    cleanup_visual_outputs(output_dir)
    html, svgs = build_dashboard_html(summary_rows, detailed_rows)
    write_text_file(output_dir / "dashboard_consistencia.html", html)
    for filename, content in svgs.items():
        write_text_file(output_dir / filename, content)


def is_supported_news_json(data: Any) -> bool:
    """Filtra JSON genéricos que no tienen la estructura esperada de noticia evaluada."""
    if not isinstance(data, dict):
        return False

    if any(data.get(key) for key in ("identificador", "url", "titulo", "title")):
        return True

    eval_result = data.get("evaluation_result")
    if not isinstance(eval_result, dict):
        return False

    has_scores = isinstance(eval_result.get("scores"), dict) and bool(eval_result.get("scores"))
    has_status = safe_get(data, "evaluation_result", "status", "label") is not None
    has_meta = isinstance(eval_result.get("meta"), dict) and bool(eval_result.get("meta"))
    return has_scores or has_status or has_meta


def flatten_run(path: Path, data: Dict[str, Any]) -> Dict[str, Any]:
    meta = extract_meta(data)
    scores = extract_scores(data)
    status = extract_status(data)
    alerts = extract_alerts(data)

    sev_counts = severity_counter(alerts)
    codes = alert_code_set(alerts)

    row = {
        "archivo": path.name,
        "grupo_noticia": build_group_key(data, fallback_name=path.stem),
        "identificador": meta["identificador"],
        "titulo": meta["title"],
        "url": meta["url"],
        "fuente": meta["source"],
        "fecha_publicacion": meta["date"],
        "status_label": status,
        "global_score": scores.get("global_score"),
        "fiabilidad": scores.get("fiabilidad"),
        "adecuacion": scores.get("adecuacion"),
        "claridad": scores.get("claridad"),
        "profundidad": scores.get("profundidad"),
        "enfoque": scores.get("enfoque"),
        "num_alertas": len(alerts),
        "num_alertas_high": sev_counts.get("high", 0),
        "num_alertas_medium": sev_counts.get("medium", 0),
        "num_alertas_low": sev_counts.get("low", 0),
        "codigos_alerta": " | ".join(codes),
    }
    return row


def summarize_group(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    first = rows[0]
    status_values = [r["status_label"] for r in rows if r["status_label"]]
    status_counter = Counter(status_values)

    summary = {
        "grupo_noticia": first["grupo_noticia"],
        "identificador": first["identificador"],
        "titulo": first["titulo"],
        "url": first["url"],
        "fuente": first["fuente"],
        "fecha_publicacion": first["fecha_publicacion"],
        "n_ejecuciones": len(rows),
        "status_mas_frecuente": status_counter.most_common(1)[0][0] if status_counter else "",
        "status_consistente": len(set(status_values)) <= 1 if status_values else False,
        "status_distintos": " | ".join(sorted(set(status_values))),
    }

    metrics = ["global_score"] + CATEGORIES
    for metric in metrics:
        values = [to_float(r.get(metric)) for r in rows]
        summary[f"{metric}_media"] = mean_or_none(values)
        summary[f"{metric}_std"] = stdev_or_none(values)
        summary[f"{metric}_min"] = min_or_none(values)
        summary[f"{metric}_max"] = max_or_none(values)
        summary[f"{metric}_rango"] = range_or_none(values)
        summary[f"{metric}_consistencia"] = consistency_label(summary[f"{metric}_rango"])

    global_values = [to_float(r.get("global_score")) for r in rows]
    q1 = percentile_or_none(global_values, 0.25)
    q3 = percentile_or_none(global_values, 0.75)
    summary["global_score_mediana"] = percentile_or_none(global_values, 0.50)
    summary["global_score_q1"] = q1
    summary["global_score_q3"] = q3
    summary["global_score_iqr"] = (q3 - q1) if (q1 is not None and q3 is not None) else None

    # Alertas
    code_sets = []
    all_codes = []
    total_high = 0
    total_medium = 0
    total_low = 0

    for r in rows:
        codes = [c.strip() for c in str(r["codigos_alerta"]).split("|") if c.strip()]
        code_set = set(codes)
        code_sets.append(code_set)
        all_codes.extend(codes)
        total_high += int(r.get("num_alertas_high", 0) or 0)
        total_medium += int(r.get("num_alertas_medium", 0) or 0)
        total_low += int(r.get("num_alertas_low", 0) or 0)

    all_codes_counter = Counter(all_codes)

    summary["alertas_jaccard_media"] = jaccard_similarity(code_sets)
    summary["alertas_distintas_totales"] = len(set(all_codes))
    summary["alertas_codigos_frecuentes"] = " | ".join(
        f"{code}({count})" for code, count in all_codes_counter.most_common()
    )
    summary["alertas_high_totales"] = total_high
    summary["alertas_medium_totales"] = total_medium
    summary["alertas_low_totales"] = total_low

    return summary


def summarize_alerts_by_group(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped = defaultdict(list)
    for row in rows:
        grouped[row["grupo_noticia"]].append(row)

    results = []
    for group_key, group_rows in grouped.items():
        title = group_rows[0]["titulo"]
        codes_per_run = []
        for row in group_rows:
            codes = [c.strip() for c in str(row["codigos_alerta"]).split("|") if c.strip()]
            codes_per_run.append(set(codes))

        union_codes = sorted(set().union(*codes_per_run)) if codes_per_run else []
        for code in union_codes:
            present_in = sum(1 for s in codes_per_run if code in s)
            results.append({
                "grupo_noticia": group_key,
                "titulo": title,
                "codigo_alerta": code,
                "presente_en_ejecuciones": present_in,
                "total_ejecuciones": len(group_rows),
                "porcentaje_presencia": round((present_in / len(group_rows)) * 100, 2) if group_rows else None,
            })

    return results


def write_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    if not rows:
        print(f"[INFO] No hay datos para escribir en {path.name}")
        return

    fieldnames = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def print_terminal_summary(group_summaries: List[Dict[str, Any]]) -> None:
    print("\n===== RESUMEN DE CONSISTENCIA =====\n")
    for g in group_summaries:
        print(f"Título: {g['titulo']}")
        print(f"  Ejecuciones: {g['n_ejecuciones']}")
        print(f"  Status más frecuente: {g['status_mas_frecuente']}")
        print(f"  Status consistente: {g['status_consistente']}")
        print(f"  Rango global: {g['global_score_rango']}")
        print(f"  Consistencia global: {g['global_score_consistencia']}")
        print(f"  Rango fiabilidad: {g['fiabilidad_rango']}")
        print(f"  Rango adecuacion: {g['adecuacion_rango']}")
        print(f"  Rango claridad: {g['claridad_rango']}")
        print(f"  Rango profundidad: {g['profundidad_rango']}")
        print(f"  Rango enfoque: {g['enfoque_rango']}")
        print(f"  Similitud media de alertas: {g['alertas_jaccard_media']}")
        print("")


def main() -> None:
    parser = argparse.ArgumentParser(description="Analiza consistencia entre JSONs de noticias.")
    parser.add_argument(
        "--input",
        default=str(DEFAULT_INPUT_DIR),
        help="Carpeta con los JSON de entrada. Por defecto, la carpeta donde está este script."
    )
    parser.add_argument(
        "--output",
        default="resultados_consistencia",
        help="Carpeta de salida para los CSV."
    )
    args = parser.parse_args()

    input_dir = Path(args.input).resolve()
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    json_files = discover_json_files(input_dir)

    if not json_files:
        print(f"[ERROR] No se encontraron archivos JSON en: {input_dir}")
        return

    detailed_rows: List[Dict[str, Any]] = []

    for json_path in json_files:
        data = load_json_file(json_path)
        if data is None:
            continue
        if not is_supported_news_json(data):
            print(f"[INFO] Se omite {json_path.name}: no tiene formato de noticia evaluada.")
            continue
        detailed_rows.append(flatten_run(json_path, data))

    if not detailed_rows:
        print("[ERROR] No se pudo procesar ningún JSON.")
        return

    grouped = defaultdict(list)
    for row in detailed_rows:
        grouped[row["grupo_noticia"]].append(row)

    summary_rows = [summarize_group(rows) for rows in grouped.values()]
    alert_summary_rows = summarize_alerts_by_group(detailed_rows)

    # Ordenar para que quede más legible
    summary_rows.sort(key=lambda x: x["titulo"])
    detailed_rows.sort(key=lambda x: (x["titulo"], x["archivo"]))
    alert_summary_rows.sort(key=lambda x: (x["titulo"], x["codigo_alerta"]))

    write_csv(output_dir / "analisis_detallado_por_ejecucion.csv", detailed_rows)
    write_csv(output_dir / "resumen_consistencia_por_noticia.csv", summary_rows)
    write_csv(output_dir / "resumen_alertas_por_noticia.csv", alert_summary_rows)
    generate_visual_reports(summary_rows, detailed_rows, output_dir)

    print_terminal_summary(summary_rows)

    print("Archivos generados:")
    print(f"  - {output_dir / 'analisis_detallado_por_ejecucion.csv'}")
    print(f"  - {output_dir / 'resumen_consistencia_por_noticia.csv'}")
    print(f"  - {output_dir / 'resumen_alertas_por_noticia.csv'}")
    print(f"  - {output_dir / 'dashboard_consistencia.html'}")
    print(f"  - {output_dir / '01_dispersion_global.svg'}")
    print(f"  - {output_dir / '02_heatmap_categorias.svg'}")
    print(f"  - {output_dir / '03_variabilidad_por_categoria.svg'}")
    print(f"  - {output_dir / '04_estabilidad_alertas.svg'}")
    print(f"  - {output_dir / '05_matriz_alertas.svg'}")


if __name__ == "__main__":
    main()
