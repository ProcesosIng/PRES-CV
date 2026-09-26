// =====================================================================
// DETALLE DE PRODUCCIÓN desde los archivos FP26 (Crisoles y Fundente)
//
// El proyectado general solo trae la materia prima y los envases como UN monto por mes
// (916121000, 916141000...). Aquí se lee el detalle que está detrás de esos montos:
//
//  CRISOLES (hoja CosCris)
//   - Materia prima por tamaño e insumo: kg ("Consumo de MP crisoles de 30 g KG") y soles
//     ("Costo de MP crisoles de 30 g SOLES", con el costo unitario en la columna B).
//   - Cajas por tamaño ("CANTIDAD DE CAJAS" / "COSTO DE CAJAS") y la goma (embalaje).
//   - Plan de producto terminado ("CANT PRODUCTO TERMINADO") y costo unitario del Excel
//     ("COSTOS UNITARIOS POR TAMAÑO DE CRISOL") para comparar con el costeo del sistema.
//  FUNDENTE (hojas "Costeo Fundente" y Comp_FPROY)
//   - Materia prima y envases por componente y mes, en soles y cantidades (tablas resumen).
//   - Costo unitario del Excel por pedido (Comp_FPROY: COSTO TOTAL UNITARIO 2026, US$/kg).
//   - Lista de materiales (BOM), costo de cada componente (CostosUnit) y productos en sachet:
//     quedan guardados para que el costeo de Fundente no necesite volver a cargar el archivo.
//
// Los registros de detalle reemplazan en la importación a los montos globales de esas cuentas
// (mismo total), así cada módulo queda con su detalle y el costeo lo usa por producto.
// =====================================================================
import { leerBomFP26, leerCostosFP26 } from './costeoFundente';

export const MESES_P = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
export const MODULO_REFERENCIA = 'Costeo de Referencia (Excel)';
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());
const normal = (t) => texto(t).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

// Tamaño del crisol (30, 40, 45, 50) a partir de su nombre: "CRISOLES DE ARCILLA 45GR - 500 VOL" -> "45".
export const tamanoDe = (nombre) => (texto(nombre).match(/(\d{2})\s*G(?:R|\b)/i) || [])[1] || '';

// Doce valores a partir de la columna `desde`.
const doce = (fila, desde) => MESES_P.map((_, i) => num(fila?.[desde + i]));

// Filas de un bloque: desde la fila siguiente al encabezado hasta la primera fila sin etiqueta en A
// (o hasta la fila TOTAL inclusive, cuando otro bloque empieza pegado debajo).
function bloque(filas, iEnc, alto = 40) {
  const salida = [];
  for (let i = iEnc + 1; i < Math.min(filas.length, iEnc + 1 + alto); i++) {
    const f = filas[i] || [];
    if (!texto(f[0])) break;
    salida.push(f);
    if (/^TOTAL\b/.test(normal(f[0])) && !/^TOTAL CAJAS/.test(normal(f[0]))) break;
  }
  return salida;
}

