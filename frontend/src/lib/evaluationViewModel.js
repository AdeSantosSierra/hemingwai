const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const getEvaluationResult = (payload = {}) => {
  const candidate = payload?.evaluation_result;
  return candidate && typeof candidate === 'object' ? candidate : {};
};

export const getEvaluationGlobalScore = (evaluationResult = {}) => {
  const derived = evaluationResult?.derived || {};
  return toFiniteNumber(derived.global_score_2dp ?? derived.global_score);
};

export const getEvaluationStatusLabel = (evaluationResult = {}) => {
  const label = evaluationResult?.status?.label;
  return typeof label === 'string' && label.trim() ? label.trim() : null;
};

export const getEvaluationAlerts = (evaluationResult = {}) =>
  Array.isArray(evaluationResult?.alerts) ? evaluationResult.alerts : [];

export const getEvaluationAlertsSummary = (evaluationResult = {}) =>
  evaluationResult?.alerts_summary && typeof evaluationResult.alerts_summary === 'object'
    ? evaluationResult.alerts_summary
    : null;
