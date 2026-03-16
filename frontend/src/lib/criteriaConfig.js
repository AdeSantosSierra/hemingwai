export const CRITERIA_CONFIG = [
  {
    key: 'fiabilidad',
    label: 'Fiabilidad',
    color: '#00D26A',
    description: 'Cita de fuentes autorizadas y relevancia de los datos.',
    sectionId: '1',
  },
  {
    key: 'adecuacion',
    label: 'Adecuación',
    color: '#00F3FF',
    description: 'Correspondencia entre el relato y el hecho.',
    sectionId: '2',
  },
  {
    key: 'claridad',
    label: 'Claridad',
    color: '#FFCC00',
    description: 'Lógica y precisión narrativa.',
    sectionId: '3',
  },
  {
    key: 'profundidad',
    label: 'Profundidad',
    color: '#BC13FE',
    description: 'Indica el alcance de las consecuencias.',
    sectionId: '4',
  },
  {
    key: 'enfoque',
    label: 'Enfoque',
    color: '#FF0055',
    description: 'Revela el aspecto clave del acontecimiento.',
    sectionId: '5',
  },
];

export const CRITERION_BY_KEY = Object.fromEntries(
  CRITERIA_CONFIG.map((criterion) => [criterion.key, criterion])
);
