// =====================================================================
// ESTADO DE RESULTADOS (EERR): estructura, clasificación de cuentas y cálculo.
//
// Convención de signos: ingresos en POSITIVO, costos y gastos en NEGATIVO.
// Así las utilidades son simples sumas y la variación es siempre
// Ejecutado - Proyectado (verde si es >= 0, rojo si es < 0).
//
// PROYECTADO (lo que registran las áreas en el sistema):
//   - Ventas: Forecast de Ventas (cantidad esperada × precio, US$ a soles).
//   - Costo de ventas: cantidad esperada × costo unitario del COSTEO del producto
//     (sin el embalaje, que ya se registra como gasto de Logística); si el producto
//     no tiene costeo, se usa el costo unitario del forecast.
//   - Gastos: registros de gasto por cuenta destino (prefijo del área):
//       94 Administración · 95 Comercial · 98 Logística · 99 Almacén · 97 Financieros
//     La base 68 (depreciación/amortización) de esas áreas va a "Depre&Amort".
//     91/92/93 (producción) no se suman aquí: ya están dentro del costo de ventas.
//
// EJECUTADO (Odoo, asientos publicados, /api/eerr/ejecutado):
//   70 Ventas · 74 Descuentos · 69 Costo de ventas · 75 Otros ingresos
//   77 Ingresos financieros (776 = diferencia de cambio) · 67/97 Gastos financieros (676 = dif. cambio)
//   94/95/98/99 igual que el proyectado · 87 Participaciones · 88 Impuesto a la renta
//   Las cuentas de clase 6 por naturaleza no se suman (su destino ya está en la clase 9).
// =====================================================================

export const MESES_EERR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

// estilo: 'venta' | 'costo' | 'utilidad' | 'pct' | 'gasto' | 'subgasto' | 'depre' | 'otros' | 'difcamb' | 'impuesto'
export const LINEAS_EERR = [
  { id: '01', nombre: 'Total Ventas', clave: 'ventas', estilo: 'venta' },
  { id: '02', nombre: 'Dscto de Ventas', clave: 'dscto', estilo: 'costo' },
  { id: '03', nombre: 'Costo de Ventas', clave: 'costo', estilo: 'costo' },
  { id: '04', nombre: 'Utilidad Bruta', clave: 'utilBruta', estilo: 'utilidad' },
  { id: '05', nombre: '% MARGEN BRUTO', clave: 'pctBruto', estilo: 'pct' },
  { id: '06', nombre: 'Gastos de Ventas', clave: 'gVentas', estilo: 'gasto' },
  { id: '06.1', nombre: 'Gastos Logísticos', clave: 'gLog', estilo: 'subgasto' },
  { id: '06.2', nombre: 'Gastos de Almacén', clave: 'gAlm', estilo: 'subgasto' },
  { id: '06.3', nombre: 'Gastos Comerciales', clave: 'gCom', estilo: 'subgasto' },
  { id: '07', nombre: 'Gastos Administrativos', clave: 'gAdm', estilo: 'gasto' },
  { id: '08', nombre: 'Depre&Amort', clave: 'depre', estilo: 'depre' },
  { id: '09', nombre: 'Utilidad Operativa', clave: 'utilOper', estilo: 'utilidad' },
  { id: '10', nombre: '% MARGEN OPERATIVO', clave: 'pctOper', estilo: 'pct' },
  { id: '11', nombre: 'Otros Ing', clave: 'otrosIng', estilo: 'otros' },
  { id: '12', nombre: 'IngFinan', clave: 'ingFin', estilo: 'otros' },
  { id: '13', nombre: 'Gast Finan', clave: 'gastFin', estilo: 'costo' },
  { id: '14', nombre: 'DifCamb', clave: 'difCamb', estilo: 'difcamb' },
  { id: '15', nombre: 'Util AImpPart', clave: 'utilAImpPart', estilo: 'utilidad' },
  { id: '16', nombre: '% MARGEN ANT IMP Y PART', clave: 'pctAImpPart', estilo: 'pct' },
  { id: '17', nombre: 'ParticTrabj', clave: 'partic', estilo: 'impuesto' },
  { id: '18', nombre: 'Util AImp', clave: 'utilAImp', estilo: 'utilidad' },
  { id: '19', nombre: '% MARGEN ANT IMP', clave: 'pctAImp', estilo: 'pct' },
  { id: '20', nombre: 'IR', clave: 'ir', estilo: 'impuesto' },
  { id: '21', nombre: 'Util Neta', clave: 'utilNeta', estilo: 'utilidad' },
  { id: '22', nombre: '% MARGEN NETO', clave: 'pctNeto', estilo: 'pct' },
];

