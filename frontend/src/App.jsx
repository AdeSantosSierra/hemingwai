// App.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import logoBlanco from './assets/logoblanco.png';
import logoNegro from './assets/logonegro.png';
import {
  Search,
  History,
  Globe2,
  Newspaper,
  Loader,
  Database,
  Code,
  Link2,
  Brain,
  ShieldCheck,
  Sun,
  Moon
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import {
  SignedIn,
  SignedOut,
  UserButton,
  useAuth
} from '@clerk/clerk-react';

import API_BASE_URL from './apiConfig';
import ResultadoBusqueda from './components/ResultadoBusqueda';
import HistoryPanel from './components/HistoryPanel';
import GlitchTitle from './components/GlitchTitle';
import RevealOnScroll from './components/RevealOnScroll';
import TerminalSectionTitle from './components/TerminalSectionTitle';
import BackgroundParticles from './components/BackgroundParticles';
import SignedOutLanding from './components/SignedOutLanding';

const HISTORY_LIMIT = 4;
const HISTORY_STORAGE_KEY_PREFIX = 'analysisHistory';
const THEME_STORAGE_KEY = 'hw-theme';

/*  
   App principal
     */
function App() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'dark') return true;
      if (savedTheme === 'light') return false;
    } catch (error) {
      console.error('No se pudo leer el tema guardado:', error);
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [identificador, setIdentificador] = useState('');
  const [resultadoBusqueda, setResultadoBusqueda] = useState(null);
  const [estadoBusqueda, setEstadoBusqueda] = useState('idle'); // 'idle', 'loading', 'success', 'error'
  const [history, setHistory] = useState([]);
  const [initialQuery, setInitialQuery] = useState(null);
  
  // State for History Dropdown
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef(null);

  const isIdle = estadoBusqueda === 'idle';
  const historyStorageKey = userId
    ? `${HISTORY_STORAGE_KEY_PREFIX}:${userId}`
    : null;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light');
    } catch (error) {
      console.error('No se pudo guardar la preferencia de tema:', error);
    }
  }, [isDarkMode]);

  const mapHistoryItemsForUI = useCallback((items) => {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .filter((item) => item && typeof item.query === 'string' && item.query.trim())
      .map((item) => ({
        id: crypto.randomUUID(),
        query: item.query.trim(),
        title: item.title ?? null,
        url: item.url ?? null,
        timestamp: Number.isFinite(Number(item.timestamp))
          ? Number(item.timestamp)
          : Date.now()
      }))
      .slice(0, HISTORY_LIMIT);
  }, []);

  // Detectar ruta /analisis/:id al montar
  useEffect(() => {
    // Detectar ruta /analisis/:id al montar
    const path = window.location.pathname;
    const match = path.match(/^\/analisis\/([^/]+)/);
    
    if (match && match[1]) {
      // Prioridad 1: ID en ruta
      setInitialQuery(match[1]);
    } else {
      // Prioridad 2: Query param ?url=
      const searchParams = new URLSearchParams(window.location.search);
      const urlParam = searchParams.get('url');
      if (urlParam) {
        setInitialQuery(urlParam);
      }
    }
  }, []);

  // Guardar copia de fallback por usuario en sessionStorage
  useEffect(() => {
    if (!historyStorageKey) {
      return;
    }
    try {
      sessionStorage.setItem(historyStorageKey, JSON.stringify(history));
    } catch (e) {
      console.error('Error al guardar historial local:', e);
    }
  }, [history, historyStorageKey]);

  // Cargar historial persistente desde backend por usuario autenticado.
  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn || !userId || !historyStorageKey) {
      setHistory([]);
      return;
    }

    let cancelled = false;

    async function loadRemoteHistory() {
      try {
        const token = await getToken();
        if (!token) {
          throw new Error('No se pudo obtener token de Clerk.');
        }

        const response = await fetch(`${API_BASE_URL}/api/history`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error(`Error al cargar historial (${response.status})`);
        }

        const data = await response.json();
        if (cancelled) {
          return;
        }

        const mapped = mapHistoryItemsForUI(data.items);
        setHistory(mapped);
      } catch (error) {
        console.error('No se pudo cargar historial remoto. Usando fallback local:', error);
        try {
          const storedHistory = sessionStorage.getItem(historyStorageKey);
          const parsed = storedHistory ? JSON.parse(storedHistory) : [];
          if (!cancelled) {
            setHistory(mapHistoryItemsForUI(parsed));
          }
        } catch (fallbackError) {
          console.error('Error al cargar historial local:', fallbackError);
          if (!cancelled) {
            setHistory([]);
          }
        }
      }
    }

    loadRemoteHistory();

    return () => {
      cancelled = true;
    };
  }, [getToken, historyStorageKey, isLoaded, isSignedIn, mapHistoryItemsForUI, userId]);

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

  const addToHistory = useCallback((item) => {
    const normalized = mapHistoryItemsForUI([item])[0];
    if (!normalized) {
      return;
    }

    setHistory((prev) => {
      // Evitar duplicados: eliminar si ya existe (para moverlo al principio)
      const filtered = prev.filter((i) => i.query !== normalized.query);
      // Añadir al principio
      const newHistory = [normalized, ...filtered];
      // Limitar a 4 items
      return newHistory.slice(0, HISTORY_LIMIT);
    });
  }, [mapHistoryItemsForUI]);

  const handleBuscarNoticia = useCallback(async (queryOverride = null) => {
    const query = (queryOverride || identificador || '').trim();
    if (!query) {
      setEstadoBusqueda('error');
      setResultadoBusqueda('El campo de búsqueda no puede estar vacío.');
      toast.error('Por favor, introduce una URL válida.');
      return;
    }

    if (!isLoaded) {
      toast.error('Inicializando sesión. Inténtalo de nuevo en unos segundos.');
      return;
    }

    if (!isSignedIn) {
      setEstadoBusqueda('error');
      setResultadoBusqueda('Inicia sesión con Google para analizar noticias.');
      toast.error('Debes iniciar sesión para usar el análisis.');
      return;
    }

    // Si es un override (historial), actualizar input
    if (queryOverride) {
      setIdentificador(queryOverride);
    }

    setEstadoBusqueda('loading');
    setResultadoBusqueda(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No se pudo obtener el token de sesión de Clerk.');
      }

      const response = await fetch(`${API_BASE_URL}/api/buscar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
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

        // /api/buscar guarda en backend; mantenemos UI sincronizada localmente.
        addToHistory({
          id: crypto.randomUUID(),
          query,
          title: data.titulo ?? null,
          url: data.url ?? null,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error al procesar la búsqueda:', error);
      setEstadoBusqueda('error');
      setResultadoBusqueda(
        error.message || 'Error de conexión con el servidor Express.'
      );
      toast.error('Error de conexión. Inténtalo de nuevo.');
    }
  }, [addToHistory, getToken, identificador, isLoaded, isSignedIn]);

  useEffect(() => {
    if (!initialQuery || !isLoaded || !isSignedIn) return;
    handleBuscarNoticia(initialQuery);
    setInitialQuery(null);
  }, [handleBuscarNoticia, initialQuery, isLoaded, isSignedIn]);

  const handleHistorySelect = (item) => {
      const selectedIdentifier = (
        (typeof item?.url === 'string' && item.url.trim())
        || (typeof item?.query === 'string' && item.query.trim())
        || ''
      );
      if (!selectedIdentifier) {
        return;
      }

      setShowHistory(false);
      // Smooth scroll si es necesario
      window.scrollTo({ top: 0, behavior: 'smooth' });
      handleBuscarNoticia(selectedIdentifier);
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[color:var(--hw-bg)] text-[color:var(--hw-text)] flex items-center justify-center px-6">
        <div className="max-w-lg w-full rounded-2xl border border-lima/40 bg-[color:var(--hw-bg-elevated)] p-6 text-center">
          <h1 className="text-2xl font-bold mb-2">Loading authentication...</h1>
          <p className="text-sm text-[color:var(--hw-text-muted)]">Preparing your session to access HemingwAI.</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <SignedIn>
    <div className="min-h-screen flex flex-col bg-animated text-[color:var(--hw-text)] font-sans overflow-x-hidden transition-colors duration-300">
      {/* Capa de Partículas (Z-Index 0, detrás del grid y contenido) */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <BackgroundParticles />
      </div>
      
      <Toaster position="top-center" richColors />
      
      {/* Barra superior */}
      <header className="w-full border-b border-[color:var(--hw-border)] bg-[color:var(--hw-bg-elevated)]/95 backdrop-blur flex items-center justify-between px-6 sm:px-10 py-3 shadow-md sticky top-0 z-50 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <img
            src={isDarkMode ? logoBlanco : logoNegro}
            alt="Mirada Media Lab"
            className="h-9 w-auto drop-shadow-sm"
          />
          <div className="hidden sm:flex flex-col">
            <span className="text-sm font-semibold tracking-tight">
              Mirada21 Media Lab
            </span>
            <span className="text-xs text-[color:var(--hw-text-muted)]">
              Análisis de noticias con IA
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[color:var(--hw-text-muted)]">
          {/* History Button and Dropdown */}
          <div className="relative flex items-center" ref={historyRef}>
            <button 
              className={`flex items-center justify-center hover:text-lima transition-colors transform hover:scale-110 duration-200 ${showHistory ? 'text-lima' : ''}`}
              title="Historial"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="w-5 h-5" />
            </button>
            
            {showHistory && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-[color:var(--hw-bg-elevated)] border border-[color:var(--hw-border)] rounded-lg shadow-2xl overflow-hidden w-64 md:w-80">
                <HistoryPanel history={history} onSelect={handleHistorySelect} />
              </div>
            )}
          </div>

          <button
            className="hover:text-lima transition-colors transform hover:scale-110 duration-200"
            title={isDarkMode ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
            onClick={() => setIsDarkMode((current) => !current)}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 relative w-full max-w-7xl mx-auto">
        
        {/* HERO SECTION */}
        {/* En Idle: se queda arriba (con margen). En Active: igual, arriba. */}
        <Motion.section 
          layout 
          className={`flex flex-col items-center text-center w-full transition-all duration-700 ${isIdle ? 'mt-20 sm:mt-24 mb-0' : 'mt-8 mb-8'}`}
          transition={{ duration: 0.6, type: "spring", stiffness: 100, damping: 20 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[color:var(--hw-bg-elevated)] border border-lima shadow-sm mb-4 animate-fade-in">
            <Newspaper className="w-4 h-4 text-lima" />
            <span className="text-xs font-semibold tracking-wide uppercase">
              IA para análisis periodístico
            </span>
          </div>
          
          <GlitchTitle 
            text={`El marcador\nde calidad de las Noticias`}
            className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-4 whitespace-pre-line"
            intensity="subtle"
          />

          <p className="text-sm sm:text-base text-[color:var(--hw-text-muted)] max-w-2xl mx-auto">
            Evalúa el rigor, detecta sesgos y verifica los acontecimientos con
            nuestro motor de IA avanzado.
          </p>
        </Motion.section>

        {/* WRAPPER PARA EL BUSCADOR */}
        {/* 
            En Idle: flex-1 (ocupa todo el espacio restante hasta el footer) + flex + justify-center 
            Esto centra verticalmente la tarjeta de búsqueda en el espacio disponible.
        */}
        <Motion.div 
          layout
          className={`w-full flex flex-col items-center transition-all duration-700 ease-in-out ${isIdle ? 'flex-1 justify-center pb-20' : 'justify-start'}`}
        >
          {/* Tarjeta de búsqueda */}
          <RevealOnScroll className="w-full flex justify-center">
            <Motion.section 
              layout
              className={`w-full transition-all duration-500 ease-in-out ${isIdle ? 'max-w-4xl' : 'max-w-5xl mb-2'}`}
            >
              <div className={`
                hw-glass rounded-[24px]
                transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl
                ${isIdle ? 'px-8 sm:px-12 py-12' : 'px-6 sm:px-8 py-6'}
              `}>
                <h2 className={`
                  font-bold text-[color:var(--hw-text)] flex items-center gap-3 transition-all duration-300
                  ${isIdle ? 'text-2xl sm:text-3xl mb-8 justify-center tracking-tight' : 'text-lg sm:text-xl mb-5'}
                `}>
                  <Globe2 className={`text-lima transition-all duration-300 ${isIdle ? 'w-7 h-7' : 'w-5 h-5'}`} />
                  {isIdle ? 'EL MARCADOR DE CALIDAD DE LAS NOTICIAS' : 'El marcador de calidad de las Noticias'}
                </h2>

                <div className={`space-y-5 ${isIdle ? 'max-w-3xl mx-auto' : ''}`}>
                  <div className="relative group">
                    <Search className={`
                      absolute left-5 text-[color:var(--hw-text-muted)] group-focus-within:text-lima transition-all duration-300
                      ${isIdle ? 'top-5 w-6 h-6' : 'top-3 w-5 h-5'}
                    `} />
                    <input
                      type="text"
                      placeholder="Pega aquí la URL de la noticia..."
                      value={identificador}
                      onChange={(e) => setIdentificador(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleBuscarNoticia()}
                      className={`
                        w-full bg-[color:var(--hw-bg-strong)] border border-[color:var(--hw-border)] text-[color:var(--hw-text)] placeholder-[color:var(--hw-text-muted)]
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
                    disabled={estadoBusqueda === 'loading' || !isLoaded || !isSignedIn}
                    className={`
                      w-full flex items-center justify-center font-bold
                      rounded-[14px]
                      hover:brightness-110 hover:scale-[1.005] active:scale-[0.99]
                      transition-all duration-200
                      disabled:bg-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed
                      bg-gradient-to-r from-[#d4e600] to-[#c6dd00] text-[#050505]
                      shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_15px_rgba(212,230,0,0.2)]
                      ${isIdle ? 'px-8 py-4 text-lg mt-6' : 'px-4 py-3 text-base'}
                    `}
                  >
                    {estadoBusqueda === 'loading' && (
                      <Loader className={`animate-spin ${isIdle ? 'w-7 h-7 mr-3' : 'w-5 h-5 mr-2'}`} />
                    )}
                    {estadoBusqueda !== 'loading' && <Database className={`${isIdle ? 'w-7 h-7 mr-3' : 'w-5 h-5 mr-2'}`} />}
                    {estadoBusqueda === 'loading'
                      ? 'Analizando...'
                      : (!isLoaded || !isSignedIn ? 'Inicia sesión para analizar' : 'Analizar Noticia')}
                  </button>
                </div>
              </div>
            </Motion.section>
          </RevealOnScroll>
        </Motion.div>

        {/* Resultados - Solo visible si no es idle */}
        <AnimatePresence>
          {!isIdle && (
            <RevealOnScroll className="w-full">
              <Motion.section 
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="w-full mt-0 mb-8"
              >
                <div className="bg-transparent p-6 transition-all duration-500">
                  <h3 className="text-lg sm:text-xl font-semibold mb-4 text-[color:var(--hw-text)] flex items-center gap-2 hw-terminal-font">
                    <Code className="w-5 h-5 text-lima" />
                    Resultado del análisis
                  </h3>
                  <ResultadoBusqueda
                    estado={estadoBusqueda}
                    resultado={resultadoBusqueda}
                  />
                </div>
              </Motion.section>
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
              <div className="bg-[color:var(--hw-bg-elevated)]/70 backdrop-blur border border-lima/30 rounded-xl p-6 hover:border-lima transition-colors h-full flex flex-col items-center text-center group">
                <div className="w-12 h-12 rounded-full bg-lima/10 flex items-center justify-center mb-4 group-hover:bg-lima/20 transition-colors">
                  <Link2 className="w-6 h-6 text-lima" />
                </div>
                <h3 className="text-lg font-bold text-[color:var(--hw-text)] mb-2">1. Leemos tu URL</h3>
                <p className="text-sm text-[color:var(--hw-text-muted)]">
                  Extraemos el titular, el cuerpo de la noticia y la fuente original para procesar la información.
                </p>
              </div>
            </RevealOnScroll>

            {/* Card 2 */}
            <RevealOnScroll delay={100} className="h-full">
              <div className="bg-[color:var(--hw-bg-elevated)]/70 backdrop-blur border border-lima/30 rounded-xl p-6 hover:border-lima transition-colors h-full flex flex-col items-center text-center group">
                 <div className="w-12 h-12 rounded-full bg-lima/10 flex items-center justify-center mb-4 group-hover:bg-lima/20 transition-colors">
                  <Brain className="w-6 h-6 text-lima" />
                </div>
                <h3 className="text-lg font-bold text-[color:var(--hw-text)] mb-2">2. Analizamos el contenido</h3>
                <p className="text-sm text-[color:var(--hw-text-muted)]">
                  La IA evalúa la calidad del titular, la precisión, el contexto y la confiabilidad de las fuentes.
                </p>
              </div>
            </RevealOnScroll>

            {/* Card 3 */}
            <RevealOnScroll delay={200} className="h-full">
              <div className="bg-[color:var(--hw-bg-elevated)]/70 backdrop-blur border border-lima/30 rounded-xl p-6 hover:border-lima transition-colors h-full flex flex-col items-center text-center group">
                 <div className="w-12 h-12 rounded-full bg-lima/10 flex items-center justify-center mb-4 group-hover:bg-lima/20 transition-colors">
                  <ShieldCheck className="w-6 h-6 text-lima" />
                </div>
                <h3 className="text-lg font-bold text-[color:var(--hw-text)] mb-2">3. Te devolvemos la valoración</h3>
                <p className="text-sm text-[color:var(--hw-text-muted)]">
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
                <div className="bg-[color:var(--hw-bg-elevated)] text-[color:var(--hw-text-muted)] text-xs text-center py-3 rounded-xl border border-lima shadow-[0_0_25px_rgba(212,230,0,0.28)] px-4 mb-3">
                Esta IA puede cometer errores. Verifica la información relevante
                antes de tomar decisiones basadas en los resultados.
              </div>
            )}
            <p className="text-[11px] text-[color:var(--hw-text-muted)] text-center">
              © 2025 Mirada Media Lab · Suite de Análisis IA. Todos los derechos
              reservados.
            </p>
          </div>
        </footer>

      </main>
    </div>
    </SignedIn>

    <SignedOut>
      <SignedOutLanding
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode((current) => !current)}
      />
    </SignedOut>
    </>
  );
}

export default App;
