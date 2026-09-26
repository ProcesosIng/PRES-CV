// =====================================================================
// PLAN DE COMPRAS — qué se compra, cuánto y cuándo (base del flujo de caja de egresos).
//
// ▶ PARA AGREGAR UNA CATEGORÍA: añade un objeto a CATEGORIAS_COMPRA (abajo), con:
//     id       identificador corto (sin espacios)
//     nombre   cómo se verá en el reporte y en el filtro
//     modulos  módulos del sistema cuyos registros entran completos (opcional)
//     cuentas  inicio de la cuenta BASE de 7 dígitos, sin el prefijo del área (opcional),
//              p. ej. '6561' = útiles de oficina (entra 946561000, 956561000, ...)
//   El orden de la lista es el orden en que se revisa: un registro va a la PRIMERA categoría
//   que coincida (primero por módulo, luego por cuenta). El color se asigna por posición.
//   La mercadería del forecast es especial (forecast: true): productos que no fabricamos.
// =====================================================================

export const CATEGORIAS_COMPRA = [
  { id: 'mp', nombre: 'Materia prima e insumos', modulos: ['Materias Primas'], cuentas: ['6121'] },
  { id: 'env', nombre: 'Envases y embalajes', modulos: ['Envases y Embalajes'], cuentas: ['614'] },
  { id: 'sum', nombre: 'Suministros de producción (GNV, aceite, repuestos…)', modulos: ['Materiales Auxiliares y Suministros'], cuentas: ['613'] },
  { id: 'merc', nombre: 'Mercadería (forecast)', forecast: true },
  { id: 'epp', nombre: 'EPPs y uniformes', modulos: ['Uniforme - EPPs', 'Uniformes - EPPs'], cuentas: ['6252'] },
  { id: 'utiles', nombre: 'Útiles de oficina', cuentas: ['6561'] },
  { id: 'aseo', nombre: 'Útiles de aseo y limpieza', cuentas: ['6562'] },
];

// Colores categóricos en orden fijo (paleta validada para daltonismo; no se reciclan).
export const COLORES_CATEGORIA = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#6b7280'];
export const colorDeCategoria = (id) => COLORES_CATEGORIA[Math.max(0, CATEGORIAS_COMPRA.findIndex(c => c.id === id))] || COLORES_CATEGORIA[7];

// Unidades de negocio que fabricamos: su costo de venta no es una compra (va a la 692).
export const UNIDADES_FABRICADAS = ['Crisoles de Arcilla', 'Fundente', 'Copelas'];
// Cuentas que nunca son compra aunque coincidan (materia prima en proceso: traslado interno).
const CUENTAS_EXCLUIDAS = ['6122'];

export const MESES_PC = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const mesDe = (f) => { const m = String(f || '').match(/^(\d{4})-(\d{2})/); return m ? { anio: parseInt(m[1], 10), mes: parseInt(m[2], 10) - 1 } : null; };
const baseDe = (cuenta) => { const c = String(cuenta || '').split(/\s/)[0].replace(/\D/g, ''); return c.length > 7 ? c.slice(-7) : c; };

// Categoría de un registro de gasto (null = no es compra).
export function categoriaDe(reg) {
  const dc = reg.detalle_columnas || {};
  const cuenta = dc.cuenta_afectada || dc.numero_cuenta || (Array.isArray(reg.desglose_contable) && reg.desglose_contable[0]?.cuenta) || '';
  const base = baseDe(cuenta);
  if (CUENTAS_EXCLUIDAS.some(c => base.startsWith(c))) return null;
  // El formulario de útiles distingue aseo / oficina en el propio registro.
  if (reg.modulo === 'Utiles de Oficina') return dc.tipo_material === 'aseo' || base.startsWith('6562') ? 'aseo' : 'utiles';
  const porModulo = CATEGORIAS_COMPRA.find(c => (c.modulos || []).includes(reg.modulo));
  if (porModulo) return porModulo.id;
  const porCuenta = CATEGORIAS_COMPRA.find(c => (c.cuentas || []).some(p => base.startsWith(p)));
  return porCuenta ? porCuenta.id : null;
}

