// App.jsx
import React, { useState } from 'react';
import logo from './assets/logo2.png';
import Chatbot from './components/Chatbot';

import {
  Search,
  Code,
  Database,
  Loader,
  AlertTriangle,
  XCircle,
  History,
  Settings,
  HelpCircle,
  User,
  Globe2,
  Newspaper,
} from 'lucide-react';

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer
} from 'recharts';

import API_BASE_URL from './apiConfig';

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
    } catch (e) {
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
        <div class="font-semibold text-[#0A2342] mb-2">${escapeHtml(key)}</div>
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

/*  
   ResultadoBusqueda
     */
const ResultadoBusqueda = ({ estado, resultado }) => {
  const [seccionSeleccionada, setSeccionSeleccionada] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [mostrarRadarGrande, setMostrarRadarGrande] = useState(false);

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
    return (
      <div className="flex items-center justify-center p-8 bg-white/90 shadow-lg rounded-xl text-lima">
        <Loader className="w-6 h-6 animate-spin mr-3" />
        <span className="text-lg font-medium">Cargando análisis...</span>
      </div>
    );
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

  return (
    <div className="space-y-6">
      {/* Información básica */}
      <div className="p-6 bg-white/95 shadow-xl rounded-xl border-l-4 border-lima">
      <div className="flex flex-col md:flex-row gap-4 md:items-center">

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
                  <span className="text-3xl font-extrabold text-lima">
                    {resultado.puntuacion ?? 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Mini Radar (Botón) */}
            {resultado.puntuacion_individual && (
              <div className="flex flex-col items-center">
                <button
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
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Radar chart Expandido */}
        {mostrarRadarGrande && resultado.puntuacion_individual && (
          <div className="mt-6 border-t border-gray-100 pt-6">
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
          </div>
        )}
      </div>

      {/* Otras secciones (Análisis adicional) */}
      <div className="bg-white/95 shadow-xl rounded-xl p-6">
        <h4 className="text-xl font-bold text-gray-900 mb-4">
          Análisis adicional
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() =>
              abrirModal('Valoración general', resultado.valoracion_general)
            }
            disabled={!resultado.valoracion_general}
            className="p-4 border-2 border-gray-200 rounded-lg hover:border-lima hover:shadow-lg transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed bg-white"
          >
            <div className="font-semibold text-gray-800">📊 Valoración general</div>
            {!resultado.valoracion_general && (
              <p className="text-xs text-gray-400 mt-1">No disponible</p>
            )}
          </button>

          <button
            onClick={() =>
              abrirModal(
                'Valoración del titular',
                resultado.valoracion_titular?.titular
              )
            }
            disabled={!resultado.valoracion_titular?.titular}
            className="p-4 border-2 border-gray-200 rounded-lg hover:border-lima hover:shadow-lg transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed bg-white"
          >
            <div className="font-semibold text-gray-800">
              📰 Valoración del titular
            </div>
            {!resultado.valoracion_titular?.titular && (
              <p className="text-xs text-gray-400 mt-1">No disponible</p>
            )}
          </button>

          <button
            onClick={() =>
              abrirModal('Análisis de fact-checking', resultado.fact_check_analisis)
            }
            disabled={!resultado.fact_check_analisis}
            className="p-4 border-2 border-gray-200 rounded-lg hover:border-lima hover:shadow-lg transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed bg-white"
          >
            <div className="font-semibold text-gray-800">
              🔍 Análisis de Fact-Checking
            </div>
            {!resultado.fact_check_analisis && (
              <p className="text-xs text-gray-400 mt-1">No disponible</p>
            )}
          </button>

          <button
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
            className="p-4 border-2 border-gray-200 rounded-lg hover:border-lima hover:shadow-lg transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed bg-white"
          >
            <div className="font-semibold text-gray-800">
              📚 Fuentes de Fact-Checking
            </div>
            {(!resultado.fact_check_fuentes ||
              resultado.fact_check_fuentes.length === 0) && (
              <p className="text-xs text-gray-400 mt-1">No disponible</p>
            )}
          </button>

          
            
        </div>
      </div>

      {/* Valoraciones individuales - MOVIDO ABAJO */}
      <div className="bg-white/95 shadow-xl rounded-xl p-6">
        <h4 className="text-xl font-bold text-gray-900 mb-4">
          Valoraciones por sección
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {resultado.puntuacion_individual &&
            Object.keys(nombresSecciones).map((key) => {
              const puntuacion = resultado.puntuacion_individual?.[key];
              const valoracion = resultado.valoraciones?.[key];

              return (
                <button
                  key={key}
                  onClick={() =>
                    abrirModal(
                      nombresSecciones[key],
                      valoracion || 'Contenido no disponible'
                    )
                  }
                  className="p-4 border-2 border-gray-200 rounded-lg hover:border-lima hover:shadow-lg transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed bg-white"
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
                </button>
              );
            })}
        </div>
      </div>

      {/* Modal */}
      {mostrarModal && seccionSeleccionada && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={cerrarModal}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 flex items-center justify-between bg-[#0A2342]/5">
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
          </div>
        </div>
      )}

      {/* Sección del Chatbot */}
      {resultado.titulo && resultado.cuerpo && resultado.valoraciones && (
          <div className="mt-6 bg-white/95 shadow-xl rounded-xl p-6">
              <Chatbot 
                  noticiaContexto={{
                      titulo: resultado.titulo,
                      cuerpo: resultado.cuerpo,
                      valoraciones: resultado.valoraciones,
                  }}
              />
          </div>
      )}
    </div>
  );
};

/*  
   App principal
     */
function App() {
  const [identificador, setIdentificador] = useState('');
  const [resultadoBusqueda, setResultadoBusqueda] = useState(null);
  const [estadoBusqueda, setEstadoBusqueda] = useState('idle'); // 'idle', 'loading', 'success', 'error'

  const handleBuscarNoticia = async () => {
    if (!identificador.trim()) {
      setEstadoBusqueda('error');
      setResultadoBusqueda('El campo de búsqueda no puede estar vacío.');
      return;
    }

    setEstadoBusqueda('loading');
    setResultadoBusqueda(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/buscar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificador })
      });

      if (response.status === 404) {
        const data = await response.json();
        setEstadoBusqueda('success');
        setResultadoBusqueda(data);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error en la API (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      if (data.error) {
        setEstadoBusqueda('error');
        setResultadoBusqueda(data.error);
      } else {
        setEstadoBusqueda('success');
        setResultadoBusqueda(data);
      }
    } catch (error) {
      console.error('Error al procesar la búsqueda:', error);
      setEstadoBusqueda('error');
      setResultadoBusqueda(
        error.message || 'Error de conexión con el servidor Express.'
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0A2342] text-gray-100">
      {/* Barra superior */}
      <header className="w-full border-b border-lima/60 bg-[#071A31]/95 backdrop-blur flex items-center justify-between px-6 sm:px-10 py-3 shadow-md">
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt="Mirada Media Lab"
            className="h-9 w-auto drop-shadow-sm"
          />
          <div className="hidden sm:flex flex-col">
            <span className="text-sm font-semibold tracking-tight">
              Mirada21 Media Lab
            </span>
            <span className="text-xs text-gray-300">
              Análisis de noticias con IA
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-gray-200">
          <button className="hover:text-lima transition-colors" title="Historial">
            <History className="w-5 h-5" />
          </button>
          <button className="hover:text-lima transition-colors" title="Ayuda">
            <HelpCircle className="w-5 h-5" />
          </button>
          <button className="hover:text-lima transition-colors" title="Ajustes">
            <Settings className="w-5 h-5" />
          </button>
          <button className="hover:text-lima transition-colors" title="Perfil">
            <User className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 py-8">
        <div className="w-full max-w-5xl">
          {/* Hero */}
          <section className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#071A31]/80 border border-lima shadow-sm mb-4">
              <Newspaper className="w-4 h-4 text-lima" />
              <span className="text-xs font-semibold tracking-wide uppercase">
                IA para análisis periodístico
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-2">
              La IA que evalúa la calidad de las noticias
            </h1>
            <p className="text-sm sm:text-base text-gray-200 max-w-2xl mx-auto">
              Analiza titulares, fuentes, contexto y criterios éticos para ayudarte
              a entender la calidad informativa de cada artículo.
            </p>
          </section>

          {/* Tarjeta de búsqueda */}
          <section className="mb-8">
            <div className="bg-white/95 backdrop-blur-lg shadow-2xl rounded-2xl border border-lima px-6 sm:px-8 py-6">
              <h2 className="text-lg sm:text-xl font-semibold mb-5 text-[#0A2342] flex items-center gap-2">
                <Globe2 className="w-5 h-5 text-lima" />
                Analizar noticia desde URL
              </h2>

              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Pega aquí la URL de la noticia..."
                    value={identificador}
                    onChange={(e) => setIdentificador(e.target.value)}
                    className="w-full pl-10 pr-3 py-3 bg-gray-100 border border-gray-300 rounded-lg
                               focus:ring-2 focus:ring-lime-300 focus:border-lima
                               transition shadow-sm text-gray-900 text-sm"
                    disabled={estadoBusqueda === 'loading'}
                  />
                </div>

                <button
                  onClick={handleBuscarNoticia}
                  disabled={estadoBusqueda === 'loading'}
                  className="w-full flex items-center justify-center px-4 py-3 
                             bg-lima text-[#0A2342] font-bold rounded-lg 
                             hover:bg-lima-dark transition duration-200 
                             shadow-md disabled:bg-gray-400 disabled:text-gray-100"
                >
                  {estadoBusqueda === 'loading' && (
                    <Loader className="w-5 h-5 mr-2 animate-spin" />
                  )}
                  <Database className="w-5 h-5 mr-2" />
                  Analizar
                </button>
              </div>
            </div>
          </section>

          {/* Resultados */}
          <section className="mb-8">
            <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200 p-6">
              <h3 className="text-lg sm:text-xl font-semibold mb-4 text-[#0A2342] flex items-center gap-2">
                <Code className="w-5 h-5 text-lima" />
                Resultado del análisis
              </h3>
              <ResultadoBusqueda
                estado={estadoBusqueda}
                resultado={resultadoBusqueda}
              />
            </div>
          </section>

          {/* Footer */}
          <footer className="mt-6 mb-2">
            <div className="max-w-3xl mx-auto">
              <div className="bg-[#071A31] text-gray-200 text-xs text-center py-3 rounded-xl border border-lima shadow-[0_0_25px_rgba(210,210,9,0.4)] px-4">
                Esta IA puede cometer errores. Verifica la información relevante
                antes de tomar decisiones basadas en los resultados.
              </div>
              <p className="text-[11px] text-gray-400 text-center mt-3">
                © 2025 Mirada Media Lab · Suite de Análisis IA. Todos los derechos
                reservados.
              </p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
