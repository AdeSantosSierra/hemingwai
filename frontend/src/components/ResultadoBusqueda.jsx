import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer
} from 'recharts';
import {
  XCircle,
  MessageSquare,
  Search,
  Loader,
  AlertTriangle,
} from 'lucide-react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import Chatbot from './Chatbot';
import ScoreCounter from './ScoreCounter';
import SkeletonAnalysis from './SkeletonAnalysis';
import RevealOnScroll from './RevealOnScroll';

/*  
   Helpers
     */

// Emoticono según puntuación
const getEmoticonoPuntuacion = (puntuacion) => {
  const p = Number(puntuacion) || 0;
  if (p >= 85) return '🤩';
  if (p >= 75) return '😊';
  if (p >= 60) return '🙂';
  if (p >= 45) return '😐';
  return '😢';
};

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

/*  
   PuntuacionIndicador
     */
const PuntuacionIndicador = ({ puntuacion }) => {
  const score = Number(puntuacion);
  const getColor = (s) => {
    if (s >= 75) return 'bg-green-500';
    if (s >= 60) return 'bg-yellow-500';
    if (s >= 45) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${getColor(score)}`} />
      <span className="font-bold text-gray-700">{isNaN(score) ? 'N/A' : score}</span>
    </div>
  );
};


const ResultadoBusqueda = ({ estado, resultado }) => {
  const [seccionSeleccionada, setSeccionSeleccionada] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [mostrarRadarGrande, setMostrarRadarGrande] = useState(false);
  const [mostrarResumen, setMostrarResumen] = useState(false);
  
  // Referencia al chatbot
  const chatbotRef = useRef(null);

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
    '1': 'Interpretación del periodista',
    '2': 'Opiniones',
    '3': 'Cita de fuentes',
    '4': 'Confiabilidad de fuentes',
    '5': 'Trascendencia',
    '6': 'Relevancia de los datos',
    '7': 'Precisión y claridad',
    '8': 'Enfoque',
    '9': 'Contexto',
    '10': 'Ética'
  };

  const datosRadar = Object.keys(nombresSecciones).map((key) => ({
    seccion: nombresSecciones[key],
    puntuacion: resultado.puntuacion_individual?.[key] ?? 0
  }));

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
    if (chatbotRef.current) {
        const pregunta = `Dame un resumen de la calificación que ha obtenido la sección de ${nombreSeccion}`;
        chatbotRef.current.handleQuickQuestion(pregunta);
    }
  };

  return (
    <>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8 items-start"
        key={resultado._id || resultado.url}
      >
        {/* Columna Izquierda: Contenido del análisis */}
        <div className="space-y-6">
        {/* Información básica */}
        <RevealOnScroll delay={0}>
        <div className="p-6 bg-white/95 shadow-xl rounded-xl border-l-4 border-lima">
        <div className="flex flex-col md:flex-row gap-4 md:items-start">

            {/* Columna izquierda: Título y Metadatos */}
            <div className="flex-1">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                {resultado.titulo}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold text-gray-600">
                    Fecha de publicación:
                  </span>
                  <p className="text-gray-900">
                    {resultado.fecha_publicacion
                      ? new Date(resultado.fecha_publicacion).toLocaleDateString('es-ES')
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="font-semibold text-gray-600">Fuente:</span>
                  <p className="text-gray-900">{resultado.fuente || 'N/A'}</p>
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <span className="font-semibold text-gray-600">Autor(es):</span>
                  <p className="text-gray-900">
                    {resultado.autor && resultado.autor.length > 0
                      ? resultado.autor.join(', ')
                      : 'N/A'}
                  </p>
                </div>
                {/* Botón Resumen del análisis */}
                <div className="col-span-1 sm:col-span-2 mt-2">
                  <button
                    onClick={() => setMostrarResumen(!mostrarResumen)}
                    className="bg-[#001a33] text-lima px-4 py-2 rounded-md shadow-md hover:bg-[#0f2e52] transition-colors font-medium text-sm"
                  >
                    Resumen del análisis
                  </button>
                </div>

                {/* Dropdown Resumen */}
                {mostrarResumen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="col-span-1 sm:col-span-2 space-y-4 overflow-hidden border-t border-gray-100 pt-4 mt-2"
                  >
                    <div>
                      <span className="font-semibold text-gray-600 block mb-1">
                        Resumen valoración:
                      </span>
                      <p className="text-gray-900 leading-relaxed">
                        {resultado.resumen_valoracion || 'No disponible'}
                      </p>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-600 block mb-1">
                        Resumen valoración del titular:
                      </span>
                      <p className="text-gray-900 leading-relaxed">
                        {resultado.resumen_valoracion_titular || 'No disponible'}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Columna derecha: Puntuación arriba, radar debajo */}
            <div className="flex flex-col items-end gap-3 flex-shrink-0 md:w-48 lg:w-56">


              {/* Puntuación General */}
              <div className="text-center">
                <div className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                  Puntuación general
                </div>
                <div className="flex flex-col items-center justify-center">
                  <span className="text-4xl mb-1">{getEmoticonoPuntuacion(resultado.puntuacion)}</span>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        resultado.puntuacion >= 75
                          ? 'bg-green-500'
                          : resultado.puntuacion >= 60
                          ? 'bg-yellow-500'
                          : resultado.puntuacion >= 45
                          ? 'bg-orange-500'
                          : 'bg-red-500'
                      }`}
                    />
                    <ScoreCounter value={resultado.puntuacion ?? 0} className="text-3xl font-extrabold text-lima" />
                  </div>
                </div>
              </div>

              {/* Mini Radar (Botón) */}
              {resultado.puntuacion_individual && (
                <div className="flex flex-col items-center">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setMostrarRadarGrande(!mostrarRadarGrande)}
                    className="w-24 h-24 rounded-lg hover:bg-gray-50 transition-colors p-1 border border-transparent hover:border-gray-200"
                    title="Ver desglose de criterios"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="100%" data={datosRadar}>
                        <PolarGrid stroke="#E5E7EB" />
                        <PolarAngleAxis
                          dataKey="seccion"
                          tick={false}
                          axisLine={false}
                        />
                        <PolarRadiusAxis
                          angle={90}
                          domain={[0, 100]}
                          tick={{
                            fill: '#6B7280',   
                            fontSize: 0       
                          }}
                          tickLine={false}      
                        />
                        <Radar
                          name="Puntuación"
                          dataKey="puntuacion"
                          stroke="#D2D209"
                          fill="#D2D209"
                          fillOpacity={0.5}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </motion.button>
                </div>
              )}
            </div>
          </div>

          {/* Radar chart Expandido */}
          {mostrarRadarGrande && resultado.puntuacion_individual && (
            <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 border-t border-gray-100 pt-6"
            >
              <h4 className="text-xl font-bold text-gray-900 mb-4 text-center">
                Análisis visual de calidad
              </h4>
              <div style={{ width: '100%', height: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart 
                    data={datosRadar} 
                    outerRadius="100%" 
                    margin={{ top: 10, right: 10, bottom: 40, left: 10 }}
                  >
                    <PolarGrid stroke="#E5E7EB" />
                    <PolarAngleAxis
                      dataKey="seccion"
                      tick={{ fill: '#111827', fontSize: 14 }}
                    />
                    <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{
                      fill: '#6B7280',   // color de las etiquetas
                      fontSize: 11       // ↓ tamaño más pequeño (prueba 9–11)
                    }}
                    tickLine={false}
                    
                    />

                    <Radar
                      name="Puntuación"
                      dataKey="puntuacion"
                      stroke="#D2D209"
                      fill="#D2D209"
                      fillOpacity={0.5}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}
        </div>
        </RevealOnScroll>

        {/* Otras secciones (Análisis adicional) */}
        <RevealOnScroll delay={100}>
        <div className="bg-white/95 shadow-xl rounded-xl p-6 border-l-4 border-lima">
          <h4 className="text-xl font-bold text-gray-900 mb-4">
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
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-lima transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed bg-white"
            >
              <div className="font-semibold text-gray-800">Valoración general</div>
              {!resultado.valoracion_general && (
                <p className="text-xs text-gray-400 mt-1">No disponible</p>
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
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-lima transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed bg-white"
            >
              <div className="font-semibold text-gray-800">
                Valoración del titular
              </div>
              {!resultado.valoracion_titular?.titular && (
                <p className="text-xs text-gray-400 mt-1">No disponible</p>
              )}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
              whileTap={{ scale: 0.98 }}
              onClick={() =>
                abrirModal('Análisis de fact-checking', resultado.fact_check_analisis)
              }
              disabled={!resultado.fact_check_analisis}
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-lima transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed bg-white"
            >
              <div className="font-semibold text-gray-800">
                Análisis de Fact-Checking
              </div>
              {!resultado.fact_check_analisis && (
                <p className="text-xs text-gray-400 mt-1">No disponible</p>
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
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-lima transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed bg-white"
            >
              <div className="font-semibold text-gray-800">
                Fuentes de Fact-Checking
              </div>
              {(!resultado.fact_check_fuentes ||
                resultado.fact_check_fuentes.length === 0) && (
                <p className="text-xs text-gray-400 mt-1">No disponible</p>
              )}
            </motion.button>
          </div>
        </div>
        </RevealOnScroll>

        {/* NUEVA SECCIÓN: Pregúntale al chatbot */}
        <RevealOnScroll delay={200}>
        <div className="bg-white/95 shadow-xl rounded-xl p-6 border-l-4 border-lima">
          <h4 className="text-xl font-bold text-gray-900 mb-2">
            Pregúntale al chatbot
          </h4>
          <p className="text-sm text-gray-600 mb-4">
             Haz clic en una sección para preguntar automáticamente al chatbot sobre su calificación.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {Object.keys(nombresSecciones).map((key) => {
                return (
                  <motion.button
                    key={key}
                    whileHover={{ scale: 1.02, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                    onClick={() => handlePreguntaChatbot(nombresSecciones[key])}
                    className="p-4 border-2 border-gray-200 rounded-lg hover:border-lima transition-all duration-200 text-left bg-white flex items-center justify-between group"
                  >
                    <span className="text-sm font-semibold text-gray-800 group-hover:text-[#001a33]">
                      {nombresSecciones[key]}
                    </span>
                    <MessageSquare className="w-4 h-4 text-gray-400 group-hover:text-lima" />
                  </motion.button>
                );
              })}
          </div>
        </div>
        </RevealOnScroll>

        {/* Valoraciones individuales */}
        <RevealOnScroll delay={300}>
        <div className="bg-white/95 shadow-xl rounded-xl p-6 border-l-4 border-lima">
          <h4 className="text-xl font-bold text-gray-900 mb-4">
            Valoraciones por sección
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {resultado.puntuacion_individual &&
              Object.keys(nombresSecciones).map((key) => {
                const puntuacion = resultado.puntuacion_individual?.[key];
                const valoracion = resultado.valoraciones?.[key];

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
                    className="p-4 border-2 border-gray-200 rounded-lg hover:border-lima transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed bg-white"
                    disabled={!valoracion}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-800">
                        {nombresSecciones[key]}
                      </span>
                      {puntuacion ? (
                        <PuntuacionIndicador puntuacion={puntuacion} />
                      ) : (
                        <span className="text-gray-400 text-xs">N/A</span>
                      )}
                    </div>
                    {!valoracion && (
                      <p className="text-xs text-gray-400 mt-2">No disponible</p>
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
              <div className="bg-white/95 shadow-xl rounded-xl p-6">
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
                          puntuacion: resultado.puntuacion,
                          puntuacion_individual: resultado.puntuacion_individual,
                      }}
                  />
              </div>
          )}
          </RevealOnScroll>
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
