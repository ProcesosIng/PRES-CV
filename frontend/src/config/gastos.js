// =====================================================================
// REPORTE DE GASTOS: Proyectado (sistema) vs Ejecutado (Odoo).
//
// Solo cuentas de destino (clase 9): los 2 primeros dígitos son el ÁREA y el resto
// es la cuenta base del Plan Contable (p. ej. 946251000 = Administración + 6251000).
// La cuenta base define el GRUPO (B..F) y el SUBGRUPO (04..21), como en el reporte de Power BI.
//
// Signos: los gastos se muestran en NEGATIVO; Variación = Ejecutado - Proyectado
// (verde si >= 0, es decir, se gastó menos) y %Var = Variación / Proyectado.
// =====================================================================

export const AREAS_POR_PREFIJO = {
  '91': 'Producción Crisoles',
  '92': 'Producción Fundente',
  '93': 'Producción Copelas',
  '94': 'Administración',
  '95': 'Comercial',
  '97': 'Gastos Financieros',
  '98': 'Logística',
  '99': 'Almacén',
};

export const GRUPOS = {
  A: 'A. COMPRAS Y CONSUMOS',
  B: 'B. REMUNERACIONES',
  C: 'C. SERVICIOS PRESTADOS POR TERCEROS',
  D: 'D. TRIBUTOS',
  E: 'E. OTROS GASTOS',
  F: 'F. DEPRECIACION',
  G: 'G. OTROS',
};

// [prefijo de la cuenta base, subgrupo, grupo] — se usa el prefijo más largo que coincida.
const REGLAS = [
  ['60', '01. COMPRAS', 'A'],
  ['61', '02. CONSUMO DE MATERIALES, ENVASES Y EMBALAJES', 'A'],
  ['624', '05. CAPACITACIONES', 'B'],
  ['625', '06. ATENCION AL PERSONAL', 'B'],
  ['627', '07. SEGURIDAD Y PREVISION SOCIAL', 'B'],
  ['629', '08. BENEFICIOS SOCIALES', 'B'],
  ['62', '04. REMUNERACIONES', 'B'],
  ['631', '09. TRANSPORTE, CORREOS Y GASTOS DE VIAJE', 'C'],
  ['632', '10. ASESORIA Y CONSULTORIA', 'C'],
  ['634', '11. MANTENIMIENTO Y REPARACIONES', 'C'],
  ['635', '12. ALQUILERES', 'C'],
  ['636', '13. SERVICIOS BASICOS', 'C'],
  ['637', '14. PUBLICIDAD Y RELACIONES PUBLICAS', 'C'],
  ['63', '15. OTROS SERVICIOS PRESTADOS POR TERCEROS', 'C'],
  ['64', '16. GOBIERNO LOCAL Y NACIONAL', 'D'],
  ['651', '17. SEGUROS', 'E'],
  ['653', '18. SUSCRIPCIONES, LICENCIAS Y REGALIAS', 'E'],
  ['654', '18. SUSCRIPCIONES, LICENCIAS Y REGALIAS', 'E'],
  ['652', '18. SUSCRIPCIONES, LICENCIAS Y REGALIAS', 'E'],
  ['656', '19. SUMINISTROS', 'E'],
  ['65', '20. OTROS GASTOS DE GESTION', 'E'],
  ['68', '21. DEPRECIACION Y AMORTIZACION', 'F'],
].sort((a, b) => b[0].length - a[0].length);

// Devuelve { area, base, grupo, subgrupo } o null si no es una cuenta de gasto por destino.
export function clasificarGasto(codigo, areaRespaldo = '') {
  const c = String(codigo || '').replace(/\D/g, '');
  if (!c.startsWith('9') || c.length < 5) return null;
  const prefijo = c.slice(0, 2);
  const base = c.slice(2);
  const regla = REGLAS.find(([p]) => base.startsWith(p));
  const grupo = regla ? regla[2] : 'G';
  return {
    area: AREAS_POR_PREFIJO[prefijo] || areaRespaldo || `Destino ${prefijo}`,
    base,
    grupo: GRUPOS[grupo],
    subgrupo: regla ? regla[1] : '99. OTROS',
  };
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const mesDe = (fecha) => { const m = String(fecha || '').match(/^(\d{4})-(\d{2})/); return m ? { anio: m[1], mes: parseInt(m[2], 10) - 1 } : null; };

// Movimientos PROYECTADOS: una fila por cuenta y mes, desde los registros de gasto del sistema.
export function movimientosProyectados(registros, { idVersion, anio }) {
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
      const cls = clasificarGasto(codigo, r.area);
      if (!cls || !l.monto) return;
      const nombre = texto.includes(' - ') ? texto.slice(texto.indexOf(' - ') + 3) : '';
      salida.push({ ...cls, codigo, nombre, mes: f.mes, proyectado: -l.monto, ejecutado: 0 });
    });
  });
  return salida;
}

// Movimientos EJECUTADOS desde Odoo: { codigo, mes (1-12), saldo = debe - haber }.
export function movimientosEjecutados(filasOdoo) {
  const salida = [];
  (filasOdoo || []).forEach(f => {
    const cls = clasificarGasto(f.codigo);
    const mes = (parseInt(f.mes, 10) || 0) - 1;
    if (!cls || mes < 0 || mes > 11) return;
    salida.push({ ...cls, codigo: String(f.codigo), nombre: '', mes, proyectado: 0, ejecutado: -num(f.saldo) });
  });
  return salida;
}
