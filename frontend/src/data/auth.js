// =====================================================================
// SESIÓN DEL USUARIO
//  - Login con Microsoft (Entra ID) usando MSAL: la contraseña y el 2FA los maneja Microsoft,
//    esta app nunca ve la contraseña. El backend valida el token y decide si la persona tiene acceso.
//  - Latido de uso: cada minuto, si la pestaña está visible y la persona la está usando,
//    se avisa al backend para medir el tiempo real en la aplicación.
// =====================================================================
import { API_URL, guardarToken, obtenerToken } from '../config/api';

const ESCOPOS = ['openid', 'profile', 'email'];
let msal = null;
let configAuth = null;

async function llamar(ruta, { method = 'GET', body } = {}) {
  const resp = await fetch(`${API_URL}/api${ruta}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(datos.error || `Error ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return datos;
}

// Iniciales para el avatar: "Juan Pérez" -> "JP"
const iniciales = (nombre) => String(nombre || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');

// Forma que usa el resto de la app (Dashboard, Layout...).
export function aUsuarioApp(u) {
  return {
    ...u,
    iniciales: iniciales(u.nombre || u.email),
    rolTexto: u.esAdmin ? 'Administrador' : 'Usuario de área',
    areasPermitidas: u.areas || [],
  };
}

export async function obtenerConfigAuth() {
  if (!configAuth) configAuth = await llamar('/auth/config');
  return configAuth;
}

async function obtenerMsal() {
  if (msal) return msal;
  const cfg = await obtenerConfigAuth();
  if (!cfg.clientId || !cfg.tenantId) throw new Error('El login con Microsoft aún no está configurado en el servidor.');
  const { PublicClientApplication } = await import('@azure/msal-browser');
  msal = new PublicClientApplication({
    auth: {
      clientId: cfg.clientId,
      authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
      redirectUri: window.location.origin,
      postLogoutRedirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'sessionStorage' },
  });
  await msal.initialize();
  return msal;
}

async function abrirSesionEnBackend(ruta, body) {
  const { token, usuario } = await llamar(ruta, { method: 'POST', body });
  guardarToken(token);
  return aUsuarioApp(usuario);
}

// Al cargar la página: 1) vuelve de Microsoft con un token, o 2) ya había una sesión en esta pestaña.
export async function restaurarSesion() {
  const cfg = await obtenerConfigAuth();
  if (cfg.modo === 'microsoft' && cfg.clientId) {
    const cliente = await obtenerMsal();
    const resultado = await cliente.handleRedirectPromise();
    if (resultado?.idToken) return abrirSesionEnBackend('/auth/microsoft', { idToken: resultado.idToken });
  }
  if (!obtenerToken()) return null;
  try {
    const { usuario } = await llamar('/auth/yo');
    return aUsuarioApp(usuario);
  } catch {
    guardarToken(null);
    return null;
  }
}

// Lleva a la página de Microsoft; al volver, restaurarSesion() completa el ingreso.
export async function iniciarSesionMicrosoft() {
  const cliente = await obtenerMsal();
  await cliente.loginRedirect({ scopes: ESCOPOS, prompt: 'select_account' });
}

// Solo si el backend corre con AUTH_MODO=desarrollo (pruebas en tu PC).
export function iniciarSesionDesarrollo(email) {
  return abrirSesionEnBackend('/auth/desarrollo', { email });
}

export async function cerrarSesion() {
  detenerLatido();
  try { if (obtenerToken()) await llamar('/auth/salir', { method: 'POST' }); } catch { /* ya estaba cerrada */ }
  guardarToken(null);
  // Cierra también la cuenta de Microsoft en esta pestaña (no en todo el equipo).
  if (msal) {
    const cuenta = msal.getAllAccounts()[0];
    if (cuenta) await msal.clearCache({ account: cuenta }).catch(() => {});
  }
}

// ---------------------------------------------------------------------
// Medición de uso
// ---------------------------------------------------------------------
let intervalo = null;
let ultimaInteraccion = Date.now();
const marcarInteraccion = () => { ultimaInteraccion = Date.now(); };
const EVENTOS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

function enviarLatido(vista) {
  if (!obtenerToken()) return;
  // "Activo" = pestaña visible y alguna interacción en los últimos 5 minutos.
  const activo = document.visibilityState === 'visible' && Date.now() - ultimaInteraccion < 5 * 60000;
  if (!activo && !vista) return;
  llamar('/auth/ping', { method: 'POST', body: { activo, vista } }).catch(() => {});
}

export function iniciarLatido() {
  if (intervalo) return;
  EVENTOS.forEach(e => window.addEventListener(e, marcarInteraccion, { passive: true }));
  intervalo = setInterval(() => enviarLatido(), 60000);
}

export function detenerLatido() {
  if (intervalo) clearInterval(intervalo);
  intervalo = null;
  EVENTOS.forEach(e => window.removeEventListener(e, marcarInteraccion));
}

// Registra la pantalla que se abrió (área, módulo o reporte) para el análisis de uso.
let ultimaVista = '';
export function registrarVista({ pantalla, area = null, modulo = null }) {
  const clave = `${pantalla}|${area}|${modulo}`;
  if (clave === ultimaVista) return;
  ultimaVista = clave;
  marcarInteraccion();
  enviarLatido({ pantalla, area, modulo });
}