// Nombre del ítem a comprar según lo que traiga cada formulario / importación.
function itemDe(reg) {
  const dc = reg.detalle_columnas || {};
  const nombre = dc.insumo || dc.epp_nombre || dc.descripcion_material || dc.producto_compra || dc.producto;
  if (nombre) return String(nombre).trim();
  const quien = reg.empleado_nombre && reg.empleado_nombre !== '-' ? reg.empleado_nombre : (dc.detalle || '');
  return `Sin detalle de ítem · ${String(quien).trim() || reg.modulo}`;
}

// Ítems de compra de una versión y año:
//  [{ categoria, area, mes, producto, unidad, cantidad, monto, origen, proveedor, cuenta }]
// anticipacion: meses antes de la venta en que se compra la mercadería (0 = el mismo mes).
export function itemsDeCompra(registros, { idVersion, anio, anticipacion = 0 }) {
  const anioN = parseInt(anio, 10);
  const deVersion = registros.filter(r => !idVersion || r.id_version === idVersion);
  // Calidad repartida: cuentan las copias en cada destino, no el original.
  const calidadRepartida = new Set(deVersion.filter(r => String(r.id_registro).startsWith('DERIV-CAL-'))
    .map(r => { const id = String(r.id_registro).slice('DERIV-CAL-'.length); return id.slice(0, id.lastIndexOf('-')); }));
  const items = [];
  deVersion.forEach(reg => {
    const dc = reg.detalle_columnas || {};
    const modulo = reg.modulo || '';
    if (modulo === 'Forecast de Ventas') {
      // Mercadería: lo que vendemos y no fabricamos (costo a la 691).
      const fabricado = String(dc.cuenta_costo || '').startsWith('692') || UNIDADES_FABRICADAS.includes(dc.unidad_negocio);
      if (fabricado || !CATEGORIAS_COMPRA.some(c => c.forecast)) return;
      const anioF = parseInt(dc.anio_proyeccion || mesDe(reg.fecha_proyeccion)?.anio, 10);
      const tc = dc.moneda === 'US$' ? (num(dc.tipo_cambio) || 1) : 1;
      const costo = num(dc.costo_unitario) * tc;
      MESES_PC.forEach((m, i) => {
        const cant = num(dc.cantidades?.[m]);
        if (!cant) return;
        const prob = dc.tipo_probabilidad === 'general' || !dc.probabilidades_meses
          ? num(dc.probabilidad_general ?? 100) : num(dc.probabilidades_meses?.[m] ?? 100);
        const q = cant * prob / 100;
        const d = new Date(anioF, i - (parseInt(anticipacion, 10) || 0), 1);
        if (d.getFullYear() !== anioN) return;
        items.push({
          categoria: 'merc', area: reg.area || 'Comercial', mes: d.getMonth(), producto: dc.producto || 'Sin producto',
          unidad: dc.um || 'und', cantidad: q, monto: q * costo, origen: `Forecast · ${dc.unidad_negocio || ''} · ${dc.cliente || ''}`,
          proveedor: dc.proveedor || '', cuenta: dc.cuenta_costo || '',
        });
      });
      return;
    }
    if (modulo.startsWith('Costeo de') || modulo === 'Distribución de Calidad') return;
    if (calidadRepartida.has(String(reg.id_registro))) return;
    const f = mesDe(reg.fecha_proyeccion);
    if (!f || f.anio !== anioN) return;
    const categoria = categoriaDe(reg);
    if (!categoria || !CATEGORIAS_COMPRA.some(c => c.id === categoria)) return;
    const monto = num(reg.totales?.costo_total ?? dc.costo_total);
    if (!monto) return;
    items.push({
      categoria, area: reg.area || dc.area || 'Sin área', mes: f.mes, producto: itemDe(reg),
      unidad: dc.unidad || dc.unid_med || (dc.cantidad ? 'und' : ''), cantidad: num(dc.cantidad), monto,
      origen: modulo, proveedor: dc.proveedor || '', cuenta: dc.cuenta_afectada || '',
    });
  });
  return items;
}
