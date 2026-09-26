// =====================================================================
// PREFIJO CONTABLE Y PROCESOS POR ÁREA (fuente única para todos los formularios).
//  - Cada área registra sus gastos en cuentas de destino: prefijo del área + cuenta base 6.
//  - CALIDAD no tiene prefijo: registra la cuenta 6 base y luego se distribuye por
//    porcentajes a Crisoles (91), Fundente (92), Copelas (93) y Comercial (95).
// =====================================================================
const quitarTildes = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const PREFIJOS = {
  'administracion': '94',
  'comercial': '95',
  'logistica': '98',
  'almacen': '99',
  'produccion crisoles': '91',
  'produccion fundente': '92',
  'produccion copelas': '93',
  'produccion': '91',
  'calidad': '',
};

export function prefijoDeArea(area) {
  return PREFIJOS[quitarTildes(area)] ?? '';
}

// Procesos de cada centro de producción. 'CIF' es el gasto COMPARTIDO entre procesos.
const PROCESOS = {
  'produccion crisoles': ['Primer Proceso', 'Segundo Proceso', 'CIF'],
  'produccion copelas': ['Primer Proceso', 'Segundo Proceso', 'CIF'],
  'produccion fundente': ['Granel', 'Sachet', 'CIF'],
};

export function procesosDeArea(area) {
  return PROCESOS[quitarTildes(area)] || [];
}

const ETIQUETAS = {
  'Primer Proceso': '1er proceso',
  'Segundo Proceso': '2do proceso',
  'CIF': 'Compartido / CIF',
};
export const etiquetaProceso = (p) => ETIQUETAS[p] || p;
