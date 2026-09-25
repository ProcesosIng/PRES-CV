// Lista estándar de meses usada en los selects de "mes de adquisición",
// "mes de ejecución de gasto", etc. de los planes complementarios.
export const MESES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'
];

// Tamaños de crisol producidos (ver "COSTOS UNITARIOS POR TAMAÑO DE CRISOL"
// en el Excel de costeo: Crisol 30g, 40g, 45g, 50g).
export const TAMANOS_CRISOL = ['30g', '40g', '45g', '50g'];

// Presentaciones de Fundente (Producción Fundente trabaja en dos líneas).
export const PRESENTACIONES_FUNDENTE = ['Granel', 'Sachet'];

export const PROCESOS_PRODUCTIVOS = ['Primer Proceso', 'Segundo Proceso', 'CIF', 'Granel', 'Sachet'];

// Los 3 tramos del proceso productivo de Crisoles. Los módulos "normales"
// (Remuneraciones, Uniforme - EPPs, Servicios, etc.) etiquetan cada registro
// con `detalle_columnas.proceso`; Costeo de Crisoles agrupa esos registros
// por estos 3 valores para armar el costo unitario (ver store.js →
// obtenerTotalesPorProceso).
export const PROCESOS_CRISOLES = ['Primer Proceso', 'Segundo Proceso', 'CIF'];

// Fundente solo tiene 2 líneas de proceso (a diferencia de Crisoles, que
// tiene 3). Mismo mecanismo de agregación, distinto vocabulario.
export const PROCESOS_FUNDENTE = ['Granel', 'Sachet'];

// Unidades de negocio que maneja Comercial (columna "UNIDAD DE NEGOCIO" /
// "PRODUCTO" del Excel de forecast). Se usan como select en el formulario
// de Forecast de Ventas, y Costeo de Crisoles/Fundente filtran por estos
// valores exactos ('CCS' y 'Fundente').
export const UNIDADES_NEGOCIO = ['CCS', 'Carbon Activado', 'Epp', 'Copelas', 'Bolas de acero', 'Crisoles de Arcilla', 'Fundente', 'Floculantes', 'Insumos'];

export const TIPOS_CLIENTE = ['Minera', 'Distribuidor', 'Laboratorio', 'Manufactura'];
export const TIPOS_ZONA = ['Local', 'Exterior'];

