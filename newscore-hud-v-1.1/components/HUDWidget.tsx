
import React, { useState, useEffect } from 'react';
import { EvaluationResult } from '../types';
import { CATEGORIES } from '../constants';

interface HUDWidgetProps {
  result: EvaluationResult;
}

const HUDWidget: React.FC<HUDWidgetProps> = ({ result }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);

  // SVG Constants
  const RADIUS = 85;
  const CENTER = 100;
  const MAX_DASH = 95; 

  useEffect(() => {
    setAnimating(true);
    const timer = setTimeout(() => setAnimating(false), 800);
    return () => clearTimeout(timer);
  }, [result]);

  const currentCategory = hoveredIdx !== null ? CATEGORIES[hoveredIdx] : null;
  const selectedCategory = selectedIdx !== null ? CATEGORIES[selectedIdx] : null;

  return (
    <div className="relative w-full max-w-[580px] aspect-square flex items-center justify-center font-display select-none group/hud">
      {/* Decorative Rotating Rings */}
      <div className="absolute inset-0 border border-black/5 dark:border-white/5 rounded-full animate-[spin_30s_linear_infinite] opacity-10"></div>
      <div className="absolute inset-8 border border-black/5 dark:border-white/5 rounded-full animate-[spin_20s_linear_infinite_reverse] opacity-10"></div>
      
      {/* Background Glow */}
      <div className="absolute inset-16 bg-primary/5 blur-[120px] rounded-full opacity-0 group-hover/hud:opacity-100 transition-opacity duration-1000"></div>

      {/* CALL TO ACTION */}
      <div className="absolute -bottom-16 text-center w-full animate-bounce z-30 px-4">
        <span className="text-[10px] sm:text-[14px] font-mono uppercase tracking-[0.2em] sm:tracking-[0.3em] text-primary dark:text-primary font-bold whitespace-nowrap">
          Ratón sobre color:evaluación. Clic:Análisis
        </span>
      </div>

      {/* Main SVG Container */}
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full drop-shadow-[0_0_30px_rgba(0,0,0,0.1)] dark:drop-shadow-[0_0_50px_rgba(0,0,0,0.7)] z-10"
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          className="text-gray-100 dark:text-white/5"
          strokeWidth="6"
        />

        {CATEGORIES.map((cat, i) => {
          const score = result.scores[cat.id].value;
          const rotation = -90 + (i * 72); 
          const dashArray = `${MAX_DASH} 500`;
          const offset = MAX_DASH - (MAX_DASH * (score / 10));
          const isSelected = hoveredIdx === i || selectedIdx === i;

          return (
            <g
              key={cat.id}
              className="cursor-pointer transition-all duration-300"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => setSelectedIdx(i)}
            >
              <circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke="transparent"
                strokeWidth="24"
                strokeDasharray={dashArray}
                transform={`rotate(${rotation} ${CENTER} ${CENTER})`}
              />
              <circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={cat.color}
                strokeWidth={isSelected ? "12" : "9"}
                strokeDasharray={dashArray}
                strokeDashoffset={animating ? MAX_DASH : offset}
                strokeLinecap="round"
                transform={`rotate(${rotation} ${CENTER} ${CENTER})`}
                className={`transition-all duration-700 ease-out ${hoveredIdx !== null && !isSelected ? 'opacity-20 grayscale-[0.3]' : 'opacity-100'}`}
                style={{ filter: isSelected ? `drop-shadow(0 0 15px ${cat.color}cc)` : '' }}
              />
            </g>
          );
        })}
      </svg>

      {/* Center Display */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 sm:p-12 text-center pointer-events-none z-20 overflow-hidden">
        <div className={`flex flex-col items-center justify-center transition-all duration-500 w-full ${hoveredIdx !== null ? 'scale-105' : 'scale-100'}`}>
          {currentCategory ? (
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300 w-full px-2 sm:px-4">
              <span className="text-[10px] sm:text-[18px] font-mono tracking-[0.4em] uppercase mb-0.5 sm:mb-3 block text-gray-900 dark:text-white font-bold">
                {currentCategory.label}
              </span>
              <span className="text-[48px] sm:text-[90px] font-mono font-bold leading-none tracking-tighter" style={{ color: currentCategory.color }}>
                {result.scores[currentCategory.id].value.toFixed(1)}
              </span>
              <p className="text-[9px] sm:text-[14px] leading-relaxed text-gray-600 dark:text-gray-300 mt-1 sm:mt-6 font-medium max-w-[140px] sm:max-w-[220px] mx-auto not-italic">
                {currentCategory.description}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center animate-in fade-in duration-700 w-full px-2 sm:px-4">
              <span className="text-[9px] sm:text-[15px] font-mono tracking-[0.2em] sm:tracking-[0.5em] uppercase text-gray-400 dark:text-gray-500 mb-0.5 sm:mb-2 block font-bold">
                Valoración Global
              </span>
              <span className="text-[52px] sm:text-[100px] font-mono font-bold leading-none mb-1 sm:mb-4 text-gray-900 dark:text-white tracking-tighter drop-shadow-sm dark:drop-shadow-lg">
                {result.derived.global_score.toFixed(1)}
              </span>
              <div className="px-4 sm:px-10 py-1 sm:py-3 bg-primary/10 dark:bg-primary/10 border border-primary/40 rounded-lg sm:rounded-xl text-primary text-[8px] sm:text-[15px] font-bold tracking-[0.2em] sm:tracking-[0.4em] uppercase inline-block mb-1.5 sm:mb-6 shadow-[0_0_20px_rgba(212,230,0,0.1)] dark:shadow-[0_0_20px_rgba(212,230,0,0.2)]">
                {result.status.label.toUpperCase()}
              </div>
              <p className="text-[10px] sm:text-[14px] leading-relaxed text-gray-800 dark:text-white font-medium max-w-[180px] sm:max-w-[320px] mx-auto not-italic">
                {result.status.short_text}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ANALYSIS POP-UP OVERLAY */}
      {selectedCategory && (
        <div className="absolute inset-0 z-50 flex items-center justify-center animate-in zoom-in fade-in duration-300 p-4">
          <div 
            className="absolute inset-[-40px] sm:inset-[-60px] rounded-full blur-[60px] sm:blur-[100px] opacity-20 dark:opacity-40 transition-all duration-1000 animate-pulse"
            style={{ backgroundColor: selectedCategory.color }}
          ></div>
          
          <div className="absolute inset-0 bg-white/90 dark:bg-black/95 backdrop-blur-3xl rounded-full border border-gray-200 dark:border-white/10 shadow-[0_0_150px_rgba(0,0,0,0.2)] dark:shadow-[0_0_150px_rgba(0,0,0,0.9)] overflow-hidden">
             <div className="absolute inset-0 rounded-full border-[1.5px] sm:border-[3px] opacity-30" style={{ borderColor: selectedCategory.color }}></div>
          </div>

          <div className="relative p-6 sm:p-12 text-center max-w-[400px] flex flex-col items-center justify-center h-full">
            <button 
              className="mb-6 sm:mb-10 text-gray-900 dark:text-white hover:text-primary flex flex-col items-center gap-1 sm:gap-2 pointer-events-auto group/close"
              onClick={() => setSelectedIdx(null)}
            >
              <div className="w-8 h-8 sm:w-14 sm:h-14 rounded-full border border-gray-300 dark:border-white/40 flex items-center justify-center bg-white/50 dark:bg-black/50 group-hover/close:border-primary transition-colors shadow-lg">
                <span className="material-icons text-xl sm:text-4xl text-gray-900 dark:text-white">close</span>
              </div>
              <span className="text-[8px] sm:text-[11px] font-mono uppercase tracking-[0.3em] sm:tracking-[0.5em] font-bold text-gray-600 dark:text-white group-hover/close:text-primary">Cerrar</span>
            </button>

            <span className="text-[14px] sm:text-[22px] font-mono tracking-[0.4em] sm:tracking-[0.6em] uppercase font-bold mb-1 sm:mb-3 block" style={{ color: selectedCategory.color }}>
              DETALLE
            </span>
            <div className="text-[40px] sm:text-[80px] font-mono font-bold mb-4 sm:mb-8 leading-none" style={{ color: selectedCategory.color }}>
              {result.scores[selectedCategory.id].value.toFixed(1)}
            </div>
            <p className="text-[11px] sm:text-base md:text-lg text-gray-700 dark:text-gray-200 leading-relaxed font-light not-italic px-4 sm:px-8 max-h-[160px] sm:max-h-[220px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-white/10">
              {result.scores[selectedCategory.id].justification}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default HUDWidget;
