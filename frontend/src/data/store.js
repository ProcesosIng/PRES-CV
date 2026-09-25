// =====================================================================
// CAPA DE DATOS — Sistema de Presupuestos C&V International
//
// Jerarquía: Versión -> Área -> Módulo -> Registros
//
// Hoy persiste en localStorage (funciona sin backend), pero está escrita
// con la MISMA forma que el esquema relacional de referencia
// (ver src/data/schema.sql), para que el día que exista un backend real
// solo haya que reemplazar el cuerpo de estas funciones por llamadas
// fetch/axios — los componentes que las usan (Dashboard, Offcanvas,
// SelectorVersiones) no deberían necesitar cambios.
//
// Antes: cada versión/área compartía el mismo estado en memoria
// (registrosPorCategoria, indexado solo por nombre de módulo), lo que
// mezclaba datos de áreas distintas. Aquí cada registro queda
// físicamente separado por (id_version, area, modulo).
// =====================================================================

const DB_KEY = 'cv_presupuestos_db_v1';

function leerDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return semilla();
    const db = JSON.parse(raw);
    if (!Array.isArray(db.versiones) || !Array.isArray(db.registros)) return semilla();
    return db;
  } catch {
    return semilla();
  }
}

function guardarDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function semilla() {
  const db = {
    versiones: [
      {
        id_version: 'v1',
        nombre: 'Presupuesto Inicial 2026',
        estado: 'Aprobado',
        fecha_creacion: '2026-01-15',
        clonada_de: null,
      },
    ],
    registros: [],
  };
  guardarDB(db);
  return db;
}

function generarId(prefijo = 'REG') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefijo}-${crypto.randomUUID()}`;
  }
  // Respaldo para entornos sin crypto.randomUUID
  return `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ===================== VERSIONES =====================

export function listarVersiones() {
  return leerDB().versiones;
}

export function obtenerVersion(idVersion) {
  return leerDB().versiones.find(v => v.id_version === idVersion) || null;
}

export function crearVersion({ nombre, estado = 'Borrador', clonarDesde = '' }) {
  const db = leerDB();

  const numerosExistentes = db.versiones
    .map(v => parseInt(String(v.id_version).replace(/^v/i, ''), 10))
    .filter(n => !isNaN(n));
  const siguienteNumero = numerosExistentes.length > 0 ? Math.max(...numerosExistentes) + 1 : 1;
  const idVersion = `v${siguienteNumero}`;

  const nuevaVersion = {
    id_version: idVersion,
    nombre: nombre.trim(),
    estado,
    fecha_creacion: new Date().toISOString().split('T')[0],
    clonada_de: clonarDesde || null,
  };
  db.versiones.push(nuevaVersion);

  if (clonarDesde) {
    const registrosOrigen = db.registros.filter(r => r.id_version === clonarDesde);
    const registrosClonados = registrosOrigen.map(r => ({
      ...r,
      id_registro: generarId((r.modulo || 'REG').slice(0, 3).toUpperCase()),
      id_version: idVersion,
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    }));
    db.registros.push(...registrosClonados);
  }

  guardarDB(db);
  return nuevaVersion;
}

export function actualizarVersion(idVersion, cambios) {
  const db = leerDB();
  db.versiones = db.versiones.map(v => (v.id_version === idVersion ? { ...v, ...cambios } : v));
  guardarDB(db);
  return db.versiones.find(v => v.id_version === idVersion) || null;
}

export function eliminarVersion(idVersion) {
  const db = leerDB();
  db.versiones = db.versiones.filter(v => v.id_version !== idVersion);
  db.registros = db.registros.filter(r => r.id_version !== idVersion);
  guardarDB(db);
}

// ===================== REGISTROS =====================

// Lee los registros de una combinación exacta (versión, área, módulo).
export function listarRegistros({ idVersion, area, modulo }) {
  const db = leerDB();
  return (db.registros || []).filter(
    r => String(r.id_version) === String(idVersion) &&
         String(r.area).trim().toLowerCase() === String(area).trim().toLowerCase() &&
         (modulo === undefined || String(r.modulo).trim().toLowerCase() === String(modulo).trim().toLowerCase())
  );
}

