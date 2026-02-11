from typing import Dict, Any, Optional

# --- Constants & Configuration ---

CATEGORIES_V2 = ["fiabilidad", "adecuacion", "claridad", "profundidad", "enfoque"]

WEIGHTS = {
    "fiabilidad": 0.25,
    "adecuacion": 0.20,
    "claridad": 0.15,
    "profundidad": 0.20,
    "enfoque": 0.20
}

STATUS_LABELS = {
    "desinformativa": "Desinformativa",
    "confusa": "Confusa",
    "irrelevante": "Irrelevante",
    "valiosa": "Valiosa",
    "excelente": "Excelente"
}

def clamp(value: float, min_val: float = 0.0, max_val: float = 10.0) -> float:
    return max(min_val, min(value, max_val))

def normalize_model_scores(model_scores: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ensures the input model_scores dictionary has the expected structure 
    and values are within valid ranges.
    Raises ValueError if required categories are missing or values are invalid.
    """
    normalized_scores = {}
    raw_scores = model_scores.get("scores", {})
    
    for category in CATEGORIES_V2:
        entry = raw_scores.get(category)
        
        # 1. Missing Category Check
        if entry is None:
            raise ValueError(f"Missing required category: {category}")
        
        # 1b. Entry Type Check
        if not isinstance(entry, dict):
            raise ValueError(f"Invalid score entry for category {category}: expected dict")
            
        # 2. Value Existence Check
        if "value" not in entry:
            raise ValueError(f"Missing 'value' for category: {category}")
            
        val = entry.get("value")
        
        # 3. Type Conversion Check
        try:
            val_float = float(val)
        except (ValueError, TypeError):
            raise ValueError(f"Invalid score value for category {category}: {val}")
            
        # 4. Clamp (Allowed)
        normalized_scores[category] = {
            "value": clamp(val_float),
            "justification": entry.get("justification", "")
        }

    # Normalize alerts
    normalized_alerts = []
    raw_alerts = model_scores.get("alerts", [])
    if isinstance(raw_alerts, list):
        for alert in raw_alerts:
            if isinstance(alert, dict):
                # Ensure origin exists
                if "origin" not in alert:
                    alert["origin"] = "model"
                normalized_alerts.append(alert)

    return {
        "scores": normalized_scores,
        "alerts": normalized_alerts
    }

def compute_evaluation_result(model_scores: Dict[str, Any], meta: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """
    Core function of the Deterministic Engine (V2).
    Calculates derived metrics, checks gates, determines status, and generates audit trail.
    """
    # 1. Normalize Inputs (Raises ValueError if invalid)
    data = normalize_model_scores(model_scores)
    scores = data["scores"]
    model_alerts = data["alerts"]
    
    # Extract values for calculation
    F = scores["fiabilidad"]["value"]
    A = scores["adecuacion"]["value"]
    C = scores["claridad"]["value"]
    P = scores["profundidad"]["value"]
    E = scores["enfoque"]["value"]

    # 2. Calculate Derived Metrics
    # G = 0.25F + 0.20A + 0.15C + 0.20P + 0.20E
    G_raw = sum(scores[c]["value"] * WEIGHTS[c] for c in CATEGORIES_V2)
    # Note: We keep G_raw for internal logic, but report rounded value.

    # m_min_fa = min(F, A)
    m_min_fa = min(F, A)
    # Usually we can keep m_min_fa raw, but standard practice is 2 decimals if needed.
    # Logic uses raw comparison anyway.
    
    # T = (E + P) / 2
    T_raw = (E + P) / 2

    derived = {
        "global_score": round(G_raw, 1), # Rounded for display
        "tripod": {
            "m_min_fa": round(m_min_fa, 2),
            "T_transcendence": round(T_raw, 2)
        },
        "gates": {
            "hard_triggered": False,
            "soft_cap_triggered": False
        }
    }

    # 3. Initialize Audit & Engine Alerts
    audit = {
        "decision_path": [],
        "rules_fired": [],
        "inconsistencies": []
    }
    engine_alerts = []

    # 4. Check Inconsistencies (Model Alert vs Score)
    # Rule: If model alert severity="high" in F or A AND score > 6 => Add engine alert
    for alert in model_alerts:
        if alert.get("origin") == "model" and alert.get("severity") == "high":
            cat = alert.get("category")
            if cat in ["fiabilidad", "adecuacion"]:
                current_score = scores.get(cat, {}).get("value", 0)
                if current_score > 6.0:
                    # Inconsistency detected
                    audit["inconsistencies"].append({
                        "category": cat,
                        "score_value": current_score,
                        "alert_code": alert.get("code"),
                        "severity": "high",
                        "message": alert.get("message")
                    })
                    engine_alerts.append({
                        "code": "SCORE_ALERT_INCONSISTENCY",
                        "category": cat,
                        "severity": "medium", # V2 spec says use medium if high inconsistency
                        "message": f"Inconsistencia detectada: Alerta crítica en {cat} pero puntuación alta ({current_score}).",
                        "origin": "engine",
                        "evidence_refs": []
                    })
                    audit["rules_fired"].append("INCONSISTENCY_CHECK_FAIL")
                    audit["decision_path"].append(f"Inconsistency found in {cat} (Score {current_score} > 6 with High Severity Alert)")

    # 5. Check Soft Gate (Epistemic Reserve)
    # Rule: 4.0 <= m_min_fa < 5.0 => soft_cap_triggered=true + alert RESERVA_EPISTEMICA_FA
    if 4.0 <= m_min_fa < 5.0:
        derived["gates"]["soft_cap_triggered"] = True
        engine_alerts.append({
            "code": "RESERVA_EPISTEMICA_FA",
            "category": "fiabilidad", # Affects core trust, message clarifies
            "severity": "medium",
            "message": "La noticia presenta debilidades en fiabilidad o adecuación (Score 4.0-5.0). Se activa Reserva Epistémica.",
            "origin": "engine",
            "evidence_refs": []
        })
        audit["rules_fired"].append("GATE_SOFT_MIN_FA_4_5")

    # 6. Determine Status (Strict Decision Tree)
    status_label = "irrelevante" # Default fallback
    
    # Node 1: Hard Gate (m_min_fa < 4.0)
    if m_min_fa < 4.0:
        status_label = "desinformativa"
        derived["gates"]["hard_triggered"] = True
        audit["decision_path"].append(f"m_min_fa ({m_min_fa:.2f}) < 4.0 -> desinformativa")
        audit["rules_fired"].append("GATE_HARD_MIN_FA_LT_4")
    
    # Node 2: Global Score Floor (G_raw < 4.0)
    elif G_raw < 4.0:
        status_label = "desinformativa"
        audit["decision_path"].append(f"G_raw ({G_raw:.3f}) < 4.0 -> desinformativa")
        audit["rules_fired"].append("STATUS_DESINFORMATIVA_G_LT_4")
        
    # Node 3: Clarity Floor (C < 5.0)
    elif C < 5.0:
        status_label = "confusa"
        audit["decision_path"].append(f"C ({C:.2f}) < 5.0 -> confusa")
        audit["rules_fired"].append("STATUS_CONFUSA_C_LT_5")
        
    # Node 4: Transcendence Floor (T_raw < 5.5)
    elif T_raw < 5.5:
        status_label = "irrelevante"
        audit["decision_path"].append(f"T ({T_raw:.2f}) < 5.5 -> irrelevante")
        audit["rules_fired"].append("STATUS_IRRELEVANTE_T_LT_5.5")
        
    # Node 5: Excellent Condition
    # (m_min_fa >= 7.0 && C >= 6.5 && T >= 7.0 && G_raw >= 8.5)
    elif (m_min_fa >= 7.0 and C >= 6.5 and T_raw >= 7.0 and G_raw >= 8.5):
        status_label = "excelente"
        audit["decision_path"].append("m_min_fa>=7 & C>=6.5 & T>=7 & G>=8.5 -> excelente")
        audit["rules_fired"].append("STATUS_EXCELENTE_CONDITIONS_MET")
        
    # Node 6: Valuable Condition
    # (m_min_fa >= 5.0 && C >= 5.0 && T >= 5.5)
    elif (m_min_fa >= 5.0 and C >= 5.0 and T_raw >= 5.5):
        status_label = "valiosa"
        audit["decision_path"].append("m_min_fa>=5 & C>=5 & T>=5.5 -> valiosa")
        audit["rules_fired"].append("STATUS_VALIOSA_CONDITIONS_MET")
        
    # Node 7: Fallback
    else:
        status_label = "irrelevante"
        audit["decision_path"].append("No specific condition met -> irrelevante")
        audit["rules_fired"].append("STATUS_FALLBACK_IRRELEVANTE")

    # 7. Construct Final Object
    
    # Merge alerts (Model + Engine)
    final_alerts = model_alerts + engine_alerts
    
    # Prepare meta (use provided or defaults)
    if meta is None:
        meta = {}
    final_meta = {
        "url": meta.get("url", ""),
        "title": meta.get("title", ""),
        "date": meta.get("date", ""),
        "source": meta.get("source", ""),
        "author": meta.get("author", "")
    }

    # Include G_raw in extras for full transparency/debugging
    extras = {
        "raw_global_score": G_raw
    }

    return {
        "meta": final_meta,
        "scores": scores,
        "derived": derived,
        "status": {
            "label": status_label,
            "short_text": STATUS_LABELS.get(status_label, status_label.capitalize())
        },
        "alerts": final_alerts,
        "recommendations": {"items": []}, # Placeholder for future logic
        "audit": audit,
        "extras": extras
    }