// ---------------------------------------------------------------- CRISOLES
export function leerDetalleCrisoles(hojas) {
  const filas = hojas.CosCris || [];
  if (!filas.length) return null;
  const idx = (re, desde = 0) => filas.findIndex((f, i) => i >= desde && re.test(normal(f?.[0])));

  // Plan de producto terminado (nombre de cada tamaño).
  const productos = {};
  const iPT = idx(/^CANT PRODUCTO TERMINADO/);
  if (iPT >= 0) {
    bloque(filas, iPT, 10).forEach(f => {
      if (/^TOTAL/.test(normal(f[0]))) return;
      const t = tamanoDe(f[0]);
      if (t) productos[t] = { producto: texto(f[0]), tamano: t, pt: doce(f, 2) };
    });
  }
  const nombreDe = (t) => productos[t]?.producto || `CRISOL ${t} GR`;

  // Materia prima: kg y soles por tamaño e insumo.
  const mp = [];
  filas.forEach((f, i) => {
    const et = normal(f?.[0]);
    const mKg = et.match(/^CONSUMO DE MP CRISOLES DE (\d{2}) ?G/);
    if (!mKg) return;
    const t = mKg[1];
    const kg = {};
    bloque(filas, i, 12).forEach(r => { kg[normal(r[0])] = { codigo: texto(r[1]), cuenta: texto(r[2]).replace(/\D/g, ''), meses: doce(r, 3) }; });
    // El bloque de soles del mismo tamaño viene después: "Costo de (MP) crisol(es) (de) 30 g SOLES".
    const iS = filas.findIndex((g, j) => j > i && new RegExp(`^COSTO DE (MATERIA PRIMA |MP )?CRISOL(ES)? (DE )?${t} ?G.*SOLES`).test(normal(g?.[0])));
    if (iS < 0) return;
    bloque(filas, iS, 12).forEach(r => {
      const insumo = texto(r[0]);
      const q = kg[normal(insumo)];
      // Soles = kg x costo unitario: así cuadra con el total de la hoja (algunas celdas por tamaño
      // del Excel no siguen esa fórmula, p. ej. el jabón de 50 g).
      const cu = num(r[1]);
      mp.push({ tamano: t, producto: nombreDe(t), insumo, codigo: q?.codigo || '', cuenta: texto(r[2]).replace(/\D/g, '') || q?.cuenta || '916121000',
        costoUnitario: cu, kg: q ? q.meses : Array(12).fill(0), soles: q && cu ? q.meses.map(v => v * cu) : doce(r, 3) });
    });
  });

  // Envases (cajas por tamaño) y embalaje (goma).
  const envases = [];
  const iCant = idx(/^CANTIDAD DE CAJAS/);
  const iCost = idx(/^COSTO DE CAJAS/);
  if (iCost >= 0) {
    const cant = {};
    if (iCant >= 0) bloque(filas, iCant, 12).forEach(r => { cant[normal(r[0])] = { codigo: texto(r[1]), meses: doce(r, 3) }; });
    bloque(filas, iCost, 12).forEach(r => {
      const nombre = texto(r[0]);
      if (/^TOTAL/.test(normal(nombre))) return;
      const t = tamanoDe(nombre.replace(/GR/i, ' GR'));
      const q = cant[normal(nombre)];
      const esEmbalaje = !t;
      envases.push({ tamano: t, producto: t ? nombreDe(t) : '', insumo: nombre, codigo: q?.codigo || '',
        cuenta: esEmbalaje ? '916142000' : '916141000', costoUnitario: num(r[1]),
        cantidad: q ? q.meses : Array(12).fill(0), soles: doce(r, 3) });
    });
  }

  // Costo unitario del Excel por tamaño (S/ por crisol): 1er proceso, 2do proceso y total.
  const referencia = {};
  const iRef = idx(/^COSTOS UNITARIOS POR TAMANO/);
  if (iRef >= 0) {
    let t = '';
    for (let i = iRef + 2; i < Math.min(filas.length, iRef + 30); i++) {
      const f = filas[i] || [];
      if (texto(f[0])) { t = tamanoDe(f[0]); if (!t) break; }
      const et = normal(f[1]);
      if (!t || !et) continue;
      referencia[t] = referencia[t] || { tamano: t, producto: nombreDe(t) };
      const clave = /PRIMER/.test(et) ? 'p1' : /SEGUNDO/.test(et) ? 'p2' : /USD/.test(et) ? 'usd' : /TOTAL/.test(et) ? 'total' : null;
      if (clave) referencia[t][clave] = doce(f, 3);
    }
  }
  Object.values(referencia).forEach(r => { r.pt = productos[r.tamano]?.pt || Array(12).fill(0); });

  return { area: 'Producción Crisoles', mp, envases, productos: Object.values(productos), referencia: Object.values(referencia) };
}

