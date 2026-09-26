// =====================================================================
// ESTADO DE RESULTADOS (EERR) — misma lógica que las medidas DAX del Power BI.
//
// Se trabaja con SALDOS contables: saldo = debe - haber (el "balance" de Odoo).
// Cada línea base suma los saldos de sus cuentas y luego se aplica la fórmula DAX:
//
//   01 Total Ventas      = ABS(Σ 70)
//   02 Dscto de Ventas   = Σ 74
//   03 Costo de Ventas   = Σ 69
//   04 Utilidad Bruta    = 01 - 03 - 02
//   06.1 Gastos Logíst.  = Σ 9862 · 9863 · 9864 · 9865
//   06.2 Gastos Almacén  = Σ 9962 · 9963 · 9964 · 9965
//   06.3 Gastos Comerc.  = Σ 9562 · 9563 · 9564 · 9565
//   06 Gastos de Ventas  = 06.1 + 06.2 + 06.3
//   07 Gastos Adm.       = Σ 9462 · 9463 · 9464 · 9465
//   08 Depre&Amort       = Σ 9568 · 9868 · 9468 · 9968
//   09 Utilidad Operat.  = 04 - 06 - 07 - 08
//   11 Otros Ing         = ABS(Σ 75 · 775 · 7611)
//   12 IngFinan          = ABS(Σ 7792)
//   13 Gast Finan        = Σ 976711 · 97673 · 976793
//   14 DifCamb           = -(Σ 776 · 97676)
//   15 Util AImpPart     = 09 + 11 + 12 - 13 + 14
//   17 ParticTrabj       = % participación × 15      (DAX: 0.1)
//   18 Util AImp         = 15 - 17
//   20 IR                = % IR × 18                  (DAX: 0.295)
//   21 Util Neta         = 18 - 20
//   05/10/16/19/22 %     = línea / 01 (vacío si alguno es 0)
//
// Así, ventas y utilidades salen en positivo y costos/gastos también en positivo
// (se RESTAN en las fórmulas), igual que en el Power BI.
//
// PROYECTADO: se arma con los mismos saldos a partir de lo registrado en el sistema:
//   - Ventas: Forecast (cantidad esperada × precio, US$ a soles) como saldo acreedor de la 70.
//   - Costo de ventas: cantidad esperada × costo unitario que coloca el vendedor en el forecast
//     (cuenta 69x según línea de negocio y zona).
//   - Gastos: registros de gasto por cuenta destino (mismas reglas que el ejecutado).
// =====================================================================

export const MESES_EERR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

