import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  XCircle,
  MessageSquare,
  Search,
  AlertTriangle,
} from 'lucide-react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import Chatbot from './Chatbot';
import NewsScoreDonut from './NewsScoreDonut';
import SkeletonAnalysis from './SkeletonAnalysis';
import RevealOnScroll from './RevealOnScroll';
import {
  getEvaluationAlerts,
  getEvaluationAlertsSummary,
  getEvaluationGlobalScore,
  getEvaluationResult,
} from '../lib/evaluationViewModel';

/*  
   Helpers
     */

// Escape HTML helper
const escapeHtml = (unsafe) => {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

// Renderizado Markdown muy básico
const renderMarkdown = (text) => {
  if (!text && text !== 0) return '<p>Contenido no disponible</p>';
  let html = String(text);

  html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>');

  // Bold e italic
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

  // Listas
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
  html = html.replace(/^\s*\d+\.\s+(.*)$/gim, '<li>$1</li>');

  html = html.replace(/(<li>.*<\/li>)/gims, (m) => {
    if (m.startsWith('<ul>')) return m;
    return `<ul class="list-disc ml-6 mb-4">${m}</ul>`;
  });

  const paragraphs = html
    .split(/\n{2,}/)
    .map((p) => `<p class="mb-3">${p.trim()}</p>`)
    .join('');

  return paragraphs.replace(/<p>\s*<\/p>/g, '');
};

// Formatea diccionarios/objetos en HTML legible
const formatearDiccionario = (objOrString) => {
  let obj = objOrString;

  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      const cleaned = obj
        .replace(/^[\s\r\n]*|[\s\r\n]*$/g, '')
        .replace(/{\s*/g, '')
        .replace(/\s*}/g, '')
        .replace(/",\s*"/g, '",\n"')
        .replace(/":\s*/g, '": ');

      return `<pre class="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap font-mono">${escapeHtml(
        cleaned
      )}</pre>`;
    }
  }

  if (typeof obj !== 'object' || obj === null) {
    return `<pre class="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap font-mono">${escapeHtml(
      String(obj)
    )}</pre>`;
  }

  let html = '';
  for (const [key, value] of Object.entries(obj)) {
    const valStr =
      typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    html += `
      <div class="mb-4 p-3 bg-gray-50 rounded-lg">
        <div class="font-semibold text-[#001a33] mb-2">${escapeHtml(key)}</div>
        <pre class="whitespace-pre-wrap font-mono text-sm">${escapeHtml(valStr)}</pre>
      </div>
    `;
  }
  return html;
};

// Formatea array de fuentes en HTML
const formatearFuentes = (fuentes) => {
  if (!fuentes || !Array.isArray(fuentes) || fuentes.length === 0) {
    return '<p>No hay fuentes disponibles.</p>';
  }
  let html = '<ol class="list-decimal list-inside space-y-2">';
  for (const fuente of fuentes) {
    const url = String(fuente).trim();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      html += `<li><a href="${escapeHtml(
        url
      )}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline break-all">${escapeHtml(
        url
      )}</a></li>`;
    } else {
      html += `<li class="break-all">${escapeHtml(url)}</li>`;
    }
  }
  html += '</ol>';
  return html;
};

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeKey = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const SEVERITY_UI = {
  high: {
    label: 'Alta',
    badge: 'bg-red-500/20 text-red-200 border border-red-400/40',
  },
  medium: {
    label: 'Media',
    badge: 'bg-yellow-500/20 text-yellow-200 border border-yellow-400/40',
  },
  low: {
    label: 'Baja',
    badge: 'bg-sky-500/20 text-sky-200 border border-sky-400/40',
  },
};

const CATEGORY_LABELS = {
  fiabilidad: 'Fiabilidad',
  adecuacion: 'Adecuación',
  claridad: 'Claridad',
  profundidad: 'Profundidad',
  enfoque: 'Enfoque',
};

