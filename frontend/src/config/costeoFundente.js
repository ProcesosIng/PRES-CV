// =====================================================================
// MOTOR DEL COSTEO DE FUNDENTE (misma lógica que Comp_FPROY del Excel FP26 Fundente)
//
// Cada PEDIDO del forecast (cliente + producto + mes, en kg) se costea así:
//   Materia prima = kg x Σ (fracción del componente en la BOM x costo del componente en US$)
//   Envases, embalaje y suministros, MOD y CIF del mes (registrados en los módulos del área)
//       se reparten por kilos entre los pedidos del mes:
//         proceso "Sachet"  -> solo a los pedidos en sachet (p. ej. personal externo de ensachetado)
//         proceso "Granel"  -> solo a los pedidos a granel
//         "CIF" / sin proceso -> a todos los pedidos del mes
//   Costo unitario = costo del pedido / kg   (en S/ y en US$ con el tipo de cambio)
// La materia prima puede tomarse de la BOM (recomendado) o de lo registrado en el módulo Materias
// Primas repartido por kilos; la otra fuente se muestra para comparar.
// =====================================================================
export const MESES_F = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
export const TIPOS_F = [
  { clave: 'mp', nombre: 'Materia prima', color: '#2563eb' },
  { clave: 'env', nombre: 'Envases, embalaje y suministros', color: '#0891b2' },
  { clave: 'mod', nombre: 'Mano de obra', color: '#ea580c' },
  { clave: 'cif', nombre: 'CIF', color: '#7c3aed' },
];
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
export const normalF = (t) => String(t || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export function tipoF(modulo) {
  const m = normalF(modulo);
  if (m === 'MATERIAS PRIMAS') return 'mp';
  if (m === 'ENVASES Y EMBALAJES' || m === 'MATERIALES AUXILIARES Y SUMINISTROS') return 'env';
  if (['REMUNERACIONES', 'PERSONAL EXTERNO (RXH)', 'CAPACITACION', 'ATENCION AL PERSONAL', 'EXAMEN OCUPACIONAL', 'UNIFORME - EPPS'].includes(m)) return 'mod';
  return 'cif';
}
const destinoF = (proceso) => { const p = normalF(proceso); return p === 'SACHET' ? 'sachet' : p === 'GRANEL' ? 'granel' : 'todos'; };

// Costos registrados del área por (tipo, destino) y mes.
export function costosFundente(registros, { idVersion, area, anio }) {
  const filas = {};
  registros.forEach(r => {
    if (String(r.id_version) !== String(idVersion)) return;
    const dc = r.detalle_columnas || {};
    if (normalF(dc.area || r.area) !== normalF(area)) return;
    if (/^COSTEO DE|^FORECAST|^PLAN DE (PRODUCCION|COMPRAS)|^DISTRIBUCION DE CALIDAD/.test(normalF(r.modulo))) return;
    const f = String(r.fecha_proyeccion || '').match(/^(\d{4})-(\d{2})/);
    if (!f || f[1] !== String(anio)) return;
    const monto = num(r.totales?.costo_total ?? dc.costo_total);
    if (!monto) return;
    const tipo = tipoF(r.modulo);
    const destino = destinoF(dc.proceso);
    const clave = `${tipo}|${destino}|${r.modulo}`;
    if (!filas[clave]) filas[clave] = { tipo, destino, modulo: r.modulo, meses: Array(12).fill(0) };
    filas[clave].meses[parseInt(f[2], 10) - 1] += monto;
  });
  return Object.values(filas).sort((a, b) => a.tipo.localeCompare(b.tipo) || a.modulo.localeCompare(b.modulo));
}

// Costo de materia prima por kg (US$) de un producto según su BOM.
export function mpPorKg(bomProducto, costos) {
  if (!bomProducto) return null;
  let total = 0;
  const faltan = [];
  Object.entries(bomProducto).forEach(([comp, frac]) => {
    if (!num(frac)) return;
    const c = costos[comp];
    if (c === undefined || c === '') faltan.push(comp); else total += num(frac) * num(c);
  });
  return { usdPorKg: total, faltan };
}

// pedidos: [{ id, cliente, producto, mes (0-11), kg, sachet }]
export function calcularFundente({ pedidos, costosArea, bom, costosComp, parametros }) {
  const tc = num(parametros.tipoCambio) || 1;
  const usarBom = parametros.fuenteMP !== 'registrado';
  const kgMes = (filtro) => MESES_F.map((_, i) => pedidos.filter(p => p.mes === i && filtro(p)).reduce((a, p) => a + p.kg, 0));
  const kgTodos = kgMes(() => true);
  const kgSachet = kgMes(p => p.sachet);
  const kgGranel = kgMes(p => !p.sachet);
  const base = { todos: kgTodos, sachet: kgSachet, granel: kgGranel };

  const alertas = [];
  const sinBom = new Set();
  const compSinCosto = new Set();
  const mpCache = {};
  const detalle = pedidos.map(p => {
    const r = { ...p, mp: 0, env: 0, mod: 0, cif: 0, mpBom: 0 };
    if (!(p.producto in mpCache)) mpCache[p.producto] = mpPorKg(bom[normalF(p.producto)], costosComp);
    const info = mpCache[p.producto];
    if (!info) sinBom.add(p.producto); else info.faltan.forEach(c => compSinCosto.add(c));
    r.mpBom = info ? p.kg * info.usdPorKg * tc : 0;
    if (usarBom) r.mp = r.mpBom;
    return r;
  });
  const asignado = { mp: Array(12).fill(0), env: Array(12).fill(0), mod: Array(12).fill(0), cif: Array(12).fill(0) };
  const sinAsignar = [];
  costosArea.forEach(fila => {
    if (fila.tipo === 'mp' && usarBom) return; // la MP sale de la BOM; lo registrado solo se compara
    fila.meses.forEach((monto, i) => {
      if (!monto) return;
      const kgBase = base[fila.destino][i];
      if (kgBase <= 0) { sinAsignar.push(`${MESES_F[i]}: S/ ${Math.round(monto).toLocaleString('en-US')} de ${fila.modulo}${fila.destino !== 'todos' ? ` (${fila.destino})` : ''} sin pedidos para asignarlo`); return; }
      detalle.forEach(d => {
        if (d.mes !== i) return;
        if (fila.destino === 'sachet' && !d.sachet) return;
        if (fila.destino === 'granel' && d.sachet) return;
        d[fila.tipo] += monto * d.kg / kgBase;
      });
      asignado[fila.tipo][i] += monto;
    });
  });
  detalle.forEach(d => {
    d.total = d.mp + d.env + d.mod + d.cif;
    d.unit = d.kg > 0 ? d.total / d.kg : 0;
    d.unitUsd = d.unit / tc;
  });

  // Por producto: kg y costo por mes, promedio del año.
  const productos = {};
  detalle.forEach(d => {
    if (!productos[d.producto]) productos[d.producto] = { producto: d.producto, meses: MESES_F.map(() => ({ kg: 0, mp: 0, env: 0, mod: 0, cif: 0, total: 0 })), sachet: d.sachet };
    const m = productos[d.producto].meses[d.mes];
    ['kg', 'mp', 'env', 'mod', 'cif', 'total'].forEach(k => { m[k] += d[k]; });
  });
  const listaProductos = Object.values(productos).map(p => {
    p.meses.forEach(m => { m.unit = m.kg > 0 ? m.total / m.kg : 0; });
    const suma = (k) => p.meses.reduce((a, m) => a + m[k], 0);
    const kg = suma('kg');
    return { ...p, kg, mp: suma('mp'), env: suma('env'), mod: suma('mod'), cif: suma('cif'), total: suma('total'), unit: kg > 0 ? suma('total') / kg : 0 };
  }).sort((a, b) => b.kg - a.kg);

  if (sinBom.size) alertas.push(`${sinBom.size} productos sin lista de materiales: ${[...sinBom].slice(0, 8).join(', ')}${sinBom.size > 8 ? '…' : ''}`);
  if (compSinCosto.size) alertas.push(`Componentes sin costo: ${[...compSinCosto].join(', ')}`);
  alertas.push(...sinAsignar);

  const mpRegistrada = costosArea.filter(f => f.tipo === 'mp').reduce((a, f) => a + f.meses.reduce((x, v) => x + v, 0), 0);
  const mpBomTotal = detalle.reduce((a, d) => a + d.mpBom, 0);
  return { detalle, productos: listaProductos, alertas, asignado, kgTodos, kgSachet, mpRegistrada, mpBomTotal, tc };
}

// ---- Lectura de BOM y costos desde el FP26 de Fundente (hojas BOM y CostosUnit) ----
export function leerBomFP26(hojas) {
  const bom = {};
  const filas = hojas.BOM || [];
  const iEnc = filas.findIndex(f => normalF(f?.[0]) === 'FUNDENTE');
  if (iEnc < 0) return bom;
  const enc = filas[iEnc].map(normalF);
  // Mismas columnas que usa Comp_FPROY: 6 (litargirio, con costo de LITARGIRIO ASSAY GH), 11..23, 26 (nitrato de plata), 28 (aceite).
  const cols = [[5, 'LITARGIRIO ASSAY GH'], ...Array.from({ length: 13 }, (_, k) => [10 + k, enc[10 + k]]), [25, 'NITRATO DE PLATA'], [27, 'ACEITE ANTIPOLVO (VACELINA)']];
  filas.slice(iEnc + 1).forEach(f => {
    const nombre = normalF(f?.[0]);
    if (!nombre) return;
    const comp = {};
    cols.forEach(([c, n]) => { const v = num(f[c]); if (v && n) comp[normalF(n) === 'SAL (CLORURO DE SODIO)' ? 'SAL' : normalF(n)] = v; });
    // Como el BUSCARV del Excel: vale la primera fila de cada fundente.
    if (Object.keys(comp).length && !bom[nombre]) bom[nombre] = comp;
  });
  return bom;
}

export function leerCostosFP26(hojas) {
  const costos = {};
  const filas = hojas.CostosUnit || [];
  const iEnc = filas.findIndex(f => normalF(f?.[1]) === 'DESCRIPCION');
  if (iEnc < 0) return costos;
  const enc = filas[iEnc].map(normalF);
  const cUsd = enc.findIndex(e => e === 'COSTO USD');
  filas.slice(iEnc + 1).forEach(f => {
    const n = normalF(f?.[1]);
    if (n && cUsd >= 0 && f[cUsd] !== null && f[cUsd] !== undefined && f[cUsd] !== '') costos[n] = num(f[cUsd]);
  });
  return costos;
}

// BOM desde las fórmulas de Odoo (maestro de fórmulas): fracción = cantidad / cantidad base.
export function bomDesdeOdoo(formulas) {
  const bom = {};
  (formulas || []).forEach(f => {
    const base = num(f.cantidad_base) || 1;
    const comp = {};
    (f.materia_prima || []).forEach(m => { if (m.insumo) comp[normalF(m.insumo)] = (comp[normalF(m.insumo)] || 0) + num(m.cantidad) / base; });
    if (Object.keys(comp).length) bom[normalF(f.producto)] = comp;
  });
  return bom;
}
