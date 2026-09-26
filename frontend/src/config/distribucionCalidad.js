// =====================================================================
// DISTRIBUCIÓN DE CALIDAD (lógica compartida por la pantalla y el importador de Excel).
// Cada gasto de Calidad (cuenta 6 base) se replica en el mismo módulo de cada destino con su
// prefijo y el % que le corresponde; en producción entra como CIF compartido.
// =====================================================================
import { prefijoDeArea } from './areas';

export const MODULO_DISTRIBUCION_CALIDAD = 'Distribución de Calidad';
export const DESTINOS_CALIDAD = ['Producción Crisoles', 'Producción Fundente', 'Producción Copelas', 'Comercial'];
const esProduccion = (a) => a.startsWith('Producción');
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

const conPrefijo = (cuenta, prefijo) => {
  const t = String(cuenta || '').trim();
  const m = t.match(/^(\d+)\s*(?:-\s*)?(.*)$/);
  if (!m) return t;
  const base = m[1].length > 7 ? m[1].slice(-7) : m[1];
  return `${prefijo}${base}${m[2] ? ` - ${m[2]}` : ''}`;
};

export const lineasDeRegistro = (r) => {
  const dc = r.detalle_columnas || {};
  const d = Array.isArray(r.desglose_contable) ? r.desglose_contable.filter(x => x && (x.cuenta || x.monto)) : [];
  return d.length ? d.map(x => ({ cuenta: x.cuenta, monto: num(x.monto) }))
    : [{ cuenta: dc.cuenta_afectada || dc.numero_cuenta || '', monto: num(r.totales?.costo_total ?? dc.costo_total) }];
};

// Devuelve [registro de configuración, ...registros repartidos]. Con activar=false solo la configuración.
export function generarDistribucionCalidad({ idVersion, gastosCalidad, porcentajes, activar, usuario, fechaBase }) {
  const idLote = `DIST-CAL-${idVersion}`;
  const pcts = DESTINOS_CALIDAD.reduce((a, d) => ({ ...a, [d]: num(porcentajes[d]) }), {});
  const config = {
    id_registro: `DIST-CAL-CFG-${idVersion}`,
    id_lote: idLote,
    id_version: idVersion, idVersion,
    area: 'Calidad', modulo: MODULO_DISTRIBUCION_CALIDAD, categoria: MODULO_DISTRIBUCION_CALIDAD,
    fecha_proyeccion: fechaBase || `${new Date().getFullYear()}-01-01`,
    empleado_dni: '-', empleado_nombre: 'Distribución de Calidad',
    detalle_columnas: { porcentajes: pcts, activo: !!activar, aplicado_en: activar ? new Date().toISOString() : null, aplicado_por: usuario?.email || null },
    totales: { costo_total: 0 },
  };
  if (!activar) return [config];
  const derivados = [];
  gastosCalidad.forEach(r => {
    DESTINOS_CALIDAD.forEach(destino => {
      const pct = pcts[destino] / 100;
      if (pct <= 0) return;
      const prefijo = prefijoDeArea(destino);
      const lineas = lineasDeRegistro(r).map((l, i) => ({ id: `cal-${i}`, cuenta: conPrefijo(l.cuenta, prefijo), monto: (l.monto * pct).toFixed(2) }));
      const total = lineas.reduce((a, l) => a + num(l.monto), 0);
      if (!total) return;
      const dc = r.detalle_columnas || {};
      derivados.push({
        id_registro: `DERIV-CAL-${r.id_registro}-${prefijo}`,
        id_lote: idLote,
        id_version: idVersion, idVersion,
        area: destino, modulo: r.modulo, categoria: r.modulo,
        fecha_proyeccion: r.fecha_proyeccion,
        empleado_dni: r.empleado_dni || '-',
        empleado_nombre: r.empleado_nombre || 'CALIDAD',
        detalle_columnas: {
          area: destino,
          detalle: `CALIDAD (${(pct * 100).toFixed(2)}%) - ${dc.detalle || r.empleado_nombre || r.modulo}`,
          cuenta_afectada: lineas[0]?.cuenta,
          costo_total: total,
          ...(esProduccion(destino) ? { proceso: 'CIF' } : {}),
          es_derivado: true,
          origen_calidad: r.id_registro,
          porcentaje_calidad: pct * 100,
        },
        desglose_contable: lineas,
        totales: { costo_total: total },
      });
    });
  });
  return [config, ...derivados];
}