const normTxt = (t) => String(t || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const AREAS_PRODUCCION = ['produccion crisoles', 'produccion fundente', 'produccion'];

// Registros que un costeo puede usar (mano de obra y CIF).
// Usa el ÁREA elegida en el form (detalle_columnas.area) y, si no existe, el área del menú.
export function listarRegistrosParaCosteo({ idVersion, area }) {
  const db = leerDB();
  const objetivo = normTxt(area);
  return (db.registros || []).filter(r => {
    if (String(r.id_version) !== String(idVersion)) return false;
    const dc = r.detalle_columnas || {};
    const areaEfectiva = normTxt(dc.area || r.area);
    if (areaEfectiva === objetivo) return true;
    // El CIF de cualquier área de producción se comparte entre ambos costeos
    return normTxt(dc.proceso) === 'cif' && AREAS_PRODUCCION.includes(areaEfectiva);
  });
}

// NUEVA: Función global requerida por SelectorVersiones y Reporte General
export function listarTodosLosRegistros() {
  const db = leerDB();
  return db.registros || [];
}

// Inserta o actualiza (upsert) una lista de registros, estampando la
// jerarquía a la que pertenecen. Si el registro ya existía (mismo
// id_registro, caso "editar"), lo reemplaza en su lugar.
// Inserta o actualiza (upsert) una lista o un registro individual, asegurando
// que conserve toda la jerarquía (id_version, area, modulo).
export function guardarRegistro(registrosEntrada, contexto = {}) {
  const db = leerDB();
  const ahora = new Date().toISOString();
  
  // Normalizamos a un arreglo para aceptar tanto un objeto como un array de registros
  const listaAProcesar = Array.isArray(registrosEntrada) ? registrosEntrada : [registrosEntrada];

  listaAProcesar.forEach(nuevoRegistro => {
    // Heredamos el contexto si el registro individual no lo trae explícito
    const regConContexto = {
      ...nuevoRegistro,
      id_version: nuevoRegistro.id_version || nuevoRegistro.idVersion || contexto.idVersion,
      area: nuevoRegistro.area || contexto.area,
      modulo: nuevoRegistro.modulo || contexto.modulo
    };

    // Generamos ID único si no existe
    if (!regConContexto.id_registro) {
      regConContexto.id_registro = generarId((regConContexto.modulo || 'REG').slice(0, 3).toUpperCase());
    }

    const index = db.registros.findIndex(r => r.id_registro === regConContexto.id_registro);

    if (index >= 0) {
      // EDICIÓN: Actualizamos manteniendo la fecha de creación original
      db.registros[index] = {
        ...db.registros[index],
        ...regConContexto,
        actualizado_en: ahora
      };
    } else {
      // NUEVO REGISTRO
      db.registros.push({
        ...regConContexto,
        creado_en: regConContexto.creado_en || ahora,
        actualizado_en: ahora
      });
    }
  });

  guardarDB(db);
}

export function guardarRegistrosLote(nuevosRegistros, { reemplazar } = {}) {
  if (!Array.isArray(nuevosRegistros) || nuevosRegistros.length === 0) return;
  const db = leerDB();
  const ahora = new Date().toISOString();

  if (reemplazar) {
    // Edición de UN costeo: borra su registro y sus derivados, sin tocar otros productos del lote
    db.registros = db.registros.filter(r =>
      r.id_registro !== reemplazar && !String(r.id_registro).includes(`-${reemplazar}-`)
    );
  } else {
    const idLoteTarget = nuevosRegistros[0].id_lote;
    if (idLoteTarget) db.registros = db.registros.filter(r => r.id_lote !== idLoteTarget);
    // Evita duplicados si un registro con el mismo id ya existía en otro lote
    const idsNuevos = new Set(nuevosRegistros.map(r => r.id_registro).filter(Boolean));
    db.registros = db.registros.filter(r => !idsNuevos.has(r.id_registro));
  }

  const procesados = nuevosRegistros.map(r => ({
    ...r,
    creado_en: r.creado_en || ahora,
    actualizado_en: ahora
  }));

  db.registros.push(...procesados);
  guardarDB(db);
}

export function eliminarRegistro(idRegistro) {
  const db = leerDB();
  db.registros = db.registros.filter(r => r.id_registro !== idRegistro);
  guardarDB(db);
}

// ===================== AGREGACIONES =====================

export function calcularTotalPresupuestado(registros, categoria = '', mesFiltrado = '') {
  return registros.reduce((sum, reg) => {
    
    if (categoria === 'Forecast de Ventas') {
      if (mesFiltrado && reg.detalle_columnas?.cantidades) {
        const cantidadMes = parseFloat(reg.detalle_columnas.cantidades[mesFiltrado]) || 0;
        const precio = parseFloat(reg.detalle_columnas.precio_venta) || 0;
        return sum + (cantidadMes * precio);
      }
      return sum + (reg.totales?.ingreso_total ?? reg.detalle_columnas?.ingreso_total ?? 0);
    }
    
    return sum + (reg.totales?.costo_total ?? reg.detalle_columnas?.costo_total ?? 0);
  }, 0);
}

export function resumenPorArea(idVersion) {
  const db = leerDB();
  const registrosVersion = db.registros.filter(r => r.id_version === idVersion);
  const resumen = {};
  registrosVersion.forEach(r => {
    const monto = r.totales?.costo_total ?? r.detalle_columnas?.costo_total ?? 0;
    resumen[r.area] = (resumen[r.area] || 0) + monto;
  });
  return resumen;
}

// esto jala toda la informacion de forecast de ventas para un version especifica, para luego ser procesada en el componente ForecastVentas
export function listarForecastComercial(idVersion) {
  const db = leerDB();
  return db.registros
    .filter(r => r.id_version === idVersion && r.modulo === 'Forecast de Ventas')
    .map(r => {
      const dc = r.detalle_columnas || {};
      return {
      id_registro: r.id_registro,
      cliente: dc.cliente || '',
      vendedor: dc.vendedor || '',
      unidad_negocio: dc.unidad_negocio || '',
      producto: dc.producto || '',
      presentacion_fundente: dc.presentacion_fundente || '',
      unidad_sachet: dc.unidad_sachet || '',
      proceso: dc.proceso || '',
      um: dc.um || 'Unidad',
      anio_proyeccion: dc.anio_proyeccion || (r.fecha_proyeccion ? r.fecha_proyeccion.split('-')[0] : ''),
      fecha_proyeccion: r.fecha_proyeccion || '',
      precio_venta: dc.precio_venta || 0,
      costo_unitario: dc.costo_unitario || 0,
      cantidades: dc.cantidades || {},
    };
    });
}

// ===================== COSTEO DE EMBALAJES (Logística) =====================

// Cada línea del forecast (producto + cliente + zona) es una fila independiente a costear,
// aunque el producto se repita entre clientes distintos.
export function listarLineasForecastParaEmbalaje({ idVersion, lineasNegocio }) {
  const db = leerDB();
  return (db.registros || [])
    .filter(r => r.id_version === idVersion && r.modulo === 'Forecast de Ventas')
    .map(r => {
      const dc = r.detalle_columnas || {};
      return {
        id_registro: r.id_registro,
        cliente: dc.cliente || '',
        unidad_negocio: dc.unidad_negocio || '',
        producto: dc.producto || '',
        zona: dc.zona || 'Local',
        um: dc.um || 'Unidad',
        anio_proyeccion: dc.anio_proyeccion || (r.fecha_proyeccion ? r.fecha_proyeccion.split('-')[0] : ''),
        cantidades: dc.cantidades || {},
      };
    })
    .filter(f => !lineasNegocio || lineasNegocio.includes(f.unidad_negocio));
}

// Logística costea el embalaje por separado para cada línea de producción
// (unidad de negocio del forecast). Cada costeo de producción solo lee la suya.
export const LINEAS_PRODUCCION_EMBALAJE = [
  { unidadNegocio: 'Crisoles de Arcilla', area: 'Producción Crisoles' },
  { unidadNegocio: 'Fundente', area: 'Producción Fundente' },
  { unidadNegocio: 'Copelas', area: 'Producción Copelas' },
];

// Última configuración guardada (capacidades + insumos) del embalaje de una línea/año.
export function obtenerConfigEmbalajeGuardada({ idVersion, anio, unidadNegocio }) {
  const db = leerDB();
  const regs = (db.registros || []).filter(r => {
    const dc = r.detalle_columnas || {};
    return r.id_version === idVersion && r.modulo === 'Costeo de Embalajes'
      && String(dc.anio_proyeccion) === String(anio)
      && dc.unidad_negocio === unidadNegocio && dc.config_global;
  });
  if (regs.length === 0) return null;
  regs.sort((a, b) => String(b.actualizado_en || '').localeCompare(String(a.actualizado_en || '')));
  return regs[0].detalle_columnas.config_global;
}

// Costo de embalaje YA CALCULADO por Logística, por cada línea de forecast (producto+cliente+zona).
// Los costeos de producción (Crisoles/Fundente/Copelas) SOLO LEEN esto, filtrado por su unidad de negocio.
export function obtenerCostosEmbalajePorLinea({ idVersion, anio, unidadNegocio }) {
  const db = leerDB();
  const mapa = {}; // clave: id_registro_forecast -> costo
  (db.registros || [])
    .filter(r => r.id_version === idVersion && r.modulo === 'Costeo de Embalajes')
    .forEach(r => {
      const dc = r.detalle_columnas || {};
      if (anio && String(dc.anio_proyeccion) !== String(anio)) return;
      if (unidadNegocio && dc.unidad_negocio !== unidadNegocio) return;
      const idRef = dc.id_registro_forecast;
      if (!idRef) return;
      mapa[idRef] = {
        producto: dc.producto,
        zona: dc.zona || 'Local',
        volumen: parseFloat(dc.volumen_anual) || 0,
        costoUnitario: parseFloat(dc.costo_unitario_embalaje) || 0,
        costoTotal: parseFloat(r.totales?.costo_total || dc.costo_total_anual || 0),
      };
    });
  return mapa;
}

// Agregado por PRODUCTO (promedio ponderado por volumen entre todas sus líneas/zonas/clientes).
// Esto es lo que consumen Fundente/Crisoles/Copelas: un solo costo unitario de embalaje por producto.
export function obtenerCostoEmbalajePorProducto({ idVersion, anio, unidadNegocio }) {
  const porLinea = obtenerCostosEmbalajePorLinea({ idVersion, anio, unidadNegocio });
  const acumulado = {}; // producto -> { volumen, costoTotal }
  Object.values(porLinea).forEach(l => {
    if (!acumulado[l.producto]) acumulado[l.producto] = { volumen: 0, costoTotal: 0 };
    acumulado[l.producto].volumen += l.volumen;
    acumulado[l.producto].costoTotal += l.costoTotal;
  });
  const resultado = {};
  Object.entries(acumulado).forEach(([prod, { volumen, costoTotal }]) => {
    resultado[prod] = volumen > 0 ? costoTotal / volumen : 0;
  });
  return resultado;
}

export function obtenerTotalesPorProceso({ idVersion, area, procesos, mes = null }) {
  const db = leerDB();
  const resultado = {};
  procesos.forEach(p => { resultado[p] = 0; });

  db.registros
    .filter(r => r.id_version === idVersion && r.area === area)
    .forEach(r => {
      const proceso = r.detalle_columnas?.proceso;
      if (!proceso || !procesos.includes(proceso)) return;
      if (mes && r.detalle_columnas?.mes_uso && r.detalle_columnas.mes_uso !== mes) return;

      const monto = r.totales?.costo_total ?? r.detalle_columnas?.costo_total ?? 0;
      resultado[proceso] += monto;
    });

  return resultado;
}

export function guardarCosteoDerivado(registroCosteo, desglose, { idVersion, area }) {
  const ahora = new Date().toISOString();
  const idLote = registroCosteo.id_lote;
  const base = {
    fecha_proyeccion: registroCosteo.fecha_proyeccion,
    empleado_dni: '-',
    empleado_nombre: registroCosteo.detalle_columnas?.producto || '-',
  };

  const hijos = [
    {
      modulo: 'Materias Primas',
      monto: desglose.materiasPrimas,
      cuenta: '946252000 - Materiales Auxiliares y Suministros'
    },
    {
      modulo: 'Materiales Auxiliares y Suministros',
      monto: desglose.maSuministros,
      cuenta: '946252000 - Materiales Auxiliares y Suministros'
    },
    {
      modulo: 'Envases y Embalajes',
      monto: desglose.envasesEmbalajes,
      cuenta: '946252000 - Materiales Auxiliares y Suministros'
    },
  ];

  const db = leerDB();

  hijos.forEach(h => {
    if (!h.monto || h.monto <= 0) return;

    const idRegistro = `${idLote}-${h.modulo.slice(0, 3).toUpperCase()}`;
    const registroHijo = {
      ...base,
      id_registro: idRegistro,
      id_lote: idLote,
      id_version: idVersion,
      area,
      modulo: h.modulo,
      detalle_columnas: {
        cuenta_afectada: h.cuenta,
        detalle: `Origen: ${registroCosteo.modulo || 'Costeo'} · ${registroCosteo.detalle_columnas?.producto || ''}`,
        origen_costeo: registroCosteo.id_registro,
        producto: registroCosteo.detalle_columnas?.producto || '',
        proceso: registroCosteo.detalle_columnas?.proceso || '',
        costo_total: h.monto,
      },
      totales: { costo_total: h.monto },
      desglose_contable: [{ id: `cta-${idRegistro}`, cuenta: h.cuenta, monto: h.monto.toFixed(2) }],
      creado_en: ahora,
      actualizado_en: ahora,
    };

    const idx = db.registros.findIndex(r => r.id_registro === idRegistro);
    if (idx >= 0) db.registros[idx] = registroHijo;
    else db.registros.push(registroHijo);
  });

  guardarDB(db);
}

// Cargar maestros iniciales desde data.js si no existen en localStorage
import { maestroEmpleados, maestroCuentas, maestroClientes, maestroProductos, baseDatosUsuarios } from '../config/data';

export function obtenerMaestro(tipo) {
  const guardado = localStorage.getItem(`maestro_${tipo}`);
  if (guardado) return JSON.parse(guardado);
  
  let inicial = [];
  if (tipo === 'empleados') inicial = maestroEmpleados;
  if (tipo === 'cuentas') inicial = maestroCuentas;
  if (tipo === 'clientes') inicial = maestroClientes;
  if (tipo === 'productos') inicial = maestroProductos;
  if (tipo === 'usuarios') inicial = baseDatosUsuarios;
  if (tipo === 'formulas') inicial = maestroFormulas;

  localStorage.setItem(`maestro_${tipo}`, JSON.stringify(inicial));
  return inicial;
}

export function guardarEnMaestro(tipo, nuevoItem, esEdicion, idOriginal) {
  let lista = obtenerMaestro(tipo);
  
  if (tipo === 'usuarios' || tipo === 'formulas') {
    // Si es edición y el nombre/ID clave ha cambiado, eliminamos el registro viejo
    if (esEdicion && idOriginal && idOriginal !== (nuevoItem.id || nuevoItem.producto)) {
      delete lista[idOriginal];
    }
    // Asignamos o actualizamos usando "id" (usuarios) o "producto" (fórmulas)
    lista[nuevoItem.id || nuevoItem.producto] = nuevoItem;
  } else {
    if (esEdicion) {
      lista = lista.map(item => (item.dni || item.id || item.ruc || item.codigo) === idOriginal ? nuevoItem : item);
    } else {
      lista.push(nuevoItem);
    }
  }
  
  localStorage.setItem(`maestro_${tipo}`, JSON.stringify(lista));
  return lista;
}

export function eliminarDeMaestro(tipo, idUnico) {
  let lista = obtenerMaestro(tipo);
  
  if (tipo === 'usuarios' || tipo === 'formulas') {
    delete lista[idUnico];
  } else {
    // Agregamos item.codigo como precaución adicional por si acaso tienes productos/clientes usando ese campo
    lista = lista.filter(item => (item.dni || item.id || item.ruc || item.codigo) !== idUnico);
  }
  
  localStorage.setItem(`maestro_${tipo}`, JSON.stringify(lista));
  return lista;
}

// =====================================================================
// MAESTROS LOCALES (FRONTEND APUNTANDO CORRECTAMENTE AL BACKEND)
// =====================================================================

export async function obtenerProductosOdoo() {
  try {
    const res = await fetch('http://localhost:5000/api/maestros/productos');
    if (!res.ok) throw new Error('Error al conectar');
    return await res.json();
  } catch (error) {
    console.error("Error obteniendo productos locales:", error);
    return [];
  }
}

export async function obtenerClientesOdoo() {
  try {
    const res = await fetch('http://localhost:5000/api/maestros/clientes');
    if (!res.ok) throw new Error('Error al conectar');
    return await res.json();
  } catch (error) {
    console.error("Error obteniendo clientes locales:", error);
    return [];
  }
}

export async function obtenerEmpleadosOdoo() {
  try {
    const res = await fetch('http://localhost:5000/api/maestros/empleados');
    if (!res.ok) throw new Error('Error al conectar');
    return await res.json();
  } catch (error) {
    console.error("Error obteniendo empleados locales:", error);
    return [];
  }
}

export async function obtenerCuentasOdoo() {
  try {
    const res = await fetch('http://localhost:5000/api/maestros/cuentas');
    if (!res.ok) throw new Error('Error al conectar');
    return await res.json();
  } catch (error) {
    console.error("Error obteniendo cuentas locales:", error);
    return [];
  }
}

export async function obtenerUsuariosOdoo() {
  try {
    const res = await fetch('http://localhost:5000/api/maestros/usuarios');
    if (!res.ok) throw new Error('Error al conectar');
    return await res.json();
  } catch (error) {
    console.error("Error obteniendo usuarios locales:", error);
    return [];
  }
}

export async function obtenerFormulasOdoo() {
  try {
    const respuesta = await fetch('http://localhost:5000/api/maestros/formulas');
    if (!respuesta.ok) throw new Error('Error al conectar con el servidor local de fórmulas');
    
    const filasSQL = await respuesta.json();
    const formulasAgrupadas = {};

    filasSQL.forEach(fila => {
      const idUnicoFormula = fila.bom_id; 

      if (!formulasAgrupadas[idUnicoFormula]) {
        formulasAgrupadas[idUnicoFormula] = {
          id: idUnicoFormula,
          producto: fila.producto_final,
          codigo: fila.codigo_formula || `BOM-${fila.bom_id}`,
          cantidad_base: fila.cantidad_base || 1,
          materia_prima: [],
          envases: [] 
        };
      }

      formulasAgrupadas[idUnicoFormula].materia_prima.push({
        insumo: fila.componente_nombre,
        cantidad: parseFloat(fila.cantidad_componente) || 0,
        unidad: fila.unidad_medida || 'Unidad',
        costo_unit_ref: 0 
      });
    });

    return Object.values(formulasAgrupadas);
  } catch (error) {
    console.error("Error obteniendo fórmulas locales:", error);
    return [];
  }
}

export async function obtenerUnidadesMedida() {
  try {
    const respuesta = await fetch('http://localhost:5000/api/maestros/unidades');
    if (!respuesta.ok) throw new Error('Error al obtener unidades de medida');
    return await respuesta.json();
  } catch (error) {
    console.error("Fallo al obtener unidades:", error);
    return [];
  }
}

export async function actualizarMaestroDB(tipo, id, datosNuevos) {
  try {
    const respuesta = await fetch(`http://localhost:5000/api/maestros/${tipo}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(datosNuevos)
    });
    
    if (!respuesta.ok) {
      const errorData = await respuesta.json();
      throw new Error(errorData.error || 'Error al actualizar el registro');
    }
    
    return await respuesta.json();
  } catch (error) {
    console.error("Fallo al actualizar en BD:", error);
    alert("Hubo un error al guardar los cambios: " + error.message);
    return null;
  }
}

export async function sincronizarConOdooDB() {
  try {
    const respuesta = await fetch('http://localhost:5000/api/sincronizar/maestros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!respuesta.ok) throw new Error('Error al conectar con el servidor de sincronización');
    
    const resultado = await respuesta.json();
    return resultado;
  } catch (error) {
    console.error("Fallo en sincronización:", error);
    throw error;
  }
}

export async function obtenerHistorialProducto(codigo, cliente) {
  try {
    const params = new URLSearchParams({ codigo });
    if (cliente) params.set('cliente', cliente);
    const res = await fetch(`http://localhost:5000/api/maestros/productos/historial?${params.toString()}`);
    if (!res.ok) throw new Error('Error al conectar');
    return await res.json();
  } catch (error) {
    console.error('Error obteniendo historial del producto:', error);
    return { ventas: [], compras: [], salidas: [], costoPromedio: 0 };
  }
}

export async function obtenerTipoCambioPromedio() {
  try {
    const res = await fetch('http://localhost:5000/api/tipo-cambio/promedio');
    if (!res.ok) throw new Error('Error al conectar');
    const data = await res.json();
    return parseFloat(data.tipo_cambio) || 3.75;
  } catch (error) {
    console.error('Error obteniendo tipo de cambio promedio:', error);
    return 3.75;
  }
}