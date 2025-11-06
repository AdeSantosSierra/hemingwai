// App.jsx
import React, { useState } from 'react';
import {
  Search,
  Code,
  Database,
  Loader,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react';

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer
} from 'recharts';

// URL base para nuestra API de Express.js
import API_BASE_URL from './apiConfig';

/* -------------------------
   Helpers: emoticono, markdown, diccionarios
   ------------------------- */

// Emoticono según puntuación
const getEmoticonoPuntuacion = (puntuacion) => {
  const p = Number(puntuacion) || 0;
  if (p >= 85) return '🤩';
  if (p >= 75) return '😊';
  if (p >= 60) return '🙂';
  if (p >= 45) return '😐';
  return '😢';
};

// Renderizado Markdown muy básico (solo para visualización limpia en modal)
// NOTA: no es un parser completo — para Markdown completo usar una librería como remark/marked
const renderMarkdown = (text) => {
  if (!text && text !== 0) return '<p>Contenido no disponible</p>';
  let html = String(text);

  // Escapa caracteres "<" ">" para evitar XSS si el backend devuelve HTML inesperado
  // (aún así usamos dangerouslySetInnerHTML con parsers controlados)
  html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Heading (h1,h2,h3)
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>');

  // Bold **text**
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');

  // Italic *text*
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

  // Lists: - item  or * item  or numbered lists 1. item
  // Convert list items to <li> then wrap consecutive <li> in <ul>
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
  html = html.replace(/^\s*\d+\.\s+(.*)$/gim, '<li>$1</li>');

  // wrap runs of <li> in <ul>
  html = html.replace(/(<li>.*<\/li>)/gims, (m) => {
    // if already wrapped, leave
    if (m.startsWith('<ul>')) return m;
    return `<ul class="list-disc ml-6 mb-4">${m}</ul>`;
  });

  // Paragraphs: double newline -> paragraph
  const paragraphs = html.split(/\n{2,}/).map(p => `<p class="mb-3">${p.trim()}</p>`).join('');
  // Remove empty paragraphs produced by list wrapping
  return paragraphs.replace(/<p>\s*<\/p>/g, '');
};

// Formatea diccionarios/objetos en HTML legible (admite strings JSON o objetos)
const formatearDiccionario = (objOrString) => {
  let obj = objOrString;
  // si es string intentamos parsear JSON, si no, dejamos como string formateado
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch (e) {
      // puede que sea un string que vino de Python; intentamos limpiar llaves y comillas para mostrarlo
      const cleaned = obj.replace(/^[\s\r\n]*|[\s\r\n]*$/g, '')
                         .replace(/{\s*/g, '')
                         .replace(/\s*}/g, '')
                         .replace(/",\s*"/g, '",\n"')
                         .replace(/":\s*/g, '": ');
      return `<pre class="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap font-mono">${escapeHtml(cleaned)}</pre>`;
    }
  }

  if (typeof obj !== 'object' || obj === null) {
    return `<pre class="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap font-mono">${escapeHtml(String(obj))}</pre>`;
  }

  // Si es objeto, construimos bloques por clave
  let html = '';
  for (const [key, value] of Object.entries(obj)) {
    const valStr = (typeof value === 'object') ? JSON.stringify(value, null, 2) : String(value);
    html += `
      <div class="mb-4 p-3 bg-gray-50 rounded-lg">
        <div class="font-semibold text-indigo-700 mb-2">${escapeHtml(key)}</div>
        <pre class="whitespace-pre-wrap font-mono text-sm">${escapeHtml(valStr)}</pre>
      </div>
    `;
  }
  return html;
};

// Escape HTML helper
const escapeHtml = (unsafe) => {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

/* -------------------------
   Componente PuntuacionIndicador (pequeño punto+numero)
   ------------------------- */
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
      <div className={`w-3 h-3 rounded-full ${getColor(score)}`}></div>
      <span className="font-bold text-gray-700">{isNaN(score) ? 'N/A' : score}</span>
    </div>
  );
};

/* -------------------------
   ResultadoBusqueda: componente grande con modal y radar
   ------------------------- */
