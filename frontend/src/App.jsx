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
  Code,
  Link2,
  Brain,
  ShieldCheck
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

import API_BASE_URL from './apiConfig';
import ResultadoBusqueda from './components/ResultadoBusqueda';
import HistoryPanel from './components/HistoryPanel';
import GlitchTitle from './components/GlitchTitle';
import RevealOnScroll from './components/RevealOnScroll';
import TerminalSectionTitle from './components/TerminalSectionTitle';
import BackgroundParticles from './components/BackgroundParticles';

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

  const isIdle = estadoBusqueda === 'idle';

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
    
    if (match && match[1]) {
      // Prioridad 1: ID en ruta
      handleBuscarNoticia(match[1]);
    } else {
      // Prioridad 2: Query param ?url=
      const searchParams = new URLSearchParams(window.location.search);
      const urlParam = searchParams.get('url');
      if (urlParam) {
        handleBuscarNoticia(urlParam);
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
      // Smooth scroll si es necesario
      window.scrollTo({ top: 0, behavior: 'smooth' });
      handleBuscarNoticia(item.query);
  };

  return (
    <div className="min-h-screen flex flex-col bg-animated text-gray-100 font-sans overflow-x-hidden">
      {/* Capa de Partículas (Z-Index 0, detrás del grid y contenido) */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <BackgroundParticles />
      </div>
      
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
              <div className="absolute right-0 mt-2 z-50 bg-[#071A31] border border-gray-700 rounded-lg shadow-2xl overflow-hidden w-64 md:w-80">
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
      <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 relative w-full max-w-7xl mx-auto">
        
        {/* HERO SECTION */}
        {/* En Idle: se queda arriba (con margen). En Active: igual, arriba. */}
        <motion.section 
          layout 
          className={`flex flex-col items-center text-center w-full transition-all duration-700 ${isIdle ? 'mt-20 sm:mt-24 mb-0' : 'mt-8 mb-8'}`}
          transition={{ duration: 0.6, type: "spring", stiffness: 100, damping: 20 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#071A31]/80 border border-lima shadow-sm mb-4 animate-fade-in">
            <Newspaper className="w-4 h-4 text-lima" />
            <span className="text-xs font-semibold tracking-wide uppercase">
              IA para análisis periodístico
            </span>
          </div>
          
          <GlitchTitle 
            text="La IA que evalúa la calidad de las noticias" 
            className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-4"
            intensity="subtle"
          />

          <p className="text-sm sm:text-base text-gray-200 max-w-2xl mx-auto">
            Analiza titulares, fuentes, contexto y criterios éticos para ayudarte
            a entender la calidad informativa de cada artículo.
          </p>
        </motion.section>

        {/* WRAPPER PARA EL BUSCADOR */}
        {/* 
            En Idle: flex-1 (ocupa todo el espacio restante hasta el footer) + flex + justify-center 
            Esto centra verticalmente la tarjeta de búsqueda en el espacio disponible.
        */}
        <motion.div 
          layout
          className={`w-full flex flex-col items-center transition-all duration-700 ease-in-out ${isIdle ? 'flex-1 justify-center pb-20' : 'justify-start'}`}
        >
          {/* Tarjeta de búsqueda */}
          <RevealOnScroll className="w-full flex justify-center">
            <motion.section 
              layout
              className={`w-full transition-all duration-500 ease-in-out ${isIdle ? 'max-w-4xl' : 'max-w-5xl mb-2'}`}
            >
              <div className={`
                hw-glass rounded-[24px]
                transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl
                ${isIdle ? 'px-8 sm:px-12 py-12' : 'px-6 sm:px-8 py-6'}
              `}>
                <h2 className={`
                  font-bold text-gray-100 flex items-center gap-3 transition-all duration-300
                  ${isIdle ? 'text-2xl sm:text-3xl mb-8 justify-center tracking-tight' : 'text-lg sm:text-xl mb-5'}
                `}>
                  <Globe2 className={`text-lima transition-all duration-300 ${isIdle ? 'w-7 h-7' : 'w-5 h-5'}`} />
                  {isIdle ? 'ANALIZAR NOTICIA DESDE URL' : 'Analizar noticia desde URL'}
                </h2>

                <div className={`space-y-5 ${isIdle ? 'max-w-3xl mx-auto' : ''}`}>
                  <div className="relative group">
                    <Search className={`
                      absolute left-5 text-gray-500 group-focus-within:text-lima transition-all duration-300
                      ${isIdle ? 'top-5 w-6 h-6' : 'top-3 w-5 h-5'}
                    `} />
                    <input
                      type="text"
                      placeholder="Pega aquí la URL de la noticia..."
                      value={identificador}
                      onChange={(e) => setIdentificador(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleBuscarNoticia()}
                      className={`
                        w-full bg-[#050f1e]/60 border border-gray-600/70 text-gray-100 placeholder-gray-400
                        rounded-[14px]
                        focus:outline-none focus:ring-2 focus:ring-lima/20 focus:border-lima/40
                        transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]
                        ${isIdle ? 'pl-14 pr-4 py-5 text-lg' : 'pl-10 pr-3 py-3 text-sm'}
                      `}
                      disabled={estadoBusqueda === 'loading'}
                      autoFocus={isIdle}
                    />
                  </div>

                  <button
                    onClick={() => handleBuscarNoticia()}
                    disabled={estadoBusqueda === 'loading'}
                    className={`
                      w-full flex items-center justify-center font-bold
                      rounded-[14px]
                      hover:brightness-110 hover:scale-[1.005] active:scale-[0.99]
                      transition-all duration-200
                      disabled:bg-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed
                      bg-gradient-to-r from-[#e3e30a] to-[#c4c408] text-[#001a33]
                      shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_15px_rgba(210,210,9,0.2)]
                      ${isIdle ? 'px-8 py-4 text-lg mt-6' : 'px-4 py-3 text-base'}
                    `}
                  >
                    {estadoBusqueda === 'loading' && (
                      <Loader className={`animate-spin ${isIdle ? 'w-7 h-7 mr-3' : 'w-5 h-5 mr-2'}`} />
                    )}
                    {estadoBusqueda !== 'loading' && <Database className={`${isIdle ? 'w-7 h-7 mr-3' : 'w-5 h-5 mr-2'}`} />}
                    {estadoBusqueda === 'loading' ? 'Analizando...' : 'Analizar Noticia'}
                  </button>
                </div>
              </div>
            </motion.section>
          </RevealOnScroll>
        </motion.div>

        {/* Resultados - Solo visible si no es idle */}
        <AnimatePresence>
          {!isIdle && (
            <RevealOnScroll className="w-full">
              <motion.section 
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="w-full mt-0 mb-8"
              >
                <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200 p-6 transition-all duration-500">
                  <h3 className="text-lg sm:text-xl font-semibold mb-4 text-[#001a33] flex items-center gap-2 hw-terminal-font">
                    <Code className="w-5 h-5 text-lima" />
                    Resultado del análisis
                  </h3>
                  <ResultadoBusqueda
                    estado={estadoBusqueda}
                    resultado={resultadoBusqueda}
                  />
                </div>
              </motion.section>
            </RevealOnScroll>
          )}
        </AnimatePresence>

        {/* Sección: ¿Cómo analiza HemingwAI tus noticias? */}
        <section className="w-full mt-10 mb-12">
          <RevealOnScroll>
            <div className="flex justify-center mb-10">
              <TerminalSectionTitle className="text-xl sm:text-2xl font-bold">
                I. ¿Cómo analiza HemingwAI las noticias?
              </TerminalSectionTitle>
            </div>
          </RevealOnScroll>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Card 1 */}
            <RevealOnScroll delay={0} className="h-full">
              <div className="bg-[#001a33]/60 backdrop-blur border border-lima/30 rounded-xl p-6 hover:border-lima transition-colors h-full flex flex-col items-center text-center group">
                <div className="w-12 h-12 rounded-full bg-lima/10 flex items-center justify-center mb-4 group-hover:bg-lima/20 transition-colors">
                  <Link2 className="w-6 h-6 text-lima" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">1. Leemos tu URL</h3>
                <p className="text-sm text-gray-300">
                  Extraemos el titular, el cuerpo de la noticia y la fuente original para procesar la información.
                </p>
              </div>
            </RevealOnScroll>

            {/* Card 2 */}
            <RevealOnScroll delay={100} className="h-full">
              <div className="bg-[#001a33]/60 backdrop-blur border border-lima/30 rounded-xl p-6 hover:border-lima transition-colors h-full flex flex-col items-center text-center group">
                 <div className="w-12 h-12 rounded-full bg-lima/10 flex items-center justify-center mb-4 group-hover:bg-lima/20 transition-colors">
                  <Brain className="w-6 h-6 text-lima" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">2. Analizamos el contenido</h3>
                <p className="text-sm text-gray-300">
                  La IA evalúa la calidad del titular, la precisión, el contexto y la confiabilidad de las fuentes.
                </p>
              </div>
            </RevealOnScroll>

            {/* Card 3 */}
            <RevealOnScroll delay={200} className="h-full">
              <div className="bg-[#001a33]/60 backdrop-blur border border-lima/30 rounded-xl p-6 hover:border-lima transition-colors h-full flex flex-col items-center text-center group">
                 <div className="w-12 h-12 rounded-full bg-lima/10 flex items-center justify-center mb-4 group-hover:bg-lima/20 transition-colors">
                  <ShieldCheck className="w-6 h-6 text-lima" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">3. Te devolvemos la valoración</h3>
                <p className="text-sm text-gray-300">
                  Te mostramos una puntuación global y un desglose detallado de la información.
                </p>
              </div>
            </RevealOnScroll>
          </div>
        </section>

        {/* Footer */}
        <footer className={`mt-auto mb-6 w-full ${isIdle ? '' : ''}`}>
          <div className="max-w-3xl mx-auto">
            {!isIdle && (
                <div className="bg-[#071A31] text-gray-200 text-xs text-center py-3 rounded-xl border border-lima shadow-[0_0_25px_rgba(210,210,9,0.4)] px-4 mb-3">
                Esta IA puede cometer errores. Verifica la información relevante
                antes de tomar decisiones basadas en los resultados.
              </div>
            )}
            <p className="text-[11px] text-gray-400 text-center">
              © 2025 Mirada Media Lab · Suite de Análisis IA. Todos los derechos
              reservados.
            </p>
          </div>
        </footer>

      </main>
    </div>
  );
}

export default App;
