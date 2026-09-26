// =====================================================================
// IMPORTADOR DE EXCEL (administrador)
// Archivos que reconoce (por sus encabezados):
//  - PROYECTADO de gastos: Fecha | NUMERO DE CUENTA | DETALLE | Monto S/. | VERSION | AREA | ... | ID | NUM | DETALLE CUENTA
//  - FORECAST de ventas:  CLIENTE | VENDEDOR | TIPO DE CLIENTE | Tipo | Zona | Pais | UNIDAD DE NEGOCIOS | PRODUCTO | NOMBRE DEL PRODUCTO | ... | Cant1..Cant12
//  - Archivo de PRODUCCIÓN (FP26): de él solo se leen los procesos sugeridos
//      * hoja Remunr: proceso (1/2/3) de cada trabajador
//      * hoja CosCris: USO (1/2/3) de cada cuenta en el detalle del CIF
// Todo es "puro" (recibe filas ya leídas); el componente ImportarExcel.jsx lee el archivo con exceljs.
// =====================================================================
import { cuentasForecast, tipoNegocioDe } from './cuentasForecast';
import { procesosDeArea } from './areas';

export const MESES_IMP = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());
const normal = (t) => texto(t).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

// Filas de una hoja: [[celda, celda, ...], ...] (índice 0 = columna A).
export function detectarTipo(hojas) {
  const nombres = Object.keys(hojas);
  if (nombres.includes('CosCris') || nombres.includes('Remunr') || nombres.includes('Comp_FPROY')) return 'produccion';
  for (const filas of Object.values(hojas)) {
    const enc = (filas[0] || []).map(normal);
    if (enc.includes('NUMERO DE CUENTA') && enc.some(e => e.startsWith('MONTO')) && enc.includes('AREA')) return 'proyectado';
    if (enc.includes('CLIENTE') && enc.includes('CANT1')) return 'forecast';
  }
  return null;
}

const PROCESO_NUM = { 1: 'Primer Proceso', 2: 'Segundo Proceso', 3: 'CIF' };

// Procesos sugeridos desde un archivo FP26 de producción.
export function leerProcesosProduccion(hojas) {
  const empleados = {};
  const cuentas = {};
  const remun = hojas.Remunr || [];
  const iEnc = remun.findIndex(f => (f || []).map(normal).includes('PROCESO'));
  if (iEnc >= 0) {
    const enc = remun[iEnc].map(normal);
    const cNom = enc.findIndex(e => e.includes('APELLIDOS'));
    const cProc = enc.indexOf('PROCESO');
    const cuenta = {};
    remun.slice(iEnc + 1).forEach(f => {
      const nombre = normal(f[cNom]);
      const p = parseInt(f[cProc], 10);
      if (!nombre || !PROCESO_NUM[p]) return;
      cuenta[nombre] = cuenta[nombre] || {};
      cuenta[nombre][p] = (cuenta[nombre][p] || 0) + 1;
    });
    Object.entries(cuenta).forEach(([n, c]) => { empleados[n] = PROCESO_NUM[Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]]; });
  }
  // CosCris: secciones "USO | n", "PRIMER/SEGUNDO PROCESO", "COMPARTIDO" seguidas de filas con la cuenta.
  const cos = hojas.CosCris || [];
  let uso = null;
  const SIEMPRE_COMPARTIDO = ['TRANSPORTE', 'ASESORIA', 'ALQUILERES', 'PUBLICIDAD', 'TRIBUTOS', 'SEGUROS Y SUSCRIPCIONES', 'SUMINISTROS, GESTION MEDIOAMBIENTAL Y OTROS GASTOS DE GESTION'];
  const POR_USO = ['SERVICIOS', 'OTROS SERVICIOS PRESTADOS POR TERCEROS', 'DEPRECIACION'];
  cos.forEach(f => {
    const a = normal(f?.[0]);
    if (a === 'USO') { uso = parseInt(f[1], 10) || null; return; }
    if (a.includes('PRIMER PROCESO')) { uso = 1; return; }
    if (a.includes('SEGUNDO PROCESO')) { uso = 2; return; }
    if (a.includes('COMPARTIDO')) { uso = 3; return; }
    if (SIEMPRE_COMPARTIDO.includes(a)) { uso = 3; return; }
    if (POR_USO.includes(a)) { uso = null; return; }
    const m = texto(f?.[0]).match(/^(9\d{8})/);
    if (m && uso && !cuentas[m[1]]) cuentas[m[1]] = PROCESO_NUM[uso];
  });
  return { empleados, cuentas };
}

