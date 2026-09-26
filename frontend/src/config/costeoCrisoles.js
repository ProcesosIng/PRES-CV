// =====================================================================
// MOTOR DEL COSTEO DE CRISOLES (misma lógica que CosCris del Excel FP26, sin duplicar costos)
//
// Cantidades por tamaño y mes:
//   PT (producto terminado a entregar)  -> lo define el plan (forecast, editable)
//   Calcinados = PT / (1 - merma)       -> lo que entra al horno para obtener el PT bueno
//   Crudos     = Calcinados x (1 + factor de corrección)   -> lo que se prensa
//
// Costos del mes (registrados en los módulos del área), por bloque:
//   1er proceso (prensado):  materia prima e insumos + MOD proceso 1 + CIF proceso 1
//   2do proceso (calcinado): envases, GNV y suministros + MOD proceso 2 + CIF proceso 2
//   CIF compartido:          MOD compartida + CIF compartido (incluye Calidad repartida)
// Reparto entre tamaños (cada sol se asigna UNA sola vez):
//   1er proceso -> según crudos (la materia prima, según crudos x peso del crisol)
//   2do proceso -> según calcinados
//   Compartido  -> según lo producido (PT)
// Costo unitario = costo asignado / PT bueno  (la merma queda incluida en el costo).
// =====================================================================
export const MESES_COSTEO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
export const BLOQUES = [
  { clave: 'p1', nombre: '1er proceso (prensado)', color: '#2563eb' },
  { clave: 'p2', nombre: '2do proceso (calcinado)', color: '#ea580c' },
  { clave: 'comp', nombre: 'CIF compartido', color: '#7c3aed' },
];
// Peso teórico calcinado (g) por tamaño, del Excel FP26 (reparte la materia prima según el tamaño).
export function pesoSugerido(producto) {
  const m = String(producto || '').match(/(\d{2})\s*GR?\b/i);
  return { '30': 460, '40': 500, '45': 670, '50': 555 }[m?.[1]] || 0;
}

export const PARAMETROS_POR_DEFECTO = {
  factorCorreccion: 10,        // % adicional de crudos a prensar
  merma: 4,                    // % que se pierde en la calcinación
  capacidadCalcinacion: 11500, // crisoles por calcinación (horneada)
  calcinacionesMes: 13,
  hornos: 2,
  stockInicial: 0,             // PT disponible al inicio del año (se descuenta de enero en adelante)
  tipoCambio: 3.5,
};

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// Tipo de costo según el módulo donde se registró.
export function tipoDeModulo(modulo) {
  const m = norm(modulo);
  if (m === 'materias primas') return 'mp';
  if (m === 'envases y embalajes' || m === 'materiales auxiliares y suministros') return 'sum';
  // Mano de obra: planilla y lo que se paga por cada trabajador (como la hoja Remunr del Excel).
  if (['remuneraciones', 'personal externo (rxh)', 'capacitacion', 'atencion al personal', 'examen ocupacional', 'uniforme - epps'].includes(m)) return 'mod';
  return 'cif';
}

// Bloque (p1 / p2 / comp) según el proceso marcado en el gasto; sin proceso se usa el natural del tipo.
export function bloqueDe(proceso, tipo) {
  const p = norm(proceso);
  if (p === 'primer proceso') return 'p1';
  if (p === 'segundo proceso') return 'p2';
  if (p === 'cif' || p === 'compartido') return 'comp';
  if (tipo === 'mp') return 'p1';
  if (tipo === 'sum') return 'p2';
  return 'comp';
}

const mesDeFecha = (f) => { const m = String(f || '').match(/^(\d{4})-(\d{2})/); return m ? { anio: m[1], mes: parseInt(m[2], 10) - 1 } : null; };
const ETIQUETA_TIPO = { mp: 'Materia prima e insumos', sum: 'Envases, GNV y suministros', mod: 'Mano de obra', cif: 'CIF' };

// Costos del área y año agrupados: bloque -> fila (tipo · módulo) -> 12 meses.
export function costosDelArea(registros, { idVersion, area, anio }) {
  const filas = {};
  const vacio = () => Array(12).fill(0);
  registros.forEach(r => {
    if (String(r.id_version) !== String(idVersion)) return;
    const dc = r.detalle_columnas || {};
    if (norm(dc.area || r.area) !== norm(area)) return;
    const modulo = r.modulo || '';
    if (/^costeo de|^forecast|^plan de (produccion|compras)|^distribucion de calidad/.test(norm(modulo))) return;
    // Derivados de costeos antiguos de este mismo formulario (DERIV-MAT/SUM) sí son costo registrado;
    // los de embalaje (Logística) y Calidad llegan con su propio id y también cuentan.
    const f = mesDeFecha(r.fecha_proyeccion);
    if (!f || f.anio !== String(anio)) return;
    const monto = num(r.totales?.costo_total ?? dc.costo_total);
    if (!monto) return;
    const tipo = tipoDeModulo(modulo);
    const bloque = bloqueDe(dc.proceso, tipo);
    const clave = `${bloque}|${tipo}|${modulo}`;
    if (!filas[clave]) filas[clave] = { bloque, tipo, modulo, etiqueta: `${ETIQUETA_TIPO[tipo]} · ${modulo}`, meses: vacio() };
    filas[clave].meses[f.mes] += monto;
  });
  const lista = Object.values(filas).sort((a, b) => a.bloque.localeCompare(b.bloque) || a.tipo.localeCompare(b.tipo) || a.modulo.localeCompare(b.modulo));
  const totales = { p1: vacio(), p2: vacio(), comp: vacio(), mpP1: vacio() };
  lista.forEach(fl => fl.meses.forEach((v, i) => {
    totales[fl.bloque][i] += v;
    if (fl.bloque === 'p1' && fl.tipo === 'mp') totales.mpP1[i] += v;
  }));
  return { filas: lista, totales };
}

