// =====================================================================
// SEGURIDAD: login con Microsoft (Entra ID), sesiones, permisos por área
// y registro de uso (quién entra, cuánto tiempo y qué pantallas usa).
//
// Flujo:
//  1. El frontend inicia sesión en Microsoft (MSAL) y envía el id_token a /api/auth/microsoft.
//  2. Aquí se valida la firma del token con las llaves públicas de Microsoft, el tenant y el Client ID.
//  3. Si el correo está activo en ppto_usuarios_acceso, se abre una sesión y se entrega un token
//     propio (firmado con APP_JWT_SECRET) que el frontend manda en cada llamada.
//  4. Cada petición vuelve a leer la sesión y el usuario en la base: desactivar a alguien
//     o cerrar su sesión corta el acceso al instante.
// =====================================================================
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { SignJWT, jwtVerify, createRemoteJWKSet } = require('jose');

const AREAS = ['Administración', 'Comercial', 'Producción Crisoles', 'Producción Fundente', 'Producción Copelas', 'Calidad', 'Logística', 'Almacen'];

// Módulos que otras áreas necesitan LEER (nunca editar) para hacer sus costeos.
const LECTURA_COMPARTIDA = {
  'Forecast de Ventas': ['Producción Crisoles', 'Producción Fundente', 'Producción Copelas', 'Logística'],
  'Costeo de Embalajes': ['Producción Crisoles', 'Producción Fundente', 'Producción Copelas'],
};

// Prefijo contable (cuentas de destino 9x) de cada área, para filtrar lo ejecutado en Odoo.
const PREFIJO_POR_AREA = {
  'Producción Crisoles': '91', 'Producción Fundente': '92', 'Producción Copelas': '93',
  'Administración': '94', 'Comercial': '95', 'Logística': '98', 'Almacen': '99',
};

const env = (k, d = '') => (process.env[k] ?? d).trim();
const ES_PRODUCCION = env('NODE_ENV') === 'production';
const CONFIG = {
  tenantId: env('AZURE_TENANT_ID'),
  clientId: env('AZURE_CLIENT_ID'),
  // 'desarrollo' permite entrar solo con el correo (sin Microsoft). Nunca se activa en producción.
  modo: env('AUTH_MODO', 'microsoft') === 'desarrollo' && !ES_PRODUCCION ? 'desarrollo' : 'microsoft',
  adminEmails: env('ADMIN_EMAILS').split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
  sesionHoras: parseFloat(env('SESION_HORAS', '10')) || 10,
  inactividadMin: parseFloat(env('INACTIVIDAD_MINUTOS', '60')) || 60,
};

let secreto = env('APP_JWT_SECRET');
if (secreto.length < 32) {
  if (ES_PRODUCCION) throw new Error('APP_JWT_SECRET debe tener al menos 32 caracteres en producción.');
  // En desarrollo se genera uno al vuelo: las sesiones se pierden al reiniciar el backend.
  secreto = crypto.randomBytes(48).toString('hex');
  console.warn('⚠ APP_JWT_SECRET no definido: se usa uno temporal (las sesiones se cierran al reiniciar).');
}
const CLAVE_JWT = new TextEncoder().encode(secreto);