// Módulo del sistema según la cuenta base (7 dígitos).
export function moduloPorCuenta(base, esTrabajador) {
  const b = String(base);
  if (b.startsWith('612')) return 'Materias Primas';
  if (b.startsWith('613')) return 'Materiales Auxiliares y Suministros';
  if (b.startsWith('614')) return 'Envases y Embalajes';
  if (b.startsWith('621') || b.startsWith('622') || b.startsWith('627') || b.startsWith('629') || (b.startsWith('6597') && esTrabajador)) return 'Remuneraciones';
  if (b.startsWith('624')) return 'Capacitación';
  if (b.startsWith('6252')) return 'Uniforme - EPPs';
  if (b.startsWith('6253')) return 'Examen Ocupacional';
  if (b.startsWith('625')) return 'Atencion al Personal';
  if (b.startsWith('631')) return 'Transporte';
  if (b.startsWith('632')) return 'Asesoria';
  if (b.startsWith('634')) return 'Plan de Mantenimiento';
  if (b.startsWith('635')) return 'Alquiler';
  if (b.startsWith('636')) return 'Servicios';
  if (b.startsWith('637')) return 'Publicidad';
  if (b.startsWith('6399')) return esTrabajador ? 'Personal Externo (RxH)' : 'Otros Servicios';
  if (b.startsWith('638') || b.startsWith('639')) return 'Otros Servicios';
  if (b.startsWith('64')) return 'Tributos';
  if (b.startsWith('651') || b.startsWith('652') || b.startsWith('653') || b.startsWith('654')) return 'Seguros, Suscripciones, Licencias y Regalias';
  if (b.startsWith('65')) return 'Suministros, Gestion M. Ambiental y Otros gastos de gestion';
  if (b.startsWith('68')) return 'Plan de Depreciación';
  return 'Gastos Varios';
}

const AREA_POR_PREFIJO = { 91: 'Producción Crisoles', 92: 'Producción Fundente', 93: 'Producción Copelas', 94: 'Administración', 95: 'Comercial', 98: 'Logística', 99: 'Almacen' };
const AREA_POR_NOMBRE = {
  CRISOLES: 'Producción Crisoles', 'PRODUCCION CRISOLES': 'Producción Crisoles',
  FUNDENTE: 'Producción Fundente', 'PRODUCCION FUNDENTE': 'Producción Fundente',
  COPELAS: 'Producción Copelas', 'PRODUCCION COPELAS': 'Producción Copelas',
  ADMINISTRACION: 'Administración', COMERCIAL: 'Comercial', LOGISTICA: 'Logística', ALMACEN: 'Almacen',
};
export const areaDeFila = (nombreArea, cuenta) => {
  const n = normal(nombreArea);
  if (n.startsWith('CALIDAD')) return 'Calidad';
  return AREA_POR_NOMBRE[n] || AREA_POR_PREFIJO[String(cuenta).slice(0, 2)] || null;
};

// Proceso sugerido para un gasto de producción.
export function procesoSugerido({ area, modulo, cuenta, detalle, procesos }) {
  const opciones = procesosDeArea(area);
  if (opciones.length === 0) return null;
  if (opciones.includes('Granel')) return modulo === 'Personal Externo (RxH)' ? 'Sachet' : 'CIF'; // Fundente
  const emp = procesos?.empleados?.[normal(detalle)];
  if (emp) return emp;
  if (procesos?.cuentas?.[cuenta]) return procesos.cuentas[cuenta];
  if (modulo === 'Materias Primas') return 'Primer Proceso';
  if (modulo === 'Envases y Embalajes' || modulo === 'Materiales Auxiliares y Suministros') return 'Segundo Proceso';
  return 'CIF';
}

// Lee las filas del proyectado en movimientos { area, destinoCalidad, cuenta, base, nombreCuenta, detalle, mes, monto, modulo, esTrabajador }.
export function leerProyectado(filas, anio) {
  const enc = (filas[0] || []).map(normal);
  const col = (...nombres) => enc.findIndex(e => nombres.some(n => e === n || e.startsWith(n)));
  const c = { fecha: col('FECHA'), cuenta: col('NUMERO DE CUENTA'), detalle: col('DETALLE'), monto: col('MONTO'), area: col('AREA'), nombre: col('DETALLE CUENTA') };
  const movs = [];
  const avisos = { sinArea: 0, otroAnio: 0, sinMonto: 0 };
  filas.slice(1).forEach(f => {
    const cuenta = texto(f[c.cuenta]).replace(/\D/g, '');
    if (!cuenta) return;
    const monto = num(f[c.monto]);
    if (Math.abs(monto) < 0.005) { avisos.sinMonto++; return; }
    const fecha = f[c.fecha] instanceof Date ? f[c.fecha] : new Date(f[c.fecha]);
    if (Number.isNaN(fecha.getTime())) return;
    if (anio && String(fecha.getFullYear()) !== String(anio)) { avisos.otroAnio++; return; }
    const area = areaDeFila(f[c.area], cuenta);
    if (!area) { avisos.sinArea++; return; }
    const detalle = texto(f[c.detalle]);
    const base = cuenta.length > 7 ? cuenta.slice(-7) : cuenta;
    const esTrabajador = !!detalle && /^(621|622|624|625|627|629|6597|6399)/.test(base);
    movs.push({
      area, destinoCalidad: area === 'Calidad' ? AREA_POR_PREFIJO[cuenta.slice(0, 2)] || null : null,
      cuenta, base, nombreCuenta: texto(f[c.nombre]), detalle, mes: fecha.getMonth(), anio: fecha.getFullYear(), monto,
      modulo: moduloPorCuenta(base, esTrabajador), esTrabajador,
    });
  });
  return { movimientos: movs, avisos };
}

