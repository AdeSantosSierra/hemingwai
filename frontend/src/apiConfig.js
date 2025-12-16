// Este archivo centraliza la configuración de la URL base de la API
// para facilitar el cambio entre entornos de desarrollo y producción.

// Priorizamos VITE_API_BASE si está definida (nueva convención para Render DEV/PROD).
// Mantenemos compatibilidad con VITE_API_BASE_URL o string vacío (proxy en local).

const API_BASE_URL = import.meta.env.VITE_API_BASE || 
                     (import.meta.env.PROD ? import.meta.env.VITE_API_BASE_URL || '' : '');

export const API_BASE = API_BASE_URL; // Named export as requested
export default API_BASE_URL;          // Default export for backward compatibility