const JWKS_MICROSOFT = CONFIG.tenantId
  ? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${CONFIG.tenantId}/discovery/v2.0/keys`))
  : null;

class ErrorAuth extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}

// req.ip respeta 'trust proxy' (index.js): toma la IP que puso el proxy de Render, no la que envía el navegador.
const ipDe = (req) => req.ip || req.socket?.remoteAddress || null;
const normalizarEmail = (e) => String(e || '').trim().toLowerCase();

// ---------------------------------------------------------------------
// Permisos
// ---------------------------------------------------------------------
const esAdmin = (u) => u?.rol === 'admin';
const areasDe = (u) => (esAdmin(u) ? AREAS : (u?.areas || []));
const puedeEditarArea = (u, area) => esAdmin(u) || (u?.areas || []).includes(area);
const puedeVerRegistro = (u, r) => esAdmin(u)
  || (u?.areas || []).includes(r.area)
  || (LECTURA_COMPARTIDA[r.modulo] || []).some(a => (u?.areas || []).includes(a));
const prefijosDe = (u) => (esAdmin(u) ? null : (u?.areas || []).map(a => PREFIJO_POR_AREA[a]).filter(Boolean));

function usuarioPublico(u) {
  return { email: u.email, nombre: u.nombre || u.email, dni: u.dni || null, rol: u.rol, areas: areasDe(u), esAdmin: esAdmin(u) };
}

// ---------------------------------------------------------------------
// Límite de intentos (evita ataques de fuerza bruta contra el login)
// ---------------------------------------------------------------------
function limitador({ ventanaMs, maximo }) {
  const intentos = new Map();
  return (req, res, next) => {
    const clave = ipDe(req) || 'desconocida';
    const ahora = Date.now();
    const lista = (intentos.get(clave) || []).filter(t => ahora - t < ventanaMs);
    lista.push(ahora);
    intentos.set(clave, lista);
    if (intentos.size > 5000) intentos.clear();
    if (lista.length > maximo) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
    next();
  };
}

// Cabeceras básicas de seguridad para todas las respuestas de la API.
function cabecerasSeguridad(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'same-site',
  });
  if (ES_PRODUCCION) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

// ---------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------
async function registrarActividad(pool, { id_sesion = null, email = null, tipo, area = null, modulo = null, detalle = null, ip = null }) {
  await pool.query(
    'INSERT INTO ppto_actividad (id_sesion, email, tipo, area, modulo, detalle, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id_sesion, email, tipo, area ? String(area).slice(0, 120) : null, modulo ? String(modulo).slice(0, 120) : null, detalle ? String(detalle).slice(0, 300) : null, ip]
  ).catch(e => console.error('No se pudo registrar actividad:', e.message));
}

async function abrirSesion(pool, req, email, metodo) {
  const ip = ipDe(req);
  if (CONFIG.adminEmails.includes(email)) {
    // Los correos de ADMIN_EMAILS siempre pueden entrar como administradores (arranque inicial).
    await pool.query(
      `INSERT INTO ppto_usuarios_acceso (email, rol, activo, creado_por, actualizado_por) VALUES ($1, 'admin', true, 'ADMIN_EMAILS', 'ADMIN_EMAILS')
       ON CONFLICT (email) DO UPDATE SET rol = 'admin', activo = true`,
      [email]
    );
  }
  const u = await pool.query('SELECT * FROM ppto_usuarios_acceso WHERE email = $1', [email]);
  if (u.rowCount === 0 || !u.rows[0].activo) {
    await registrarActividad(pool, { email, tipo: 'rechazo', detalle: `Sin acceso (${metodo})`, ip });
    throw new ErrorAuth(403, `La cuenta ${email} no tiene acceso al sistema. Pide al administrador que la habilite.`);
  }
  const usuario = u.rows[0];
  if (usuario.rol !== 'admin' && (!usuario.areas || usuario.areas.length === 0)) {
    await registrarActividad(pool, { email, tipo: 'rechazo', detalle: 'Usuario sin áreas asignadas', ip });
    throw new ErrorAuth(403, 'Tu usuario todavía no tiene áreas asignadas. Pide al administrador que te asigne una.');
  }

  const id = crypto.randomUUID();
  await pool.query(
    'INSERT INTO ppto_sesiones (id, email, metodo, ip, navegador) VALUES ($1,$2,$3,$4,$5)',
    [id, email, metodo, ip, String(req.get('user-agent') || '').slice(0, 250)]
  );
  await pool.query('UPDATE ppto_usuarios_acceso SET ultimo_ingreso = now() WHERE email = $1', [email]);
  await registrarActividad(pool, { id_sesion: id, email, tipo: 'ingreso', detalle: metodo, ip });

  const token = await new SignJWT({ sid: id })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${Math.round(CONFIG.sesionHoras * 60)}m`)
    .sign(CLAVE_JWT);
  return { token, usuario: usuarioPublico(usuario) };
}

async function cerrarSesion(pool, id, motivo) {
  await pool.query('UPDATE ppto_sesiones SET fin = now(), motivo_fin = $2 WHERE id = $1 AND fin IS NULL', [id, motivo]);
}

