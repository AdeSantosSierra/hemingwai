
import React from 'react';

interface LandingPageProps {
  url: string;
  onUrlChange: (url: string) => void;
  onAnalyze: () => void;
  loading: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
  children?: React.ReactNode;
}

const LandingPage: React.FC<LandingPageProps> = ({ url, onUrlChange, onAnalyze, loading, isDark, onToggleTheme, children }) => {
  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark text-gray-900 dark:text-white selection:bg-primary/30 transition-colors duration-500">
      {/* HUD Scanline Overlay - visible en ambos pero más suave en claro */}
      <div className="fixed inset-0 pointer-events-none z-50 opacity-10 bg-scanlines"></div>
      
      <header className="w-full px-4 md:px-12 py-8 flex justify-between items-center z-20">
        <div className="flex items-center gap-6 md:gap-8">
          <div className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Newscore<span className="text-primary">.</span></div>
          <div className="hidden lg:flex items-center gap-6 text-[12px] tracking-widest font-mono text-gray-400 dark:text-gray-500 uppercase font-bold">
            <span className="w-px h-8 bg-gray-300 dark:bg-gray-700"></span>
            <span>Mirada21 Media Lab</span>
            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
            <span>Análisis IA v2.1</span>
          </div>
        </div>
        <div className="flex items-center gap-6 text-gray-500 dark:text-gray-400">
          {/* Theme Toggle Button */}
          <button 
            onClick={onToggleTheme}
            className="w-12 h-12 rounded-full border border-gray-200 dark:border-gray-800 flex items-center justify-center hover:border-primary hover:text-primary transition-all duration-300 shadow-sm bg-white/50 dark:bg-transparent"
            title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            <span className="material-icons text-2xl">
              {isDark ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
          <button className="flex items-center justify-center hover:text-gray-900 dark:hover:text-white transition-colors">
            <span className="material-icons text-2xl">history</span>
          </button>
          <div className="w-10 h-10 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center cursor-pointer hover:border-primary transition-colors bg-white/50 dark:bg-transparent">
            <span className="material-icons text-base">person</span>
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center relative px-4 md:px-8 pt-6 pb-24">
        {/* Background Grid */}
        <div className="absolute inset-0 text-gray-200 dark:text-gray-800 bg-grid-pattern opacity-[0.2] dark:opacity-[0.03] bg-grid pointer-events-none"></div>

        {/* Hero Section */}
        <div className="max-w-4xl w-full mx-auto text-center z-10 mb-6">
          <h1 className="text-3xl sm:text-5xl md:text-7xl font-light tracking-tight leading-tight mb-4 md:mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 text-gray-900 dark:text-white">
            El <span className="font-bold">marcador</span><br/>
            de calidad de las <span className="font-bold text-primary">Noticias</span>
          </h1>
          <p className="text-sm md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto font-light leading-relaxed mb-6 md:mb-10 animate-in fade-in duration-1000">
            Evalúa el rigor, detecta sesgos y verifica los acontecimientos con nuestro <span className="text-gray-900 dark:text-white border-b border-primary/50">motor de IA avanzado</span>.
          </p>
          
          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl sm:rounded-full p-1.5 sm:p-2 pl-3 sm:pl-6 flex flex-col sm:flex-row items-stretch sm:items-center shadow-xl dark:shadow-none max-w-2xl mx-auto mt-4 focus-within:border-primary transition-colors group gap-2 w-full box-border">
            <div className="flex items-center flex-grow min-w-0">
              <span className="material-icons text-primary mr-3 transform -rotate-45 hidden sm:block">link</span>
              <input 
                className="bg-transparent border-none focus:ring-0 flex-grow text-gray-700 dark:text-gray-300 font-mono text-xs sm:text-sm placeholder-gray-400 dark:placeholder-gray-500 w-full truncate" 
                placeholder="Introduce aquí la url de la noticia" 
                type="text"
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onAnalyze()}
              />
            </div>
            <button 
              onClick={onAnalyze}
              disabled={loading || !url.trim()}
              className="bg-primary text-black font-bold py-2.5 sm:py-3 px-4 sm:px-8 rounded-lg sm:rounded-full hover:bg-opacity-90 transition-transform active:scale-95 flex items-center justify-center gap-2 text-xs sm:text-[15px] tracking-wide disabled:opacity-50 shrink-0"
            >
              {loading ? (
                <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>ANALIZAR</span>
                  <span className="material-icons text-sm sm:text-base">arrow_forward</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Contenedor dinámico de resultados */}
        <div className="w-full max-w-7xl mx-auto z-10 overflow-hidden">
          {children}
        </div>

        {/* Diagrama de Flujo */}
        <div className="w-full max-w-4xl mt-12 py-8 opacity-95">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 text-center">
              <div className="space-y-4">
                 <div className="w-12 h-12 rounded-full border-2 border-primary/40 flex items-center justify-center mx-auto bg-white dark:bg-surface-dark shadow-[0_0_20px_rgba(212,230,0,0.1)] ring-2 ring-black/5 dark:ring-white/5 aspect-square">
                    <span className="material-icons text-primary text-2xl">file_download</span>
                 </div>
                 <h4 className="text-[13px] font-mono uppercase tracking-[0.4em] font-bold text-gray-900 dark:text-white">Extracción</h4>
                 <p className="text-[14px] text-gray-600 dark:text-gray-400 font-light leading-relaxed px-4">Obtención de metadatos y limpieza de texto original.</p>
              </div>
              <div className="space-y-4">
                 <div className="w-12 h-12 rounded-full border-2 border-primary/40 flex items-center justify-center mx-auto bg-white dark:bg-surface-dark shadow-[0_0_20px_rgba(212,230,0,0.1)] ring-2 ring-black/5 dark:ring-white/5 aspect-square">
                    <span className="material-icons text-primary text-2xl">psychology</span>
                 </div>
                 <h4 className="text-[13px] font-mono uppercase tracking-[0.4em] font-bold text-gray-900 dark:text-white">Procesamiento</h4>
                 <p className="text-[14px] text-gray-600 dark:text-gray-400 font-light leading-relaxed px-4">Análisis neuronal de fiabilidad y trascendencia.</p>
              </div>
              <div className="space-y-4">
                 <div className="w-12 h-12 rounded-full border-2 border-primary/40 flex items-center justify-center mx-auto bg-white dark:bg-surface-dark shadow-[0_0_20px_rgba(212,230,0,0.1)] ring-2 ring-black/5 dark:ring-white/5 aspect-square">
                    <span className="material-icons text-primary text-2xl">analytics</span>
                 </div>
                 <h4 className="text-[13px] font-mono uppercase tracking-[0.4em] font-bold text-gray-900 dark:text-white">Resultados</h4>
                 <p className="text-[14px] text-gray-600 dark:text-gray-400 font-light leading-relaxed px-4">Generación de puntuaciones y alertas de calidad.</p>
              </div>
           </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-gray-200 dark:border-white/5 p-10 text-center opacity-30 font-mono text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400">
        Newscore HUD // journalism_validation_engine // mirada21_media_lab
      </footer>
    </div>
  );
};

export default LandingPage;
