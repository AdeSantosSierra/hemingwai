// App.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import logoBlanco from './assets/logoblanco.png';
import logoNegro from './assets/logonegro.png';
import {
  Search,
  History,
  Loader,
  ArrowRight,
  Database,
  Code,
  FileDown,
  Cpu,
  BarChart3,
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
import RevealOnScroll from './components/RevealOnScroll';
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
  const [chatbotAccess, setChatbotAccess] = useState({
    isLoading: true,
    canUseChatbot: false,
  });
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

  useEffect(() => {
    if (!isLoaded) {
      setChatbotAccess({ isLoading: true, canUseChatbot: false });
      return;
    }

    if (!isSignedIn || !userId) {
      setChatbotAccess({ isLoading: false, canUseChatbot: false });
      return;
    }

    let cancelled = false;

    async function loadChatbotAccess() {
      setChatbotAccess((prev) => ({ ...prev, isLoading: true }));

      try {
        const token = await getToken();
        if (!token) {
          throw new Error('No se pudo obtener token de Clerk.');
        }

        const response = await fetch(`${API_BASE_URL}/api/chatbot/access`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error(`Error al cargar permiso de chatbot (${response.status})`);
        }

        const data = await response.json();
        if (cancelled) {
          return;
        }

        setChatbotAccess({
          isLoading: false,
          canUseChatbot: data.canUseChatbot === true,
        });
      } catch (error) {
        console.error('No se pudo cargar permiso de chatbot. Se aplica modo restringido:', error);
        if (cancelled) {
          return;
        }

        // Fail-closed: sin confirmación del backend, no habilitamos chatbot.
        setChatbotAccess({ isLoading: false, canUseChatbot: false });
      }
    }

    loadChatbotAccess();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, userId]);

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
      <header className="w-full border-b border-[color:var(--hw-border)] bg-[color:var(--hw-bg-elevated)]/95 backdrop-blur flex items-center justify-between px-8 sm:px-12 py-4 shadow-md sticky top-0 z-50 transition-colors duration-300">
        <div className="flex items-center gap-4">
          <img
            src={isDarkMode ? logoBlanco : logoNegro}
            alt="Mirada Media Lab"
            className="h-[44px] w-auto drop-shadow-sm"
          />
          <div className="hidden sm:flex flex-col">
            <span className="text-[18px] leading-tight font-semibold tracking-tight">
              Mirada21 Media Lab
            </span>
            <span className="text-[14px] leading-tight text-[color:var(--hw-text-muted)]">
              Análisis de noticias con IA
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6 sm:gap-7 text-[color:var(--hw-text-muted)]">
          {/* History Button and Dropdown */}
          <div className="relative flex items-center" ref={historyRef}>
            <button 
              className={`flex items-center justify-center hover:text-lima transition-colors transform hover:scale-110 duration-200 ${showHistory ? 'text-lima' : ''}`}
              title="Historial"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="w-6 h-6" />
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
            {isDarkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
          </button>
          <div className="scale-[1.25] origin-center">
            <UserButton afterSignOutUrl="/" />
          </div>
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
          <h1 className="text-4xl sm:text-6xl font-light tracking-tight leading-tight mb-6 sm:mb-8 text-[color:var(--hw-text)]">
            El <span className="font-bold">marcador</span>
            <br />
            de calidad de las <span className="font-bold text-lima">Noticias</span>
          </h1>

          <p className="text-sm sm:text-base md:text-xl text-[color:var(--hw-text-muted)] max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed">
            Evalúa el rigor, detecta sesgos y verifica los acontecimientos con nuestro{' '}
            <span className="text-[color:var(--hw-text)] border-b border-lima/50 font-medium">
              motor de IA avanzado
            </span>
            .
          </p>
        </Motion.section>

        {/* WRAPPER PARA EL BUSCADOR */}
        {/* 
            En Idle: flex-1 (ocupa todo el espacio restante hasta el footer) + flex + justify-center 
            Esto centra verticalmente la tarjeta de búsqueda en el espacio disponible.
        */}
        <Motion.div 
          layout
          className={`w-full flex flex-col items-center transition-all duration-700 ease-in-out ${isIdle ? 'flex-1 justify-center pb-20' : 'justify-start pt-2 sm:pt-4'}`}
        >
          {/* Tarjeta de búsqueda */}
          <RevealOnScroll className="w-full flex justify-center">
            <Motion.section 
              layout
              className={`w-full transition-all duration-500 ease-in-out ${isIdle ? 'max-w-4xl' : 'max-w-5xl mb-2'}`}
            >
              <div className={`${isIdle ? 'max-w-3xl mx-auto' : ''}`}>
                <div className="bg-[color:var(--hw-bg-elevated)] border border-[color:var(--hw-border)] rounded-xl sm:rounded-full p-1.5 sm:p-2 pl-3 sm:pl-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shadow-[0_12px_30px_rgba(0,0,0,0.14)] focus-within:border-lima transition-colors">
                  <div className="flex items-center flex-grow min-w-0">
                    <Search className="text-lima mr-3 w-5 h-5 sm:w-6 sm:h-6 transform -rotate-45" />
                    <input
                      type="text"
                      placeholder="Introduce aquí la URL de la noticia"
                      value={identificador}
                      onChange={(e) => setIdentificador(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleBuscarNoticia()}
                      className="bg-transparent border-none focus:ring-0 flex-grow text-[color:var(--hw-text)] placeholder-[color:var(--hw-text-muted)] font-mono text-xs sm:text-sm w-full truncate"
                      disabled={estadoBusqueda === 'loading'}
                      autoFocus={isIdle}
                    />
                  </div>

                  <button
                    onClick={() => handleBuscarNoticia()}
                    disabled={estadoBusqueda === 'loading' || !isLoaded || !isSignedIn}
                    className="bg-gradient-to-r from-[#d4e600] to-[#c6dd00] text-[#050505] font-bold py-2.5 sm:py-3 px-4 sm:px-8 rounded-lg sm:rounded-full hover:bg-opacity-90 transition-transform active:scale-95 flex items-center justify-center gap-2 text-xs sm:text-sm tracking-wide disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {estadoBusqueda === 'loading' ? (
                      <>
                        <Loader className="animate-spin w-4 h-4 sm:w-5 sm:h-5" />
                        <span>ANALIZANDO</span>
                      </>
                    ) : (
                      <>
                        <span>{(!isLoaded || !isSignedIn) ? 'INICIA SESIÓN' : 'ANALIZAR'}</span>
                        <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                      </>
                    )}
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
                    chatbotAccess={chatbotAccess}
                  />
                </div>
              </Motion.section>
            </RevealOnScroll>
          )}
        </AnimatePresence>

        {/* Flujo de análisis */}
        <section className="w-full max-w-4xl mt-12 py-8 opacity-95 mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 text-center">
            <RevealOnScroll delay={0} className="space-y-4">
              <div className="w-12 h-12 rounded-full border-2 border-lima/40 flex items-center justify-center mx-auto bg-[color:var(--hw-bg-elevated)] shadow-[0_0_20px_rgba(212,230,0,0.1)] aspect-square">
                <FileDown className="w-5 h-5 text-lima" />
              </div>
              <h4 className="text-[13px] font-mono uppercase tracking-[0.4em] font-bold text-[color:var(--hw-text)]">Extracción</h4>
              <p className="text-[14px] text-[color:var(--hw-text-muted)] font-light leading-relaxed px-4">
                Obtención de metadatos y limpieza de texto original.
              </p>
            </RevealOnScroll>

            <RevealOnScroll delay={100} className="space-y-4">
              <div className="w-12 h-12 rounded-full border-2 border-lima/40 flex items-center justify-center mx-auto bg-[color:var(--hw-bg-elevated)] shadow-[0_0_20px_rgba(212,230,0,0.1)] aspect-square">
                <Cpu className="w-5 h-5 text-lima" />
              </div>
              <h4 className="text-[13px] font-mono uppercase tracking-[0.4em] font-bold text-[color:var(--hw-text)]">Procesamiento</h4>
              <p className="text-[14px] text-[color:var(--hw-text-muted)] font-light leading-relaxed px-4">
                Análisis de la noticia usando nuestro motor basado en IA.
              </p>
            </RevealOnScroll>

            <RevealOnScroll delay={200} className="space-y-4">
              <div className="w-12 h-12 rounded-full border-2 border-lima/40 flex items-center justify-center mx-auto bg-[color:var(--hw-bg-elevated)] shadow-[0_0_20px_rgba(212,230,0,0.1)] aspect-square">
                <BarChart3 className="w-5 h-5 text-lima" />
              </div>
              <h4 className="text-[13px] font-mono uppercase tracking-[0.4em] font-bold text-[color:var(--hw-text)]">Resultados</h4>
              <p className="text-[14px] text-[color:var(--hw-text-muted)] font-light leading-relaxed px-4">
                Generación de puntuaciones y alertas de calidad.
              </p>
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
