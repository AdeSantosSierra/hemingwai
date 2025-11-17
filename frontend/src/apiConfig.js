// Este archivo centraliza la configuración de la URL base de la API
// para facilitar el cambio entre entornos de desarrollo y producción.

// En desarrollo, Vite usa el proxy configurado en vite.config.js,
// por lo que las peticiones a '/api' son suficientes.
// En producción, VITE_API_BASE_URL será definida por el entorno de Render
// y apuntará a la URL pública del servicio backend.

// Temporalmente, usamos la URL directa para depurar problemas con el proxy de Vite
const API_BASE_URL = 'http://localhost:3000';

export default API_BASE_URL;
