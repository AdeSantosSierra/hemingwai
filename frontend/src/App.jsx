// App.jsx
import React, { useState, useEffect, useRef } from 'react';
import logo from './assets/logo2.png';
import {
  Search,
  History,
  Settings,
  HelpCircle,
  User,
  Globe2,
  Newspaper,
  Loader,
  Database,
  Code
} from 'lucide-react';
import { Toaster, toast } from 'sonner';

import API_BASE_URL from './apiConfig';
import ResultadoBusqueda from './components/ResultadoBusqueda';
import HistoryPanel from './components/HistoryPanel';

/*  
   App principal
     */
function App() {
  const [identificador, setIdentificador] = useState('');
  const [resultadoBusqueda, setResultadoBusqueda] = useState(null);
  const [estadoBusqueda, setEstadoBusqueda] = useState('idle'); // 'idle', 'loading', 'success', 'error'
  const [history, setHistory] = useState([]);
  
  // State for History Dropdown
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef(null);

  // Cargar historial desde sessionStorage al inicio
  useEffect(() => {
    try {
      const storedHistory = sessionStorage.getItem('analysisHistory');
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
    } catch (e) {
      console.error('Error al cargar historial:', e);
    }

    // Detectar ruta /analisis/:id al montar
    const path = window.location.pathname;
    const match = path.match(/^\/analisis\/([^/]+)/);
    if (match) {
      const id = match[1];
      if (id) {
        // Ejecutar búsqueda automáticamente
        handleBuscarNoticia(id);
      }
    }
  }, []);

  // Guardar historial en sessionStorage cuando cambie
  useEffect(() => {
    sessionStorage.setItem('analysisHistory', JSON.stringify(history));
  }, [history]);

  // Click outside handler for History dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (historyRef.current && !historyRef.current.contains(event.target)) {
        setShowHistory(false);
      }
    }
    
    if (showHistory) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showHistory]);

  const addToHistory = (item) => {
    setHistory((prev) => {
      // Evitar duplicados: eliminar si ya existe (para moverlo al principio)
      const filtered = prev.filter((i) => i.query !== item.query);
      // Añadir al principio
      const newHistory = [item, ...filtered];
      // Limitar a 10 items
      return newHistory.slice(0, 10);
    });
  };

  const handleBuscarNoticia = async (queryOverride = null) => {
    const query = queryOverride || identificador;
    if (!query || !query.trim()) {
      setEstadoBusqueda('error');
      setResultadoBusqueda('El campo de búsqueda no puede estar vacío.');
      toast.error('Por favor, introduce una URL válida.');
      return;
    }

    // Si es un override (historial), actualizar input
    if (queryOverride) {
      setIdentificador(queryOverride);
    }

    setEstadoBusqueda('loading');
    setResultadoBusqueda(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/buscar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificador: query })
      });

      if (response.status === 404) {
        const data = await response.json();
        setEstadoBusqueda('success');
        setResultadoBusqueda(data);
        toast('Noticia no encontrada en la base de datos.', {
           icon: '⚠️',
        });
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
        toast.error('Error en el análisis: ' + data.error);
      } else {
        setEstadoBusqueda('success');
        setResultadoBusqueda(data);
        toast.success('Análisis completado con éxito.');

        // Añadir al historial si tiene título y es válido
        if (data.titulo) {
            addToHistory({
                id: crypto.randomUUID(),
                query: query,
                title: data.titulo,
                url: data.url,
                timestamp: Date.now()
            });
        }
      }
    } catch (error) {
      console.error('Error al procesar la búsqueda:', error);
      setEstadoBusqueda('error');
      setResultadoBusqueda(
        error.message || 'Error de conexión con el servidor Express.'
      );
      toast.error('Error de conexión. Inténtalo de nuevo.');
    }
  };

  const handleHistorySelect = (item) => {
      setShowHistory(false);
      // Smooth scroll si es necesario (aunque al cargar nuevos resultados el componente ResultadoBusqueda hace scroll automático o reemplaza contenido)
      window.scrollTo({ top: 0, behavior: 'smooth' });
      handleBuscarNoticia(item.query);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0A2342] text-gray-100 font-sans">
      <Toaster position="top-center" richColors />
      
      {/* Barra superior */}
      <header className="w-full border-b border-lima/60 bg-[#071A31]/95 backdrop-blur flex items-center justify-between px-6 sm:px-10 py-3 shadow-md sticky top-0 z-50">
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
          {/* History Button and Dropdown */}
          <div className="relative" ref={historyRef}>
            <button 
              className={`hover:text-lima transition-colors transform hover:scale-110 duration-200 ${showHistory ? 'text-lima' : ''}`}
              title="Historial"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="w-5 h-5" />
            </button>
            
            {showHistory && (
              <div className="absolute right-0 mt-2 z-50 bg-[#071A31] border border-gray-700 rounded-lg shadow-2xl overflow-hidden">
                <HistoryPanel history={history} onSelect={handleHistorySelect} />
              </div>
            )}
          </div>

          <button className="hover:text-lima transition-colors transform hover:scale-110 duration-200" title="Ayuda">
            <HelpCircle className="w-5 h-5" />
          </button>
          <button className="hover:text-lima transition-colors transform hover:scale-110 duration-200" title="Ajustes">
            <Settings className="w-5 h-5" />
          </button>
          <button className="hover:text-lima transition-colors transform hover:scale-110 duration-200" title="Perfil">
            <User className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 py-8">
        <div className="w-full max-w-7xl">
          {/* Hero */}
          <section className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#071A31]/80 border border-lima shadow-sm mb-4 animate-fade-in">
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
          <section className="mb-2">
            <div className="bg-white/95 backdrop-blur-lg shadow-2xl rounded-2xl border border-lima px-6 sm:px-8 py-6 max-w-5xl mx-auto transition-all duration-300 hover:shadow-lima-500/20">
              <h2 className="text-lg sm:text-xl font-semibold mb-5 text-[#0A2342] flex items-center gap-2">
                <Globe2 className="w-5 h-5 text-lima" />
                Analizar noticia desde URL
              </h2>

              <div className="space-y-4">
                <div className="relative group">
                  <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5 group-focus-within:text-lima transition-colors" />
                  <input
                    type="text"
                    placeholder="Pega aquí la URL de la noticia..."
                    value={identificador}
                    onChange={(e) => setIdentificador(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleBuscarNoticia()}
                    className="w-full pl-10 pr-3 py-3 bg-gray-100 border border-gray-300 rounded-lg
                               focus:ring-2 focus:ring-lima-300 focus:border-lima
                               transition shadow-sm text-gray-900 text-sm"
                    disabled={estadoBusqueda === 'loading'}
                  />
                </div>

                <button
                  onClick={() => handleBuscarNoticia()}
                  disabled={estadoBusqueda === 'loading'}
                  className="w-full flex items-center justify-center px-4 py-3 
                             bg-lima text-[#0A2342] font-bold rounded-lg 
                             hover:bg-[#0A2342] hover:text-lima hover:scale-[1.01] active:scale-[0.99]
                             transition-all duration-200 
                             shadow-md disabled:bg-gray-400 disabled:text-gray-100 disabled:cursor-not-allowed"
                >
                  {estadoBusqueda === 'loading' && (
                    <Loader className="w-5 h-5 mr-2 animate-spin" />
                  )}
                  <Database className="w-5 h-5 mr-2" />
                  {estadoBusqueda === 'loading' ? 'Analizando...' : 'Analizar'}
                </button>
              </div>
            </div>
          </section>

          {/* Resultados */}
          <section className="mb-8">
            <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200 p-6 transition-all duration-500">
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