const ResultadoBusqueda = ({ estado, resultado }) => {
  const [seccionSeleccionada, setSeccionSeleccionada] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);

  // Estado inicial
  if (estado === 'idle') {
    return (
      <div className="p-8 bg-gray-50 text-gray-500 rounded-xl text-center shadow-inner">
        <Search className="w-8 h-8 mx-auto mb-2 text-indigo-400" />
        <p className="text-lg font-medium">Listo para buscar.</p>
        <p className="text-sm">Introduce una URL o ID para ver el análisis de una noticia.</p>
      </div>
    );
  }

  // Loading state
  if (estado === 'loading') {
    return (
      <div className="flex items-center justify-center p-8 bg-white shadow-lg rounded-xl text-indigo-600">
        <Loader className="w-6 h-6 animate-spin mr-3" />
        <span className="text-lg font-medium">Cargando... Por favor, espere.</span>
      </div>
    );
  }

  // Error state
  if (estado === 'error') {
    return (
      <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg flex items-start space-x-3">
        <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="text-lg font-bold">Error de Búsqueda</h3>
          <p className="font-mono text-sm whitespace-pre-wrap">{resultado}</p>
        </div>
      </div>
    );
  }

  // Vacío / no encontrada
  if (estado === 'success' && (!resultado || Object.keys(resultado).length === 0 || (resultado.mensaje && resultado.mensaje.toLowerCase().includes("no encontrada")))) {
    return (
      <div className="p-8 bg-gray-50 text-gray-500 rounded-xl text-center shadow-inner">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
        <p className="text-lg font-medium">Noticia no encontrada o analizada todavía.</p>
        <p className="text-sm">Verifique el ID/URL e intente de nuevo.</p>
      </div>
    );
  }

  // nombres de secciones (igual que en tu versión original)
  const nombresSecciones = {
    "1": "Interpretación del periodista",
    "2": "Opiniones",
    "3": "Cita de fuentes",
    "4": "Confiabilidad de fuentes",
    "5": "Trascendencia",
    "6": "Relevancia de los datos",
    "7": "Precisión y claridad",
    "8": "Enfoque",
    "9": "Contexto",
    "10": "Ética"
  };

  // preparar datos para radar (abreviar nombres para que quepan)
  const datosRadar = Object.keys(nombresSecciones).map((key) => ({
    seccion: nombresSecciones[key].split(' ').slice(0, 2).join(' '),
    puntuacion: resultado.puntuacion_individual?.[key] ?? 0
  }));

  const abrirModal = (titulo, contenido, esDiccionario = false) => {
    setSeccionSeleccionada({ titulo, contenido, esDiccionario });
    setMostrarModal(true);
  };

  const cerrarModal = () => {
    setMostrarModal(false);
    setSeccionSeleccionada(null);
  };

  return (
    <div className="space-y-6">
      {/* Información Básica */}
      <div className="p-6 bg-white shadow-xl rounded-xl border-l-4 border-indigo-500">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-2xl font-bold text-gray-800 flex-1">{resultado.titulo}</h3>
          <div className="ml-4 text-center">
            <div className="text-sm text-gray-500 mb-1">Puntuación General</div>
            <div className="flex items-center gap-3 justify-center">
              <span className="text-4xl">{getEmoticonoPuntuacion(resultado.puntuacion)}</span>
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    (resultado.puntuacion >= 75) ? 'bg-green-500' :
                    (resultado.puntuacion >= 60) ? 'bg-yellow-500' :
                    (resultado.puntuacion >= 45) ? 'bg-orange-500' :
                    'bg-red-500'
                  }`}
                />
                <span className="text-3xl font-bold text-indigo-600">{resultado.puntuacion ?? 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-semibold text-gray-600">Fecha de publicación:</span>
            <p className="text-gray-800">{resultado.fecha_publicacion ? new Date(resultado.fecha_publicacion).toLocaleDateString('es-ES') : 'N/A'}</p>
          </div>
          <div>
            <span className="font-semibold text-gray-600">Fuente:</span>
            <p className="text-gray-800">{resultado.fuente || 'N/A'}</p>
          </div>
          <div className="col-span-2">
            <span className="font-semibold text-gray-600">Autor(es):</span>
            <p className="text-gray-800">
              {resultado.autor && resultado.autor.length > 0 ? resultado.autor.join(', ') : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Gráfico de Araña (Radar) */}
      {resultado.puntuacion_individual && (
        <div className="bg-white shadow-xl rounded-xl p-6">
          <h4 className="text-xl font-bold text-gray-800 mb-4 text-center">Análisis Visual de Calidad</h4>
          <div style={{ width: '100%', height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={datosRadar}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="seccion" tick={{ fill: '#374151', fontSize: 12 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#6b7280' }} />
                <Radar name="Puntuación" dataKey="puntuacion" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.6} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Valoraciones Individuales */}
      <div className="bg-white shadow-xl rounded-xl p-6">
        <h4 className="text-xl font-bold text-gray-800 mb-4">Valoraciones por Sección</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {resultado.puntuacion_individual && Object.keys(nombresSecciones).map((key) => {
            const puntuacion = resultado.puntuacion_individual?.[key];
            const valoracion = resultado.valoraciones?.[key];

            return (
              <button
                key={key}
                onClick={() => abrirModal(nombresSecciones[key], valoracion || 'Contenido no disponible', false)}
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:shadow-lg transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!valoracion}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700">{nombresSecciones[key]}</span>
                  {puntuacion ? <PuntuacionIndicador puntuacion={puntuacion} /> : <span className="text-gray-400 text-xs">N/A</span>}
                </div>
                {!valoracion && <p className="text-xs text-gray-400 mt-2">No disponible</p>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Otras Secciones */}
      <div className="bg-white shadow-xl rounded-xl p-6">
        <h4 className="text-xl font-bold text-gray-800 mb-4">Análisis Adicional</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => abrirModal('Valoración General', resultado.valoracion_general)}
            disabled={!resultado.valoracion_general}
            className="p-4 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:shadow-lg transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="font-semibold text-gray-700">📊 Valoración General</div>
            {!resultado.valoracion_general && <p className="text-xs text-gray-400 mt-1">No disponible</p>}
          </button>

          <button
            onClick={() => abrirModal('Valoración del Titular', resultado.valoracion_titular?.titular)}
            disabled={!resultado.valoracion_titular?.titular}
            className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-lg transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="font-semibold text-gray-700">📰 Valoración del Titular</div>
            {!resultado.valoracion_titular?.titular && <p className="text-xs text-gray-400 mt-1">No disponible</p>}
          </button>

          <button
            onClick={() => abrirModal('Análisis de Fact-Checking', resultado.fact_check_analisis)}
            disabled={!resultado.fact_check_analisis}
            className="p-4 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:shadow-lg transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="font-semibold text-gray-700">🔍 Fact-Check Análisis</div>
            {!resultado.fact_check_analisis && <p className="text-xs text-gray-400 mt-1">No disponible</p>}
          </button>

          <button
            onClick={() => abrirModal('Fuentes de Fact-Checking', (resultado.fact_check_fuentes || []).join('\n'))}
            disabled={!resultado.fact_check_fuentes || resultado.fact_check_fuentes.length === 0}
            className="p-4 border-2 border-gray-200 rounded-lg hover:border-orange-500 hover:shadow-lg transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="font-semibold text-gray-700">📚 Fuentes de Fact-Checking</div>
            {(!resultado.fact_check_fuentes || resultado.fact_check_fuentes.length === 0) && <p className="text-xs text-gray-400 mt-1">No disponible</p>}
          </button>

          <button
            onClick={() => abrirModal('Texto de Referencia', resultado.texto_referencia_diccionario, true)}
            disabled={!resultado.texto_referencia_diccionario}
            className="p-4 border-2 border-gray-200 rounded-lg hover:border-pink-500 hover:shadow-lg transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed col-span-1 md:col-span-2"
          >
            <div className="font-semibold text-gray-700">📝 Texto de Referencia</div>
            {!resultado.texto_referencia_diccionario && <p className="text-xs text-gray-400 mt-1">No disponible</p>}
          </button>
        </div>
      </div>

      {/* Modal para mostrar contenido */}
      {mostrarModal && seccionSeleccionada && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={cerrarModal}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between bg-indigo-50">
              <h3 className="text-2xl font-bold text-gray-800">{seccionSeleccionada.titulo}</h3>
              <button onClick={cerrarModal} className="text-gray-500 hover:text-gray-700 transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
              <div className="prose max-w-none text-gray-700">
                <div
                  dangerouslySetInnerHTML={{
                    __html: seccionSeleccionada.esDiccionario
                      ? formatearDiccionario(seccionSeleccionada.contenido)
                      : renderMarkdown(seccionSeleccionada.contenido)
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* -------------------------
   Componente principal App (con lógica de fetch a la API)
   ------------------------- */
function App() {
  // Estados para la entrada del usuario y el resultado
  const [identificador, setIdentificador] = useState('');
  const [resultadoBusqueda, setResultadoBusqueda] = useState(null);
  const [estadoBusqueda, setEstadoBusqueda] = useState('idle'); // 'idle', 'loading', 'success', 'error'

  // Función asíncrona para buscar la noticia
  const handleBuscarNoticia = async () => {
    if (!identificador.trim()) {
      setEstadoBusqueda('error');
      setResultadoBusqueda("El campo de búsqueda no puede estar vacío.");
      return;
    }

    setEstadoBusqueda('loading');
    setResultadoBusqueda(null);

    try {
      // Llamada a la API de búsqueda
      const response = await fetch(`${API_BASE_URL}/api/buscar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificador })
      });

      // Si la respuesta es 404 (No Encontrado), lo tratamos como un éxito de búsqueda
      if (response.status === 404) {
        const data = await response.json();
        setEstadoBusqueda('success');
        setResultadoBusqueda(data); // data contendrá { mensaje: "Noticia no encontrada." }
        return;
      }

      // Para otros errores (500, etc.), lanzamos un error para que lo capture el catch
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
      console.error("Error al procesar la búsqueda:", error);
      setEstadoBusqueda('error');
      setResultadoBusqueda(error.message || "Error de conexión con el servidor Express.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      {/* Cabecera Principal */}
      <header className="text-center mb-10">
        <h1 className="text-5xl font-extrabold text-indigo-800">Hemingwai: Motor de Análisis de Noticias</h1>
        <p className="text-sm mt-2 text-gray-600">React, Express y Python trabajando juntos.</p>
      </header>

      {/* Contenedor Principal */}
      <main className="max-w-4xl mx-auto space-y-8">
        <div className="p-6 bg-white shadow-2xl rounded-xl border-t-4 border-indigo-500">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800 flex items-center">
            <Search className="w-5 h-5 mr-2 text-indigo-500" /> Buscar Noticia
          </h2>

          <input
            type="text"
            placeholder="Introduce URL o ID de la noticia..."
            value={identificador}
            onChange={(e) => setIdentificador(e.target.value)}
            className="w-full p-3 mb-4 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:ring focus:ring-indigo-200 transition duration-150 shadow-sm"
            disabled={estadoBusqueda === 'loading'}
          />

          <div className="flex space-x-4">
            <button
              onClick={handleBuscarNoticia}
              disabled={estadoBusqueda === 'loading'}
              className="w-full flex items-center justify-center px-4 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition duration-200 shadow-md disabled:bg-gray-400"
            >
              {estadoBusqueda === 'loading' && <Loader className="w-5 h-5 mr-2 animate-spin" />}
              <Database className="w-5 h-5 mr-2" />
              Buscar Noticia
            </button>
          </div>
        </div>

        {/* Área de Resultados */}
        <div className="min-h-[200px] border-t-4 border-gray-300 pt-6">
          <h3 className="text-xl font-semibold mb-4 text-gray-700 flex items-center">
            <Code className="w-5 h-5 mr-2 text-gray-500" /> Resultado de la Búsqueda
          </h3>

          <ResultadoBusqueda estado={estadoBusqueda} resultado={resultadoBusqueda} />
        </div>
      </main>
    </div>
  );
}

export default App;
  