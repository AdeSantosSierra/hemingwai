# Configuración de entorno (`.env`) para HemingwAI

Aplica a:
- `src/Hemingwai.py`
- `src/analiza_y_guarda.py`

Referencia base: `.env.example`.

## Convenciones
- Prefijos: `OPENAI_`, `ANTHROPIC_`, `PERPLEXITY_`, `MONGO_`, `ALERT_`, `FEATURE_`, `LOG_`, `PATH_`.
- Flags normalizadas:
  - `FEATURE_ENABLE_*` habilita/deshabilita un módulo.
  - `FEATURE_FAIL_OPEN_*` define si el fallo del módulo degrada (no aborta) o corta ejecución.
- Legacy permitido solo en aliases de conexión/modelo (`OLD_MONGODB_URI`, `NEW_MONGODB_URI`, `MONGODB_URI`, `ANTHROPIC_MODEL`).

## Variables

| Variable | Qué hace | Valores típicos | Default recomendado | Módulos |
|---|---|---|---|---|
| `OPENAI_API_KEY` | Credencial OpenAI | `sk-...` | obligatoria | `src/Hemingwai.py`, `src/Utils.py`, `src/llm_alert_extractor.py` |
| `ANTHROPIC_API_KEY` | Credencial Anthropic | `sk-ant-...` | condicional (ver flags) | `src/Hemingwai.py`, `src/Utils.py` |
| `PERPLEXITY_API_KEY` | Credencial Perplexity | `pplx-...` | condicional (ver flags) | `src/fact_check_perplexity.py` |
| `PERPLEXITY_BASE_URL` | Endpoint Perplexity | `https://api.perplexity.ai` | `https://api.perplexity.ai` | `src/fact_check_perplexity.py` |
| `MONGO_READ_URI` | URI lectura Mongo | `mongodb+srv://...` | fallback legacy | `src/Hemingwai.py` |
| `MONGO_WRITE_URI` | URI escritura Mongo | `mongodb+srv://...` | fallback legacy | `src/Hemingwai.py`, `src/fact_check_perplexity.py`, `src/fetch_news_item.py` |
| `MONGO_DB_NAME` | DB Mongo | `Base_de_datos_noticias` | `Base_de_datos_noticias` | `src/Hemingwai.py`, `src/fact_check_perplexity.py`, `src/fetch_news_item.py` |
| `MONGO_COLLECTION_NAME` | Colección Mongo | `Noticias` | `Noticias` | `src/Hemingwai.py`, `src/fact_check_perplexity.py`, `src/fetch_news_item.py` |
| `MONGO_SERVER_API_VERSION` | ServerApi PyMongo | `1` | `1` | `src/Hemingwai.py` |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | Timeout selección servidor | `5000` | `5000` | `src/fetch_news_item.py` |
| `OLD_MONGODB_URI` | Alias legacy read | `mongodb+srv://...` | vacío | fallback |
| `NEW_MONGODB_URI` | Alias legacy write | `mongodb+srv://...` | vacío | fallback |
| `MONGODB_URI` | Alias legacy genérico | `mongodb+srv://...` | vacío | fallback |
| `GIT_SHA` | Metadata de versión | hash/tag | `pipeline.local-dev` | `src/Hemingwai.py` |
| `OPENAI_MODEL_MAIN` | Modelo chat OpenAI | `gpt-4o` | `gpt-4o` | `src/Utils.py` |
| `OPENAI_MODEL_EMBEDDING` | Modelo embeddings | `text-embedding-3-small` | `text-embedding-3-small` | `src/Hemingwai.py`, `src/Utils.py` |
| `ANTHROPIC_MODEL_MAIN` | Modelo Anthropic preferido | `claude-3-haiku-20240307` | `claude-3-haiku-20240307` | `src/Utils.py` |
| `ANTHROPIC_MODEL` | Alias legacy de modelo Anthropic | `claude-3-haiku-20240307` | vacío | `src/Utils.py` (fallback) |
| `ALERT_EXTRACTOR_MODEL` | Modelo extractor alertas | `gpt-4o-mini` | `gpt-4o-mini` | `src/llm_alert_extractor.py` |
| `PERPLEXITY_MODEL_FACT_CHECK` | Modelo fact-check | `sonar-deep-research` | `sonar-deep-research` | `src/fact_check_perplexity.py` |
| `ALERT_MIN_BODY_CHARS` | Umbral mínimo cuerpo | `300-800` | `400` | `src/Hemingwai.py` |
| `ALERT_MAX_ITEMS` | Máx alertas LLM | `5-12` | `8` | `src/Hemingwai.py` |
| `OPENAI_TIMEOUT_SECONDS` | Timeout OpenAI | `30-120` | `60` | `src/Hemingwai.py`, `src/llm_alert_extractor.py` |
| `OPENAI_RETRIES` | Reintentos embeddings | `1-5` | `3` | `src/Hemingwai.py` |
| `OPENAI_RETRY_BASE_SECONDS` | Backoff base OpenAI | `1-3` | `1` | `src/Hemingwai.py` |
| `PERPLEXITY_TIMEOUT_SECONDS` | Timeout Perplexity | `60-180` | `120` | `src/fact_check_perplexity.py` |
| `PERPLEXITY_RETRIES` | Reintentos Perplexity | `1-4` | `2` | `src/fact_check_perplexity.py` |
| `PERPLEXITY_RETRY_BASE_SECONDS` | Backoff base Perplexity | `1-5` | `2` | `src/fact_check_perplexity.py` |
| `PATH_SUBPROCESS_TIMEOUT_SECONDS` | Timeout subprocesos (`0`=sin timeout) | `0`, `600` | `0` | `src/analiza_y_guarda.py` |
| `LATEX_BUILD_TIMEOUT` | Timeout LaTeX | `60`, `120` | `60` | `src/render_latex.py` |
| `FEATURE_ENABLE_ANTHROPIC` | Activa módulo Anthropic | `true/false` | `true` | `src/Hemingwai.py`, `src/Utils.py` |
| `FEATURE_FAIL_OPEN_ANTHROPIC` | Degrada si Anthropic falla | `true/false` | `false` | `src/Hemingwai.py`, `src/Utils.py` |
| `FEATURE_ENABLE_PERPLEXITY` | Activa módulo Perplexity | `true/false` | `true` | `src/fact_check_perplexity.py` |
| `FEATURE_FAIL_OPEN_PERPLEXITY` | Degrada si Perplexity falla | `true/false` | `false` | `src/analiza_y_guarda.py`, `src/fact_check_perplexity.py` |
| `PATH_VENV_DIR` | Ruta venv | `.venv` | `.venv` | `src/analiza_y_guarda.py` |
| `PATH_OUTPUT_DIR` | Carpeta artefactos | `output_temporal` | `output_temporal` | `src/analiza_y_guarda.py` |
| `PATH_RETRIEVED_FILE` | Ruta noticia extraída | `output_temporal/retrieved_news_item.txt` | `output_temporal/retrieved_news_item.txt` | `src/analiza_y_guarda.py` |
| `LOG_LEVEL` | Nivel log | `DEBUG/INFO/WARN/ERROR` | `INFO` | reservado |
| `MEGA_EMAIL` | Usuario MEGA | email | vacío | `src/render_latex.py` |
| `MEGA_PASSWORD` | Password MEGA | texto | vacío | `src/render_latex.py` |
| `RENDER_LATEX_TEST_UNICODE` | Toggle test render | `1/true` | vacío | `src/render_latex.py` |
| `RENDER_LATEX_TEST_URL` | Toggle test render | `1/true` | vacío | `src/render_latex.py` |
| `RENDER_LATEX_TEST_FORMAT` | Toggle test render | `1/true` | vacío | `src/render_latex.py` |

## Validación condicional de obligatorias
Se implementa en `src/env_config.py`:
- `validate_required(...)`
- `validate_required_any(...)`

Regla operativa:
- Si `FEATURE_ENABLE_<PROVIDER>=false`, no se exigen claves de ese provider.
- Si `FEATURE_ENABLE_<PROVIDER>=true` y `FEATURE_FAIL_OPEN_<PROVIDER>=false`, las credenciales son obligatorias.
- Si `FEATURE_FAIL_OPEN_<PROVIDER>=true`, el provider puede degradar sin abortar.

## Persistencia de estado provider (fail-open)
Cuando hay degradación o deshabilitación, se persiste en Mongo:
- `pipeline.steps.anthropic.status/error`
- `pipeline.steps.perplexity.status/error`

También se mantiene `pipeline.steps.fact_check` como espejo de compatibilidad para Perplexity.

## Consistencia declaradas vs usadas
Fuente: `.env.example`.

| Tipo | Resultado |
|---|---|
| Usadas y no declaradas | 0 |
| Declaradas y no usadas | 1 (`LOG_LEVEL`, reservado) |