// favorable: 'mayor' = mejor si el ejecutado es mayor (ingresos, utilidades); 'menor' = costos y gastos.
export const LINEAS_EERR = [
  { id: '01', nombre: 'Total Ventas', clave: 'ventas', estilo: 'venta', favorable: 'mayor' },
  { id: '02', nombre: 'Dscto de Ventas', clave: 'dscto', estilo: 'costo', favorable: 'menor' },
  { id: '03', nombre: 'Costo de Ventas', clave: 'costo', estilo: 'costo', favorable: 'menor' },
  { id: '04', nombre: 'Utilidad Bruta', clave: 'utilBruta', estilo: 'utilidad', favorable: 'mayor' },
  { id: '05', nombre: '% MARGEN BRUTO', clave: 'pctBruto', estilo: 'pct', favorable: 'mayor' },
  { id: '06', nombre: 'Gastos de Ventas', clave: 'gVentas', estilo: 'gasto', favorable: 'menor' },
  { id: '06.1', nombre: 'Gastos Logísticos', clave: 'gLog', estilo: 'subgasto', favorable: 'menor' },
  { id: '06.2', nombre: 'Gastos de Almacén', clave: 'gAlm', estilo: 'subgasto', favorable: 'menor' },
  { id: '06.3', nombre: 'Gastos Comerciales', clave: 'gCom', estilo: 'subgasto', favorable: 'menor' },
  { id: '07', nombre: 'Gastos Administrativos', clave: 'gAdm', estilo: 'gasto', favorable: 'menor' },
  { id: '08', nombre: 'Depre&Amort', clave: 'depre', estilo: 'depre', favorable: 'menor' },
  { id: '09', nombre: 'Utilidad Operativa', clave: 'utilOper', estilo: 'utilidad', favorable: 'mayor' },
  { id: '10', nombre: '% MARGEN OPERATIVO', clave: 'pctOper', estilo: 'pct', favorable: 'mayor' },
  { id: '11', nombre: 'Otros Ing', clave: 'otrosIng', estilo: 'otros', favorable: 'mayor' },
  { id: '12', nombre: 'IngFinan', clave: 'ingFin', estilo: 'otros', favorable: 'mayor' },
  { id: '13', nombre: 'Gast Finan', clave: 'gastFin', estilo: 'costo', favorable: 'menor' },
  { id: '14', nombre: 'DifCamb', clave: 'difCamb', estilo: 'difcamb', favorable: 'mayor' },
  { id: '15', nombre: 'Util AImpPart', clave: 'utilAImpPart', estilo: 'utilidad', favorable: 'mayor' },
  { id: '16', nombre: '% MARGEN ANT IMP Y PART', clave: 'pctAImpPart', estilo: 'pct', favorable: 'mayor' },
  { id: '17', nombre: 'ParticTrabj', clave: 'partic', estilo: 'impuesto', favorable: 'menor' },
  { id: '18', nombre: 'Util AImp', clave: 'utilAImp', estilo: 'utilidad', favorable: 'mayor' },
  { id: '19', nombre: '% MARGEN ANT IMP', clave: 'pctAImp', estilo: 'pct', favorable: 'mayor' },
  { id: '20', nombre: 'IR', clave: 'ir', estilo: 'impuesto', favorable: 'menor' },
  { id: '21', nombre: 'Util Neta', clave: 'utilNeta', estilo: 'utilidad', favorable: 'mayor' },
  { id: '22', nombre: '% MARGEN NETO', clave: 'pctNeto', estilo: 'pct', favorable: 'mayor' },
];

// Saldos base que se acumulan por mes (debe - haber)
const BASES = ['ventas', 'dscto', 'costo', 'gLog', 'gAlm', 'gCom', 'gAdm', 'depre', 'otrosIng', 'ingFin', 'gastFin', 'difCamb'];
const vacioMeses = () => Object.fromEntries(BASES.map(b => [b, Array(12).fill(0)]));

const empiezaCon = (c, lista) => lista.some(p => c.startsWith(p));