// =====================================================================
// FORECAST COMERCIAL (semilla) — mismo Excel de Comercial (cliente,
// vendedor, producto, unidad de negocio, precio de venta, costo promedio
// y cantidades proyectadas mes a mes), usado ahora SOLO como fallback de
// demostración. La fuente real es el módulo "Forecast de Ventas" (área
// Comercial), que persiste en store.js igual que cualquier otro módulo;
// Costeo de Crisoles y Costeo de Fundente llaman a
// listarForecastComercial(idVersion) y solo caen a esta lista si esa
// versión todavía no tiene ningún forecast cargado por Comercial.
export const maestroForecastComercial = [
  {
    cliente: 'COMPAÑÍA MINERA ARES S.A.C.', vendedor: 'GIANELLA ROMERO',
    unidad_negocio: 'CCS', producto: 'CRISOL DE CARBURO DE SILICIO T64BX',
    um: 'Unidad', pv_2025: 2250.00, cv_2025: 1847.54, precio_venta: 2250, costo_unitario: 1850,
    cantidades: { Ene: 5, Feb: 5, Mar: 5, Abr: 5, May: 5, Jun: 0, Jul: 0, Ago: 0, Set: 0, Oct: 0, Nov: 0, Dic: 0 }
  },
  {
    cliente: 'MINAS ARGENTINAS S.A.', vendedor: 'MILTON RODRÍGUEZ',
    unidad_negocio: 'CCS', producto: 'CRISOL DE CARBURO DE SILICIO T8AX',
    um: 'Unidad', pv_2025: 785.44, cv_2025: 425.95, precio_venta: 660, costo_unitario: 380,
    cantidades: { Ene: 32, Feb: 0, Mar: 0, Abr: 0, May: 0, Jun: 0, Jul: 0, Ago: 0, Set: 0, Oct: 0, Nov: 0, Dic: 0 }
  },
  {
    cliente: 'MINERA BOROO MISQUICHILCA', vendedor: 'LUZ GARCÍA',
    unidad_negocio: 'CCS', producto: 'CRISOL DE CARBURO DE SILICIO BDXL 315T-57MM',
    um: 'Unidad', pv_2025: 2175.00, cv_2025: 1430, precio_venta: 2155, costo_unitario: 1250,
    cantidades: { Ene: 0, Feb: 0, Mar: 0, Abr: 0, May: 0, Jun: 0, Jul: 0, Ago: 0, Set: 0, Oct: 0, Nov: 0, Dic: 0 }
  },
  {
    cliente: 'LA ARENA S.A.', vendedor: 'MILTON RODRÍGUEZ',
    unidad_negocio: 'Carbon&Resinas', producto: 'CARBON ACTIVADO PICAGOLD G210 AS',
    um: 'Kg', pv_2025: 6.82, cv_2025: 5.8, precio_venta: 6.82, costo_unitario: 5.8,
    cantidades: { Ene: 12100, Feb: 12100, Mar: 12100, Abr: 0, May: 0, Jun: 0, Jul: 0, Ago: 0, Set: 0, Oct: 0, Nov: 0, Dic: 0 }
  },
  {
    cliente: 'MINERA MANSFIELD', vendedor: 'MILTON RODRÍGUEZ',
    unidad_negocio: 'Fundente', producto: 'FUNDENTE BÁSICO GRANEL x 25KG',
    um: 'Kg', pv_2025: 85.00, cv_2025: 52.30, precio_venta: 85, costo_unitario: 52.3,
    cantidades: { Ene: 2000, Feb: 2400, Mar: 2200, Abr: 2200, May: 2000, Jun: 2000, Jul: 2000, Ago: 2000, Set: 2000, Oct: 2000, Nov: 2000, Dic: 2000 }
  },
  {
    cliente: 'TECNOFIL S.A.', vendedor: 'LUZ GARCÍA',
    unidad_negocio: 'Fundente', producto: 'FUNDENTE SACHET x 1KG',
    um: 'Unidad', pv_2025: 6.50, cv_2025: 3.90, precio_venta: 6.5, costo_unitario: 3.9,
    cantidades: { Ene: 5000, Feb: 5200, Mar: 5100, Abr: 5000, May: 5000, Jun: 5000, Jul: 5000, Ago: 5000, Set: 5000, Oct: 5000, Nov: 5000, Dic: 5000 }
  }
];

export const baseDatosUsuarios = {
  'admin': { nombre: 'Gerencia General', iniciales: 'GG', rol: 'Administrador', areasPermitidas: ['Administración', 'Comercial', 'Producción Crisoles', 'Producción Fundente', 'Producción Copelas', 'Calidad', 'Logística', 'Almacen'] }
};

export const datosAreas = {
   'Administración':      { presupuesto: '150,000', consumido: 45, color: '#2563eb', ic:'💼' }, /* Azul Primario - Gestión y finanzas */
   'Comercial':           { presupuesto: '320,000', consumido: 70, color: '#0ea5e9', ic:'📈' }, /* Celeste Sky - Crecimiento y ventas */
   'Producción Crisoles': { presupuesto: '200,000', consumido: 30, color: '#ea580c', ic:'⚱️' }, /* Naranja/Arcilla - Fuego, hornos y manufactura de arcilla */
   'Producción Fundente': { presupuesto: '150,000', consumido: 45, color: '#8b5cf6', ic:'⚗️' }, /* Violeta - Insumos químicos y reactivos */
   'Calidad':             { presupuesto: '320,000', consumido: 70, color: '#10b981', ic:'✔️' }, /* Verde Esmeralda - Aprobación y estándares */
   'Logística':           { presupuesto: '200,000', consumido: 30, color: '#f59e0b', ic:'🚚' }, /* Ámbar - Tránsito, rutas y distribución */
   'Almacen':             { presupuesto: '200,000', consumido: 30, color: '#64748b', ic:'📦' },  /* Pizarra/Gris - Inventario estático y resguardo */
   'Producción Copelas': { presupuesto: '150,000', consumido: 20, color: '#0891b2', ic:'🧪' }
  
};

