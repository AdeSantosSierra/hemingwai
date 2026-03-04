
export type Category = "fiabilidad" | "adecuacion" | "claridad" | "profundidad" | "enfoque";
export type Severity = "high" | "medium" | "low";

export type CategoryScore = { value: number; justification: string };

export type Alert = {
  code: string;
  category: Category;
  severity: Severity;
  message: string;
  evidence_refs?: string[];
  origin?: "model" | "engine";
};

export type ModelScores = {
  scores: Record<Category, CategoryScore>;
  alerts?: Alert[];
};

export interface NewsMetadata {
  url: string;
  title: string;
  source: string;
  author: string;
  date: string;
}

// Added RawGeminiResponse type as it is imported and used in logic/evaluator.ts
export type RawGeminiResponse = ModelScores & {
  metadata: NewsMetadata;
  grounding?: any[];
};

export type StatusLabel = "desinformativa" | "confusa" | "irrelevante" | "valiosa" | "excelente";

export type EvaluationResult = {
  meta: NewsMetadata;
  scores: Record<Category, CategoryScore>;
  derived: {
    global_score: number;
    tripod: { m_min_fa: number; T_transcendence: number };
    gates: { hard_triggered: boolean; soft_cap_triggered: boolean };
  };
  status: { label: StatusLabel; short_text: string };
  alerts: Alert[];
  recommendations: { items: any[] };
  audit: { decision_path: string[] };
  extras?: {
    headline_result?: EvaluationResult;
    grounding?: any[];
    /* Added article_text property to store the processed news text for UI display */
    article_text?: string;
  };
};

export interface CategoryMetadata {
  id: Category;
  label: string;
  description: string;
  color: string;
  weight: number;
}
