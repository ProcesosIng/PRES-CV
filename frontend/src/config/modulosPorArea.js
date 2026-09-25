// Antes: Dashboard.jsx tenía un objeto "modulosPermitidosPorArea" con la
// MISMA lista de ~18 módulos copiada y pegada 7 veces (una por área), con
// solo 1 o 2 diferencias reales entre ellas. Cambiar un módulo obligaba a
// editar hasta 7 listas a mano y era la fuente más probable de errores.
//
// Aquí se define una vez la base común y las extensiones por tipo de área;
// MODULOS_POR_AREA se arma combinándolas. Si mañana esto pasa a la base de
// datos, corresponde 1 a 1 con la tabla `areas_modulos` de schema.sql.

const BASE_COMUN = [
  'Remuneraciones',
  'Capacitación',
  'Atencion al Personal',  
  'Examen Ocupacional',
  'Transporte',
  'Asesoria',
  'Alquiler',
  'Gastos Varios',
  'Servicios',
  'Publicidad',
  'Otros Servicios',
  'Tributos',
  'Seguros, Suscripciones, Licencias y Regalias',
  'Suministros, Gestion M. Ambiental y Otros gastos de gestion',
];

const MODULOS_PRODUCCION = [
  'Materias Primas',
  'Materiales Auxiliares y Suministros',
  'Envases y Embalajes',
];

const MODULOS_PLANIFICACION = [
  'Plan de Producción',
  'Plan de Compras',
];

const MODULOS_PLAN_COMP = [
  'Plan de Viaje',
  'Plan de Mantenimiento',
  'Plan de Depreciación',
  'Uniforme - EPPs',
  'Utiles de Oficina',
];

// Costeo de Crisoles / Fundente son exclusivos de sus áreas de producción:
// leen el forecast de Comercial y los totales por proceso de los módulos
// "normales" de esa misma área (ver store.js → obtenerTotalesPorProceso),
// y alimentan Materias Primas / MA y Suministros / Envases y Embalajes.
const MODULOS_COSTEO_CRISOLES = ['Costeo de Crisoles'];
const MODULOS_COSTEO_FUNDENTE = ['Costeo de Fundente'];

export const MODULOS_POR_AREA = {
  'Administración': [...BASE_COMUN, ...MODULOS_PLAN_COMP],
  'Logística': [...BASE_COMUN, ...MODULOS_PLAN_COMP],
  'Producción Crisoles': [...MODULOS_PRODUCCION, ...MODULOS_COSTEO_CRISOLES, ...MODULOS_PLANIFICACION, ...BASE_COMUN, ...MODULOS_PLAN_COMP, 'Costeo de Embalajes'],
  'Almacen': [...BASE_COMUN, ...MODULOS_PLAN_COMP],
  'Producción Fundente': [...MODULOS_PRODUCCION, ...MODULOS_COSTEO_FUNDENTE, ...BASE_COMUN, ...MODULOS_PLAN_COMP],
  'Calidad': [...BASE_COMUN, ...MODULOS_PLAN_COMP],
  'Comercial': [...BASE_COMUN, ...MODULOS_PLAN_COMP, 'Forecast de Ventas'],
};

// Si un área no está en el mapa, se le muestran todos los módulos (mismo
// comportamiento por defecto que tenía el código original).
export function modulosVisiblesParaArea(area) {
  return MODULOS_POR_AREA[area] || null; // null = "todos"
}
