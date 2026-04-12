# HemingwAI — Claude Code Instructions

## Proyecto
Plataforma de análisis de calidad periodística. Analiza noticias de periódicos españoles
evaluando 5 dimensiones: fiabilidad, adecuación, claridad, profundidad y enfoque.
Cada análisis produce un JSON con puntuaciones, alertas, resúmenes y metadata.

## Stack
- Backend: Python + FastAPI
- Frontend: React + Node.js
- DB: MongoDB
- Auth: Clerk
- Scoring engine: v2.0.0

## Estructura de datos clave
Cada documento analizado contiene:
- `puntuacion` (0-10, global)
- `puntuacion_individual`: {1: fiabilidad, 2: adecuación, 3: claridad, 4: profundidad, 5: enfoque}
- `evaluation_result.status.label`: "valiosa" | "desinformativa" | "aceptable"
- `evaluation_result.alerts`: array de alertas con severity (high/medium/low) y category
- `evaluation_result.alerts_summary.counts`: {high, medium, low}
- `fuente`: "Eldiario" | "Elpais" | "Lavanguardia" | etc.
- `es_clickbait`: boolean
- `evaluation_result.derived.gates`: {hard_triggered, soft_cap_triggered}

## Frontend — Design System

### Estética general
Editorial minimalista de alto contraste. Inspiración: dashboards analíticos de newsrooms.
Paleta: fondo muy oscuro (#0a0a0f), acentos en ámbar/dorado (#f59e0b), texto en blanco roto.
Tipografía: display en "Playfair Display" o "DM Serif Display", body en "Inter" o "DM Sans".
NO usar: purple gradients, Inter como display font, layouts genéricos tipo Bootstrap.

### Principios de diseño
- Datos primero: las puntuaciones deben ser el elemento visual dominante
- Jerarquía clara: score global > dimensiones individuales > alertas > metadata
- Usar colores semánticos para scores: verde (≥7.5), ámbar (5-7.4), rojo (<5)
- Alertas: rojo para high severity, naranja para medium, gris para low
- Status badges: "valiosa" en verde oscuro, "desinformativa" en rojo, "aceptable" en ámbar

### Componentes recurrentes
- ScoreRing: círculo con puntuación grande centrada, color semántico
- DimensionBar: barra horizontal con label y valor numérico
- AlertBadge: pill con código de alerta y severidad
- SourceTag: logo/nombre del medio con color distinctive por fuente
- StatusBadge: etiqueta de estado con color semántico

### Cuando generes HTML/CSS/JS para este proyecto:
- Usar CSS custom properties (variables) para el design system
- Animaciones sutiles en entrada de datos (fade + slide)
- Responsive: mobile-first
- Charts: usar Chart.js o SVG nativo, NO librerías pesadas
- Formato de puntuaciones: siempre con 2 decimales (ej: 6.83)