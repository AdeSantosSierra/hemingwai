# hemingwai

## V2 pipeline and schema (production traceability)

### Pipeline run metadata

Every pipeline run is traceable via:

- **`pipeline.run_id`** — UUIDv4 for the run (set at the start of scoring in `Hemingwai.py`).
- **`pipeline.status`** — One of: `scored`, `scored_with_missing`, `fact_checked`, `pdf_generated`, `uploaded`.
- **`pipeline.steps`** — Per-step metadata: `scoring` (ok, at), `fact_check` (ok, at, provider, artifact), `pdf` (ok, at, artifact, mega_link).
- **`evaluation_meta`** — `run_id`, `evaluated_at` (UTC ISO), `engine_version`, `pipeline_version` (env `GIT_SHA` or default).

All timestamps are UTC ISO. Later steps (fact_check_perplexity, render_latex) can update `pipeline.status` and `pipeline.steps` in MongoDB.

### Clickbait semantics

- **`es_clickbait`** is set from an **explicit** model decision, not from the presence of a reformulated title.
- **`is_clickbait`** in `valoracion_titular`: `True` only when the model **rejects** the headline (did not respond "Aprobada"); `False` when the headline is approved.
- **`titulo_reformulado`** is stored in the document **only when** `es_clickbait` is true. A suggested title from the model for an approved headline is not stored as the main reformulation (so e.g. BBC is not marked clickbait just because a reformulation was proposed).

### Model alert schema (V2)

Alerts are lists of objects with (at least):

| Field           | Description |
|----------------|-------------|
| `code`         | e.g. `UNVERIFIED_CLAIM`, `INTERNAL_CONTRADICTION`, `SCORE_ALERT_INCONSISTENCY`, `RESERVA_EPISTEMICA_FA` |
| `category`     | `fiabilidad`, `adecuacion`, `claridad`, `profundidad`, `enfoque` |
| `severity`     | `low`, `medium`, `high` |
| `message`     | Human-readable description |
| `origin`      | `model` or `engine` |
| `evidence_refs` | Optional list of references |

The deterministic engine adds **engine** alerts when: (1) a high-severity model alert in fiabilidad/adecuación coexists with a score > 6 (**SCORE_ALERT_INCONSISTENCY**); (2) min(F,A) is between 4 and 5 (**RESERVA_EPISTEMICA_FA**).

---

## render_latex (PDF + MEGA)

Genera el PDF a partir de la noticia y el fact-check y lo sube a MEGA.

**Dependencias**

- **TeX Live** (o equivalente): `pdflatex` en PATH.
- **MEGA**: se usa **mega-cmd** (CLI). Instalación: `snap install mega-cmd`. No se usa la librería `mega.py` (compatibilidad Python 3.11+).

**Variables de entorno**

- `MEGA_EMAIL`, `MEGA_PASSWORD`: credenciales MEGA.
- `LATEX_BUILD_TIMEOUT`: segundos máximos para `pdflatex` (por defecto 60).
- `NEW_MONGODB_URI`: opcional, para actualizar `pipeline.steps.pdf`.

**Prueba local**

1. Poner un JSON de noticia válido en `output_temporal/retrieved_news_item.txt`.
2. Opcional: `output_temporal/fact_check_analisis.json` con `analisis` y `fuentes`.
3. Desde la raíz del repo: `.venv/bin/python src/render_latex.py`.
4. PDF en `output_temporal/<titulo_safe>.pdf`; log de compilación en `output_temporal/latex_build.log`.

**Test rápido Unicode (sin pipeline)**

`RENDER_LATEX_TEST_UNICODE=1 .venv/bin/python src/render_latex.py`