
import { GoogleGenAI, Type } from "@google/genai";
import { ModelScores } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM = `
Eres el componente IA de Newscore.
- IMPORTANTE: Escribe siempre en un español perfecto, respetando todas las reglas ortográficas y gramaticales. Es OBLIGATORIO incluir tildes (acentos), eñes y signos de puntuación correctos.
- No inventes datos, nombres, cargos, citas ni cifras.
- Usa Grounding de Google Search para verificar hechos si es necesario.
- NO calcules global_score ni asignas status (eso lo hace el motor determinista).
- Devuelve SOLO JSON válido cuando se te pida JSON.
`;

const categorySchemaPart = {
  type: Type.OBJECT,
  required: ["value", "justification"],
  properties: {
    value: { type: Type.NUMBER, description: "Puntuación de 0 a 10" },
    justification: { type: Type.STRING },
  },
};

const modelScoresSchema = {
  type: Type.OBJECT,
  required: ["scores"],
  properties: {
    scores: {
      type: Type.OBJECT,
      required: ["fiabilidad", "adecuacion", "claridad", "profundidad", "enfoque"],
      properties: {
        fiabilidad: categorySchemaPart,
        adecuacion: categorySchemaPart,
        claridad: categorySchemaPart,
        profundidad: categorySchemaPart,
        enfoque: categorySchemaPart,
      },
    },
    alerts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["code", "category", "severity", "message"],
        properties: {
          code: { type: Type.STRING },
          category: { type: Type.STRING, enum: ["fiabilidad", "adecuacion", "claridad", "profundidad", "enfoque"] },
          severity: { type: Type.STRING, enum: ["high", "medium", "low"] },
          message: { type: Type.STRING },
          evidence_refs: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    },
  },
};

export interface ExtractedArticle {
  url: string;
  title: string;
  source: string;
  author: string;
  date: string;
  article_text: string;
  grounding?: any[];
}

export async function extractArticleFromUrl(url: string): Promise<ExtractedArticle> {
  const prompt = `
Extrae de esta URL el contenido principal de una noticia.
Devuelve:
- title (titular de la pieza)
- source (medio)
- author (autor si aparece, sino 'Redacción')
- date (fecha si aparece)
- article_text (cuerpo limpio, sin menús/comentarios)

URL: ${url}
`;

  const r = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: SYSTEM,
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ["url", "title", "source", "author", "date", "article_text"],
        properties: {
          url: { type: Type.STRING },
          title: { type: Type.STRING },
          source: { type: Type.STRING },
          author: { type: Type.STRING },
          date: { type: Type.STRING },
          article_text: { type: Type.STRING },
        },
      },
    },
  });

  const res = JSON.parse(r.text) as ExtractedArticle;
  res.grounding = r.candidates?.[0]?.groundingMetadata?.groundingChunks;
  return res;
}

export async function scoreArticle(articleText: string): Promise<ModelScores> {
  const prompt = `
NOTICIA (cuerpo):
${articleText}

Devuelve puntuaciones 0–10 y justificación por:
fiabilidad, adecuacion, claridad, profundidad, enfoque.
Incluye alertas (máx. 8) si procede.
`;

  const r = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: { 
      systemInstruction: SYSTEM,
      responseMimeType: "application/json", 
      responseSchema: modelScoresSchema 
    },
  });

  return JSON.parse(r.text) as ModelScores;
}

export async function scoreHeadline(headline: string, bodyText: string): Promise<ModelScores> {
  const prompt = `
TITULAR:
${headline}

CUERPO (para contraste titular↔cuerpo):
${bodyText}

Evalúa el TITULAR con puntuaciones 0–10 según Newscore:
- Adecuación: si promete/insinúa algo que el cuerpo no sostiene.
- Fiabilidad: afirmaciones fuertes sin respaldo/atribución.
- Claridad: autonomía de significado y precisión.
- Enfoque y Profundidad: captura lo importante y su alcance (sin moralizar).

Incluye alertas (máx. 8) si hay clickbait, ambigüedad o desajuste con el cuerpo.
`;

  const r = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: { 
      systemInstruction: SYSTEM,
      responseMimeType: "application/json", 
      responseSchema: modelScoresSchema 
    },
  });

  return JSON.parse(r.text) as ModelScores;
}
