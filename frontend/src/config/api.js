// URL del backend. En producción (Render) se define VITE_API_URL al construir el frontend.
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');

// ---------------------------------------------------------------------
// Token de sesión: lo entrega el backend al iniciar sesión y se envía en cada llamada.
// Se guarda en sessionStorage: al cerrar el navegador la sesión se pierde.
// ---------------------------------------------------------------------
const CLAVE_TOKEN = 'cv_ppto_sesion';
let token = null;
try { token = sessionStorage.getItem(CLAVE_TOKEN); } catch { token = null; }

export function obtenerToken() { return token; }

export function guardarToken(nuevo) {
  token = nuevo || null;
  try {
    if (token) sessionStorage.setItem(CLAVE_TOKEN, token);
    else sessionStorage.removeItem(CLAVE_TOKEN);
  } catch { /* sin almacenamiento: la sesión dura lo que la pestaña */ }
}

// Todas las llamadas al backend (fetch(`${API_URL}/api/...`)) llevan el token automáticamente.
// Si el backend responde 401 (sesión vencida, cerrada o revocada) se avisa a la app para volver al login.
let instalado = false;
export function instalarInterceptorApi() {
  if (instalado || typeof window === 'undefined') return;
  instalado = true;
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (recurso, opciones = {}) => {
    const url = typeof recurso === 'string' ? recurso : recurso?.url || '';
    if (!url.startsWith(`${API_URL}/api/`) || url.startsWith(`${API_URL}/api/auth/config`)) return fetchOriginal(recurso, opciones);
    const headers = new Headers(opciones.headers || (typeof recurso === 'object' ? recurso.headers : undefined));
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const resp = await fetchOriginal(recurso, { ...opciones, headers });
    if (resp.status === 401 && token) {
      const datos = await resp.clone().json().catch(() => ({}));
      guardarToken(null);
      window.dispatchEvent(new CustomEvent('auth:expirada', { detail: { mensaje: datos.error || 'La sesión expiró.' } }));
    }
    return resp;
  };
}