// Clasifica una cuenta en su saldo base del EERR (mismas reglas que el DAX). null = no entra.
export function clasificarCuenta(codigo) {
  const c = String(codigo || '').replace(/\D/g, '');
  if (!c) return null;
  if (c.startsWith('70')) return 'ventas';
  if (c.startsWith('74')) return 'dscto';
  if (c.startsWith('69')) return 'costo';
  if (empiezaCon(c, ['9862', '9863', '9864', '9865'])) return 'gLog';
  if (empiezaCon(c, ['9962', '9963', '9964', '9965'])) return 'gAlm';
  if (empiezaCon(c, ['9562', '9563', '9564', '9565'])) return 'gCom';
  if (empiezaCon(c, ['9462', '9463', '9464', '9465'])) return 'gAdm';
  if (empiezaCon(c, ['9568', '9868', '9468', '9968'])) return 'depre';
  if (empiezaCon(c, ['75', '775', '7611'])) return 'otrosIng';
  if (c.startsWith('7792')) return 'ingFin';
  if (empiezaCon(c, ['976711', '97673', '976793'])) return 'gastFin';
  if (empiezaCon(c, ['776', '97676'])) return 'difCamb';
  return null;
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const mesDe = (fecha) => { const m = String(fecha || '').match(/^(\d{4})-(\d{2})/); return m ? { anio: m[1], mes: parseInt(m[2], 10) - 1 } : null; };
const anioDe = (reg) => String(reg.detalle_columnas?.anio_proyeccion || mesDe(reg.fecha_proyeccion)?.anio || '');
const esForecast = (m) => m === 'Forecast de Ventas';
const esCosteo = (m) => String(m || '').startsWith('Costeo de');

// PROYECTADO: saldos por mes a partir de los registros del sistema (una versión y un año).
export function calcularProyectado(registros, { idVersion, anio }) {
  const base = vacioMeses();
  const deVersion = registros.filter(r => (!idVersion || r.id_version === idVersion));

  deVersion.forEach(r => {
    const dc = r.detalle_columnas || {};
    if (esForecast(r.modulo)) {
      if (anioDe(r) !== anio) return;
      const tc = dc.moneda === 'US$' ? (num(dc.tipo_cambio) || 1) : 1;
      const precio = num(dc.precio_venta) * tc;
      // Costo de venta = costo unitario que coloca el vendedor x cantidad (cuentas 69x).
      const costoUnit = num(dc.costo_unitario) * tc;
      MESES_EERR.forEach((m, i) => {
        const cant = num(dc.cantidades?.[m]);
        if (!cant) return;
        const prob = dc.tipo_probabilidad === 'general' || !dc.probabilidades_meses
          ? num(dc.probabilidad_general ?? 100) : num(dc.probabilidades_meses?.[m] ?? 100);
        const esperada = cant * prob / 100;
        base.ventas[i] -= esperada * precio; // venta = saldo acreedor
        base.costo[i] += esperada * costoUnit;
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
      if (!clave) return;
      base[clave][f.mes] += l.monto; // gasto = saldo deudor
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
    base[clave][i] += num(f.saldo);
  });
  return base;
}

const pct = (a, b) => (!b || !a ? null : a / b);

// Líneas del EERR para un PERIODO (lista de meses): se suman los saldos del periodo
// y luego se aplican las fórmulas (igual que el DAX evaluado sobre ese filtro).
// tasas: { participacion, ir } en %.
export function lineasPeriodo(baseMensual, meses, tasas = { participacion: 10, ir: 29.5 }) {
  const s = {};
  BASES.forEach(b => { s[b] = meses.reduce((a, i) => a + (baseMensual[b][i] || 0), 0); });
  const L = {
    ventas: Math.abs(s.ventas),
    dscto: s.dscto,
    costo: s.costo,
    gLog: s.gLog,
    gAlm: s.gAlm,
    gCom: s.gCom,
    gAdm: s.gAdm,
    depre: s.depre,
    otrosIng: Math.abs(s.otrosIng),
    ingFin: Math.abs(s.ingFin),
    gastFin: s.gastFin,
    difCamb: -s.difCamb,
  };
  L.utilBruta = L.ventas - L.costo - L.dscto;
  L.pctBruto = pct(L.utilBruta, L.ventas);
  L.gVentas = L.gLog + L.gAlm + L.gCom;
  L.utilOper = L.utilBruta - L.gVentas - L.gAdm - L.depre;
  L.pctOper = pct(L.utilOper, L.ventas);
  L.utilAImpPart = L.utilOper + L.otrosIng + L.ingFin - L.gastFin + L.difCamb;
  L.pctAImpPart = pct(L.utilAImpPart, L.ventas);
  L.partic = (tasas.participacion / 100) * L.utilAImpPart;
  L.utilAImp = L.utilAImpPart - L.partic;
  L.pctAImp = pct(L.utilAImp, L.ventas);
  L.ir = (tasas.ir / 100) * L.utilAImp;
  L.utilNeta = L.utilAImp - L.ir;
  L.pctNeto = pct(L.utilNeta, L.ventas);
  return L;
}

// ---------------------------------------------------------------------------------------------
// SUBDETALLE POR CUENTA de cada línea base: { clave: { codigo: { nombre, meses: [12] } } }
// (mismos saldos y signos que calcularProyectado / calcularEjecutado).
// En el proyectado, ventas y costo se abren por la cuenta 70x / 69x que trae el forecast
// (línea de negocio y zona).
// ---------------------------------------------------------------------------------------------
const agregarDetalle = (det, clave, codigo, nombre, mes, monto) => {
  if (!det[clave]) det[clave] = {};
  const cod = codigo || 'Sin cuenta';
  if (!det[clave][cod]) det[clave][cod] = { nombre: nombre || '', meses: Array(12).fill(0) };
  if (!det[clave][cod].nombre && nombre) det[clave][cod].nombre = nombre;
  det[clave][cod].meses[mes] += monto;
};
const separar = (texto) => {
  const t = String(texto || '').trim();
  const codigo = t.split(/\s/)[0].replace(/\D/g, '');
  const nombre = t.includes(' - ') ? t.slice(t.indexOf(' - ') + 3) : '';
  return { codigo, nombre };
};

export function detalleProyectado(registros, { idVersion, anio }) {
  const det = {};
  registros.filter(r => (!idVersion || r.id_version === idVersion)).forEach(r => {
    const dc = r.detalle_columnas || {};
    if (esForecast(r.modulo)) {
      if (anioDe(r) !== anio) return;
      const tc = dc.moneda === 'US$' ? (num(dc.tipo_cambio) || 1) : 1;
      const cv = separar(dc.cuenta_venta);
      const cc = separar(dc.cuenta_costo);
      MESES_EERR.forEach((m, i) => {
        const cant = num(dc.cantidades?.[m]);
        if (!cant) return;
        const prob = dc.tipo_probabilidad === 'general' || !dc.probabilidades_meses
          ? num(dc.probabilidad_general ?? 100) : num(dc.probabilidades_meses?.[m] ?? 100);
        const esperada = cant * prob / 100;
        agregarDetalle(det, 'ventas', cv.codigo || dc.unidad_negocio, cv.nombre || dc.unidad_negocio, i, -esperada * num(dc.precio_venta) * tc);
        agregarDetalle(det, 'costo', cc.codigo || dc.unidad_negocio, cc.nombre || dc.unidad_negocio, i, esperada * num(dc.costo_unitario) * tc);
      });
      return;
    }
    if (esCosteo(r.modulo)) return;
    const f = mesDe(r.fecha_proyeccion);
    if (!f || f.anio !== anio) return;
    const lineas = Array.isArray(r.desglose_contable) && r.desglose_contable.length > 0
      ? r.desglose_contable.map(d => ({ cuenta: d.cuenta, monto: num(d.monto) }))
      : [{ cuenta: dc.cuenta_afectada || dc.numero_cuenta, monto: num(r.totales?.costo_total ?? dc.costo_total) }];
    lineas.forEach(l => {
      const { codigo, nombre } = separar(l.cuenta);
      const clave = clasificarCuenta(codigo);
      if (clave) agregarDetalle(det, clave, codigo, nombre, f.mes, l.monto);
    });
  });
  return det;
}

export function detalleEjecutado(filasOdoo) {
  const det = {};
  (filasOdoo || []).forEach(f => {
    const clave = clasificarCuenta(f.codigo);
    const i = (parseInt(f.mes, 10) || 0) - 1;
    if (!clave || i < 0 || i > 11) return;
    agregarDetalle(det, clave, String(f.codigo), '', i, num(f.saldo));
  });
  return det;
}

// Signo con que se MUESTRA el saldo de una línea (ventas e ingresos son acreedores).
export const SIGNO_LINEA = { ventas: -1, otrosIng: -1, ingFin: -1, difCamb: -1 };
export const LINEAS_CON_CUENTAS = BASES;