export const maestroCuentas = [
    { id: '6214000', nombre: 'Gratificaciones', categoria: 'Remuneraciones', subcategoria: 'Gratificaciones' },
    { id: '6215000', nombre: 'Vacaciones', categoria: 'Remuneraciones', subcategoria: 'Vacaciones' },
    { id: '6211000', nombre: 'Cargas Sociales (ESSALUD 9%)', categoria: 'Remuneraciones', subcategoria: 'Cargas Sociales' },
    { id: '6252000', nombre: 'Materiales Auxiliares y Suministros', categoria: 'Materiales', subcategoria: 'Materiales Auxiliares' },
    { id: '6261000', nombre: 'Servicios de Terceros', categoria: 'Servicios', subcategoria: 'Servicios de Terceros' },
    { id: '6271000', nombre: 'Depreciación', categoria: 'Gastos', subcategoria: 'Depreciación' },
    { id: '6571000', nombre: 'Uniforme', categoria: 'Gastos', subcategoria: 'Uniforme' }
    
    ];

export const maestroClientes = [
  { id: '20507183420', nombre: 'Cliente1', zona: 'Local', vendedor: 'GERARDO PERALES', pais: 'Perú', tipo: 'Minera' },
  { id: '10507186529', nombre: 'Cliente2', zona: 'Exterior', vendedor: 'GIANELLA ROMERO', pais: 'Perú', tipo: 'Laboratorio' },
  { id: '21408791123', nombre: 'Cliente3', zona: 'Exterior', vendedor: 'LUZ GARCIA', pais: 'Perú', tipo: 'Manufactura' }
];

export const maestroProductos = [
  { codigo: 'EPP-001', nombre: 'Casco de Seguridad 3M', unidad: 'und', pv:'85', costo: '45.00', categoria: 'Epp',uninegocio: 'NA', lineanegocio: 'Aplicaciones' },
  { codigo: 'EPP-002', nombre: 'Lentes de Seguridad Malla', unidad: 'und', pv:'85', costo: '15.50', categoria: 'Epp',uninegocio: 'NA', lineanegocio: 'Fire Assay'  },
  { codigo: 'PT-004', nombre: "Fundente #147", unidad: 'kg', pv:'85', costo: '85.00', categoria: 'Fundente', uninegocio: 'Fundente', lineanegocio: 'Fire Assay' },
  { codigo: 'PT-001', nombre: 'Crisol de arcilla 30g', unidad: 'und', pv:'85', costo: '12.00', categoria: 'Crisoles de Arcilla', uninegocio: 'Crisoles de Arcilla', lineanegocio: 'Fire Assay'  },
  { codigo: 'PT-002', nombre: 'Crisol de arcilla 40g', unidad: 'und', pv:'85', costo: '12.00', categoria: 'Crisoles de Arcilla', uninegocio: 'Crisoles de Arcilla', lineanegocio: 'Fire Assay'  },
  { codigo: 'PT-003', nombre: 'Crisol de arcilla 50g', unidad: 'und', pv:'85', costo: '12.00', categoria: 'Crisoles de Arcilla', uninegocio: 'Crisoles de Arcilla', lineanegocio: 'Fire Assay'  },
  { codigo: 'INS-003', nombre: 'Copelas de magnesita N° 8', unidad: 'und', pv:'85', costo: '4.50', categoria: 'Utiles', uninegocio: 'Copelas', lineanegocio: 'Fire Assay'  },
  { codigo: 'INS-004', nombre: 'Copelas de magnesita N° 7', unidad: 'und', pv:'85', costo: '4.50', categoria: 'Utiles', uninegocio: 'Copelas', lineanegocio: 'Fire Assay'  },
  { codigo: 'INS-005', nombre: 'Copelas de magnesita N° 5', unidad: 'und', pv:'85', costo: '4.50', categoria: 'Utiles', uninegocio: 'Copelas', lineanegocio: 'Fire Assay'  },
  { codigo: 'INS-011', nombre: 'Copelas de magnesita N° 4', unidad: 'und', pv:'85', costo: '4.50', categoria: 'Utiles', uninegocio: 'Copelas', lineanegocio: 'Fire Assay'  }
];

