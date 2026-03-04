
import { RawGeminiResponse, EvaluationResult, StatusLabel } from '../types';
import { STATUS_TEXTS } from '../constants';

export function buildEvaluationResult(modelData: RawGeminiResponse): EvaluationResult {
  // Extract data from modelData, providing default empty array for alerts if missing
  const { scores, alerts = [], metadata, grounding } = modelData;
  
  const F = scores.fiabilidad.value;
  const A = scores.adecuacion.value;
  const C = scores.claridad.value;
  const P = scores.profundidad.value;
  const E = scores.enfoque.value;

  // Global weighted score calculation
  const G = (0.25 * F) + (0.20 * A) + (0.15 * C) + (0.20 * P) + (0.20 * E);
  const m_min_fa = Math.min(F, A);
  const T_transcendence = (E + P) / 2;

  let soft_cap_triggered = false;
  let status_label: StatusLabel = 'irrelevante';

  // Quality gates logic
  if (m_min_fa < 4.0) {
    status_label = 'desinformativa';
  } else {
    if (m_min_fa >= 4.0 && m_min_fa < 5.0) {
      soft_cap_triggered = true;
    }

    if (G < 4.0) {
      status_label = 'desinformativa';
    } else if (C < 5.0) {
      status_label = 'confusa';
    } else if (T_transcendence < 5.5) {
      status_label = 'irrelevante';
    } else if (m_min_fa >= 7.0 && C >= 6.5 && T_transcendence >= 7.0 && G >= 8.5) {
      status_label = 'excelente';
    } else if (m_min_fa >= 5.0 && C >= 5.0 && T_transcendence >= 5.5) {
      status_label = 'valiosa';
    } else {
      status_label = 'irrelevante';
    }

    if (soft_cap_triggered && (status_label === 'valiosa' || status_label === 'excelente')) {
      status_label = 'irrelevante';
    }
  }

  // Fix: Corrected the return object to match the EvaluationResult type, specifically structuring the derived property
  return {
    meta: metadata,
    scores,
    alerts,
    derived: {
      global_score: Number(G.toFixed(1)),
      tripod: {
        m_min_fa: Number(m_min_fa.toFixed(1)),
        T_transcendence: Number(T_transcendence.toFixed(1))
      },
      gates: {
        hard_triggered: m_min_fa < 4.0,
        soft_cap_triggered: soft_cap_triggered
      }
    },
    status: {
      label: status_label,
      short_text: STATUS_TEXTS[status_label]
    },
    recommendations: { items: [] },
    audit: { decision_path: [] },
    extras: {
      grounding
    }
  };
}
