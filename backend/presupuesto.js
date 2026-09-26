// =====================================================================
// API de PRESUPUESTO: versiones y registros (CRUD) con historial.
//
// - Cada registro sabe de qué versión, área y módulo proviene.
// - Crear / actualizar / eliminar deja rastro en ppto_auditoria
//   (quién, cuándo, valor anterior y nuevo).
// - Eliminar es un borrado lógico: el registro se puede restaurar.
// - `rev` evita que dos personas se pisen: si alguien guardó antes,
//   la segunda edición recibe 409 en vez de sobrescribir.
// - Los registros derivados de un costeo (DERIV-...) se regeneran en
//   cada guardado: se reemplazan sin llenar el historial fila por fila.
// =====================================================================
const fs = require('fs');
const path = require('path');
const express = require('express');
const { types } = require('pg');
const { soloAdmin, puedeEditarArea, puedeVerRegistro } = require('./seguridad');

// Las columnas DATE se devuelven tal cual ('2026-01-01'), sin convertir a Date con zona horaria.
types.setTypeParser(1082, (v) => v);

const CAMPOS_META = ['rev', 'creado_por', 'creado_en', 'actualizado_por', 'actualizado_en', 'eliminado', 'eliminado_por', 'eliminado_en', 'idVersion'];

class ErrorApi extends Error {
  constructor(status, mensaje, extra = {}) {
    super(mensaje);
    this.status = status;
    this.extra = extra;
  }
}

async function inicializarEsquemaPresupuesto(pool) {
  const sql = fs.readFileSync(path.join(__dirname, 'db', 'schema_presupuesto.sql'), 'utf8');
  await pool.query(sql);
  await completarForecastExistente(pool);
}

// Forecast guardados antes de existir ppto_forecast_mensual: se generan sus filas mensuales
// y se quitan las "cuentas" de ventas/costo que antes quedaban en ppto_registro_lineas.
async function completarForecastExistente(pool) {
  await pool.query("DELETE FROM ppto_registro_lineas WHERE tipo_registro = 'forecast'");
  const pendientes = await pool.query(
    `SELECT r.* FROM ppto_registros r
      WHERE r.tipo_registro = 'forecast' AND NOT r.eliminado
        AND NOT EXISTS (SELECT 1 FROM ppto_forecast_mensual f WHERE f.id_registro = r.id_registro)`
  );
  for (const f of pendientes.rows) {
    const r = filaARegistro(f);
    await guardarForecastMensual(pool, r, camposCabecera(r));
  }
  if (pendientes.rowCount > 0) console.log(`✅ Forecast mensual generado para ${pendientes.rowCount} registros existentes`);
}

// El usuario sale de la sesión validada (middleware `autenticar` de seguridad.js), nunca del navegador.
const usuarioDe = (req) => req.usuario.email;
const ipDe = (req) => req.usuario?.ip || req.socket?.remoteAddress || null;

// Derivado que un costeo de embalajes (Logística) deja en la cuenta de embalaje de un centro de producción.
// También los gastos de Calidad repartidos por su Distribución a Crisoles, Fundente, Copelas y Comercial.
const DESTINOS_CALIDAD = ['Producción Crisoles', 'Producción Fundente', 'Producción Copelas', 'Comercial'];
const derivadoPermitido = (ctx, r) => puedeEditarArea(ctx.quien, r.area)
  || (ctx.embalaje && String(r.area || '').startsWith('Producción') && r.modulo === 'Envases y Embalajes')
  || (ctx.calidad && DESTINOS_CALIDAD.includes(r.area) && String(r.id_registro || '').startsWith('DERIV-CAL-'));

// Un usuario de área solo crea, edita o elimina registros de sus áreas.
function exigirArea(ctx, area, idRegistro) {
  if (!puedeEditarArea(ctx.quien, area)) {
    throw new ErrorApi(403, `No tienes permiso para modificar registros del área ${area || '(sin área)'} (${idRegistro}).`);
  }
}

const esDerivado = (r) => r?.detalle_columnas?.es_derivado === true || String(r?.id_registro || '').startsWith('DERIV-');

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// Solo acepta fechas AAAA-MM-DD (o que empiecen así); lo demás queda en null.
function fechaValida(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { fecha: null, anio: null, mes: null };
  return { fecha: `${m[1]}-${m[2]}-${m[3]}`, anio: parseInt(m[1], 10), mes: parseInt(m[2], 10) };
}

