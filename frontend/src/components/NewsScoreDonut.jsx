import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';

const CRITERIA_CONFIG = [
  { key: 'fiabilidad', label: 'Fiabilidad', color: '#22c55e' },
  { key: 'adecuacion', label: 'Adecuación', color: '#38bdf8' },
  { key: 'claridad', label: 'Claridad', color: '#f59e0b' },
  { key: 'profundidad', label: 'Profundidad', color: '#fb7185' },
  { key: 'enfoque', label: 'Enfoque', color: '#d2d209' },
];

const clampScore = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, n));
};

const formatScore = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) : '—';
};

const getScoreTone = (score) => {
  if (!Number.isFinite(score)) return 'text-gray-300';
  if (score < 5) return 'text-red-500';
  if (score < 8) return 'text-yellow-400';
  return 'text-green-500';
};

const toPolar = (cx, cy, radius, angle) => ({
  x: cx + radius * Math.cos(angle),
  y: cy + radius * Math.sin(angle),
});

const donutSlicePath = (cx, cy, innerRadius, outerRadius, startAngle, endAngle) => {
  const outerStart = toPolar(cx, cy, outerRadius, startAngle);
  const outerEnd = toPolar(cx, cy, outerRadius, endAngle);
  const innerEnd = toPolar(cx, cy, innerRadius, endAngle);
  const innerStart = toPolar(cx, cy, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
};

const NewsScoreDonut = ({ evaluationResult, onActiveCriterionChange }) => {
  const [activeCriterionKey, setActiveCriterionKey] = useState(null);

  useEffect(() => {
    if (typeof onActiveCriterionChange === 'function') {
      onActiveCriterionChange(activeCriterionKey);
    }
  }, [activeCriterionKey, onActiveCriterionChange]);

  const criteriaData = useMemo(
    () =>
      CRITERIA_CONFIG.map((criterion) => ({
        ...criterion,
        score: clampScore(evaluationResult?.scores?.[criterion.key]?.value),
      })),
    [evaluationResult]
  );

  const activeCriterion = criteriaData.find((criterion) => criterion.key === activeCriterionKey) || null;
  const globalScore = clampScore(evaluationResult?.derived?.global_score);
  const displayScore = activeCriterion ? activeCriterion.score : globalScore;
  const centerSubText = activeCriterion
    ? activeCriterion.label
    : evaluationResult?.status?.label || '—';

  const cx = 120;
  const cy = 120;
  const innerRadius = 65;
  const outerRadius = 80;

  const slices = useMemo(() => {
    // Slices iguales para mantener targets de interacción consistentes; el valor exacto se comunica en el centro.
    const baseStart = -Math.PI / 2;
    const step = (Math.PI * 2) / CRITERIA_CONFIG.length;
    const gap = 0.035;

    return criteriaData.map((criterion, index) => {
      const startAngle = baseStart + step * index + gap / 2;
      const endAngle = baseStart + step * (index + 1) - gap / 2;
      return {
        ...criterion,
        path: donutSlicePath(cx, cy, innerRadius, outerRadius, startAngle, endAngle),
      };
    });
  }, [criteriaData]);

  return (
    <div className="w-full max-w-[260px]">
      <div className="relative mx-auto aspect-square w-full">
        <svg
          className="h-full w-full"
          viewBox="0 0 240 240"
          role="img"
          aria-label="Distribución de puntuaciones por criterio"
          onMouseLeave={() => setActiveCriterionKey(null)}
          onBlur={(event) => {
            const nextFocusedElement = event.relatedTarget;
            if (nextFocusedElement && event.currentTarget.contains(nextFocusedElement)) {
              return;
            }
            setActiveCriterionKey(null);
          }}
        >
          {slices.map((slice) => {
            const isActive = activeCriterionKey === slice.key;
            const isMuted = activeCriterionKey !== null && !isActive;
            const scoreLabel = Number.isFinite(slice.score)
              ? `${slice.score.toFixed(1)} sobre 10`
              : 'sin dato';

            return (
              <path
                key={slice.key}
                d={slice.path}
                fill={slice.color}
                tabIndex={0}
                aria-label={`${slice.label}: ${scoreLabel}`}
                style={{
                  opacity: isMuted ? 0.3 : 1,
                  transition: 'opacity 180ms ease',
                  outline: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={() => setActiveCriterionKey(slice.key)}
                onFocus={() => setActiveCriterionKey(slice.key)}
              />
            );
          })}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-5">
          <div className="relative h-12 w-full">
            <span
              className={`absolute inset-0 flex items-center justify-center text-4xl font-extrabold transition-opacity transition-colors duration-200 ${getScoreTone(
                globalScore
              )} ${
                activeCriterion ? 'opacity-0' : 'opacity-100'
              }`}
            >
              {formatScore(globalScore)}
            </span>
            <span
              className={`absolute inset-0 flex items-center justify-center text-4xl font-extrabold transition-opacity transition-colors duration-200 ${getScoreTone(
                activeCriterion?.score
              )} ${
                activeCriterion ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {activeCriterion ? formatScore(activeCriterion.score) : '—'}
            </span>
          </div>
          <div className="relative mt-1 h-6 w-full">
            <span
              className={`absolute inset-0 truncate text-sm font-semibold text-gray-100 transition-opacity duration-200 ${
                activeCriterion ? 'opacity-0' : 'opacity-100'
              }`}
            >
              {evaluationResult?.status?.label || '—'}
            </span>
            <span
              className={`absolute inset-0 truncate text-sm font-semibold text-gray-100 transition-opacity duration-200 ${
                activeCriterion ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {activeCriterion?.label || '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-300">
        {criteriaData.map((criterion) => (
          <div key={criterion.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: criterion.color }} />
            <span className="truncate">
              {criterion.label}: {formatScore(criterion.score)}
            </span>
          </div>
        ))}
      </div>

      <p className="sr-only">
        {formatScore(displayScore)} sobre 10. {centerSubText}.
      </p>
    </div>
  );
};

NewsScoreDonut.propTypes = {
  evaluationResult: PropTypes.shape({
    derived: PropTypes.shape({
      global_score: PropTypes.number,
    }),
    status: PropTypes.shape({
      label: PropTypes.string,
    }),
    scores: PropTypes.objectOf(
      PropTypes.shape({
        value: PropTypes.number,
      })
    ),
  }),
  onActiveCriterionChange: PropTypes.func,
};

NewsScoreDonut.defaultProps = {
  evaluationResult: null,
  onActiveCriterionChange: null,
};

export default NewsScoreDonut;