// productos: [{ producto, pt: [12], peso }]  (peso en gramos; 0 o vacío = reparto por unidades)
export function calcularCosteo({ productos, costos, parametros }) {
  const p = { ...PARAMETROS_POR_DEFECTO, ...parametros };
  const merma = Math.min(num(p.merma), 99) / 100;
  const factor = num(p.factorCorreccion) / 100;
  const capacidadMes = num(p.capacidadCalcinacion) * num(p.calcinacionesMes) * Math.max(num(p.hornos), 1);

  // 1) Cantidades: el stock inicial cubre primero la demanda de los primeros meses (proporcional por tamaño).
  let stock = num(p.stockInicial);
  const filas = productos.map(pr => ({ ...pr, pt: MESES_COSTEO.map((_, i) => num(pr.pt?.[i])) }));
  const ptProducir = filas.map(() => Array(12).fill(0));
  for (let i = 0; i < 12; i++) {
    const demanda = filas.reduce((a, f) => a + f.pt[i], 0);
    const cubre = Math.min(stock, demanda);
    stock -= cubre;
    filas.forEach((f, k) => { ptProducir[k][i] = demanda > 0 ? f.pt[i] * (1 - cubre / demanda) : 0; });
  }
  const calcinados = ptProducir.map(fila => fila.map(v => (merma < 1 ? v / (1 - merma) : v)));
  const crudos = calcinados.map(fila => fila.map(v => v * (1 + factor)));
  const pesoRel = filas.map(f => (num(f.peso) > 0 ? num(f.peso) : 1));

  const totalMes = (matriz) => MESES_COSTEO.map((_, i) => matriz.reduce((a, fila) => a + fila[i], 0));
  const totPT = totalMes(ptProducir);
  const totCal = totalMes(calcinados);
  const totCru = totalMes(crudos);
  const totCruPeso = MESES_COSTEO.map((_, i) => crudos.reduce((a, fila, k) => a + fila[i] * pesoRel[k], 0));

  // 2) Reparto de costos del mes entre tamaños.
  const T = costos.totales;
  const resultado = filas.map((f, k) => {
    const meses = MESES_COSTEO.map((_, i) => {
      const shareCru = totCru[i] > 0 ? crudos[k][i] / totCru[i] : 0;
      const shareMp = totCruPeso[i] > 0 ? (crudos[k][i] * pesoRel[k]) / totCruPeso[i] : 0;
      const shareCal = totCal[i] > 0 ? calcinados[k][i] / totCal[i] : 0;
      const sharePT = totPT[i] > 0 ? ptProducir[k][i] / totPT[i] : 0;
      const p1 = T.mpP1[i] * shareMp + (T.p1[i] - T.mpP1[i]) * shareCru;
      const p2 = T.p2[i] * shareCal;
      const comp = T.comp[i] * sharePT;
      const q = ptProducir[k][i];
      const unit = (v) => (q > 0 ? v / q : 0);
      return { pt: q, calcinados: calcinados[k][i], crudos: crudos[k][i], p1, p2, comp, total: p1 + p2 + comp,
        uP1: unit(p1), uP2: unit(p2), uComp: unit(comp), uTotal: unit(p1 + p2 + comp) };
    });
    const suma = (c) => meses.reduce((a, m) => a + m[c], 0);
    const ptAnual = suma('pt');
    const totalAnual = suma('total');
    return {
      producto: f.producto, peso: f.peso, demanda: f.pt, meses,
      ptAnual, totalAnual, p1Anual: suma('p1'), p2Anual: suma('p2'), compAnual: suma('comp'),
      unitarioPromedio: ptAnual > 0 ? totalAnual / ptAnual : 0,
    };
  });

  // 3) Controles: capacidad del horno y costos de meses sin producción (no se pueden asignar).
  const alertas = [];
  MESES_COSTEO.forEach((m, i) => {
    if (capacidadMes > 0 && totCal[i] > capacidadMes) alertas.push(`${m}: se necesitan ${Math.round(totCal[i]).toLocaleString('en-US')} calcinados y la capacidad es ${Math.round(capacidadMes).toLocaleString('en-US')}.`);
    const costoMes = T.p1[i] + T.p2[i] + T.comp[i];
    if (costoMes > 0 && totPT[i] <= 0) alertas.push(`${m}: hay S/ ${costoMes.toLocaleString('en-US', { maximumFractionDigits: 0 })} de costos sin producción para asignarlos.`);
  });

  return {
    parametros: p, capacidadMes, productos: resultado, alertas,
    totales: { pt: totPT, calcinados: totCal, crudos: totCru, p1: T.p1, p2: T.p2, comp: T.comp },
  };
}
