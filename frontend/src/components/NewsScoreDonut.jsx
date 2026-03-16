import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { getEvaluationGlobalScore, getEvaluationStatusLabel } from '../lib/evaluationViewModel';
import { CRITERIA_CONFIG } from '../lib/criteriaConfig';

const clampScore = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, n));
};

const formatScore = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) : '—';
};

const hexToRgba = (hex, alpha) => {
  const normalized = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(212, 230, 0, ${alpha})`;
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getScoreTone = (score) => {
  if (!Number.isFinite(score)) return 'text-[color:var(--hw-text-muted)]';
  if (score < 5) return 'text-rose-400';
  if (score < 8) return 'text-amber-300';
  return 'text-emerald-300';
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

const NewsScoreDonut = ({
  evaluationResult,
  onActiveCriterionChange,
  onSelectedCriterionChange,
  selectedCriterionKey,
}) => {
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

  useEffect(() => {
    setPinnedKey(selectedCriterionKey || null);
  }, [selectedCriterionKey]);

  const criteriaData = useMemo(
    () =>
      CRITERIA_CONFIG.map((criterion) => ({
        ...criterion,
        score: clampScore(evaluationResult?.scores?.[criterion.key]?.value),
      })),
    [evaluationResult]
  );

  const activeCriterionKey = pinnedKey || hoveredKey;
  const activeCriterion = criteriaData.find((criterion) => criterion.key === activeCriterionKey) || null;

  useEffect(() => {
    if (typeof onActiveCriterionChange === 'function') {
      onActiveCriterionChange(activeCriterion?.key || null);
    }
  }, [activeCriterion, onActiveCriterionChange]);

  useEffect(() => {
    if (typeof onSelectedCriterionChange === 'function') {
      onSelectedCriterionChange(pinnedKey);
    }
  }, [onSelectedCriterionChange, pinnedKey]);

  const globalScore = clampScore(getEvaluationGlobalScore(evaluationResult));
  const statusLabel = getEvaluationStatusLabel(evaluationResult);
  const displayScore = activeCriterion ? activeCriterion.score : globalScore;
  const centerSubText = activeCriterion ? activeCriterion.label : statusLabel || '—';
  const accentColor = activeCriterion?.color || '#D4E600';
  const accentGlow = hexToRgba(accentColor, activeCriterion ? 0.42 : 0.24);
  const accentSoftGlow = hexToRgba(accentColor, activeCriterion ? 0.2 : 0.14);

  const radius = 80;
  const strokeWidth = 16;
  const center = 120;
  const totalSegments = CRITERIA_CONFIG.length;
  const { circumference, segmentLength, gapLength } = getSegmentGeometry(totalSegments, radius);

  const handlePointerLeave = () => {
    if (pinnedKey) return;
    setHoveredKey(null);
  };

  const handleCriterionToggle = (criterionKey) => {
    if (pinnedKey === criterionKey) {
      setPinnedKey(null);
      setHoveredKey(null);
      return;
    }

    setPinnedKey(criterionKey);
    setHoveredKey(null);
  };

  const handleLegendEnter = (criterionKey) => {
    if (pinnedKey) return;
    setHoveredKey(criterionKey);
  };

  const handleLegendLeave = () => {
    if (pinnedKey) return;
    setHoveredKey(null);
  };

  const handleLegendClick = (criterionKey) => {
    if (pinnedKey === criterionKey) {
      setPinnedKey(null);
      setHoveredKey(null);
      return;
    }

    setPinnedKey(criterionKey);
    setHoveredKey(null);
  };

  return (
    <div className="w-full max-w-[300px]">
      <div className="relative mx-auto aspect-square w-full select-none">
        <div
          className="pointer-events-none absolute inset-3 rounded-full opacity-80 blur-3xl transition-all duration-500"
          style={{
            background: `radial-gradient(circle, ${accentGlow} 0%, ${accentSoftGlow} 34%, transparent 72%)`,
            transform: activeCriterion ? 'scale(1.04)' : 'scale(0.96)',
          }}
        />
        <div className="pointer-events-none absolute inset-2 rounded-full border border-[color:var(--hw-border)] opacity-40 [animation:spin_36s_linear_infinite]" />
        <div className="pointer-events-none absolute inset-7 rounded-full border border-[color:var(--hw-border)] opacity-30 [animation:spin_22s_linear_infinite_reverse]" />
        <div
          className="pointer-events-none absolute inset-10 rounded-full opacity-80 blur-2xl transition-all duration-500"
          style={{
            background: `radial-gradient(circle, ${hexToRgba(accentColor, 0.22)} 0%, transparent 72%)`,
          }}
        />

        <svg
          className="relative z-10 h-full w-full"
          viewBox="0 0 240 240"
          role="img"
          aria-label="Distribución de puntuaciones por criterio"
          onMouseLeave={handlePointerLeave}
          onClick={() => {
            setPinnedKey(null);
            setHoveredKey(null);
          }}
          onBlur={(event) => {
            const nextFocusedElement = event.relatedTarget;
            if (nextFocusedElement && event.currentTarget.contains(nextFocusedElement)) return;
            setHoveredKey(null);
          }}
          style={{ cursor: 'pointer' }}
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
                  strokeLinecap="round"
                  strokeDasharray={trackDashArray}
                  strokeDashoffset={-dashOffset}
                  transform={`rotate(-90 ${center} ${center})`}
                  style={{ pointerEvents: 'stroke' }}
                  aria-label={`${criterion.label}: ${formatScore(criterion.score)} sobre 10`}
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => {
                    if (!pinnedKey) {
                      setHoveredKey(criterion.key);
                    }
                  }}
                  onFocus={() => {
                    if (!pinnedKey) {
                      setHoveredKey(criterion.key);
                    }
                  }}
                  onBlur={() => {
                    if (!pinnedKey) {
                      setHoveredKey(null);
                    }
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCriterionToggle(criterion.key);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleCriterionToggle(criterion.key);
                    }
                  }}
                />
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={hexToRgba(criterion.color, 0.22)}
                  strokeWidth={strokeWidth - 2}
                  strokeDasharray={trackDashArray}
                  strokeDashoffset={-dashOffset}
                  transform={`rotate(-90 ${center} ${center})`}
                  className="transition-all duration-500 ease-out"
                  style={{
                    opacity: isMuted ? 0.18 : 0.55,
                  }}
                  pointerEvents="none"
                />
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={criterion.color}
                  strokeWidth={isActive ? strokeWidth + 10 : strokeWidth + 6}
                  strokeLinecap="round"
                  strokeDasharray={animatingIn ? `0 ${circumference}` : valueDashArray}
                  strokeDashoffset={-dashOffset}
                  transform={`rotate(-90 ${center} ${center})`}
                  className="transition-all duration-500 ease-out"
                  pointerEvents="none"
                  style={{
                    opacity: isMuted ? 0.06 : isActive ? 0.5 : 0.22,
                    filter: `blur(${isActive ? 0.6 : 1.4}px)`,
                  }}
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
                    opacity: isMuted ? 0.18 : 1,
                    filter: isActive
                      ? `drop-shadow(0 0 10px ${hexToRgba(criterion.color, 0.88)}) drop-shadow(0 0 22px ${hexToRgba(criterion.color, 0.7)})`
                      : `drop-shadow(0 0 8px ${hexToRgba(criterion.color, 0.4)})`,
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
              style={{
                textShadow: `0 0 18px ${hexToRgba('#D4E600', 0.28)}`,
              }}
            >
              {formatScore(globalScore)}
            </span>
            <span
              className={`absolute inset-0 flex items-center justify-center text-5xl font-black tracking-tight transition-opacity duration-300 ${getScoreTone(
                activeCriterion?.score
              )} ${activeCriterion ? 'opacity-100' : 'opacity-0'}`}
              style={{
                textShadow: `0 0 22px ${hexToRgba(accentColor, 0.44)}`,
              }}
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
        Hover: detalle | clic: capa focal
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[color:var(--hw-text-muted)]">
        {criteriaData.map((criterion) => (
          <button
            key={criterion.key}
            type="button"
            onMouseEnter={() => handleLegendEnter(criterion.key)}
            onMouseLeave={handleLegendLeave}
            onFocus={() => handleLegendEnter(criterion.key)}
            onBlur={handleLegendLeave}
            onClick={() => handleLegendClick(criterion.key)}
            className={`flex items-center gap-2 rounded-md px-2 py-1 text-left transition-all duration-200 ${
              activeCriterionKey === criterion.key
                ? 'bg-white/5 text-[color:var(--hw-text)]'
                : 'hover:bg-white/5 hover:text-[color:var(--hw-text)]'
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full shadow-[0_0_12px_currentColor]"
              style={{ backgroundColor: criterion.color, color: criterion.color }}
            />
            <span className="truncate">
              {criterion.label}: {formatScore(criterion.score)}
            </span>
          </button>
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
  onSelectedCriterionChange: PropTypes.func,
  selectedCriterionKey: PropTypes.string,
};

NewsScoreDonut.defaultProps = {
  evaluationResult: null,
  onActiveCriterionChange: null,
  onSelectedCriterionChange: null,
  selectedCriterionKey: null,
};

export default NewsScoreDonut;
