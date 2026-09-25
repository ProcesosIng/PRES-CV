// URL del backend. En producción (Render) se define VITE_API_URL al construir el frontend.
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
