import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

const LOADING_PHASES = [
  {
    label: 'Resolviendo noticia',
    description: 'Validando la URL y preparando la extracción de metadatos.',
  },
  {
    label: 'Extrayendo señales',
    description: 'Leyendo titular, cuerpo y estructura de la publicación.',
  },
  {
    label: 'Contrastando evidencias',
    description: 'Buscando inconsistencias, sesgos y huecos de contexto.',
  },
  {
    label: 'Montando informe',
    description: 'Calculando puntuaciones, alertas y bloques de análisis.',
  },
];

const PHASE_ROTATION_MS = 900;

function SkeletonAnalysis({ query }) {
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPhaseIndex((current) => (current + 1) % LOADING_PHASES.length);
    }, PHASE_ROTATION_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  const currentPhase = LOADING_PHASES[phaseIndex];
  const progressValue = ((phaseIndex + 1) / LOADING_PHASES.length) * 100;
  const normalizedQuery = String(query || '').trim();

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[3fr_2fr] items-start">
      <div className="space-y-6">
        <div className="hw-glass hw-loading-shell rounded-[28px] border border-lima/30 p-6 sm:p-8 overflow-hidden">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-lima/30 bg-lima/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-lima">
                Analisis en curso
              </div>

              <h3 className="mt-5 text-2xl font-bold text-[color:var(--hw-text)] sm:text-3xl">
                Buscando y evaluando la noticia
              </h3>

              <p className="mt-3 max-w-xl text-sm leading-relaxed text-[color:var(--hw-text-muted)] sm:text-base">
                El motor está reproduciendo el flujo completo del análisis para que la interfaz se sienta viva y verificable.
              </p>

              <div className="mt-5 rounded-2xl border border-[color:var(--hw-border)] bg-[color:var(--hw-bg-elevated)]/75 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--hw-text-muted)]">
                  Consulta recibida
                </p>
                <p className="mt-2 break-all font-mono text-sm text-[color:var(--hw-text)]">
                  {normalizedQuery || 'Esperando URL de entrada...'}
                </p>
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-lima">
                      {currentPhase.label}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--hw-text-muted)]">
                      {currentPhase.description}
                    </p>
                  </div>
                  <div className="rounded-full border border-lima/25 bg-lima/10 px-3 py-1 text-xs font-semibold text-lima shadow-[0_0_18px_rgba(212,230,0,0.16)]">
                    {Math.round(progressValue)}%
                  </div>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-[color:var(--hw-bg-strong)]">
                  <div
                    className="hw-loading-progress h-full rounded-full"
                    style={{ width: `${progressValue}%` }}
                  />
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {LOADING_PHASES.map((phase, index) => {
                  const isActive = index === phaseIndex;
                  const isCompleted = index < phaseIndex;

                  return (
                    <div
                      key={phase.label}
                      className={`rounded-2xl border px-4 py-3 transition-all duration-300 ${
                        isActive
                          ? 'border-lima/50 bg-lima/10 shadow-[0_0_28px_rgba(212,230,0,0.18)]'
                          : isCompleted
                            ? 'border-cyan-400/30 bg-cyan-400/10'
                            : 'border-[color:var(--hw-border)] bg-[color:var(--hw-bg-elevated)]/55'
                      }`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--hw-text-muted)]">
                        Paso {index + 1}
                      </p>
                      <p className={`mt-2 text-sm font-semibold ${isActive ? 'text-[color:var(--hw-text)]' : 'text-[color:var(--hw-text-muted)]'}`}>
                        {phase.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-center xl:min-w-[280px]">
              <div className="hw-loading-radar">
                <div className="hw-loading-radar__glow" />
                <div className="hw-loading-radar__ring hw-loading-radar__ring--outer" />
                <div className="hw-loading-radar__ring hw-loading-radar__ring--middle" />
                <div className="hw-loading-radar__ring hw-loading-radar__ring--inner" />
                <div className="hw-loading-radar__sweep" />
                <div className="hw-loading-radar__core" />
              </div>
            </div>
          </div>
        </div>

        <div className="hw-glass rounded-[28px] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="hw-shimmer h-4 w-36 rounded-full" />
              <div className="mt-3 hw-shimmer h-8 w-[min(85%,34rem)] rounded-xl" />
            </div>
            <div className="hidden sm:block hw-shimmer h-14 w-14 rounded-full" />
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="rounded-2xl border border-[color:var(--hw-border)] bg-[color:var(--hw-bg-elevated)]/50 p-4">
                <div className="hw-shimmer h-3 w-20 rounded-full" />
                <div className="mt-3 hw-shimmer h-6 w-28 rounded-lg" />
                <div className="mt-4 space-y-2">
                  <div className="hw-shimmer h-3 w-full rounded-full" />
                  <div className="hw-shimmer h-3 w-4/5 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:sticky lg:top-4">
        <div className="hw-glass rounded-[28px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="hw-shimmer h-4 w-28 rounded-full" />
              <div className="mt-3 hw-shimmer h-7 w-44 rounded-xl" />
            </div>
            <div className="rounded-full border border-cyan-400/35 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              Live
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {[
              'Normalizando el texto original',
              'Midiendo consistencia del titular',
              'Preparando bloques de detalle',
              'Montando alertas del informe',
            ].map((item, index) => (
              <div
                key={item}
                className="rounded-2xl border border-[color:var(--hw-border)] bg-[color:var(--hw-bg-elevated)]/60 p-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      index === phaseIndex ? 'bg-lime-300 shadow-[0_0_14px_rgba(212,230,0,0.8)]' : 'bg-cyan-300/70'
                    }`}
                  />
                  <p className="text-sm text-[color:var(--hw-text)]">{item}</p>
                </div>
                <div className="mt-3 space-y-2 pl-5">
                  <div className="hw-shimmer h-3 w-full rounded-full" />
                  <div className="hw-shimmer h-3 w-5/6 rounded-full" />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-lima/20 bg-lima/10 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lima">
              Siguiente salida
            </p>
            <p className="mt-2 text-sm text-[color:var(--hw-text)]">
              En cuanto termine esta simulación de búsqueda, aparecerán el donut, las alertas y el detalle por criterio.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

SkeletonAnalysis.propTypes = {
  query: PropTypes.string,
};

SkeletonAnalysis.defaultProps = {
  query: '',
};

export default SkeletonAnalysis;