// gasto = lo que va al reporte de gastos; costeo y forecast son formularios de apoyo / ventas.
function tipoRegistro(modulo) {
  const m = String(modulo || '').toLowerCase();
  if (m.startsWith('costeo de')) return 'costeo';
  if (m.startsWith('forecast')) return 'forecast';
  return 'gasto';
}

// "916121000 - Materias primas - Materias primas" -> { codigo: '916121000', nombre: 'Materias primas - Materias primas' }
function separarCuenta(texto) {
  const t = String(texto || '').trim();
  const m = t.match(/^(\d+)\s*(?:-\s*)?(.*)$/);
  if (!m) return { codigo: null, nombre: t || null };
  return { codigo: m[1], nombre: m[2].trim() || null };
}

// Columnas comunes de la cabecera, tomadas del registro tal como lo arma cada formulario.
function camposCabecera(r) {
  const dc = r.detalle_columnas || {};
  const { fecha, anio, mes } = fechaValida(r.fecha_proyeccion);
  return {
    tipo: tipoRegistro(r.modulo),
    fecha, anio, mes,
    detalle: dc.detalle || dc.viaje || dc.concepto || null,
    nombre: dc.producto || r.empleado_nombre || null,
    monto: num(r.totales?.costo_total ?? dc.costo_total ?? dc.costo_total_anual),
  };
}

// Líneas contables del registro: una por cada cuenta del desglose (o la cuenta afectada si no hay desglose).
// El forecast no genera líneas contables: va a ppto_forecast_mensual.
function lineasDe(r, cab) {
  if (cab.tipo === 'forecast') return [];
  const dc = r.detalle_columnas || {};
  const desglose = Array.isArray(r.desglose_contable) ? r.desglose_contable.filter(d => d && (d.cuenta || d.monto)) : [];
  const base = desglose.length > 0
    ? desglose.map(d => ({ cuenta: d.cuenta, monto: num(d.monto), detalle: d.detalle || cab.detalle }))
    : (dc.cuenta_afectada || dc.numero_cuenta) ? [{ cuenta: dc.cuenta_afectada || dc.numero_cuenta, monto: cab.monto, detalle: cab.detalle }] : [];
  return base
    .filter(l => l.monto !== 0 || l.cuenta)
    .map(l => ({ ...separarCuenta(l.cuenta), monto: l.monto, detalle: l.detalle || null }));
}