// ---------------------------------------------------------------- FUNDENTE
export function leerDetalleFundente(hojas) {
  const cf = hojas['Costeo Fundente'] || [];
  const comp = hojas.Comp_FPROY || [];
  if (!cf.length && !comp.length) return null;
  const idx = (re) => cf.findIndex(f => re.test(normal(f?.[0])));

  // Cantidades: tabla de la derecha ("Suma de <COMPONENTE><n>" en la columna Q, meses desde R).
  // El nombre lleva un número pegado al final ("SAL14", "BOLSAS SACHETS 7x10x231"): se busca por prefijo.
  const cantidades = [];
  cf.forEach(f => {
    const et = normal(f?.[16]);
    if (et.startsWith('SUMA DE ')) cantidades.push([et.slice(8).trim(), doce(f, 17)]);
  });
  const cantidadDe = (nombre) => {
    const n = normal(nombre);
    const hallada = cantidades.filter(([l]) => l.startsWith(n) && /^\d*$/.test(l.slice(n.length)))
      .sort((a, b) => a[0].length - b[0].length)[0];
    return hallada ? hallada[1] : Array(12).fill(0);
  };
  const leerSoles = (reInicio, cuentaPorDefecto) => {
    const i = idx(reInicio);
    if (i < 0) return [];
    const salida = [];
    bloque(cf, i, 20).forEach(r => {
      const nombre = texto(r[0]);
      if (/^TOTAL/.test(normal(nombre))) return;
      const soles = doce(r, 2);
      if (!soles.some(v => v)) return;
      const q = cantidadDe(nombre);
      salida.push({ insumo: nombre, codigo: texto(r[1]).replace(/[[\]]/g, ''), cuenta: cuentaPorDefecto, cantidad: q, soles,
        costoUnitario: (() => { const tq = q.reduce((a, v) => a + v, 0); return tq ? soles.reduce((a, v) => a + v, 0) / tq : 0; })() });
    });
    // La cuenta del TOTAL del bloque manda (926121000 / 926141000).
    const total = bloque(cf, i, 20).find(r => /^TOTAL/.test(normal(r[0])));
    const cta = texto(total?.[1]).replace(/\D/g, '');
    if (cta) salida.forEach(s => { s.cuenta = cta; });
    return salida;
  };
  const mp = leerSoles(/^COSTO DE MATERIA PRIMA TOTAL SOLES/, '926121000');
  const envases = leerSoles(/^COSTO DE ENVASES TOTAL SOLES/, '926141000');

  // Referencia por pedido (Comp_FPROY): costo unitario US$/kg y su composición.
  const pedidos = [];
  const iEnc = comp.findIndex(f => (f || []).map(normal).includes('NOMBRE DEL PRODUCTO'));
  if (iEnc >= 0) {
    const enc = comp[iEnc].map(normal);
    const c = (n) => enc.indexOf(n);
    const col = {
      cliente: c('CLIENTE'), fecha: c('FECHA'), producto: c('NOMBRE DEL PRODUCTO'), kg: c('CANTIDAD'), sachet: c('SACHETS'),
      mp: c('COSTO MP'), env: c('COSTO ENVASES'), emb: c('COSTO EMBALAJE'), ens: c('COSTO ENSACHETADO'),
      mod: c('COSTO MANO DE OBRA TOTAL SOLES'), cif: c('CIF SOLES'), total: c('COSTO TOTAL'), unit: c('COSTO TOTAL UNITARIO 2026'),
    };
    comp.slice(iEnc + 1).forEach(f => {
      const producto = texto(f[col.producto]);
      const fecha = f[col.fecha] instanceof Date ? f[col.fecha] : new Date(f[col.fecha]);
      const kg = num(f[col.kg]);
      if (!producto || !kg || Number.isNaN(fecha.getTime())) return;
      pedidos.push({
        cliente: texto(f[col.cliente]), producto, mes: fecha.getMonth(), kg, sachet: normal(f[col.sachet]) === 'SI',
        mpUsd: num(f[col.mp]), envUsd: num(f[col.env]) + num(f[col.emb]) + num(f[col.ens]),
        modSoles: num(f[col.mod]), cifSoles: num(f[col.cif]), totalUsd: num(f[col.total]), unitUsd: num(f[col.unit]),
      });
    });
  }
  const sachet = {};
  pedidos.forEach(p => { sachet[normal(p.producto)] = sachet[normal(p.producto)] || p.sachet; });
  return { area: 'Producción Fundente', mp, envases, pedidos, bom: leerBomFP26(hojas), costos: leerCostosFP26(hojas), sachet };
}

