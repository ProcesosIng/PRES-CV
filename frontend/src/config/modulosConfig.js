export const MODULOS_CONFIG = {
  'Remuneraciones': {
    prefijo: 'REM',
    tituloModulo: 'Remuneraciones',
    tituloSeccion2: '2. Variables de Registro',
    labelDetalle: 'CONCEPTO / DETALLE',
    mensajeValidacion: 'Agregue al menos una cuenta de remuneraciones.'
  },
  'Uniforme - EPPs': {
    prefijo: 'EPP',
    tituloModulo: 'Uniforme - EPPs',
    tituloSeccion2: '2. Asignación de EPPs',
    labelDetalle: 'PRODUCTO / TALLA',
    mensajeValidacion: 'Agregue al menos un producto EPP.'
  },
  'Transporte': {
    prefijo: 'TRP',
    tituloModulo: 'Transporte',
    tituloSeccion2: '2. Cuentas de Transporte',
    labelDetalle: 'DETALLE / RUTA',
    mensajeValidacion: 'Agregue al menos una cuenta de transporte.'
  },
  'Utiles de Oficina': {
    prefijo: 'UTI',
    tituloModulo: 'Útiles de Oficina',
    tituloSeccion2: '2. Cuentas de Útiles',
    labelDetalle: 'DESCRIPCIÓN',
    mensajeValidacion: 'Agregue al menos un ítem.'
  },

  'Capacitación': { 
    prefijo: 'CAP',
    tituloModulo: 'Capacitación',
    tituloSeccion2: '2. Cuentas de Capacitación',
    labelDetalle: 'DESCRIPCIÓN DE CAPACITACIÓN',
    mensajeValidacion: 'Agregue al menos un ítem.' },
  
  'Asesoria': {
    prefijo: 'ASE',
    tituloModulo: 'Asesoría',
    tituloSeccion2: '2. Servicios de Asesoría',
    labelDetalle: 'TIPO DE ASESORÍA',
    mensajeValidacion: 'Agregue al menos una cuenta de asesoría.'
  },
  'Alquiler': {
    prefijo: 'ALQ',
    tituloModulo: 'Alquiler',
    tituloSeccion2: '2. Cuentas de Alquiler',
    labelDetalle: 'LOCAL / EQUIPO',
    mensajeValidacion: 'Agregue al menos un concepto de alquiler.'
  },
  'Gastos Varios': {
    prefijo: 'VAR',
    tituloModulo: 'Gastos Varios',
    tituloSeccion2: '2. Detalle de Gastos',
    labelDetalle: 'CONCEPTO',
    mensajeValidacion: 'Agregue al menos un gasto.'
  },
  'Servicios': {
    prefijo: 'SRV',
    tituloModulo: 'Servicios',
    tituloSeccion2: '2. Cuentas de Servicios',
    labelDetalle: 'TIPO DE SERVICIO',
    mensajeValidacion: 'Agregue al menos un servicio.'
  },
  'Otros Servicios': {
    prefijo: 'SRV',
    tituloModulo: 'Servicios',
    tituloSeccion2: '2. Cuentas de Otros Servicios',
    labelDetalle: 'TIPO DE SERVICIO',
    mensajeValidacion: 'Agregue al menos un servicio.'
  },
  'Publicidad': {
    prefijo: 'PUB',
    tituloModulo: 'Publicidad',
    tituloSeccion2: '2. Campañas y Publicidad',
    labelDetalle: 'MEDIO / CONCEPTO',
    mensajeValidacion: 'Agregue al menos un gasto de publicidad.'
  },
  'Tributos': {
    prefijo: 'TRI',
    tituloModulo: 'Tributos',
    tituloSeccion2: '2. Cuentas Tributarias',
    labelDetalle: 'TRIBUTO / PERIODO',
    mensajeValidacion: 'Agregue al menos un tributo.'
  }
};
// Cada config recibe como `modulo` el nombre de su clave
Object.keys(MODULOS_CONFIG).forEach((clave) => {
  MODULOS_CONFIG[clave].modulo = clave;
  MODULOS_CONFIG[clave].categoria = clave;
});