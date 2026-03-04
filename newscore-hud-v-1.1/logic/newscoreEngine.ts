
import { Category, ModelScores, EvaluationResult, CategoryScore, Alert, StatusLabel, NewsMetadata } from "../types";

const W = { fiabilidad: 0.25, adecuacion: 0.20, claridad: 0.15, profundidad: 0.20, enfoque: 0.20 } as const;

const SHORT_TEXT: Record<StatusLabel, string> = {
  desinformativa: "No ofrece garantías mínimas de fiabilidad ni ajuste a los hechos, o su calidad global es insuficiente.",
  confusa: "Aporta información fiable, pero no se entiende con claridad.",
  irrelevante: "Se entiende, pero aporta poco valor informativo.",
  valiosa: "Relato fiable y claro que aporta conocimiento útil para comprender lo importante.",
  excelente: "Fiable, clara, bien enfocada y contextualizada; ayuda a entender un asunto trascendente.",
};

function clamp010(x: number) {
  return Math.max(0, Math.min(10, Number.isFinite(x) ? x : 0));
}
function round1(x: number) {
  return Math.round(x * 10) / 10;
}

export function buildEvaluationResult(model: ModelScores, meta: NewsMetadata): EvaluationResult {
  const decision_path: string[] = [];

  const scores: Record<Category, CategoryScore> = {
    fiabilidad: { value: clamp010(model.scores.fiabilidad.value), justification: model.scores.fiabilidad.justification ?? "" },
    adecuacion: { value: clamp010(model.scores.adecuacion.value), justification: model.scores.adecuacion.justification ?? "" },
    claridad: { value: clamp010(model.scores.claridad.value), justification: model.scores.claridad.justification ?? "" },
    profundidad: { value: clamp010(model.scores.profundidad.value), justification: model.scores.profundidad.justification ?? "" },
    enfoque: { value: clamp010(model.scores.enfoque.value), justification: model.scores.enfoque.justification ?? "" },
  };

  const F = scores.fiabilidad.value;
  const A = scores.adecuacion.value;
  const C = scores.claridad.value;
  const P = scores.profundidad.value;
  const E = scores.enfoque.value;

  const G = round1(W.fiabilidad * F + W.adecuacion * A + W.claridad * C + W.profundidad * P + W.enfoque * E);
  const m_min_fa = Math.min(F, A);
  const T = round1((E + P) / 2);

  const hard = m_min_fa < 4.0;
  const soft = m_min_fa >= 4.0 && m_min_fa < 5.0;

  const alerts: Alert[] = (model.alerts ?? []).map(a => ({ ...a, origin: a.origin ?? "model" }));
  if (soft) {
    alerts.unshift({
      code: "RESERVA_EPISTEMICA_FA",
      origin: "engine",
      category: m_min_fa === F ? "fiabilidad" : "adecuacion",
      severity: "medium",
      message: "Fiabilidad/Adecuación con reservas (4,0–4,9). Interpreta el resultando con cautela.",
    });
  }

  let label: StatusLabel = "irrelevante";

  if (hard) {
    decision_path.push("hard gate: min(F,A)<4 -> desinformativa");
    label = "desinformativa";
  } else if (G < 4.0) {
    decision_path.push("G<4 -> desinformativa");
    label = "desinformativa";
  } else if (C < 5.0) {
    decision_path.push("C<5 -> confusa");
    label = "confusa";
  } else if (T < 5.5) {
    decision_path.push("T<5.5 -> irrelevante");
    label = "irrelevante";
  } else if (m_min_fa >= 7.0 && C >= 6.5 && T >= 7.0 && G >= 8.5) {
    decision_path.push("umbrales excelente -> excelente");
    label = "excelente";
  } else if (m_min_fa >= 5.0 && C >= 5.0 && T >= 5.5) {
    decision_path.push("umbrales valiosa -> valiosa");
    label = "valiosa";
  } else {
    decision_path.push("fallback -> irrelevante");
    label = "irrelevante";
  }

  if (soft && (label === "valiosa" || label === "excelente")) {
    decision_path.push("soft-cap activa -> baja a irrelevante");
    label = "irrelevante";
  }

  return {
    meta,
    scores,
    derived: {
      global_score: G,
      tripod: { m_min_fa: round1(m_min_fa), T_transcendence: T },
      gates: { hard_triggered: hard, soft_cap_triggered: soft },
    },
    status: { label, short_text: SHORT_TEXT[label] },
    alerts,
    recommendations: { items: [] },
    audit: { decision_path },
    extras: {},
  };
}
