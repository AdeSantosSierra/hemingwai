
import { CategoryMetadata, StatusLabel } from './types';

export const CATEGORIES: CategoryMetadata[] = [
  {
    id: 'fiabilidad',
    label: 'FIABILIDAD',
    description: 'Cita de fuentes autorizadas y relevancia de los datos.',
    color: '#00d26a', // Neon Green
    weight: 0.25,
  },
  {
    id: 'adecuacion',
    label: 'ADECUACIÓN',
    description: 'Correspondencia entre el relato y el hecho.',
    color: '#00f3ff', // Neon Cyan
    weight: 0.20,
  },
  {
    id: 'claridad',
    label: 'CLARIDAD',
    description: 'Lógica y precisión narrativa.',
    color: '#ffcc00', // Neon Amber
    weight: 0.15,
  },
  {
    id: 'profundidad',
    label: 'PROFUNDIDAD',
    description: 'Indica el alcance de las consecuencias.',
    color: '#bc13fe', // Neon Purple
    weight: 0.20,
  },
  {
    id: 'enfoque',
    label: 'ENFOQUE',
    description: 'Revela el aspecto clave del acontecimiento.',
    color: '#ff0055', // Neon Pink
    weight: 0.20,
  },
];

export const STATUS_TEXTS: Record<StatusLabel, string> = {
  desinformativa: "No ofrece garantías mínimas de ajuste a lo ocurrido.",
  confusa: "Aporta información fiable, pero no se entiende con claridad.",
  irrelevante: "Se entiende, pero aporta poco valor informativo.",
  valiosa: "Relato fiable y claro que aporta conocimiento útil para comprender lo importante.",
  excelente: "Fiable, clara, bien enfocada y contextualizada; ayuda a entender un asunto trascendente.",
};
