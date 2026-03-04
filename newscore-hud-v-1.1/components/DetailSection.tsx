
import React from 'react';
import { EvaluationResult } from '../types';
import { CATEGORIES } from '../constants';

interface DetailSectionProps {
  result: EvaluationResult;
}

const DetailSection: React.FC<DetailSectionProps> = ({ result }) => {
  const severityMap: Record<string, string> = {
    high: 'ALTA',
    medium: 'MEDIA',
    low: 'BAJA'
  };

  return (
    <div className="pb-20 w-full max-w-[800px] mx-auto px-4">
      <div className="text-center mb-16">
        {/* Tamaño reducido de text-2xl a text-xl */}
        <h3 className="text-xl font-mono uppercase tracking-[0.5em] text-red-500 mb-4 font-bold">
          Alertas y Hallazgos de Calidad
        </h3>
        <p className="text-[14px] font-mono text-gray-400 dark:text-gray-500 uppercase tracking-widest font-bold">
          Detección de anomalías críticas y sesgos
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <span className="material-icons text-red-500/60">notification_important</span>
          <h4 className="text-sm font-mono uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400 font-bold">Alertas detectadas</h4>
        </div>
        
        <div className="space-y-6">
          {result.alerts.length > 0 ? (
            result.alerts.map((alert, idx) => {
              const categoryColor = CATEGORIES.find(c => c.id.toLowerCase() === alert.category.toLowerCase())?.color || '#9CA3AF';
              return (
                <div 
                  key={idx} 
                  className="p-8 rounded-3xl bg-white dark:bg-[#0a0000] border-2 border-red-500/10 dark:border-red-500/20 flex flex-col gap-5 items-start group hover:border-red-500/30 dark:hover:border-red-500/50 transition-all shadow-lg dark:shadow-[0_10px_30px_-10px_rgba(255,0,0,0.1)]"
                >
                  <div className="w-full flex flex-wrap items-center gap-4">
                    <span className="text-lg font-mono uppercase font-bold tracking-[0.2em]" style={{ color: categoryColor }}>
                      {alert.category}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-red-200 dark:bg-red-900"></span>
                    <span className="font-mono text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-widest">CODE_{alert.code}</span>
                    <div className="flex-grow"></div>
                    <span className={`text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border ${
                      alert.severity === 'high' 
                        ? 'bg-red-600 text-white border-red-400' 
                        : 'bg-transparent text-red-500 dark:text-red-400 border-red-200 dark:border-red-500/30'
                    }`}>
                      {/* Traducción a español */}
                      {severityMap[alert.severity] || alert.severity.toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {/* Tamaño aumentado de text-xl a text-2xl */}
                    <h4 className="text-2xl text-gray-900 dark:text-white leading-tight font-medium">
                      {alert.message.split('.')[0]}.
                    </h4>
                    {/* Tamaño aumentado de text-xl a text-2xl */}
                    <p className="text-2xl text-gray-600 dark:text-gray-400 leading-relaxed font-light">
                      {alert.message.split('.').slice(1).join('.').trim() || ""}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-20 text-center bg-gray-50 dark:bg-white/5 rounded-3xl border-2 border-gray-200 dark:border-white/5 border-dashed">
              <div className="w-16 h-16 rounded-full bg-primary/5 border border-primary/20 flex items-center justify-center mx-auto mb-6">
                <span className="material-icons text-primary/40 text-3xl">verified_user</span>
              </div>
              <h4 className="text-lg font-mono uppercase tracking-[0.2em] text-gray-400">Escaneo Limpio</h4>
              <p className="text-gray-500 dark:text-gray-500 font-mono text-[10px] uppercase tracking-[0.3em]">
                No se detectaron anomalías en el flujo.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DetailSection;