async function guardarLineas(cx, r, cab) {
  await cx.query('DELETE FROM ppto_registro_lineas WHERE id_registro = $1', [r.id_registro]);
  const lineas = lineasDe(r, cab);
  if (lineas.length === 0) return;
  const valores = [];
  const params = [];
  lineas.forEach((l, i) => {
    const b = i * 12;
    valores.push(`(${Array.from({ length: 12 }, (_, k) => `$${b + k + 1}`).join(',')})`);
    params.push(r.id_registro, r.id_version, r.area, r.modulo, cab.tipo, cab.fecha, cab.anio, cab.mes, l.codigo, l.nombre, l.detalle, l.monto);
  });
  await cx.query(
    `INSERT INTO ppto_registro_lineas (id_registro, id_version, area, modulo, tipo_registro, fecha, anio, mes, cuenta_codigo, cuenta_nombre, detalle, monto)
     VALUES ${valores.join(',')}`,
    params
  );
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

// Forecast: una fila por mes con cantidad, probabilidad, precio, costo, ingreso y margen (también en soles).
async function guardarForecastMensual(cx, r, cab) {
  await cx.query('DELETE FROM ppto_forecast_mensual WHERE id_registro = $1', [r.id_registro]);
  if (cab.tipo !== 'forecast') return;
  const dc = r.detalle_columnas || {};
  const anio = parseInt(dc.anio_proyeccion, 10) || cab.anio;
  const moneda = dc.moneda || 'S/';
  const tc = moneda === 'US$' ? (num(dc.tipo_cambio) || 1) : 1;
  const precio = num(dc.precio_venta);
  const costoU = num(dc.costo_unitario);
  const probDe = (m) => (dc.tipo_probabilidad === 'general' || !dc.probabilidades_meses)
    ? num(dc.probabilidad_general ?? 100)
    : num(dc.probabilidades_meses?.[m] ?? 100);

  const filas = MESES.map((m, i) => {
    const cantidad = num(dc.cantidades?.[m]);
    const prob = probDe(m);
    const esperada = cantidad * prob / 100;
    const ingreso = esperada * precio;
    const costo = esperada * costoU;
    return [r.id_registro, r.id_version, anio, i + 1, dc.unidad_negocio || null, dc.codigo_producto || null, dc.producto || null,
      dc.presentacion_fundente || null, dc.cliente || null, dc.tipo_cliente || null, dc.vendedor || null, dc.zona || null, dc.pais || null,
      dc.um || null, moneda, tc, cantidad, prob, esperada, precio, costoU, ingreso, costo, ingreso - costo, ingreso * tc, costo * tc, (ingreso - costo) * tc,
      dc.tipo_negocio || null, dc.cuenta_venta || null, dc.cuenta_costo || null];
  }).filter(f => f[16] !== 0);
  if (filas.length === 0) return;

  const nCols = filas[0].length;
  const valores = filas.map((_, i) => `(${Array.from({ length: nCols }, (_, k) => `$${i * nCols + k + 1}`).join(',')})`);
  await cx.query(
    `INSERT INTO ppto_forecast_mensual (id_registro, id_version, anio, mes, unidad_negocio, codigo_producto, producto, presentacion, cliente, tipo_cliente,
       vendedor, zona, pais, um, moneda, tipo_cambio, cantidad, probabilidad, cantidad_esperada, precio_venta, costo_unitario, ingreso, costo, margen,
       ingreso_soles, costo_soles, margen_soles, tipo_negocio, cuenta_venta, cuenta_costo)
     VALUES ${valores.join(',')}`,
    filas.flat()
  );
}

function limpiarDatos(r) {
  const datos = { ...r };
  CAMPOS_META.forEach(c => delete datos[c]);
  return datos;
}

function filaARegistro(f) {
  return {
    ...f.datos,
    id_registro: f.id_registro,
    id_version: f.id_version,
    area: f.area,
    modulo: f.modulo,
    id_lote: f.id_lote,
    fecha_proyeccion: f.datos?.fecha_proyeccion ?? f.fecha_proyeccion,
    rev: f.rev,
    creado_por: f.creado_por,
    creado_en: f.creado_en,
    actualizado_por: f.actualizado_por,
    actualizado_en: f.actualizado_en,
  };
}

function filaAVersion(f) {
  return {
    id_version: f.id_version,
    nombre: f.nombre,
    estado: f.estado,
    fecha_creacion: f.fecha_creacion instanceof Date ? f.fecha_creacion.toISOString().split('T')[0] : f.fecha_creacion,
    clonada_de: f.clonada_de,
    rev: f.rev,
    creado_por: f.creado_por,
    creado_en: f.creado_en,
    actualizado_por: f.actualizado_por,
    actualizado_en: f.actualizado_en,
  };
}

function normalizarRegistro(r) {
  const reg = { ...r, id_version: r.id_version || r.idVersion };
  if (!reg.id_registro) throw new ErrorApi(400, 'Falta id_registro');
  if (!reg.id_version || !reg.area || !reg.modulo) {
    throw new ErrorApi(400, `El registro ${reg.id_registro} debe indicar versión, área y módulo`);
  }
  return reg;
}

async function auditar(cx, { usuario, ip, accion, tabla, id_objeto, id_version, area, modulo, antes = null, despues = null, detalle = null }) {
  await cx.query(
    `INSERT INTO ppto_auditoria (usuario, ip, accion, tabla, id_objeto, id_version, area, modulo, antes, despues, detalle)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [usuario, ip, accion, tabla, id_objeto, id_version, area, modulo,
     antes ? JSON.stringify(antes) : null, despues ? JSON.stringify(despues) : null, detalle]
  );
}

async function conTransaccion(pool, fn) {
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    const res = await fn(cx);
    await cx.query('COMMIT');
    return res;
  } catch (e) {
    await cx.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    cx.release();
  }
}

async function verificarVersionExiste(cx, idVersion) {
  const r = await cx.query('SELECT 1 FROM ppto_versiones WHERE id_version = $1 AND NOT eliminado', [idVersion]);
  if (r.rowCount === 0) throw new ErrorApi(400, `La versión ${idVersion} no existe`);
}

// Inserta o actualiza un registro. Con verificarRev, una edición basada en un `rev` viejo se rechaza (409).
async function upsertRegistro(cx, entrada, ctx, { verificarRev = true, conAuditoria = true, permitirDerivado = false } = {}) {
  const r = normalizarRegistro(entrada);
  const datos = limpiarDatos(r);
  const derivado = esDerivado(r);
  const actual = await cx.query('SELECT * FROM ppto_registros WHERE id_registro = $1 FOR UPDATE', [r.id_registro]);
  // Los derivados de un costeo ya se autorizaron con su registro principal (ver /registros/lote).
  if (!(derivado && permitirDerivado)) {
    exigirArea(ctx, r.area, r.id_registro);
    if (actual.rowCount > 0) exigirArea(ctx, actual.rows[0].area, r.id_registro);
  }

  const cab = camposCabecera(r);

  if (actual.rowCount === 0) {
    const ins = await cx.query(
      `INSERT INTO ppto_registros (id_registro, id_version, area, modulo, tipo_registro, id_lote, fecha_proyeccion, anio, mes, detalle, nombre_referencia, monto_total, es_derivado, datos, creado_por, actualizado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15) RETURNING *`,
      [r.id_registro, r.id_version, r.area, r.modulo, cab.tipo, r.id_lote || null, cab.fecha, cab.anio, cab.mes, cab.detalle, cab.nombre, cab.monto, derivado, JSON.stringify(datos), ctx.usuario]
    );
    await guardarLineas(cx, r, cab);
  await guardarForecastMensual(cx, r, cab);
    if (conAuditoria && !derivado) {
      await auditar(cx, { ...ctx, accion: 'CREAR', tabla: 'ppto_registros', id_objeto: r.id_registro, id_version: r.id_version, area: r.area, modulo: r.modulo, despues: datos });
    }
    return ins.rows[0];
  }

  const previo = actual.rows[0];
  if (verificarRev && !previo.eliminado && r.rev != null && Number(r.rev) !== previo.rev) {
    throw new ErrorApi(409, `Otro usuario (${previo.actualizado_por || 'desconocido'}) modificó este registro después de que lo abriste. Recarga y vuelve a intentar.`,
      { registro_actual: filaARegistro(previo) });
  }

  const upd = await cx.query(
    `UPDATE ppto_registros
        SET id_version = $2, area = $3, modulo = $4, tipo_registro = $5, id_lote = $6, fecha_proyeccion = $7, anio = $8, mes = $9,
            detalle = $10, nombre_referencia = $11, monto_total = $12, es_derivado = $13, datos = $14,
            rev = rev + 1, actualizado_por = $15, actualizado_en = now(),
            eliminado = false, eliminado_por = NULL, eliminado_en = NULL
      WHERE id_registro = $1 RETURNING *`,
    [r.id_registro, r.id_version, r.area, r.modulo, cab.tipo, r.id_lote || null, cab.fecha, cab.anio, cab.mes, cab.detalle, cab.nombre, cab.monto, derivado, JSON.stringify(datos), ctx.usuario]
  );
  await guardarLineas(cx, r, cab);
  await guardarForecastMensual(cx, r, cab);
  if (conAuditoria && !derivado) {
    await auditar(cx, { ...ctx, accion: previo.eliminado ? 'RESTAURAR' : 'ACTUALIZAR', tabla: 'ppto_registros', id_objeto: r.id_registro,
      id_version: r.id_version, area: r.area, modulo: r.modulo, antes: previo.datos, despues: datos });
  }
  return upd.rows[0];
}

// Quita registros que ya no forman parte de un costeo: los derivados se borran físicamente
// (se regeneran en cada guardado); los demás se eliminan lógicamente con historial.
async function retirarRegistros(cx, filas, ctx, detalle = null) {
  for (const f of filas) {
    if (!f.es_derivado || !derivadoPermitido(ctx, f)) exigirArea(ctx, f.area, f.id_registro);
    if (f.es_derivado) {
      await cx.query('DELETE FROM ppto_registros WHERE id_registro = $1', [f.id_registro]);
    } else {
      await cx.query(
        'UPDATE ppto_registros SET eliminado = true, eliminado_por = $2, eliminado_en = now(), rev = rev + 1 WHERE id_registro = $1',
        [f.id_registro, ctx.usuario]
      );
      await auditar(cx, { ...ctx, accion: 'ELIMINAR', tabla: 'ppto_registros', id_objeto: f.id_registro, id_version: f.id_version, area: f.area, modulo: f.modulo, antes: f.datos, detalle });
    }
  }
}

const escaparLike = (t) => String(t).replace(/[\\%_]/g, c => `\\${c}`);

function crearRouterPresupuesto(pool) {
  const router = express.Router();
  const ctxDe = (req) => ({ usuario: usuarioDe(req), ip: ipDe(req), quien: req.usuario });
  const manejar = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error('❌ API presupuesto:', e);
      res.status(status).json({ error: e.message, ...(e.extra || {}) });
    }
  };

  // ---------- Carga completa (el frontend la usa como caché al iniciar) ----------
  router.get('/presupuesto/datos', manejar(async (req, res) => {
    const [v, r] = await Promise.all([
      pool.query('SELECT * FROM ppto_versiones WHERE NOT eliminado ORDER BY fecha_creacion, id_version'),
      pool.query('SELECT * FROM ppto_registros WHERE NOT eliminado ORDER BY creado_en'),
    ]);
    // Cada usuario recibe solo lo de sus áreas (y lo que otras áreas le comparten para sus costeos).
    const registros = r.rows.map(filaARegistro).filter(reg => puedeVerRegistro(req.usuario, reg));
    res.json({ versiones: v.rows.map(filaAVersion), registros });
  }));

  // ---------- VERSIONES ----------
  router.get('/versiones', manejar(async (req, res) => {
    const v = await pool.query('SELECT * FROM ppto_versiones WHERE NOT eliminado ORDER BY fecha_creacion, id_version');
    res.json(v.rows.map(filaAVersion));
  }));

  // Crea una versión; si viene `registros` (clonado), se insertan en la misma transacción.
  router.post('/versiones', soloAdmin, manejar(async (req, res) => {
    const { version, registros = [] } = req.body || {};
    if (!version?.id_version || !version?.nombre) throw new ErrorApi(400, 'La versión necesita id_version y nombre');
    const ctx = ctxDe(req);
    const resultado = await conTransaccion(pool, async (cx) => {
      const existe = await cx.query('SELECT 1 FROM ppto_versiones WHERE id_version = $1', [version.id_version]);
      if (existe.rowCount > 0) throw new ErrorApi(409, `Ya existe la versión ${version.id_version}`);
      const ins = await cx.query(
        `INSERT INTO ppto_versiones (id_version, nombre, estado, fecha_creacion, clonada_de, creado_por, actualizado_por)
         VALUES ($1,$2,$3,COALESCE($4::date, CURRENT_DATE),$5,$6,$6) RETURNING *`,
        [version.id_version, version.nombre.trim(), version.estado || 'Borrador', version.fecha_creacion || null, version.clonada_de || null, ctx.usuario]
      );
      await auditar(cx, { ...ctx, accion: 'CREAR', tabla: 'ppto_versiones', id_objeto: version.id_version, id_version: version.id_version, despues: version,
        detalle: version.clonada_de ? `Clonada de ${version.clonada_de} (${registros.length} registros)` : null });
      const filas = [];
      for (const r of registros) filas.push(await upsertRegistro(cx, { ...r, id_version: version.id_version }, ctx, { verificarRev: false, conAuditoria: false }));
      return { version: filaAVersion(ins.rows[0]), registros: filas.map(filaARegistro) };
    });
    res.status(201).json(resultado);
  }));

  router.put('/versiones/:id', soloAdmin, manejar(async (req, res) => {
    const { cambios = {}, rev } = req.body || {};
    const ctx = ctxDe(req);
    const version = await conTransaccion(pool, async (cx) => {
      const actual = await cx.query('SELECT * FROM ppto_versiones WHERE id_version = $1 AND NOT eliminado FOR UPDATE', [req.params.id]);
      if (actual.rowCount === 0) throw new ErrorApi(404, 'Versión no encontrada');
      const previo = actual.rows[0];
      if (rev != null && Number(rev) !== previo.rev) {
        throw new ErrorApi(409, `Otro usuario (${previo.actualizado_por || 'desconocido'}) modificó esta versión. Recarga y vuelve a intentar.`, { version_actual: filaAVersion(previo) });
      }
      const upd = await cx.query(
        `UPDATE ppto_versiones SET nombre = COALESCE($2, nombre), estado = COALESCE($3, estado),
                rev = rev + 1, actualizado_por = $4, actualizado_en = now()
          WHERE id_version = $1 RETURNING *`,
        [req.params.id, cambios.nombre?.trim() || null, cambios.estado || null, ctx.usuario]
      );
      await auditar(cx, { ...ctx, accion: 'ACTUALIZAR', tabla: 'ppto_versiones', id_objeto: req.params.id, id_version: req.params.id, antes: filaAVersion(previo), despues: filaAVersion(upd.rows[0]) });
      return filaAVersion(upd.rows[0]);
    });
    res.json(version);
  }));

  // Borrado lógico de la versión y de todos sus registros.
  router.delete('/versiones/:id', soloAdmin, manejar(async (req, res) => {
    const ctx = ctxDe(req);
    await conTransaccion(pool, async (cx) => {
      const actual = await cx.query('SELECT * FROM ppto_versiones WHERE id_version = $1 AND NOT eliminado FOR UPDATE', [req.params.id]);
      if (actual.rowCount === 0) throw new ErrorApi(404, 'Versión no encontrada');
      await cx.query('UPDATE ppto_versiones SET eliminado = true, eliminado_por = $2, eliminado_en = now(), rev = rev + 1 WHERE id_version = $1', [req.params.id, ctx.usuario]);
      const regs = await cx.query('UPDATE ppto_registros SET eliminado = true, eliminado_por = $2, eliminado_en = now() WHERE id_version = $1 AND NOT eliminado', [req.params.id, ctx.usuario]);
      await auditar(cx, { ...ctx, accion: 'ELIMINAR', tabla: 'ppto_versiones', id_objeto: req.params.id, id_version: req.params.id, antes: filaAVersion(actual.rows[0]), detalle: `Incluye ${regs.rowCount} registros` });
    });
    res.json({ ok: true });
  }));

  // ---------- REGISTROS ----------
  router.get('/registros', manejar(async (req, res) => {
    const { version, area, modulo } = req.query;
    const cond = ['NOT eliminado'];
    const params = [];
    if (version) { params.push(version); cond.push(`id_version = $${params.length}`); }
    if (area) { params.push(area); cond.push(`lower(area) = lower($${params.length})`); }
    if (modulo) { params.push(modulo); cond.push(`lower(modulo) = lower($${params.length})`); }
    const r = await pool.query(`SELECT * FROM ppto_registros WHERE ${cond.join(' AND ')} ORDER BY creado_en`, params);
    res.json(r.rows.map(filaARegistro).filter(reg => puedeVerRegistro(req.usuario, reg)));
  }));

  router.get('/registros/:id', manejar(async (req, res) => {
    const r = await pool.query('SELECT * FROM ppto_registros WHERE id_registro = $1 AND NOT eliminado', [req.params.id]);
    if (r.rowCount === 0 || !puedeVerRegistro(req.usuario, r.rows[0])) throw new ErrorApi(404, 'Registro no encontrado');
    res.json(filaARegistro(r.rows[0]));
  }));

  // Crear o actualizar uno o varios registros (con control de edición simultánea).
  router.post('/registros', manejar(async (req, res) => {
    const lista = Array.isArray(req.body?.registros) ? req.body.registros : [req.body?.registro || req.body].filter(Boolean);
    if (lista.length === 0) throw new ErrorApi(400, 'No se enviaron registros');
    const ctx = ctxDe(req);
    const filas = await conTransaccion(pool, async (cx) => {
      const versiones = new Set(lista.map(r => r.id_version || r.idVersion));
      for (const v of versiones) await verificarVersionExiste(cx, v);
      const out = [];
      for (const r of lista) out.push(await upsertRegistro(cx, r, ctx));
      return out;
    });
    res.json(filas.map(filaARegistro));
  }));

  router.put('/registros/:id', manejar(async (req, res) => {
    const registro = { ...(req.body?.registro || req.body), id_registro: req.params.id };
    const ctx = ctxDe(req);
    const fila = await conTransaccion(pool, async (cx) => {
      const existe = await cx.query('SELECT 1 FROM ppto_registros WHERE id_registro = $1 AND NOT eliminado', [req.params.id]);
      if (existe.rowCount === 0) throw new ErrorApi(404, 'Registro no encontrado');
      return upsertRegistro(cx, registro, ctx);
    });
    res.json(filaARegistro(fila));
  }));

  // Guardado de un costeo completo: su registro principal + registros derivados.
  //  - reemplazar = id de UN costeo: reemplaza ese costeo y sus derivados.
  //  - sin reemplazar: reemplaza todo el lote (id_lote del primer registro).
  router.post('/registros/lote', manejar(async (req, res) => {
    const { registros = [], reemplazar } = req.body || {};
    if (!Array.isArray(registros) || registros.length === 0) throw new ErrorApi(400, 'No se enviaron registros');
    const ctx = ctxDe(req);
    // El registro principal del costeo debe ser de un área del usuario. Sus derivados pueden ir a
    // otra área solo en el caso previsto: Logística costea el embalaje de los centros de producción.
    const principales = registros.filter(r => !esDerivado(r));
    if (principales.length === 0) throw new ErrorApi(400, 'El lote no tiene registro principal');
    principales.forEach(r => exigirArea(ctx, r.area, r.id_registro));
    ctx.embalaje = principales.every(r => r.modulo === 'Costeo de Embalajes');
    ctx.calidad = principales.every(r => r.modulo === 'Distribución de Calidad' && r.area === 'Calidad');
    registros.filter(esDerivado).forEach(r => { if (!derivadoPermitido(ctx, r)) exigirArea(ctx, r.area, r.id_registro); });
    const filas = await conTransaccion(pool, async (cx) => {
      const versiones = new Set(registros.map(r => r.id_version || r.idVersion));
      for (const v of versiones) await verificarVersionExiste(cx, v);

      const idsNuevos = new Set(registros.map(r => r.id_registro));
      let previos;
      if (reemplazar) {
        previos = await cx.query(
          `SELECT * FROM ppto_registros WHERE NOT eliminado AND (id_registro = $1 OR id_registro LIKE $2 ESCAPE '\\')`,
          [reemplazar, `%-${escaparLike(reemplazar)}-%`]
        );
      } else {
        const idLote = registros[0].id_lote;
        previos = idLote
          ? await cx.query('SELECT * FROM ppto_registros WHERE NOT eliminado AND id_lote = $1', [idLote])
          : { rows: [] };
      }
      await retirarRegistros(cx, previos.rows.filter(f => !idsNuevos.has(f.id_registro)), ctx, 'Reemplazado al volver a guardar el costeo');

      const out = [];
      for (const r of registros) out.push(await upsertRegistro(cx, r, ctx, { verificarRev: false, permitirDerivado: true }));

      const principal = registros.find(r => !esDerivado(r)) || registros[0];
      await auditar(cx, { ...ctx, accion: 'LOTE', tabla: 'ppto_registros', id_objeto: reemplazar || registros[0].id_lote || principal.id_registro,
        id_version: principal.id_version || principal.idVersion, area: principal.area, modulo: principal.modulo,
        detalle: `${registros.length} registros guardados (${registros.filter(esDerivado).length} derivados)` });
      return out;
    });
    res.json(filas.map(filaARegistro));
  }));

  router.delete('/registros/:id', manejar(async (req, res) => {
    const ctx = ctxDe(req);
    await conTransaccion(pool, async (cx) => {
      const actual = await cx.query('SELECT * FROM ppto_registros WHERE id_registro = $1 AND NOT eliminado FOR UPDATE', [req.params.id]);
      if (actual.rowCount === 0) throw new ErrorApi(404, 'Registro no encontrado');
      await retirarRegistros(cx, [{ ...actual.rows[0], es_derivado: false }], ctx);
    });
    res.json({ ok: true });
  }));

  router.post('/registros/:id/restaurar', manejar(async (req, res) => {
    const ctx = ctxDe(req);
    const fila = await conTransaccion(pool, async (cx) => {
      const actual = await cx.query('SELECT * FROM ppto_registros WHERE id_registro = $1 AND eliminado FOR UPDATE', [req.params.id]);
      if (actual.rowCount === 0) throw new ErrorApi(404, 'No hay un registro eliminado con ese id');
      const f = actual.rows[0];
      exigirArea(ctx, f.area, f.id_registro);
      const upd = await cx.query(
        `UPDATE ppto_registros SET eliminado = false, eliminado_por = NULL, eliminado_en = NULL, rev = rev + 1,
                actualizado_por = $2, actualizado_en = now() WHERE id_registro = $1 RETURNING *`,
        [req.params.id, ctx.usuario]
      );
      await auditar(cx, { ...ctx, accion: 'RESTAURAR', tabla: 'ppto_registros', id_objeto: f.id_registro, id_version: f.id_version, area: f.area, modulo: f.modulo, despues: f.datos });
      return upd.rows[0];
    });
    res.json(filaARegistro(fila));
  }));

  // ---------- HISTORIAL ----------
  router.get('/auditoria', soloAdmin, manejar(async (req, res) => {
    const { tabla, id_objeto, usuario, version, area, modulo, desde, hasta } = req.query;
    const limite = Math.min(parseInt(req.query.limite, 10) || 200, 1000);
    const cond = [];
    const params = [];
    const agregar = (sql, valor) => { params.push(valor); cond.push(sql.replace('?', `$${params.length}`)); };
    if (tabla) agregar('tabla = ?', tabla);
    if (id_objeto) agregar('id_objeto = ?', id_objeto);
    if (usuario) agregar('usuario ILIKE ?', `%${usuario}%`);
    if (version) agregar('id_version = ?', version);
    if (area) agregar('lower(area) = lower(?)', area);
    if (modulo) agregar('lower(modulo) = lower(?)', modulo);
    if (desde) agregar('fecha >= ?::timestamptz', desde);
    if (hasta) agregar('fecha <= ?::timestamptz', hasta);
    params.push(limite);
    const r = await pool.query(
      `SELECT * FROM ppto_auditoria ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY fecha DESC LIMIT $${params.length}`,
      params
    );
    res.json(r.rows);
  }));

  // ---------- IMPORTAR lo que había en localStorage (una sola vez por navegador) ----------
  router.post('/presupuesto/importar', soloAdmin, manejar(async (req, res) => {
    const { versiones = [], registros = [] } = req.body || {};
    const ctx = ctxDe(req);
    const resumen = await conTransaccion(pool, async (cx) => {
      let nuevasVersiones = 0;
      for (const v of versiones) {
        if (!v?.id_version) continue;
        const ins = await cx.query(
          `INSERT INTO ppto_versiones (id_version, nombre, estado, fecha_creacion, clonada_de, creado_por, actualizado_por)
           VALUES ($1,$2,$3,COALESCE($4::date, CURRENT_DATE),$5,$6,$6) ON CONFLICT (id_version) DO NOTHING`,
          [v.id_version, v.nombre || v.id_version, v.estado || 'Borrador', v.fecha_creacion || null, v.clonada_de || null, ctx.usuario]
        );
        nuevasVersiones += ins.rowCount;
      }
      let importados = 0;
      let omitidos = 0;
      for (const r of registros) {
        const idVersion = r.id_version || r.idVersion;
        const existeVersion = await cx.query('SELECT 1 FROM ppto_versiones WHERE id_version = $1', [idVersion]);
        const existeReg = await cx.query('SELECT 1 FROM ppto_registros WHERE id_registro = $1', [r.id_registro]);
        // No pisa lo que ya está en la base: solo agrega lo que falta.
        if (!r.id_registro || !r.area || !r.modulo || existeVersion.rowCount === 0 || existeReg.rowCount > 0) { omitidos++; continue; }
        await upsertRegistro(cx, r, ctx, { verificarRev: false, conAuditoria: false });
        importados++;
      }
      await auditar(cx, { ...ctx, accion: 'IMPORTAR', tabla: 'ppto_registros', detalle: `${nuevasVersiones} versiones y ${importados} registros importados desde el navegador (${omitidos} omitidos)` });
      return { versiones: nuevasVersiones, registros: importados, omitidos };
    });
    res.json(resumen);
  }));

  return router;
}

module.exports = { crearRouterPresupuesto, inicializarEsquemaPresupuesto };
