// =====================================================================
// CUENTAS DEL FORECAST DE VENTAS (archivo "Cuentas costo y venta").
// La cuenta de VENTA (70x) y de COSTO DE VENTA (69x) dependen de la
// unidad de negocio y de la zona (Local / Exterior).
//  - Lo que produce la planta (Crisoles de Arcilla, Fundente) va a 692 (producto terminado).
//  - Lo demás es mercadería: 691.
// El costo de venta es el que coloca el vendedor (costo unitario x cantidad).
// =====================================================================
import CUENTAS from './cuentasForecast.json';

// Tipo de negocio: dato adicional para agrupar los reportes.
export const UNIDADES_FIRE_ASSAY = ['Crisoles de Arcilla', 'Fundente', 'Copelas'];
export const tipoNegocioDe = (unidad) => (UNIDADES_FIRE_ASSAY.includes(unidad) ? 'Fire Assay' : 'Procesos');

// { venta: { codigo, nombre, texto } | null, costo: {...} | null }
export function cuentasForecast(unidad, zona) {
  const fila = CUENTAS[`${unidad}|${zona}`] || {};
  const armar = (par) => (par ? { codigo: par[0], nombre: par[1], texto: `${par[0]} - ${par[1]}` } : null);
  return { venta: armar(fila.venta), costo: armar(fila.costo) };
}