// Valida el token propio en cada petición y deja el usuario en req.usuario.
function autenticar(pool) {
  return async (req, res, next) => {
    try {
      const auth = req.get('authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token) throw new ErrorAuth(401, 'Debes iniciar sesión.');
      let payload;
      try {
        ({ payload } = await jwtVerify(token, CLAVE_JWT, { algorithms: ['HS256'] }));
      } catch {
        throw new ErrorAuth(401, 'La sesión expiró. Vuelve a iniciar sesión.');
      }
      const r = await pool.query(
        `SELECT s.id AS sid, s.fin, s.ultima_actividad, u.*
           FROM ppto_sesiones s JOIN ppto_usuarios_acceso u ON u.email = s.email
          WHERE s.id = $1 AND s.email = $2`,
        [payload.sid, payload.sub]
      );
      const fila = r.rows[0];
      if (!fila || fila.fin) throw new ErrorAuth(401, 'La sesión fue cerrada. Vuelve a iniciar sesión.');
      if (!fila.activo) {
        await cerrarSesion(pool, fila.sid, 'revocada');
        throw new ErrorAuth(401, 'Tu acceso fue desactivado.');
      }
      if (Date.now() - new Date(fila.ultima_actividad).getTime() > CONFIG.inactividadMin * 60000) {
        await cerrarSesion(pool, fila.sid, 'inactividad');
        throw new ErrorAuth(401, 'La sesión se cerró por inactividad. Vuelve a iniciar sesión.');
      }
      req.usuario = { ...usuarioPublico(fila), areas: fila.areas || [], rol: fila.rol, sid: fila.sid, ip: ipDe(req) };
      next();
    } catch (e) {
      res.status(e.status || 500).json({ error: e.status ? e.message : 'Error validando la sesión' });
      if (!e.status) console.error('❌ autenticar:', e);
    }
  };
}

function soloAdmin(req, res, next) {
  if (!esAdmin(req.usuario)) return res.status(403).json({ error: 'Solo un administrador puede hacer esto.' });
  next();
}

// ---------------------------------------------------------------------
// Rutas públicas de autenticación (/api/auth/...)
// ---------------------------------------------------------------------
function crearRouterAuth(pool) {
  const router = express.Router();
  const manejar = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      if (!e.status) console.error('❌ auth:', e);
      res.status(e.status || 500).json({ error: e.status ? e.message : 'Error en la autenticación' });
    }
  };
  const limiteLogin = limitador({ ventanaMs: 15 * 60000, maximo: 30 });

  // Datos que el frontend necesita para abrir el login de Microsoft (no son secretos).
  router.get('/auth/config', (req, res) => {
    res.json({ modo: CONFIG.modo, tenantId: CONFIG.tenantId || null, clientId: CONFIG.clientId || null });
  });

  router.post('/auth/microsoft', limiteLogin, manejar(async (req, res) => {
    if (!JWKS_MICROSOFT || !CONFIG.clientId) throw new ErrorAuth(503, 'El login con Microsoft no está configurado (AZURE_TENANT_ID / AZURE_CLIENT_ID).');
    const idToken = String(req.body?.idToken || '');
    if (!idToken) throw new ErrorAuth(400, 'Falta el token de Microsoft.');
    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, JWKS_MICROSOFT, {
        issuer: `https://login.microsoftonline.com/${CONFIG.tenantId}/v2.0`,
        audience: CONFIG.clientId,
      }));
    } catch (e) {
      await registrarActividad(pool, { tipo: 'rechazo', detalle: `Token Microsoft inválido: ${e.code || e.message}`, ip: ipDe(req) });
      throw new ErrorAuth(401, 'No se pudo validar tu cuenta de Microsoft.');
    }
    if (payload.tid !== CONFIG.tenantId) throw new ErrorAuth(401, 'La cuenta no pertenece a la organización.');
    const email = normalizarEmail(payload.preferred_username || payload.email || payload.upn);
    if (!email) throw new ErrorAuth(401, 'La cuenta de Microsoft no tiene correo.');
    const resultado = await abrirSesion(pool, req, email, 'microsoft');
    // Primer ingreso: guarda el nombre que viene de Microsoft si el administrador no puso uno.
    if (payload.name) await pool.query('UPDATE ppto_usuarios_acceso SET nombre = COALESCE(nombre, $2) WHERE email = $1', [email, payload.name]);
    if (!resultado.usuario.nombre || resultado.usuario.nombre === email) resultado.usuario.nombre = payload.name || email;
    res.json(resultado);
  }));

  // SOLO desarrollo local (AUTH_MODO=desarrollo y NODE_ENV distinto de production).
  router.post('/auth/desarrollo', limiteLogin, manejar(async (req, res) => {
    if (CONFIG.modo !== 'desarrollo') throw new ErrorAuth(404, 'No disponible.');
    const email = normalizarEmail(req.body?.email);
    if (!email) throw new ErrorAuth(400, 'Ingresa un correo.');
    res.json(await abrirSesion(pool, req, email, 'desarrollo'));
  }));

  return router;
}

