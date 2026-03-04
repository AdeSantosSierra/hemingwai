
import React, { useState, useEffect, useRef } from 'react';
import { extractArticleFromUrl, scoreArticle, scoreHeadline } from './services/geminiService';
import { buildEvaluationResult } from './logic/newscoreEngine';
import { EvaluationResult } from './types';
import HUDWidget from './components/HUDWidget';
import DetailSection from './components/DetailSection';
import LandingPage from './components/LandingPage';
import { CATEGORIES } from './constants';

const App: React.FC = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(true); // Por defecto modo oscuro
  const resultRef = useRef<HTMLDivElement>(null);

  // Efecto para aplicar el tema al documento
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Efecto para scroll automático cuando el resultado está listo
  useEffect(() => {
    if (result && !loading) {
      const timer = setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [result, loading]);

  const toggleTheme = () => setIsDark(!isDark);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const extracted = await extractArticleFromUrl(url.trim());
      
      const bodyScores = await scoreArticle(extracted.article_text);
      const bodyEval = buildEvaluationResult(bodyScores, {
        url: extracted.url || url.trim(),
        title: extracted.title,
        source: extracted.source,
        author: extracted.author,
        date: extracted.date,
      });

      const headScores = await scoreHeadline(extracted.title, extracted.article_text);
      const headEval = buildEvaluationResult(headScores, {
        url: extracted.url || url.trim(),
        title: extracted.title,
        source: extracted.source,
        author: extracted.author,
        date: extracted.date,
      });

      bodyEval.extras = { 
        ...bodyEval.extras, 
        headline_result: headEval,
        grounding: extracted.grounding,
        article_text: extracted.article_text
      };
      
      setResult(bodyEval);
    } catch (err: any) {
      setError(err.message || "Error durante el análisis neuronal.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setUrl('');
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <LandingPage 
      url={url} 
      onUrlChange={setUrl} 
      onAnalyze={handleAnalyze} 
      loading={loading}
      isDark={isDark}
      onToggleTheme={toggleTheme}
    >
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 mt-4 space-y-6 animate-in fade-in duration-500">
          <div className="relative w-40 h-40 flex items-center justify-center">
            <div className="absolute inset-0 border border-black/5 dark:border-white/5 rounded-full animate-[spin_10s_linear_infinite]"></div>
            <div className="absolute inset-4 border border-black/5 dark:border-white/5 rounded-full animate-[spin_15s_linear_infinite_reverse]"></div>
            <div className="absolute inset-0 border-[3px] border-primary/20 dark:border-primary/10 rounded-full"></div>
            <div className="absolute inset-0 border-[3px] border-primary border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(212,230,0,0.4)]"></div>
            <div className="absolute inset-8 border border-cyan-500/40 dark:border-cyan-400/40 rounded-full animate-pulse flex items-center justify-center">
              <span className="material-icons text-primary/50 animate-pulse text-2xl">sensors</span>
            </div>
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-lg font-mono uppercase tracking-[0.5em] text-primary animate-pulse font-bold">Analizando noticia</h2>
            <div className="flex flex-col gap-1">
               <p className="text-[9px] font-mono text-gray-500 uppercase tracking-widest font-bold">Protocolo de evaluación neuronal v2.1</p>
               <p className="text-[8px] font-mono text-primary/60 dark:text-primary/40 uppercase tracking-[0.3em] font-bold">Extrayendo metadatos y verificando hechos...</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-6">
          <span className="material-icons text-red-500 text-6xl">error_outline</span>
          <h2 className="text-2xl font-bold uppercase tracking-widest text-red-500">Error de Escaneo</h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto font-mono text-sm">"{error}"</p>
          <button 
            onClick={() => setError(null)}
            className="text-[11px] font-mono uppercase tracking-widest border border-gray-300 dark:border-white/20 px-8 py-3 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            Reintentar Protocolo
          </button>
        </div>
      )}

      {result && !loading && (
        <div ref={resultRef} className="space-y-10 animate-in fade-in slide-in-from-top-4 duration-1000 scroll-mt-6">
          <div className="w-full border-t border-gray-200 dark:border-white/5 pt-10 flex flex-col md:flex-row flex-wrap gap-x-16 gap-y-8 text-left">
            <div className="space-y-2 w-full">
              <span className="block text-primary text-[12px] uppercase tracking-widest font-bold">Noticia Analizada</span>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight max-w-7xl font-display text-gray-900 dark:text-white">
                {result.meta.title}
              </h2>
            </div>
            <div className="flex flex-wrap gap-12 md:gap-16">
              <div className="space-y-1">
                <span className="block text-primary text-[10px] uppercase tracking-widest font-bold opacity-70">Fuente</span>
                <span className="text-xl text-gray-600 dark:text-gray-300 font-light">{result.meta.source}</span>
              </div>
              <div className="space-y-1">
                <span className="block text-primary text-[10px] uppercase tracking-widest font-bold opacity-70">Autor</span>
                <span className="text-xl text-gray-600 dark:text-gray-300 font-light">{result.meta.author || "Redacción"}</span>
              </div>
              <div className="space-y-1">
                <span className="block text-primary text-[10px] uppercase tracking-widest font-bold opacity-70">Fecha</span>
                <span className="text-xl text-gray-600 dark:text-gray-300 font-light">{result.meta.date}</span>
              </div>
            </div>

            {result.extras?.grounding && result.extras.grounding.length > 0 && (
              <div className="w-full mt-4 flex flex-wrap items-center gap-6">
                <span className="text-[13px] font-mono uppercase text-gray-400 dark:text-gray-500 tracking-widest font-bold">Fuentes de Verificación:</span>
                <div className="flex flex-wrap gap-4">
                  {result.extras.grounding.map((chunk: any, idx: number) => chunk.web && (
                    <a 
                      key={idx} 
                      href={chunk.web.uri} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[13px] text-primary hover:text-primary/80 dark:text-primary/60 dark:hover:text-primary font-mono truncate max-w-[280px] border border-gray-200 dark:border-white/10 px-4 py-2 rounded-lg transition-colors bg-white dark:bg-transparent shadow-sm dark:shadow-none"
                    >
                      {chunk.web.title || "Link"}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <section className="flex flex-col items-center justify-center bg-white dark:bg-surface-dark/40 p-6 sm:p-10 py-16 sm:py-20 rounded-[2rem] sm:rounded-[3rem] border border-gray-200 dark:border-white/5 shadow-xl dark:shadow-2xl relative overflow-hidden">
            <HUDWidget result={result} />
          </section>

          <DetailSection result={result} />

          <div className="flex justify-center pt-2 pb-24">
            <button 
              onClick={reset}
              className="flex items-center justify-center gap-4 px-12 sm:px-24 py-5 sm:py-6 bg-white dark:bg-surface-dark border border-gray-200 dark:border-white/10 text-[14px] font-mono uppercase tracking-[0.4em] hover:bg-gray-50 dark:hover:bg-white/10 transition-all text-gray-900 dark:text-white hover:text-primary shadow-xl dark:shadow-2xl active:scale-95 font-bold"
            >
              <span className="material-icons text-xl">refresh</span>
              Nuevo Análisis
            </button>
          </div>
        </div>
      )}
    </LandingPage>
  );
};

export default App;