export const maestroEmpleados = [  
    { dni: '42671570', nombre: 'AGUILAR VILLA KARLA VANESSA', area: 'administracion', sueldo: '4800.00', asigFam: '113.00', proceso: 'na', cargo: 'jefe', seguro: 'EsSalud' },
    { dni: '76743173', nombre: 'CALDERON BENANCIO CAROLINA', area: 'contabilidad', sueldo: '3000.00', asigFam: '113.00', proceso: 'na', cargo: 'ingeniero', seguro: 'EsSalud' },
    { dni: '27533146', nombre: 'CAÑARI JARA JUANA', area: 'produccion', sueldo: '1300.00', asigFam: '113.00', proceso: '1', cargo: 'operario', seguro: 'EsSalud' },
    { dni: '57543146', nombre: 'GIANELLA ROMERO', area: 'ventas', sueldo: '1300.00', asigFam: '113.00', proceso: '1', cargo: 'operario', seguro: 'EsSalud' },
    { dni: '87768846', nombre: 'GERARDO PERALES', area: 'ventas', sueldo: '1300.00', asigFam: '113.00', proceso: '1', cargo: 'operario', seguro: 'EsSalud' },
    { dni: '75443146', nombre: 'LUZ GARCIA', area: 'ventas', sueldo: '1300.00', asigFam: '113.00', proceso: '1', cargo: 'operario', seguro: 'EsSalud' },
  ];