// ---------------------------------------------------------------------
// Rutas con sesión: perfil, latido de uso y cierre (/api/auth/...)
// ---------------------------------------------------------------------
function crearRouterSesion(pool) {
  const router = express.Router();

  router.get('/auth/yo', (req, res) => res.json({ usuario: req.usuario }));

  // Latido cada ~60 s mientras la pestaña está visible y la persona la usa.
  // Suma el tiempo transcurrido (máx. 2.5 min por latido, para no contar pausas largas).
  // Si trae `vista`, registra la pantalla abierta (área / módulo / reporte).
  router.post('/auth/ping', async (req, res) => {
    try {
      const { activo = true, vista } = req.body || {};
      await pool.query(
        `UPDATE ppto_sesiones
            SET segundos_activos = segundos_activos + CASE WHEN $2 THEN LEAST(GREATEST(EXTRACT(EPOCH FROM now() - ultima_actividad), 0), 150)::int ELSE 0 END,
                ultima_actividad = CASE WHEN $2 THEN now() ELSE ultima_actividad END
          WHERE id = $1 AND fin IS NULL`,
        [req.usuario.sid, !!activo]
      );
      if (vista && typeof vista === 'object') {
        await registrarActividad(pool, { id_sesion: req.usuario.sid, email: req.usuario.email, tipo: 'vista', area: vista.area, modulo: vista.modulo, detalle: vista.pantalla, ip: req.usuario.ip });
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('❌ ping:', e.message);
      res.status(500).json({ error: 'No se pudo registrar la actividad' });
    }
  });

  router.post('/auth/salir', async (req, res) => {
    await cerrarSesion(pool, req.usuario.sid, 'salir');
    await registrarActividad(pool, { id_sesion: req.usuario.sid, email: req.usuario.email, tipo: 'salida', ip: req.usuario.ip });
    res.json({ ok: true });
  });

  return router;
}

// ---------------------------------------------------------------------
// Administración: usuarios y permisos, y análisis de uso (/api/admin/...)
// ---------------------------------------------------------------------
function crearRouterAdmin(pool) {
  const router = express.Router();
  router.use('/admin', soloAdmin);
  const manejar = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      if (!e.status) console.error('❌ admin:', e);
      res.status(e.status || 500).json({ error: e.message });
    }
  };

  const validarUsuario = (b) => {
    const email = normalizarEmail(b.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorAuth(400, 'Correo inválido.');
    const rol = b.rol === 'admin' ? 'admin' : 'area';
    const areas = Array.isArray(b.areas) ? b.areas.filter(a => AREAS.includes(a)) : [];
    if (rol === 'area' && areas.length === 0) throw new ErrorAuth(400, 'Un usuario de área necesita al menos un área.');
    const dni = b.dni ? String(b.dni).replace(/\D/g, '').slice(0, 20) || null : null;
    return { email, rol, areas: rol === 'admin' ? [] : areas, dni, nombre: b.nombre ? String(b.nombre).trim().slice(0, 150) : null, activo: b.activo !== false };
  };

  // Lista de usuarios con el empleado (por DNI) si existe el maestro de empleados.
  router.get('/admin/usuarios', manejar(async (req, res) => {
    const hayEmpleados = (await pool.query("SELECT to_regclass('maestros_empleados_local') IS NOT NULL AS ok")).rows[0].ok;
    const sql = hayEmpleados
      ? `SELECT u.*, e.nombre AS empleado_nombre, e.area AS empleado_area, e.puesto AS empleado_puesto
           FROM ppto_usuarios_acceso u
           LEFT JOIN LATERAL (SELECT nombre, area, puesto FROM maestros_empleados_local e WHERE u.dni IS NOT NULL AND e.dni = u.dni LIMIT 1) e ON true
          ORDER BY u.activo DESC, u.nombre NULLS LAST, u.email`
      : 'SELECT u.* FROM ppto_usuarios_acceso u ORDER BY u.activo DESC, u.nombre NULLS LAST, u.email';
    const r = await pool.query(sql);
    res.json({ areas: AREAS, adminEmails: CONFIG.adminEmails, usuarios: r.rows });
  }));

  // Crear o actualizar (por correo).
  router.post('/admin/usuarios', manejar(async (req, res) => {
    const u = validarUsuario(req.body || {});
    if (u.email === req.usuario.email && (u.rol !== 'admin' || !u.activo)) throw new ErrorAuth(400, 'No puedes quitarte tu propio acceso de administrador.');
    const antes = (await pool.query('SELECT * FROM ppto_usuarios_acceso WHERE email = $1', [u.email])).rows[0] || null;
    const r = await pool.query(
      `INSERT INTO ppto_usuarios_acceso (email, dni, nombre, rol, areas, activo, creado_por, actualizado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
       ON CONFLICT (email) DO UPDATE SET dni = EXCLUDED.dni, nombre = EXCLUDED.nombre, rol = EXCLUDED.rol, areas = EXCLUDED.areas,
         activo = EXCLUDED.activo, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now()
       RETURNING *`,
      [u.email, u.dni, u.nombre, u.rol, u.areas, u.activo, req.usuario.email]
    );
    if (!u.activo) await pool.query("UPDATE ppto_sesiones SET fin = now(), motivo_fin = 'revocada' WHERE email = $1 AND fin IS NULL", [u.email]);
    await pool.query(
      `INSERT INTO ppto_auditoria (usuario, ip, accion, tabla, id_objeto, antes, despues) VALUES ($1,$2,$3,'ppto_usuarios_acceso',$4,$5,$6)`,
      [req.usuario.email, req.usuario.ip, antes ? 'ACTUALIZAR' : 'CREAR', u.email, antes ? JSON.stringify(antes) : null, JSON.stringify(r.rows[0])]
    );
    res.json(r.rows[0]);
  }));

  // Cierra todas las sesiones abiertas de un usuario (p. ej. si perdió su laptop).
  router.post('/admin/usuarios/:email/cerrar-sesiones', manejar(async (req, res) => {
    const r = await pool.query("UPDATE ppto_sesiones SET fin = now(), motivo_fin = 'revocada' WHERE email = $1 AND fin IS NULL", [normalizarEmail(req.params.email)]);
    res.json({ cerradas: r.rowCount });
  }));

  // Análisis de uso entre dos fechas (por defecto, los últimos 30 días).
  router.get('/admin/actividad', manejar(async (req, res) => {
    const hasta = req.query.hasta ? new Date(`${req.query.hasta}T23:59:59`) : new Date();
    const desde = req.query.desde ? new Date(`${req.query.desde}T00:00:00`) : new Date(hasta.getTime() - 30 * 86400000);
    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) throw new ErrorAuth(400, 'Fechas inválidas.');
    const p = [desde, hasta];
    const [usuarios, sesiones, cambios, vistas, porDia, porModulo, recientes] = await Promise.all([
      pool.query('SELECT email, nombre, rol, areas, activo, ultimo_ingreso FROM ppto_usuarios_acceso'),
      pool.query(`SELECT email, count(*)::int AS sesiones, COALESCE(sum(segundos_activos),0)::int AS segundos, max(inicio) AS ultima_sesion
                    FROM ppto_sesiones WHERE inicio BETWEEN $1 AND $2 GROUP BY email`, p),
      pool.query(`SELECT usuario AS email,
                         count(*) FILTER (WHERE accion = 'CREAR')::int AS creados,
                         count(*) FILTER (WHERE accion IN ('ACTUALIZAR','RESTAURAR'))::int AS modificados,
                         count(*) FILTER (WHERE accion = 'ELIMINAR')::int AS eliminados,
                         count(*) FILTER (WHERE accion = 'LOTE')::int AS costeos,
                         max(fecha) AS ultimo_cambio
                    FROM ppto_auditoria WHERE fecha BETWEEN $1 AND $2 AND tabla = 'ppto_registros' GROUP BY usuario`, p),
      pool.query(`SELECT email, count(*)::int AS vistas FROM ppto_actividad WHERE tipo = 'vista' AND fecha BETWEEN $1 AND $2 GROUP BY email`, p),
      pool.query(`SELECT to_char(inicio, 'YYYY-MM-DD') AS dia, count(DISTINCT email)::int AS usuarios, count(*)::int AS sesiones,
                         COALESCE(sum(segundos_activos),0)::int AS segundos
                    FROM ppto_sesiones WHERE inicio BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`, p),
      pool.query(`SELECT COALESCE(area,'-') AS area, COALESCE(modulo,'-') AS modulo, count(*)::int AS cambios,
                         count(DISTINCT usuario)::int AS usuarios, string_agg(DISTINCT usuario, ', ') AS quienes, max(fecha) AS ultimo
                    FROM ppto_auditoria WHERE fecha BETWEEN $1 AND $2 AND tabla = 'ppto_registros'
                   GROUP BY 1, 2 ORDER BY cambios DESC`, p),
      pool.query(`SELECT s.id, s.email, u.nombre, s.metodo, s.inicio, s.ultima_actividad, s.fin, s.motivo_fin, s.segundos_activos, s.ip, s.navegador
                    FROM ppto_sesiones s LEFT JOIN ppto_usuarios_acceso u ON u.email = s.email
                   WHERE s.inicio BETWEEN $1 AND $2 ORDER BY s.inicio DESC LIMIT 300`, p),
    ]);
    const mapa = new Map();
    const fila = (email) => {
      if (!mapa.has(email)) mapa.set(email, { email, nombre: null, rol: null, areas: [], activo: null, sesiones: 0, segundos: 0, vistas: 0, creados: 0, modificados: 0, eliminados: 0, costeos: 0 });
      return mapa.get(email);
    };
    usuarios.rows.forEach(u => Object.assign(fila(u.email), u));
    sesiones.rows.forEach(s => Object.assign(fila(s.email), s));
    cambios.rows.forEach(c => Object.assign(fila(c.email), c));
    vistas.rows.forEach(v => Object.assign(fila(v.email), v));
    res.json({
      desde, hasta,
      porUsuario: [...mapa.values()].sort((a, b) => b.segundos - a.segundos || (b.creados + b.modificados) - (a.creados + a.modificados)),
      porDia: porDia.rows,
      porModulo: porModulo.rows,
      sesiones: recientes.rows,
    });
  }));

  return router;
}

async function inicializarEsquemaSeguridad(pool) {
  await pool.query(fs.readFileSync(path.join(__dirname, 'db', 'schema_seguridad.sql'), 'utf8'));
  if (CONFIG.modo === 'desarrollo') console.warn('⚠ AUTH_MODO=desarrollo: se puede entrar solo con el correo (no usar fuera de tu PC).');
  if (CONFIG.modo === 'microsoft' && (!CONFIG.tenantId || !CONFIG.clientId)) console.warn('⚠ Falta AZURE_TENANT_ID / AZURE_CLIENT_ID: nadie podrá iniciar sesión.');
  if (CONFIG.adminEmails.length === 0) console.warn('⚠ ADMIN_EMAILS vacío: define al menos un administrador inicial.');
}

module.exports = {
  AREAS, CONFIG,
  cabecerasSeguridad, autenticar, soloAdmin,
  crearRouterAuth, crearRouterSesion, crearRouterAdmin, inicializarEsquemaSeguridad,
  esAdmin, puedeEditarArea, puedeVerRegistro, prefijosDe,
};