const BASES = ['ventas', 'dscto', 'costo', 'gLog', 'gAlm', 'gCom', 'gAdm', 'depre', 'otrosIng', 'ingFin', 'gastFin', 'difCamb', 'partic', 'ir'];
const vacioMeses = () => Object.fromEntries(BASES.map(b => [b, Array(12).fill(0)]));

// Clasifica una cuenta contable (con o sin prefijo de área) en una línea base del EERR.
export function clasificarCuenta(codigo) {
  const c = String(codigo || '').replace(/\D/g, '');
  if (!c) return null;
  if (c.startsWith('9')) {
    const destino = c.slice(0, 2);
    const base = c.slice(2);
    const esDepre = base.startsWith('68');
    if (destino === '94') return esDepre ? 'depre' : 'gAdm';
    if (destino === '95') return esDepre ? 'depre' : 'gCom';
    if (destino === '98') return esDepre ? 'depre' : 'gLog';
    if (destino === '99') return esDepre ? 'depre' : 'gAlm';
    if (destino === '97') return 'gastFin';
    return null; // 91/92/93: costo de producción (va dentro del costo de ventas)
  }
  if (c.startsWith('70')) return 'ventas';
  if (c.startsWith('74')) return 'dscto';
  if (c.startsWith('69')) return 'costo';
  if (c.startsWith('75')) return 'otrosIng';
  if (c.startsWith('776') || c.startsWith('676')) return 'difCamb';
  if (c.startsWith('77')) return 'ingFin';
  if (c.startsWith('67')) return 'gastFin';
  if (c.startsWith('87')) return 'partic';
  if (c.startsWith('88')) return 'ir';
  return null;
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const mesDe = (fecha) => { const m = String(fecha || '').match(/^(\d{4})-(\d{2})/); return m ? { anio: m[1], mes: parseInt(m[2], 10) - 1 } : null; };
const anioDe = (reg) => String(reg.detalle_columnas?.anio_proyeccion || mesDe(reg.fecha_proyeccion)?.anio || '');
const esForecast = (m) => m === 'Forecast de Ventas';
const esCosteo = (m) => String(m || '').startsWith('Costeo de');

// PROYECTADO: a partir de los registros del sistema (una versión y un año).
export function calcularProyectado(registros, { idVersion, anio }) {
  const base = vacioMeses();
  const deVersion = registros.filter(r => (!idVersion || r.id_version === idVersion));

  // Costo unitario por producto desde los costeos (sin embalaje)
  const costoCosteo = {};
  deVersion.filter(r => esCosteo(r.modulo) && r.modulo !== 'Costeo de Embalajes' && anioDe(r) === anio).forEach(r => {
    const dc = r.detalle_columnas || {};
    const prod = String(dc.producto || '').trim().toLowerCase();
    if (!prod) return;
    const unit = num(dc.costo_unitario_promedio) - num(dc.costo_embalaje_unitario);
    if (unit > 0) costoCosteo[prod] = unit;
  });

  deVersion.forEach(r => {
    const dc = r.detalle_columnas || {};
    if (esForecast(r.modulo)) {
      if (anioDe(r) !== anio) return;
      const tc = dc.moneda === 'US$' ? (num(dc.tipo_cambio) || 1) : 1;
      const precio = num(dc.precio_venta) * tc;
      const unitCosteo = costoCosteo[String(dc.producto || '').trim().toLowerCase()];
      const costoUnit = unitCosteo != null ? unitCosteo : num(dc.costo_unitario) * tc;
      MESES_EERR.forEach((m, i) => {
        const cant = num(dc.cantidades?.[m]);
        if (!cant) return;
        const prob = dc.tipo_probabilidad === 'general' || !dc.probabilidades_meses
          ? num(dc.probabilidad_general ?? 100) : num(dc.probabilidades_meses?.[m] ?? 100);
        const esperada = cant * prob / 100;
        base.ventas[i] += esperada * precio;
        base.costo[i] -= esperada * costoUnit;
      });
      return;
    }
    if (esCosteo(r.modulo)) return; // formulario de apoyo: su costo ya entra por el forecast
    const f = mesDe(r.fecha_proyeccion);
    if (!f || f.anio !== anio) return;
    const lineas = Array.isArray(r.desglose_contable) && r.desglose_contable.length > 0
      ? r.desglose_contable.map(d => ({ cuenta: d.cuenta, monto: num(d.monto) }))
      : [{ cuenta: dc.cuenta_afectada || dc.numero_cuenta, monto: num(r.totales?.costo_total ?? dc.costo_total) }];
    lineas.forEach(l => {
      const clave = clasificarCuenta(String(l.cuenta || '').split(' ')[0]);
      if (!clave || !(clave in base)) return;
      base[clave][f.mes] -= l.monto; // gasto proyectado => negativo
    });
  });
  return base;
}

// EJECUTADO: filas de Odoo { codigo, mes (1-12), saldo = debe - haber }.
export function calcularEjecutado(filasOdoo) {
  const base = vacioMeses();
  (filasOdoo || []).forEach(f => {
    const clave = clasificarCuenta(f.codigo);
    const i = (parseInt(f.mes, 10) || 0) - 1;
    if (!clave || i < 0 || i > 11) return;
    base[clave][i] += -num(f.saldo); // ingresos (haber) positivos, gastos (debe) negativos
  });
  return base;
}

// Arma todas las líneas del EERR (12 meses) a partir de las bases.
// tasas: { participacion, ir } en %. Si no hay cuentas 87/88 se calculan con esas tasas.
export function construirLineas(base, tasas = { participacion: 10, ir: 29.5 }) {
  const L = {};
  BASES.forEach(b => { L[b] = [...base[b]]; });
  const por = (a, b) => a.map((x, i) => x + b[i]);
  const ratio = (a, b) => a.map((x, i) => (b[i] ? x / b[i] : null));

  L.utilBruta = por(por(L.ventas, L.dscto), L.costo);
  L.pctBruto = ratio(L.utilBruta, L.ventas);
  L.gVentas = por(por(L.gLog, L.gAlm), L.gCom);
  L.utilOper = por(por(por(L.utilBruta, L.gVentas), L.gAdm), L.depre);
  L.pctOper = ratio(L.utilOper, L.ventas);
  L.utilAImpPart = por(por(por(por(L.utilOper, L.otrosIng), L.ingFin), L.gastFin), L.difCamb);
  L.pctAImpPart = ratio(L.utilAImpPart, L.ventas);
  if (L.partic.every(v => v === 0)) L.partic = L.utilAImpPart.map(u => -Math.max(0, u) * tasas.participacion / 100);
  L.utilAImp = por(L.utilAImpPart, L.partic);
  L.pctAImp = ratio(L.utilAImp, L.ventas);
  if (L.ir.every(v => v === 0)) L.ir = L.utilAImp.map(u => -Math.max(0, u) * tasas.ir / 100);
  L.utilNeta = por(L.utilAImp, L.ir);
  L.pctNeto = ratio(L.utilNeta, L.ventas);
  return L;
}

// Total anual de una línea (los % se recalculan sobre los totales, no se suman).
export function totalAnual(L, clave) {
  const suma = (k) => L[k].reduce((a, v) => a + (v || 0), 0);
  const pcts = { pctBruto: 'utilBruta', pctOper: 'utilOper', pctAImpPart: 'utilAImpPart', pctAImp: 'utilAImp', pctNeto: 'utilNeta' };
  if (pcts[clave]) { const v = suma('ventas'); return v ? suma(pcts[clave]) / v : null; }
  return suma(clave);
}