export const configModulos = {

    // Comercial carga aquí el proyectado real: cliente, vendedor, unidad
    // de negocio, producto, precio de venta / costo unitario y las
    // cantidades proyectadas mes a mes. Costeo de Crisoles y Costeo de
    // Fundente leen de este módulo (store.js → listarForecastComercial)
    // filtrando por unidad_negocio, en vez de usar datos estáticos.
    'Forecast de Ventas': {
      tipoComponente: 'FORECAST_COMERCIAL',
      icono: '🎯📊',
      columnasTabla: [
        { nombre: 'Cliente', alinear: 'left' },
        { nombre: 'Vendedor', alinear: 'left' },
        { nombre: 'Unidad de Negocio', alinear: 'left' },
        { nombre: 'Producto', alinear: 'left' },
        { nombre: 'UM', alinear: 'center' },
        { nombre: 'Moneda', alinear: 'center' },
        { nombre: 'PV Unit.', alinear: 'right' },
        { nombre: 'Costo Unit.', alinear: 'right' },
        { nombre: 'Cant. Total Año', alinear: 'right' },
        { nombre: 'Monto Venta Total', alinear: 'right' },
        { nombre: 'Acciones', alinear: 'center' }
      ],
    },

    // ESPECIFICO: costeo de crisoles en base al forecast de Comercial (CCS).
    // Al guardar, además de su propio registro, genera automáticamente los
    // registros hijos en Materias Primas / MA y Suministros / Envases y
    // Embalajes (ver CosteoCrisolesForm + store.js → guardarCosteoDerivado).
    'Costeo de Crisoles': {
      tipoComponente: 'COSTEO_CRISOLES',
      icono: '🏭',
      columnasTabla: [
        { nombre: 'Mes/Año', alinear: 'left' },
        { nombre: 'Producto', alinear: 'left' },
        { nombre: 'Cant. Proyectada', alinear: 'right' },
        { nombre: 'PV Unit. (S/)', alinear: 'right' },
        { nombre: 'Costo Unit. Total (S/)', alinear: 'right' },
        { nombre: 'Costo Total (S/)', alinear: 'right' },
        { nombre: 'Acciones', alinear: 'center' }
      ],
    },

    // ESPECIFICO: mismo mecanismo que Costeo de Crisoles pero con las 2
    // líneas de Fundente (Granel / Sachet) en vez de los 3 procesos.
    'Costeo de Fundente': {
      tipoComponente: 'COSTEO_FUNDENTE',
      icono: '⚗️',
      columnasTabla: [
        { nombre: 'Mes', alinear: 'left' },
        { nombre: 'Producto', alinear: 'left' },
        { nombre: 'Presentación', alinear: 'center' },
        { nombre: 'Cant. Proyectada', alinear: 'right' },
        { nombre: 'PV Unit. (S/)', alinear: 'right' },
        { nombre: 'Costo Unit. Total (S/)', alinear: 'right' },
        { nombre: 'Costo Total (S/)', alinear: 'right' },
        { nombre: 'Acciones', alinear: 'center' }
      ],
    },

    'Costeo de Copelas': {
      tipoComponente: 'COSTEO_COPELAS',
      icono: '🧪',
      columnasTabla: [
        { nombre: 'Año', alinear: 'left' }, { nombre: 'Producto', alinear: 'left' },
        { nombre: 'Cant. Proyectada', alinear: 'right' }, { nombre: 'PV Unit. (S/)', alinear: 'right' },
        { nombre: 'Costo Unit. Total (S/)', alinear: 'right' }, { nombre: 'Costo Total (S/)', alinear: 'right' },
        { nombre: 'Acciones', alinear: 'center' }
      ],
    },

    

    'Costeo de Embalajes': {
      tipoComponente: 'COSTEO_EMBALAJES',
      icono: '📦',
      columnasTabla: [
        { nombre: 'Año', alinear: 'left' },
        { nombre: 'Producto', alinear: 'left' },
        { nombre: 'Línea', alinear: 'left' },
        { nombre: 'Cliente', alinear: 'left' },
        { nombre: 'Zona', alinear: 'center' },
        { nombre: 'Paletas', alinear: 'right' },
        { nombre: 'Costo Unit. Embalaje (S/)', alinear: 'right' },
        { nombre: 'Costo Total (S/)', alinear: 'right' },
        { nombre: 'Acciones', alinear: 'center' }
      ],
    },

    // Estos 3 módulos son alimentados automáticamente por Costeo de
    // Crisoles / Costeo de Fundente (1 costeo -> 1 línea en cada uno de
    // estos 3). También se pueden usar TablaGenerica/BaseRegistroForm
    // para registrar movimientos manuales sueltos.
    'Materias Primas': {
      icono: '🏭',
      columnasTabla: [
        { nombre: 'Fecha / Mes', alinear: 'left' },
        { nombre: 'Origen (Costeo)', alinear: 'left' },
        { nombre: 'Producto', alinear: 'left' },
        { nombre: 'Cuenta', alinear: 'left' },
        { nombre: 'Detalle', alinear: 'left' },
        { nombre: 'Costo Total (S/)', alinear: 'right' },
        { nombre: 'Acciones', alinear: 'center' }
      ],
    },

    'Materiales Auxiliares y Suministros': {
      icono: '📦',
      columnasTabla: [
        { nombre: 'Fecha / Mes', alinear: 'left' },
        { nombre: 'Origen (Costeo)', alinear: 'left' },
        { nombre: 'Producto', alinear: 'left' },
        { nombre: 'Cuenta', alinear: 'left' },
        { nombre: 'Detalle', alinear: 'left' },
        { nombre: 'Costo Total (S/)', alinear: 'right' },
        { nombre: 'Acciones', alinear: 'center' }
      ],
    },

    'Envases y Embalajes': {
      icono: '📦',
      columnasTabla: [
        { nombre: 'Fecha / Mes', alinear: 'left' },
        { nombre: 'Origen (Costeo)', alinear: 'left' },
        { nombre: 'Producto', alinear: 'left' },
        { nombre: 'Cuenta', alinear: 'left' },
        { nombre: 'Detalle', alinear: 'left' },
        { nombre: 'Costo Total (S/)', alinear: 'right' },
        { nombre: 'Acciones', alinear: 'center' }
      ],
    },

    // especifico
    'Remuneraciones': {
      icono: '💰',
      columnasTabla: [
        { nombre: 'Fecha', alinear: 'left' },
        { nombre: 'DNI', alinear: 'left' },
        { nombre: 'Empleado', alinear: 'left' },
        { nombre: 'Sueldo Base (S/)', alinear: 'right' },
        { nombre: 'Asig. Familiar (S/)', alinear: 'right' },
        { nombre: 'Dist. (%)', alinear: 'center' },
        { nombre: 'Monto Calculado (S/)', alinear: 'right' },
        { nombre: 'Costo Total (S/)', alinear: 'right' },             
        { nombre: 'Acciones', alinear: 'center' }
      ],
      
      
    },

    'Capacitación': { icono: '📚', columnasTabla: [
        { nombre: 'FECHA', alinear: 'left' },
        { nombre: 'EMPLEADO / ÁREA', alinear: 'left' },
        { nombre: 'CUENTA CONTABLE', alinear: 'left' },
        { nombre: 'DETALLE', alinear: 'left' },
        { nombre: 'TOTAL', alinear: 'right' },
        { nombre: 'ACCIONES', alinear: 'center' },
      ] },

    'Atencion al Personal': { 
      icono: '🤝',
      columnasTabla: [
        { nombre: 'FECHA', alinear: 'left' },
        { nombre: 'EMPLEADO / ÁREA', alinear: 'left' },
        { nombre: 'CUENTA CONTABLE', alinear: 'left' },
        { nombre: 'DETALLE', alinear: 'left' },
        { nombre: 'TOTAL', alinear: 'right' },
        { nombre: 'ACCIONES', alinear: 'center' },
      ],
      
      },
      

    'Examen Ocupacional': { icono: '🩺', 
      columnasTabla: [
        { nombre: 'FECHA', alinear: 'left' },
        { nombre: 'EMPLEADO / ÁREA', alinear: 'left' },
        { nombre: 'CUENTA CONTABLE', alinear: 'left' },
        { nombre: 'DETALLE', alinear: 'left' },
        { nombre: 'TOTAL', alinear: 'right' },
        { nombre: 'ACCIONES', alinear: 'center' },
      ],},

    'Transporte': {
      icono: '🚐',
      columnasTabla: [
        { nombre: 'FECHA', alinear: 'left' },
        { nombre: 'EMPLEADO / ÁREA', alinear: 'left' },
        { nombre: 'CUENTA CONTABLE', alinear: 'left' },
        { nombre: 'DETALLE', alinear: 'left' },
        { nombre: 'TOTAL', alinear: 'right' },
        { nombre: 'ACCIONES', alinear: 'center' },
      ]
      },

    'Asesoria': { icono: '💼', columnasTabla: [
        { nombre: 'FECHA', alinear: 'left' },
        { nombre: 'EMPLEADO / ÁREA', alinear: 'left' },
        { nombre: 'CUENTA CONTABLE', alinear: 'left' },
        { nombre: 'DETALLE', alinear: 'left' },
        { nombre: 'TOTAL', alinear: 'right' },
        { nombre: 'ACCIONES', alinear: 'center' },
      ] },

    'Alquiler': { icono: '🏭', columnasTabla: [
        { nombre: 'FECHA', alinear: 'left' },
        { nombre: 'EMPLEADO / ÁREA', alinear: 'left' },
        { nombre: 'CUENTA CONTABLE', alinear: 'left' },
        { nombre: 'DETALLE', alinear: 'left' },
        { nombre: 'TOTAL', alinear: 'right' },
        { nombre: 'ACCIONES', alinear: 'center' },
      ] },

    'Gastos Varios': { icono: '🏷️', columnasTabla: [
        { nombre: 'FECHA', alinear: 'left' },
        { nombre: 'EMPLEADO / ÁREA', alinear: 'left' },
        { nombre: 'CUENTA CONTABLE', alinear: 'left' },
        { nombre: 'DETALLE', alinear: 'left' },
        { nombre: 'TOTAL', alinear: 'right' },
        { nombre: 'ACCIONES', alinear: 'center' },
      ]},

    'Servicios': { icono: '💡', columnasTabla: [
        { nombre: 'FECHA', alinear: 'left' },
        { nombre: 'EMPLEADO / ÁREA', alinear: 'left' },
        { nombre: 'CUENTA CONTABLE', alinear: 'left' },
        { nombre: 'DETALLE', alinear: 'left' },
        { nombre: 'TOTAL', alinear: 'right' },
        { nombre: 'ACCIONES', alinear: 'center' },
      ] },

    'Publicidad': { icono: '📢', columnasTabla: [
        { nombre: 'FECHA', alinear: 'left' },
        { nombre: 'EMPLEADO / ÁREA', alinear: 'left' },
        { nombre: 'CUENTA CONTABLE', alinear: 'left' },
        { nombre: 'DETALLE', alinear: 'left' },
        { nombre: 'TOTAL', alinear: 'right' },
        { nombre: 'ACCIONES', alinear: 'center' },
      ] },

    'Otros Servicios': { icono: '⚙️', columnasTabla: [
        { nombre: 'FECHA', alinear: 'left' },
        { nombre: 'EMPLEADO / ÁREA', alinear: 'left' },
        { nombre: 'CUENTA CONTABLE', alinear: 'left' },
        { nombre: 'DETALLE', alinear: 'left' },
        { nombre: 'TOTAL', alinear: 'right' },
        { nombre: 'ACCIONES', alinear: 'center' },
      ] },

    'Tributos': { icono: '🏛️', columnasTabla: [
        { nombre: 'FECHA', alinear: 'left' },
        { nombre: 'EMPLEADO / ÁREA', alinear: 'left' },
        { nombre: 'CUENTA CONTABLE', alinear: 'left' },
        { nombre: 'DETALLE', alinear: 'left' },
        { nombre: 'TOTAL', alinear: 'right' },
        { nombre: 'ACCIONES', alinear: 'center' },
      ] },

    'Seguros, Suscripciones, Licencias y Regalias': { icono: '🛡️', columnasTabla: [
        { nombre: 'FECHA', alinear: 'left' },
        { nombre: 'EMPLEADO / ÁREA', alinear: 'left' },
        { nombre: 'CUENTA CONTABLE', alinear: 'left' },
        { nombre: 'DETALLE', alinear: 'left' },
        { nombre: 'TOTAL', alinear: 'right' },
        { nombre: 'ACCIONES', alinear: 'center' },
      ] },

    'Suministros, Gestion M. Ambiental y Otros gastos de gestion': { icono: '⚗️', columnasTabla: [
        { nombre: 'FECHA', alinear: 'left' },
        { nombre: 'EMPLEADO / ÁREA', alinear: 'left' },
        { nombre: 'CUENTA CONTABLE', alinear: 'left' },
        { nombre: 'DETALLE', alinear: 'left' },
        { nombre: 'TOTAL', alinear: 'right' },
        { nombre: 'ACCIONES', alinear: 'center' },
      ] },

    // ESPECIFICOS PARA PLANIFICACION Y CONTROL DE GASTOS
    'Uniforme - EPPs': {
      tipoComponente: 'UNIFORMES_EPPS',
      icono: '🦺',
      columnasTabla: [
        { nombre: 'FECHA', alinear: 'left' },
        { nombre: 'EMPLEADO', alinear: 'left' },
        { nombre: 'CUENTA', alinear: 'left' },
        { nombre: 'DESCRIPCIÓN EPP', alinear: 'left' },
        { nombre: 'CANT.', alinear: 'center' },
        { nombre: 'COSTO TOTAL (S/)', alinear: 'right' },
        { nombre: 'ACCIONES', alinear: 'center' }
      ],
            
    },

    'Plan de Mantenimiento': {
      tipoComponente: 'PLAN_MANTENIMIENTO',
      icono: '🔧',
      columnasTabla: [
        { nombre: 'Cuenta', alinear: 'left' },
        { nombre: 'Activo / Detalle', alinear: 'left' },
        { nombre: 'Área', alinear: 'left' },
        { nombre: 'Frecuencia', alinear: 'center' },
        { nombre: 'Mes Ejecución', alinear: 'center' },
        { nombre: 'Costo Mantenimiento (S/)', alinear: 'right' },
        { nombre: 'Monto Prorrateado (S/)', alinear: 'right' },
        { nombre: 'Acciones', alinear: 'center' }
      ],
    },

    'Plan de Viaje': {
      tipoComponente: 'PLAN_VIAJE',
      icono: '✈️',
      columnasTabla: [
        { nombre: 'Viaje', alinear: 'left' },
        { nombre: 'Asignado a', alinear: 'left' },
        { nombre: 'Inicio', alinear: 'center' },
        { nombre: 'Duración (días)', alinear: 'center' },
        { nombre: 'Estado', alinear: 'center' },
        { nombre: 'Cant. Personas', alinear: 'center' },
        { nombre: 'Monto Unit. (S/)', alinear: 'right' },
        { nombre: 'Cantidad Total (S/)', alinear: 'right' },
        { nombre: 'Acciones', alinear: 'center' }
      ],
    },

    'Utiles de Oficina': {
      tipoComponente: 'UTILES_OFICINA',
      icono: '📝',
      columnasTabla: [
        { nombre: 'Mes de Uso', alinear: 'left' },
        { nombre: 'Empleado', alinear: 'left' },
        { nombre: 'Descripción Material', alinear: 'left' },
        { nombre: 'Cuenta', alinear: 'left' },
        { nombre: 'Cant.', alinear: 'center' },
        { nombre: 'Costo Total (S/)', alinear: 'right' },
        { nombre: 'Acciones', alinear: 'center' }
      ],
            
    },

    'Plan de Depreciación': {
      tipoComponente: 'PLAN_DEPRECIACION',
      icono: '⏳',
      columnasTabla: [
        { nombre: 'Nº Cuenta', alinear: 'left' },
        { nombre: 'Descripción de Activo', alinear: 'left' },
        { nombre: 'Área', alinear: 'left' },
        { nombre: 'Gasto Adq. (S/)', alinear: 'right' },
        { nombre: 'Mes', alinear: 'center' },
        { nombre: 'Vida Útil (meses)', alinear: 'center' },
        { nombre: '% Depr. Anual', alinear: 'center' },
        { nombre: 'Deprec. Mensual (S/)', alinear: 'right' },
        { nombre: 'Acciones', alinear: 'center' }
      ],
    }
  }

  export const maestroFormulas = {
  "Fundente Sachet 50g Exportación": {
    producto: "Fundente Sachet 50g Exportación",
    materia_prima: [
      { insumo: "Litargirio", cuenta: "946252000", porcentaje: 65, costo_unit_ref: 12.50 },
      { insumo: "Borax Pentahidratado (MP)", cuenta: "946252000", porcentaje: 20, costo_unit_ref: 4.20 }
    ],
    envases: [
      { insumo: "Bolsas Sachets 7x10", cuenta: "946252000", ratio: 1, costo_unit_ref: 0.05 },
      { insumo: "Cajas de 15 KG", cuenta: "946252000", ratio: 0.00333, costo_unit_ref: 2.50 }
    ]
  }
};