// Decisiones de proceso a mostrar en la vista previa (una por cuenta y una por trabajador, por área de producción).
export function decisionesDeProceso(movs, procesos) {
  const porClave = {};
  movs.forEach(m => {
    if (procesosDeArea(m.area).length === 0) return;
    // Gastos por trabajador (planilla, capacitación, atención, EPP, externos...): el proceso es el del trabajador.
    const clave = m.esTrabajador ? `${m.area}|T|${normal(m.detalle)}` : `${m.area}|C|${m.cuenta}`;
    if (!porClave[clave]) {
      porClave[clave] = {
        clave, area: m.area, tipo: clave.includes('|T|') ? 'trabajador' : 'cuenta',
        etiqueta: clave.includes('|T|') ? m.detalle : `${m.cuenta} - ${m.nombreCuenta}`,
        modulo: clave.includes('|T|') ? 'Gastos del trabajador' : m.modulo, monto: 0,
        sugerido: procesoSugerido({ area: m.area, modulo: m.modulo, cuenta: m.cuenta, detalle: m.detalle, procesos }),
      };
    }
    porClave[clave].monto += m.monto;
  });
  return Object.values(porClave).sort((a, b) => a.area.localeCompare(b.area) || a.tipo.localeCompare(b.tipo) || b.monto - a.monto);
}

// Arma los registros de gasto. elegidos: { clave: proceso } (lo que el usuario cambió en la vista previa).
export function registrosDeProyectado(movs, { idVersion, anio, elegidos = {}, decisiones = [] }) {
  const procesoDe = {};
  decisiones.forEach(d => { procesoDe[d.clave] = elegidos[d.clave] || d.sugerido; });
  const grupos = new Map();
  movs.forEach(m => {
    // Calidad se registra con la cuenta 6 base (sin prefijo) y se suma entre sus destinos.
    const cuenta = m.area === 'Calidad' ? m.base : m.cuenta;
    const clave = m.esTrabajador ? `${m.area}|T|${normal(m.detalle)}` : `${m.area}|C|${m.cuenta}`;
    const proceso = procesoDe[clave] || null;
    const grupo = m.modulo === 'Remuneraciones'
      ? `${m.area}|${m.modulo}|${normal(m.detalle)}|${m.mes}|${proceso}`
      : `${m.area}|${m.modulo}|${cuenta}|${normal(m.detalle)}|${m.mes}|${proceso}`;
    if (!grupos.has(grupo)) grupos.set(grupo, { m, proceso, lineas: new Map(), nombres: {} });
    const g = grupos.get(grupo);
    g.lineas.set(cuenta, (g.lineas.get(cuenta) || 0) + m.monto);
    g.nombres[cuenta] = m.nombreCuenta;
  });
  let i = 0;
  const registros = [];
  grupos.forEach(({ m, proceso, lineas, nombres }) => {
    const desglose = [...lineas.entries()].map(([cta, v], j) => ({ id: `l${j}`, cuenta: nombres[cta] ? `${cta} - ${nombres[cta]}` : cta, monto: v.toFixed(2) }));
    const total = [...lineas.values()].reduce((a, v) => a + v, 0);
    registros.push({
      id_registro: `IMP-${idVersion}-${anio}-${i++}`,
      area: m.area, modulo: m.modulo, categoria: m.modulo,
      fecha_proyeccion: `${m.anio}-${String(m.mes + 1).padStart(2, '0')}-01`,
      empleado_dni: '-', empleado_nombre: m.detalle || m.modulo,
      detalle_columnas: {
        area: m.area, detalle: m.detalle || desglose[0].cuenta, cuenta_afectada: desglose[0].cuenta, costo_total: total,
        ...(proceso ? { proceso } : {}), origen_importacion: 'Excel',
      },
      desglose_contable: desglose,
      totales: { costo_total: total },
    });
  });
  return registros;
}

