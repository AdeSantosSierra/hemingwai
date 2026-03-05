import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { getEvaluationGlobalScore, getEvaluationStatusLabel } from '../lib/evaluationViewModel';

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
  if (!Number.isFinite(score)) return 'text-[color:var(--hw-text-muted)]';
  if (score < 5) return 'text-red-500';
  if (score < 8) return 'text-amber-400';
  return 'text-emerald-400';
};

const getSegmentGeometry = (totalSegments, radius, desiredGapAngle = 0.24) => {
  const circumference = 2 * Math.PI * radius;
  const stepAngle = (2 * Math.PI) / totalSegments;
  const gapAngle = Math.min(desiredGapAngle, stepAngle * 0.45);
  const segmentAngle = stepAngle - gapAngle;
  const segmentLength = (circumference * segmentAngle) / (2 * Math.PI);
  const gapLength = (circumference * gapAngle) / (2 * Math.PI);

  return { circumference, segmentLength, gapLength, stepAngle, gapAngle };
};

const buildDashMetrics = (index, score, segmentLength, gapLength, circumference) => {
  const normalizedScore = Number.isFinite(score) ? score : 0;
  const visibleDash = (segmentLength * normalizedScore) / 10;
  const dashOffset = index * (segmentLength + gapLength);
  return {
    valueDashArray: `${visibleDash} ${circumference}`,
    trackDashArray: `${segmentLength} ${circumference}`,
    dashOffset,
  };
};