const CRITERION_SUMMARY_LABELS = {
  fiabilidad: 'Fiabilidad',
  adecuacion: 'Adecuación',
  claridad: 'Claridad',
  profundidad: 'Profundidad',
  enfoque: 'Enfoque',
};

/*  
   PuntuacionIndicador
     */
const PuntuacionIndicador = ({ puntuacion }) => {
  const score = Number(puntuacion);
  const getColor = (s) => {
    // Escala 0–10
    if (s >= 7.5) return 'bg-lime-500';
    if (s >= 6) return 'bg-yellow-500';
    if (s >= 4.5) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${getColor(score)}`} />
      <span className="font-bold text-[color:var(--hw-text-muted)]">
        {Number.isFinite(score) ? score.toFixed(2) : 'N/A'}
      </span>
    </div>
  );
};


const ResultadoBusqueda = ({ estado, resultado, chatbotAccess }) => {
  const [seccionSeleccionada, setSeccionSeleccionada] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [activeCriterion, setActiveCriterion] = useState(null);
  
  // Referencia al chatbot
  const chatbotRef = useRef(null);

  useEffect(() => {
    setActiveCriterion(null);
  }, [resultado?._id, resultado?.url]);

  // Estado inicial
  if (estado === 'idle') {
    return (
      <div className="p-8 bg-gray-50/80 text-gray-500 rounded-xl text-center shadow-inner border border-gray-200">
        <Search className="w-8 h-8 mx-auto mb-2 text-lima" />
        <p className="text-lg font-medium">Listo para analizar.</p>
        <p className="text-sm">
          Introduce una URL para ver el análisis de una noticia.
        </p>
      </div>
    );
  }

  // Loading
  if (estado === 'loading') {
    return <SkeletonAnalysis />;
  }

  // Error
  if (estado === 'error') {
    return (
      <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg flex items-start space-x-3">
        <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="text-lg font-bold">Error de búsqueda</h3>
          <p className="font-mono text-sm whitespace-pre-wrap">{resultado}</p>
        </div>
      </div>
    );
  }

  // No encontrada
  if (
    estado === 'success' &&
    (!resultado ||
      Object.keys(resultado).length === 0 ||
      (resultado.mensaje && resultado.mensaje.toLowerCase().includes('no encontrada')))
  ) {
    return (
      <div className="p-8 bg-gray-50 text-gray-500 rounded-xl text-center shadow-inner border border-yellow-300">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
        <p className="text-lg font-medium">
          Noticia no encontrada o aún no analizada.
        </p>
        <p className="text-sm">Verifica el ID/URL e inténtalo de nuevo.</p>
      </div>
    );
  }

  const nombresSecciones = {
    '1': 'Fiabilidad',
    '2': 'Adecuación',
    '3': 'Claridad',
    '4': 'Profundidad',
    '5': 'Enfoque'
  };

  const abrirModal = (titulo, contenido, tipoContenido = 'markdown') => {
    setSeccionSeleccionada({ titulo, contenido, tipoContenido });
    setMostrarModal(true);
  };

  const cerrarModal = () => {
    setMostrarModal(false);
    setSeccionSeleccionada(null);
  };

  // Función para enviar pregunta rápida al chatbot
  const handlePreguntaChatbot = (nombreSeccion) => {
    if (chatbotAccess?.isLoading || chatbotAccess?.canUseChatbot !== true) {
      return;
    }
    if (chatbotRef.current) {
        const pregunta = `Dame un resumen de la calificación que ha obtenido la sección de ${nombreSeccion}`;
        chatbotRef.current.handleQuickQuestion(pregunta);
    }
  };

  const evaluationResult = getEvaluationResult(resultado);
  const scoreForChatbot = getEvaluationGlobalScore(evaluationResult);
  const rawAlerts = getEvaluationAlerts(evaluationResult);
  const alertsSummary = getEvaluationAlertsSummary(evaluationResult);
  const alerts = (rawAlerts || [])
    .filter((alert) => alert && typeof alert === 'object')
    .map((alert) => {
      const severityKey = normalizeKey(alert.severity);
      const categoryKey = normalizeKey(alert.category);
      const severity = SEVERITY_UI[severityKey] || SEVERITY_UI.medium;
      const category = CATEGORY_LABELS[categoryKey] || 'General';
      const evidenceRefs = Array.isArray(alert.evidence_refs)
        ? alert.evidence_refs.filter(Boolean).slice(0, 3)
        : [];

      return {
        code: alert.code || 'UNKNOWN_ALERT',
        message: alert.message || 'Alerta sin descripción.',
        origin: normalizeKey(alert.origin) === 'engine' ? 'Motor' : 'Modelo',
        category,
        severity,
        evidenceRefs,
      };
    });

  const computedCounts = alerts.reduce(
    (acc, alert) => {
      const label = alert.severity.label;
      if (label === 'Alta') acc.high += 1;
      if (label === 'Media') acc.medium += 1;
      if (label === 'Baja') acc.low += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );
  const summaryCounts = alertsSummary?.counts || {};
  const alertCounts = {
    high: toFiniteNumber(summaryCounts.high) ?? computedCounts.high,
    medium: toFiniteNumber(summaryCounts.medium) ?? computedCounts.medium,
    low: toFiniteNumber(summaryCounts.low) ?? computedCounts.low,
  };
  const criterionSummary =
    activeCriterion === null
      ? null
      : evaluationResult?.section_summaries?.[activeCriterion] || '—';
  const criterionSummaryLabel =
    activeCriterion === null ? null : CRITERION_SUMMARY_LABELS[activeCriterion] || activeCriterion;
  const publicationDate = resultado.fecha_publicacion
    ? new Date(resultado.fecha_publicacion).toLocaleDateString('es-ES')
    : 'N/A';
  const authorsText = Array.isArray(resultado.autor)
    ? resultado.autor.length > 0
      ? resultado.autor.join(', ')
      : 'N/A'
    : resultado.autor || 'N/A';
  const isChatbotAccessLoading = chatbotAccess?.isLoading === true;
  const canUseChatbot = chatbotAccess?.canUseChatbot === true;

  return (
    <>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="space-y-8"
        key={resultado._id || resultado.url}
      >
        <RevealOnScroll delay={0}>
          <div className="hw-glass rounded-3xl p-8 border-l-4 border-lima">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.24em] text-lima/80 mb-3">
              Noticia analizada
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight text-[color:var(--hw-text)]">
              {resultado.titulo}
            </h2>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--hw-text-muted)] mb-2">
                  Autor
                </p>
                <p className="text-lg font-medium text-[color:var(--hw-text)]">{authorsText}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--hw-text-muted)] mb-2">
                  Fecha
                </p>
                <p className="text-lg font-medium text-[color:var(--hw-text)]">{publicationDate}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--hw-text-muted)] mb-2">
                  Fuente
                </p>
                <p className="text-lg font-medium text-[color:var(--hw-text)]">{resultado.fuente || 'N/A'}</p>
              </div>
            </div>
          </div>
        </RevealOnScroll>

        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8 items-start">
          <div className="space-y-6">
            <RevealOnScroll delay={70}>
              <div className="hw-glass rounded-2xl p-6 border-l-4 border-lima">
                <div className="flex flex-col xl:flex-row gap-8">
                  <div className="flex flex-col items-center gap-3 flex-shrink-0">
                    <p className="text-xs font-semibold text-[color:var(--hw-text-muted)] uppercase tracking-[0.18em]">
                      Puntuación general
                    </p>
                    <NewsScoreDonut
                      evaluationResult={evaluationResult}
                      onActiveCriterionChange={setActiveCriterion}
                    />
                  </div>
                  <div className="flex-1 xl:border-l xl:border-[color:var(--hw-border)] xl:pl-8">
                    {activeCriterion === null ? (
                      <div className="space-y-4">
                        <h4 className="text-2xl font-bold text-[color:var(--hw-text)]">
                          Análisis general
                        </h4>
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--hw-text-muted)] block mb-2">
                            Resumen valoración
                          </span>
                          <p className="text-base leading-relaxed whitespace-pre-wrap text-[color:var(--hw-text)]">
                            {resultado.resumen_valoracion || '—'}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--hw-text-muted)] block mb-2">
                            Resumen valoración del titular
                          </span>
                          <p className="text-base leading-relaxed whitespace-pre-wrap text-[color:var(--hw-text)]">
                            {resultado.resumen_valoracion_titular || '—'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <h4 className="text-2xl font-bold text-[color:var(--hw-text)]">
                          Análisis por criterio
                        </h4>
                        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-lima">
                          {criterionSummaryLabel}
                        </span>
                        <p className="text-base leading-relaxed whitespace-pre-wrap text-[color:var(--hw-text)]">
                          {criterionSummary}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </RevealOnScroll>

            {/* Alertas */}
            <RevealOnScroll delay={100}>
            <div className="hw-glass rounded-2xl p-6 border-l-4 border-amber-400">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h4 className="text-xl font-bold text-[color:var(--hw-text)]">
                  Alertas detectadas
                </h4>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-red-500/20 text-red-200 border border-red-400/30">
                    Altas: {alertCounts.high}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-200 border border-yellow-400/30">
                    Medias: {alertCounts.medium}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-200 border border-sky-400/30">
                    Bajas: {alertCounts.low}
                  </span>
                </div>
              </div>

              {alerts.length === 0 ? (
                <p className="text-sm text-[color:var(--hw-text-muted)]">No hay alertas registradas para esta noticia.</p>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert, index) => (
                    <div
                      key={`${alert.code}-${index}`}
                      className="rounded-lg border border-[color:var(--hw-border)] bg-[color:var(--hw-bg-elevated)]/70 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${alert.severity.badge}`}>
                          Severidad {alert.severity.label}
                        </span>
                        <span className="text-xs text-[color:var(--hw-text-muted)]">{alert.category}</span>
                        <span className="text-xs text-gray-500">{alert.origin}</span>
                        <span className="text-[11px] text-gray-500 font-mono">{alert.code}</span>
                      </div>
                      <p className="text-sm text-[color:var(--hw-text)]">{alert.message}</p>
                      {alert.evidenceRefs.length > 0 && (
                        <p className="text-xs text-[color:var(--hw-text-muted)] mt-2">
                          Evidencias: {alert.evidenceRefs.join(' | ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            </RevealOnScroll>

            {/* Otras secciones (Análisis adicional) */}
            <RevealOnScroll delay={150}>
            <div className="hw-glass rounded-2xl p-6 border-l-4 border-lima">
              <h4 className="text-xl font-bold text-[color:var(--hw-text)] mb-4">
                Análisis general
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() =>
                    abrirModal('Valoración general', resultado.valoracion_general)
                  }
                  disabled={!resultado.valoracion_general}
                  className="p-4 border border-[color:var(--hw-border)] rounded-lg hover:border-lima transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed bg-[color:var(--hw-bg-elevated)]/70"
                >
                  <div className="font-semibold text-[color:var(--hw-text)]">Valoración general</div>
                  {!resultado.valoracion_general && (
                    <p className="text-xs text-[color:var(--hw-text-muted)] mt-1">No disponible</p>
                  )}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() =>
                    abrirModal(
                      'Valoración del titular',
                      resultado.valoracion_titular?.titular
                    )
                  }
                  disabled={!resultado.valoracion_titular?.titular}
                  className="p-4 border border-[color:var(--hw-border)] rounded-lg hover:border-lima transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed bg-[color:var(--hw-bg-elevated)]/70"
                >
                  <div className="font-semibold text-[color:var(--hw-text)]">
                    Valoración del titular
                  </div>
                  {!resultado.valoracion_titular?.titular && (
                    <p className="text-xs text-[color:var(--hw-text-muted)] mt-1">No disponible</p>
                  )}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() =>
                    abrirModal('Análisis de fact-checking', resultado.fact_check_analisis)
                  }
                  disabled={!resultado.fact_check_analisis}
                  className="p-4 border border-[color:var(--hw-border)] rounded-lg hover:border-lima transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed bg-[color:var(--hw-bg-elevated)]/70"
                >
                  <div className="font-semibold text-[color:var(--hw-text)]">
                    Análisis de Fact-Checking
                  </div>
                  {!resultado.fact_check_analisis && (
                    <p className="text-xs text-[color:var(--hw-text-muted)] mt-1">No disponible</p>
                  )}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() =>
                    abrirModal(
                      'Fuentes de fact-checking',
                      resultado.fact_check_fuentes,
                      'fuentes'
                    )
                  }
                  disabled={
                    !resultado.fact_check_fuentes ||
                    resultado.fact_check_fuentes.length === 0
                  }
                  className="p-4 border border-[color:var(--hw-border)] rounded-lg hover:border-lima transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed bg-[color:var(--hw-bg-elevated)]/70"
                >
                  <div className="font-semibold text-[color:var(--hw-text)]">
                    Fuentes de Fact-Checking
                  </div>
                  {(!resultado.fact_check_fuentes ||
                    resultado.fact_check_fuentes.length === 0) && (
                    <p className="text-xs text-[color:var(--hw-text-muted)] mt-1">No disponible</p>
                  )}
                </motion.button>
              </div>
            </div>
            </RevealOnScroll>

            {/* NUEVA SECCIÓN: Pregúntale al chatbot */}
            <RevealOnScroll delay={220}>
            <div className="hw-glass rounded-2xl p-6 border-l-4 border-lima">
              <h4 className="text-xl font-bold text-[color:var(--hw-text)] mb-2">
                Pregúntale al chatbot
              </h4>
              <p className="text-sm text-[color:var(--hw-text-muted)] mb-4">
                 Haz clic en una sección para preguntar automáticamente al chatbot sobre su calificación.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                {Object.keys(nombresSecciones).map((key) => {
                    return (
                      <motion.button
                        key={key}
                        whileHover={{ scale: 1.02, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                        onClick={() => handlePreguntaChatbot(nombresSecciones[key])}
                        disabled={!canUseChatbot || isChatbotAccessLoading}
                        className="p-4 border border-[color:var(--hw-border)] rounded-lg hover:border-lima transition-all duration-200 text-left bg-[color:var(--hw-bg-elevated)]/70 flex items-center justify-between group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="text-sm font-semibold text-[color:var(--hw-text-muted)] group-hover:text-[color:var(--hw-text)]">
                          {nombresSecciones[key]}
                        </span>
                        <MessageSquare className="w-4 h-4 text-[color:var(--hw-text-muted)] group-hover:text-lima" />
                      </motion.button>
                    );
                  })}
              </div>
              {isChatbotAccessLoading && (
                <p className="text-xs text-[color:var(--hw-text-muted)] mt-3">
                  Verificando permisos de acceso al chatbot...
                </p>
              )}
              {!isChatbotAccessLoading && !canUseChatbot && (
                <p className="text-xs text-amber-300 mt-3">
                  Acceso restringido: tu cuenta no está autorizada para usar el chatbot.
                </p>
              )}
            </div>
            </RevealOnScroll>

            {/* Valoraciones individuales */}
            <RevealOnScroll delay={320}>
            <div className="hw-glass rounded-2xl p-6 border-l-4 border-lima">
              <h4 className="text-xl font-bold text-[color:var(--hw-text)] mb-4 hw-terminal-font">
                Valoraciones por sección
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                {resultado.puntuacion_individual &&
                  Object.keys(nombresSecciones).map((key) => {
                    const puntuacion = resultado.puntuacion_individual?.[key];
                    const valoracion = resultado.valoraciones?.[key];
                    const puntuacionNumerica = toFiniteNumber(puntuacion);

                    return (
                      <motion.button
                        key={key}
                        whileHover={{ scale: 1.02, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() =>
                          abrirModal(
                            nombresSecciones[key],
                            valoracion || 'Contenido no disponible'
                          )
                        }
                        className="p-4 border border-[color:var(--hw-border)] rounded-lg hover:border-lima transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed bg-[color:var(--hw-bg-elevated)]/70"
                        disabled={!valoracion}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-[color:var(--hw-text-muted)]">
                            {nombresSecciones[key]}
                          </span>
                          {puntuacionNumerica !== null ? (
                            <PuntuacionIndicador puntuacion={puntuacionNumerica} />
                          ) : (
                            <span className="text-[color:var(--hw-text-muted)] text-xs">N/A</span>
                          )}
                        </div>
                        {!valoracion && (
                          <p className="text-xs text-[color:var(--hw-text-muted)] mt-2">No disponible</p>
                        )}
                      </motion.button>
                    );
                  })}
              </div>
            </div>
            </RevealOnScroll>
          </div>

          {/* Columna Derecha: Chatbot Sticky */}
          <div className="md:sticky md:top-4">
            <RevealOnScroll delay={150}>
            {resultado.titulo && resultado.cuerpo && resultado.valoraciones && (
                <div className="hw-glass rounded-2xl p-6">
                    {isChatbotAccessLoading && (
                      <div className="p-4 rounded-xl border border-[color:var(--hw-border)] bg-[color:var(--hw-bg-elevated)]/70">
                        <p className="text-sm text-[color:var(--hw-text-muted)]">
                          Verificando permisos del chatbot...
                        </p>
                      </div>
                    )}

                    {!isChatbotAccessLoading && canUseChatbot && (
                      <Chatbot 
                          ref={chatbotRef}
                          noticiaContexto={{
                              titulo: resultado.titulo,
                              cuerpo: resultado.cuerpo,
                              valoraciones: resultado.valoraciones,
                              fact_check_analisis: resultado.fact_check_analisis,
                              fact_check_fuentes: resultado.fact_check_fuentes,
                              texto_referencia_diccionario: resultado.texto_referencia_diccionario,
                              valoracion_titular: resultado.valoracion_titular,
                              autor: resultado.autor,
                              url: resultado.url,
                              fecha_publicacion: resultado.fecha_publicacion,
                              fuente: resultado.fuente,
                              keywords: resultado.keywords,
                              tags: resultado.tags,
                              puntuacion: scoreForChatbot ?? undefined,
                              puntuacion_individual: resultado.puntuacion_individual,
                          }}
                      />
                    )}

                    {!isChatbotAccessLoading && !canUseChatbot && (
                      <div className="p-4 rounded-xl border border-amber-400/40 bg-amber-500/10">
                        <h5 className="text-base font-semibold text-amber-200 mb-1">
                          Acceso restringido
                        </h5>
                        <p className="text-sm text-amber-100/90">
                          Tu cuenta no tiene permiso para usar el chatbot en este momento.
                        </p>
                      </div>
                    )}
                </div>
            )}
            </RevealOnScroll>
          </div>
        </div>
      </motion.div>

      {/* Modal - Renderizado en Portal para evitar conflictos con transformaciones CSS */}
      {mostrarModal && seccionSeleccionada && createPortal(
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={cerrarModal}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="p-6 border-b border-gray-200 flex items-center justify-between bg-[#001a33]/5">
              <h3 className="text-2xl font-bold text-gray-900">
                {seccionSeleccionada.titulo}
              </h3>
              <button
                onClick={cerrarModal}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
              <div className="prose max-w-none text-gray-800">
                <div
                  dangerouslySetInnerHTML={{
                    __html: (() => {
                      if (!seccionSeleccionada) return '';
                      const { contenido, tipoContenido } = seccionSeleccionada;
                      switch (tipoContenido) {
                        case 'diccionario':
                          return formatearDiccionario(contenido);
                        case 'fuentes':
                          return formatearFuentes(contenido);
                        case 'markdown':
                        default:
                          return renderMarkdown(contenido);
                      }
                    })()
                  }}
                />
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
    </>
  );
};

export default ResultadoBusqueda;