// Porcentajes de Calidad según lo que el Excel ya repartía entre destinos (91/92/93/95).
export function porcentajesCalidad(movs) {
  const porDestino = {};
  let total = 0;
  movs.filter(m => m.area === 'Calidad' && m.destinoCalidad).forEach(m => { porDestino[m.destinoCalidad] = (porDestino[m.destinoCalidad] || 0) + m.monto; total += m.monto; });
  const pct = {};
  Object.entries(porDestino).forEach(([d, v]) => { pct[d] = total ? Math.round((v / total) * 10000) / 100 : 0; });
  // Ajuste de redondeo para que sume exactamente 100.
  const claves = Object.keys(pct);
  if (claves.length) pct[claves[0]] = Math.round((100 - claves.slice(1).reduce((a, k) => a + pct[k], 0)) * 100) / 100;
  return pct;
}

// ---------------- FORECAST ----------------
const UNIDAD_POR_PRODUCTO = { FUNDENTES: 'Fundente', FUNDENTE: 'Fundente', CRISOLES: 'Crisoles de Arcilla', COPELAS: 'Copelas', CARBON: 'Carbon Activado', CCS: 'CCS', 'BOLAS DE ACERO': 'Bolas de acero', FLOCULANTES: 'Floculantes', INSUMOS: 'Insumos', 'POLVO ZN': 'Polvo Zn', EQUIPOS: 'Equipos', SERVICIOS: 'Servicios', EPP: 'Epp' };

export function registrosDeForecast(filas, { idVersion, anio, tipoCambio }) {
  const enc = (filas[0] || []).map(normal);
  const col = (n) => enc.indexOf(n);
  const c = {
    cliente: col('CLIENTE'), vendedor: col('VENDEDOR'), tipoCliente: col('TIPO DE CLIENTE'), tipo: col('TIPO'), region: col('ZONA'), pais: col('PAIS'),
    un: col('UNIDAD DE NEGOCIOS'), producto: col('PRODUCTO'), nombre: col('NOMBRE DEL PRODUCTO'), presentacion: col('PRESENTACION'), um: col('UM'),
    pv25: col('PV 2025'), cv25: col('CV 2025'), pv: col('PRECIO DE VENTA'), cu: col('COSTO UNIT'),
  };
  const cant = MESES_IMP.map((_, i) => col(`CANT${i + 1}`));
  const registros = [];
  const sinCuenta = new Set();
  filas.slice(1).forEach((f, idx) => {
    const cliente = texto(f[c.cliente]);
    const producto = texto(f[c.nombre]);
    if (!cliente || !producto) return;
    const un = UNIDAD_POR_PRODUCTO[normal(f[c.producto])] || UNIDAD_POR_PRODUCTO[normal(f[c.un])] || texto(f[c.producto]);
    const zona = normal(f[c.tipo]) === 'EXTERIOR' ? 'Exterior' : 'Local';
    const cantidades = MESES_IMP.reduce((a, m, i) => ({ ...a, [m]: num(f[cant[i]]) }), {});
    const q = Object.values(cantidades).reduce((a, v) => a + v, 0);
    const pv = num(f[c.pv]);
    const cu = num(f[c.cu]);
    const cuentas = cuentasForecast(un, zona);
    if (!cuentas.venta) sinCuenta.add(`${un} · ${zona}`);
    const presentacion = texto(f[c.presentacion]);
    registros.push({
      id_registro: `IMPFC-${idVersion}-${anio}-${idx}`,
      area: 'Comercial', modulo: 'Forecast de Ventas', categoria: 'Forecast de Ventas',
      fecha_proyeccion: `${anio}-01-01`,
      empleado_dni: '-', empleado_nombre: texto(f[c.vendedor]) || '-',
      detalle_columnas: {
        cliente, vendedor: texto(f[c.vendedor]), tipo_cliente: texto(f[c.tipoCliente]), zona, pais: texto(f[c.pais]), region: texto(f[c.region]),
        unidad_negocio: un, tipo_negocio: tipoNegocioDe(un),
        cuenta_venta: cuentas.venta?.texto || null, cuenta_costo: cuentas.costo?.texto || null,
        producto, um: texto(f[c.um]) || 'Unidad', moneda: 'US$', tipo_cambio: num(tipoCambio) || 1, anio_proyeccion: String(anio),
        pv_2025: num(f[c.pv25]), cv_2025: num(f[c.cv25]), precio_venta: pv, costo_unitario: cu,
        tipo_probabilidad: 'general', probabilidad_general: 100, cantidades, cantidad_total_anio: q,
        ingreso_total: q * pv, costo_total: q * cu, margen_bruto: q * (pv - cu),
        ...(un === 'Fundente' ? { presentacion_fundente: /SACHET/i.test(presentacion) ? 'Sachet' : 'Granel' } : {}),
        origen_importacion: 'Excel',
      },
      totales: { ingreso_total: q * pv, costo_total: q * cu, margen_bruto: q * (pv - cu) },
    });
  });
  return { registros, sinCuenta: [...sinCuenta] };
}