const NewsScoreDonut = ({ evaluationResult, onActiveCriterionChange }) => {
  const [hoveredKey, setHoveredKey] = useState(null);
  const [pinnedKey, setPinnedKey] = useState(null);
  const [animatingIn, setAnimatingIn] = useState(true);

  useEffect(() => {
    setHoveredKey(null);
    setPinnedKey(null);
    setAnimatingIn(true);
    const timer = setTimeout(() => setAnimatingIn(false), 650);
    return () => clearTimeout(timer);
  }, [evaluationResult]);

  const criteriaData = useMemo(
    () =>
      CRITERIA_CONFIG.map((criterion) => ({
        ...criterion,
        score: clampScore(evaluationResult?.scores?.[criterion.key]?.value),
      })),
    [evaluationResult]
  );

  const activeCriterionKey = hoveredKey || pinnedKey;
  const activeCriterion = criteriaData.find((criterion) => criterion.key === activeCriterionKey) || null;

  useEffect(() => {
    if (typeof onActiveCriterionChange === 'function') {
      onActiveCriterionChange(activeCriterion?.key || null);
    }
  }, [activeCriterion, onActiveCriterionChange]);

  const globalScore = clampScore(getEvaluationGlobalScore(evaluationResult));
  const statusLabel = getEvaluationStatusLabel(evaluationResult);
  const displayScore = activeCriterion ? activeCriterion.score : globalScore;
  const centerSubText = activeCriterion ? activeCriterion.label : statusLabel || '—';

  const radius = 80;
  const strokeWidth = 16;
  const center = 120;
  const totalSegments = CRITERIA_CONFIG.length;
  const { circumference, segmentLength, gapLength, stepAngle, gapAngle } = getSegmentGeometry(
    totalSegments,
    radius
  );
  const minHitRadius = radius - strokeWidth / 2 - 8;
  const maxHitRadius = radius + strokeWidth / 2 + 10;

  const getCriterionKeyFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 240;
    const y = ((event.clientY - rect.top) / rect.height) * 240;
    const dx = x - center;
    const dy = y - center;
    const distance = Math.hypot(dx, dy);

    if (distance < minHitRadius || distance > maxHitRadius) {
      return null;
    }

    const angle = Math.atan2(dy, dx);
    const normalized = (angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    const segmentIndex = Math.floor(normalized / stepAngle);
    const withinStep = normalized - segmentIndex * stepAngle;
    if (withinStep < gapAngle) {
      return null;
    }

    return criteriaData[segmentIndex]?.key || null;
  };

  const handlePointerMove = (event) => {
    setHoveredKey(getCriterionKeyFromPointer(event));
  };

  const handlePointerLeave = () => {
    setHoveredKey(null);
  };

  const handleDonutClick = (event) => {
    const clickedKey = getCriterionKeyFromPointer(event);
    if (!clickedKey) return;
    setPinnedKey((prev) => (prev === clickedKey ? null : clickedKey));
    setHoveredKey(clickedKey);
  };

  return (
    <div className="w-full max-w-[300px]">
      <div className="relative mx-auto aspect-square w-full select-none">
        <div className="pointer-events-none absolute inset-2 rounded-full border border-[color:var(--hw-border)] opacity-40 [animation:spin_36s_linear_infinite]" />
        <div className="pointer-events-none absolute inset-7 rounded-full border border-[color:var(--hw-border)] opacity-30 [animation:spin_22s_linear_infinite_reverse]" />
        <div className="pointer-events-none absolute inset-10 rounded-full bg-[radial-gradient(circle,rgba(210,210,9,0.14)_0%,rgba(210,210,9,0)_70%)] opacity-70 blur-2xl" />

        <svg
          className="relative z-10 h-full w-full"
          viewBox="0 0 240 240"
          role="img"
          aria-label="Distribución de puntuaciones por criterio"
          onMouseMove={handlePointerMove}
          onMouseLeave={handlePointerLeave}
          onClick={handleDonutClick}
          onBlur={(event) => {
            const nextFocusedElement = event.relatedTarget;
            if (nextFocusedElement && event.currentTarget.contains(nextFocusedElement)) return;
            setHoveredKey(null);
          }}
          style={{ cursor: hoveredKey ? 'pointer' : 'default' }}
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-[color:var(--hw-border)] opacity-55"
          />

          {criteriaData.map((criterion, index) => {
            const isActive = activeCriterionKey === criterion.key;
            const isMuted = activeCriterionKey !== null && !isActive;
            const { valueDashArray, trackDashArray, dashOffset } = buildDashMetrics(
              index,
              criterion.score,
              segmentLength,
              gapLength,
              circumference
            );

            return (
              <g key={criterion.key}>
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={strokeWidth + 10}
                  strokeDasharray={trackDashArray}
                  strokeDashoffset={-dashOffset}
                  transform={`rotate(-90 ${center} ${center})`}
                  pointerEvents="none"
                  aria-label={`${criterion.label}: ${formatScore(criterion.score)} sobre 10`}
                />
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={strokeWidth}
                  strokeDasharray={trackDashArray}
                  strokeDashoffset={-dashOffset}
                  transform={`rotate(-90 ${center} ${center})`}
                  className="text-[color:var(--hw-border)] opacity-50"
                  pointerEvents="none"
                />
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={criterion.color}
                  strokeWidth={isActive ? strokeWidth + 2 : strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={animatingIn ? `0 ${circumference}` : valueDashArray}
                  strokeDashoffset={-dashOffset}
                  transform={`rotate(-90 ${center} ${center})`}
                  className="transition-all duration-500 ease-out"
                  pointerEvents="none"
                  style={{
                    opacity: isMuted ? 0.2 : 1,
                    filter: isActive ? `drop-shadow(0 0 12px ${criterion.color}cc)` : 'none',
                  }}
                />
              </g>
            );
          })}
        </svg>

        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-5 text-center">
          <div className="relative h-14 w-full">
            <span
              className={`absolute inset-0 flex items-center justify-center text-5xl font-black tracking-tight transition-opacity duration-300 ${getScoreTone(
                globalScore
              )} ${activeCriterion ? 'opacity-0' : 'opacity-100'}`}
            >
              {formatScore(globalScore)}
            </span>
            <span
              className={`absolute inset-0 flex items-center justify-center text-5xl font-black tracking-tight transition-opacity duration-300 ${getScoreTone(
                activeCriterion?.score
              )} ${activeCriterion ? 'opacity-100' : 'opacity-0'}`}
            >
              {activeCriterion ? formatScore(activeCriterion.score) : '—'}
            </span>
          </div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--hw-text-muted)]">
            {activeCriterion ? 'Criterio activo' : 'Valoración global'}
          </div>
          <div className="mt-1 max-w-[180px] truncate text-sm font-semibold text-[color:var(--hw-text)]">
            {centerSubText}
          </div>
        </div>
      </div>

      <div className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-lime-400/90">
        Hover: detalle | clic: fijar
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[color:var(--hw-text-muted)]">
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
      global_score_2dp: PropTypes.number,
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
