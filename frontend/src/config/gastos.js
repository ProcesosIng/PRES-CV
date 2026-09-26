// =====================================================================
// REPORTE DE GASTOS: Proyectado (sistema) vs Ejecutado (Odoo).
//
// Solo cuentas de destino de un ÁREA: 2 dígitos de área (91-95, 98, 99) + cuenta de gasto
// de la clase 6 (p. ej. 946251000 = Administración + 6251000).
// No entran: las 97 (gastos financieros y diferencia de cambio, van solo al EERR) ni las
// cuentas de agrupación como 910000000 / 940000000, ni la materia prima en proceso (6122000,
// p. ej. 916122000): es un traslado entre inventarios, no un gasto nuevo.
// Ejecutado: solo asientos PUBLICADOS en Odoo (ni borrador ni cancelados).
// El ID, GRUPO y SUBGRUPO salen del maestro de cuentas (asignación manual) o, si falta, del Excel por cuenta base.
//
// Signos: los gastos se muestran en NEGATIVO; Variación = Ejecutado - Proyectado
// (verde si >= 0, es decir, se gastó menos) y %Var = Variación / Proyectado.
// =====================================================================

import CLASIFICACION_BASE from './clasificacionCuentasBase.json';

export const AREAS_POR_PREFIJO = {
  '91': 'Producción Crisoles',
  '92': 'Producción Fundente',
  '93': 'Producción Copelas',
  '94': 'Administración',
  '95': 'Comercial',
  '98': 'Logística',
  '99': 'Almacén',
};

// Clasificación por cuenta BASE (sin prefijo de área) tomada del Excel "CUENTAS ODOO - PRESUPUESTOS".
// Solo es el respaldo: manda la que esté asignada en el MAESTRO DE CUENTAS (id/grupo/subgrupo_reporte).

// Cuentas base que no se consideran gasto del área (ver encabezado).
const CUENTAS_EXCLUIDAS = ['6122'];

const SIN_CLASIFICAR = { id: 'Sin ID', grupo: 'Z. SIN CLASIFICAR', subgrupo: '99. SIN CLASIFICAR (asignar en el maestro de cuentas)' };

// clasificacionMaestro: { '946251000': { id, grupo, subgrupo } } armado desde el maestro de cuentas.
// Devuelve { area, base, id, grupo, subgrupo } o null si no es una cuenta de gasto por destino (clase 9).
export function clasificarGasto(codigo, clasificacionMaestro = {}) {
  const c = String(codigo || '').replace(/\D/g, '');
  if (c.length < 5) return null;
  const prefijo = c.slice(0, 2);
  const base = c.slice(2);
  if (!AREAS_POR_PREFIJO[prefijo] || !base.startsWith('6')) return null;
  if (CUENTAS_EXCLUIDAS.some(ex => base.startsWith(ex))) return null;
  const delMaestro = clasificacionMaestro[c];
  const delExcel = CLASIFICACION_BASE[base];
  const cls = (delMaestro && delMaestro.grupo)
    ? delMaestro
    : (delExcel ? { id: delExcel[0], grupo: delExcel[1], subgrupo: delExcel[2] } : SIN_CLASIFICAR);
  return {
    area: AREAS_POR_PREFIJO[prefijo],
    base,
    id: cls.id || SIN_CLASIFICAR.id,
    grupo: cls.grupo || SIN_CLASIFICAR.grupo,
    subgrupo: cls.subgrupo || SIN_CLASIFICAR.subgrupo,
  };
}

// Mapa código -> clasificación a partir de la lista del maestro de cuentas.
export function clasificacionDesdeMaestro(listaCuentas = []) {
  const mapa = {};
  listaCuentas.forEach(c => {
    const cod = String(c.codigo || '').replace(/\D/g, '');
    if (cod && (c.grupo_reporte || c.subgrupo_reporte || c.id_reporte)) {
      mapa[cod] = { id: c.id_reporte, grupo: c.grupo_reporte, subgrupo: c.subgrupo_reporte };
    }
  });
  return mapa;
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const mesDe = (fecha) => { const m = String(fecha || '').match(/^(\d{4})-(\d{2})/); return m ? { anio: m[1], mes: parseInt(m[2], 10) - 1 } : null; };

// Movimientos PROYECTADOS: una fila por cuenta y mes, desde los registros de gasto del sistema.
export function movimientosProyectados(registros, { idVersion, anio }, clasificacionMaestro = {}) {
  const salida = [];
  registros.forEach(r => {
    if (idVersion && r.id_version !== idVersion) return;
    const m = String(r.modulo || '');
    if (m === 'Forecast de Ventas' || m.startsWith('Costeo de')) return;
    const f = mesDe(r.fecha_proyeccion);
    if (!f || f.anio !== anio) return;
    const dc = r.detalle_columnas || {};
    const lineas = Array.isArray(r.desglose_contable) && r.desglose_contable.length > 0
      ? r.desglose_contable.map(d => ({ cuenta: d.cuenta, monto: num(d.monto) }))
      : [{ cuenta: dc.cuenta_afectada || dc.numero_cuenta, monto: num(r.totales?.costo_total ?? dc.costo_total) }];
    lineas.forEach(l => {
      const texto = String(l.cuenta || '');
      const codigo = texto.split(/\s/)[0];
      const cls = clasificarGasto(codigo, clasificacionMaestro);
      if (!cls || !l.monto) return;
      const nombre = texto.includes(' - ') ? texto.slice(texto.indexOf(' - ') + 3) : '';
      salida.push({ ...cls, codigo, nombre, mes: f.mes, proyectado: -l.monto, ejecutado: 0 });
    });
  });
  return salida;
}

// Movimientos EJECUTADOS desde Odoo: { codigo, mes (1-12), saldo = debe - haber }.
export function movimientosEjecutados(filasOdoo, clasificacionMaestro = {}) {
  const salida = [];
  (filasOdoo || []).forEach(f => {
    const cls = clasificarGasto(f.codigo, clasificacionMaestro);
    const mes = (parseInt(f.mes, 10) || 0) - 1;
    if (!cls || mes < 0 || mes > 11 || Math.abs(num(f.saldo)) < 0.005) return;
    salida.push({ ...cls, codigo: String(f.codigo), nombre: '', mes, proyectado: 0, ejecutado: -num(f.saldo) });
  });
  return salida;
}