// ---------------------------------------------------------------- REGISTROS
// Un registro por insumo, producto (tamaño) y mes en Materias Primas / Envases y Embalajes.
export function registrosDeDetalle(detalle, { idVersion, anio }) {
  const registros = [];
  const area = detalle.area;
  const clave = area.includes('Crisoles') ? 'CRI' : 'FUN';
  const fmt = (v, d = 2) => num(v).toLocaleString('en-US', { maximumFractionDigits: d });
  const agregar = (modulo, proceso, item, i, cantidad, unidad) => {
    const monto = item.soles[i];
    if (!monto) return;
    const cu = cantidad ? monto / cantidad : item.costoUnitario;
    const nombreCuenta = modulo === 'Materias Primas' ? 'Materias primas - Materias primas'
      : item.cuenta.slice(-7) === '6142000' ? 'Envases y embalajes - Embalajes' : 'Envases y embalajes - Envases';
    registros.push({
      id_registro: `IMPDET-${clave}-${idVersion}-${anio}-${registros.length}`,
      area, modulo, categoria: modulo,
      fecha_proyeccion: `${anio}-${String(i + 1).padStart(2, '0')}-01`,
      empleado_dni: '-', empleado_nombre: item.insumo,
      detalle_columnas: {
        area, insumo: item.insumo, codigo_insumo: item.codigo, producto: item.producto || '', tamano: item.tamano || '',
        cantidad, unidad, costo_unitario: cu, costo_total: monto,
        detalle: `${item.insumo}${item.producto ? ` · ${item.producto}` : ''}${cantidad ? ` · ${fmt(cantidad)} ${unidad} × S/ ${fmt(cu, 4)}` : ''}`,
        cuenta_afectada: `${item.cuenta} - ${nombreCuenta}`, proceso, origen_importacion: 'Excel (detalle FP26)',
      },
      desglose_contable: [{ id: 'l0', cuenta: `${item.cuenta} - ${nombreCuenta}`, monto: monto.toFixed(2) }],
      totales: { costo_total: monto },
    });
  };
  const esFundente = clave === 'FUN';
  detalle.mp.forEach(item => MESES_P.forEach((_, i) => agregar('Materias Primas', esFundente ? 'CIF' : 'Primer Proceso', item, i, (item.kg || item.cantidad)[i], 'kg')));
  // Fundente: las bolsas de sachet solo van a los pedidos en sachet; baldes, bolsas y precintos a todos.
  const procesoEnvase = (item) => (!esFundente ? 'Segundo Proceso' : /SACHET/i.test(item.insumo) ? 'Sachet' : 'CIF');
  detalle.envases.forEach(item => MESES_P.forEach((_, i) => agregar('Envases y Embalajes', procesoEnvase(item), item, i, item.cantidad[i], 'und')));

  // Referencia del Excel para comparar (no es gasto: módulo "Costeo de ...", sin cuenta).
  registros.push({
    id_registro: `IMPREF-${clave}-${idVersion}-${anio}`,
    area, modulo: MODULO_REFERENCIA, categoria: MODULO_REFERENCIA,
    fecha_proyeccion: `${anio}-01-01`,
    empleado_dni: '-', empleado_nombre: `Costeo ${anio} del Excel`,
    detalle_columnas: {
      area, anio_proyeccion: String(anio), origen_importacion: 'Excel (FP26)',
      detalle: `Costo unitario calculado en el Excel FP26 (${esFundente ? 'por pedido, US$/kg' : 'por tamaño, S/ por crisol'})`,
      ...(esFundente
        ? { pedidos: detalle.pedidos, bom: detalle.bom, costos_componentes: detalle.costos, sachet: detalle.sachet }
        : { productos: detalle.referencia }),
    },
    totales: { costo_total: 0 },
  });
  return registros;
}

// Cuentas base que el detalle reemplaza en el proyectado general de esa área.
export const CUENTAS_REEMPLAZADAS = ['6121', '6141', '6142'];

// Totales por mes del detalle (para comparar con el proyectado general antes de importar).
export function totalesDetalle(detalle) {
  const t = { mp: Array(12).fill(0), env: Array(12).fill(0) };
  detalle.mp.forEach(it => it.soles.forEach((v, i) => { t.mp[i] += v; }));
  detalle.envases.forEach(it => it.soles.forEach((v, i) => { t.env[i] += v; }));
  return t;
}
