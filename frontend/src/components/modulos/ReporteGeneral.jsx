import React, { useState, useMemo } from 'react';
import ReporteGantt, { MESES_CORTOS, mesesVacios, totalMontoGrupos } from './ReporteGantt';
import EstadoResultados from './EstadoResultados';
import { listarVersiones } from '../../data/store';

// El Forecast (ventas) y los Costeos (formularios de apoyo que calculan el costo de cada
// producto) NO son gastos: se ven en sus propias pestañas, no en el consolidado ni en gastos.
const esForecastOCosteo = (modulo) => {
  const m = String(modulo || '');
  return m === 'Forecast de Ventas' || m.startsWith('Costeo de');
};
const PESTANAS_SOLO_GASTOS = ['general', 'gastos_areas'];

export default function ReporteGeneral({ registrosTotales = [] }) {
  const [tipoReporte, setTipoReporte] = useState('general');
  const [modoAgrupacionGeneral, setModoAgrupacionGeneral] = useState('detallado');
  
  const [filtroVersion, setFiltroVersion] = useState('');
  const [filtroModulo, setFiltroModulo] = useState('');
  const [filtroArea, setFiltroArea] = useState('');

  const [filtroPersona, setFiltroPersona] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtroMoneda, setFiltroMoneda] = useState('');

  const [areasExpandidas, setAreasExpandidas] = useState({});
  const [gruposGeneralesExpandidos, setGruposGeneralesExpandidos] = useState({});
  
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Vistas tipo Gantt (Forecast, Compras, Producción)
  const [anioGantt, setAnioGantt] = useState('');
  const [filtroUnidadNegocio, setFiltroUnidadNegocio] = useState('');
  const [centroProduccion, setCentroProduccion] = useState('');
  const [modoCompras, setModoCompras] = useState('modulo');

  // Estados de ordenamiento seguros
  const [ordenGeneral, setOrdenGeneral] = useState({ columna: 'fecha_proyeccion', direccion: 'asc' });
  const [ordenGastos, setOrdenGastos] = useState({ columna: 'total', direccion: 'desc' });
  const [ordenCompras] = useState({ columna: 'fecha', direccion: 'asc' });

  const versionesDisponibles = useMemo(() => {
    try {
      return listarVersiones();
    } catch {
      return [];
    }
  }, []);

  // ¿El registro pasa los filtros de la pestaña actual? `omitir` deja fuera un filtro:
  // así cada lista de opciones solo ofrece valores que TIENEN datos con los demás filtros.
  const cumpleFiltros = (reg, omitir = null) => {
      const dc = reg.detalle_columnas || {};

      if (PESTANAS_SOLO_GASTOS.includes(tipoReporte) && esForecastOCosteo(reg.modulo)) return false;

      if (omitir !== 'version' && filtroVersion && reg.id_version !== filtroVersion) return false;
      // Cada filtro solo aplica en las pestañas donde se muestra.
      const usaModuloArea = ['general', 'gastos_areas', 'compras'].includes(tipoReporte);
      if (omitir !== 'modulo' && usaModuloArea && filtroModulo && reg.modulo !== filtroModulo) return false;

      const areaReg = reg.area || dc.area || '';
      if (omitir !== 'area' && usaModuloArea && filtroArea && areaReg !== filtroArea) return false;

      if (tipoReporte === 'forecast') {
        if (omitir !== 'cliente' && filtroCliente && (dc.cliente || '') !== filtroCliente) return false;
        if (omitir !== 'vendedor' && filtroVendedor && (dc.vendedor || '') !== filtroVendedor) return false;
        if (omitir !== 'moneda' && filtroMoneda && (dc.moneda || '') !== filtroMoneda) return false;
        if (omitir !== 'unidad' && filtroUnidadNegocio && (dc.unidad_negocio || '') !== filtroUnidadNegocio) return false;
      }

      // Si estamos en Forecast o Compras, omitimos este filtro global de texto porque se procesa de forma específica en su propio useMemo
      if (!['forecast', 'compras', 'produccion'].includes(tipoReporte) && filtroPersona) {
        const nombre = (reg.empleado_nombre || dc.producto || '').toLowerCase();
        const dni = (reg.empleado_dni || '').toLowerCase();
        const busqueda = filtroPersona.toLowerCase();
        if (!nombre.includes(busqueda) && !dni.includes(busqueda)) return false;
      }

      // Filtro de fechas robusto con normalización de barras (Forecast y Producción usan el AÑO)
      const fechaRegStr = reg.fecha_proyeccion;
      if (fechaRegStr && !['forecast', 'produccion'].includes(tipoReporte)) {
        let fechaRegNormalizada = fechaRegStr;
        if (fechaRegStr.includes('/')) {
          const partes = fechaRegStr.split('/');
          if (partes.length === 3 && partes[2].length === 4) {
            fechaRegNormalizada = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
          }
        }

        if (fechaDesde && fechaRegNormalizada < fechaDesde) return false;
        if (fechaHasta && fechaRegNormalizada > fechaHasta) return false;
      }

      return true;
  };

  // Registros Filtrados y Ordenados de forma Segura
  const registrosFiltrados = useMemo(() => {
    const filtrados = registrosTotales.filter(reg => cumpleFiltros(reg));

    return filtrados.sort((a, b) => {
      let valA = a[ordenGeneral.columna];
      let valB = b[ordenGeneral.columna];

      if (ordenGeneral.columna === 'monto') {
        valA = a.modulo === 'Forecast de Ventas' ? parseFloat(a.totales?.ingreso_total || a.detalle_columnas?.ingreso_total || 0) : parseFloat(a.totales?.costo_total || a.detalle_columnas?.costo_total || 0);
        valB = b.modulo === 'Forecast de Ventas' ? parseFloat(b.totales?.ingreso_total || b.detalle_columnas?.ingreso_total || 0) : parseFloat(b.totales?.costo_total || b.detalle_columnas?.costo_total || 0);
        return ordenGeneral.direccion === 'asc' ? valA - valB : valB - valA;
      }

      valA = valA !== undefined && valA !== null ? String(valA).toLowerCase() : '';
      valB = valB !== undefined && valB !== null ? String(valB).toLowerCase() : '';

      if (valA < valB) return ordenGeneral.direccion === 'asc' ? -1 : 1;
      if (valA > valB) return ordenGeneral.direccion === 'asc' ? 1 : -1;
      return 0;
    });
  }, [registrosTotales, filtroVersion, filtroModulo, filtroArea, filtroPersona, fechaDesde, fechaHasta, filtroCliente, filtroVendedor, filtroMoneda, filtroUnidadNegocio, ordenGeneral, tipoReporte]);

  // Opciones de cada filtro: solo valores con datos, considerando los DEMÁS filtros activos.
  const opcionesDe = (omitir, extraer, soloForecast = false) => {
    const set = new Set();
    registrosTotales.forEach(reg => {
      if (soloForecast && reg.modulo !== 'Forecast de Ventas') return;
      if (!cumpleFiltros(reg, omitir)) return;
      const v = extraer(reg);
      if (v) set.add(v);
    });
    return [...set].sort();
  };

  const depsFiltros = [registrosTotales, tipoReporte, filtroVersion, filtroModulo, filtroArea, filtroCliente, filtroVendedor, filtroMoneda, filtroUnidadNegocio, filtroPersona, fechaDesde, fechaHasta];
  const modulosDisponibles = useMemo(() => opcionesDe('modulo', r => r.modulo), depsFiltros);
  const areasDisponibles = useMemo(() => opcionesDe('area', r => r.area || r.detalle_columnas?.area), depsFiltros);
  const clientesDisponibles = useMemo(() => opcionesDe('cliente', r => r.detalle_columnas?.cliente, true), depsFiltros);
  const vendedoresDisponibles = useMemo(() => opcionesDe('vendedor', r => r.detalle_columnas?.vendedor, true), depsFiltros);

  // Agrupación dinámica para el Reporte General
  const resumenGeneralAgrupado = useMemo(() => {
    if (modoAgrupacionGeneral === 'detallado') return [];

    const mapa = {};
    registrosFiltrados.forEach(reg => {
      const dc = reg.detalle_columnas || {};
      const cuenta = dc.cuenta_afectada || dc.numero_cuenta || (Array.isArray(reg.desglose_contable) && reg.desglose_contable.length > 0 ? reg.desglose_contable[0].cuenta : null) || 'S/C';
      const monto = reg.modulo === 'Forecast de Ventas' ? parseFloat(reg.totales?.ingreso_total || dc.ingreso_total || 0) : parseFloat(reg.totales?.costo_total || dc.costo_total || 0);

      let claveAgrupacion = 'General';
      if (modoAgrupacionGeneral === 'empleado') {
        claveAgrupacion = reg.empleado_nombre || dc.descripcion_activo || 'Sin Asignar / General';
      } else if (modoAgrupacionGeneral === 'cuenta') {
        claveAgrupacion = cuenta;
      } else if (modoAgrupacionGeneral === 'area') {
        claveAgrupacion = reg.area || dc.area || 'Sin Área';
      } else if (modoAgrupacionGeneral === 'modulo') {
        claveAgrupacion = reg.modulo || 'General';
      }

      if (!mapa[claveAgrupacion]) {
        mapa[claveAgrupacion] = { nombreGrupo: claveAgrupacion, totalMonto: 0, registros: [] };
      }
      mapa[claveAgrupacion].totalMonto += monto;
      mapa[claveAgrupacion].registros.push({ ...reg, montoCalculado: monto, cuentaContable: cuenta });
    });

    const lista = Object.values(mapa);
    return lista.sort((a, b) => b.totalMonto - a.totalMonto);
  }, [registrosFiltrados, modoAgrupacionGeneral]);

  const toggleGrupoGeneral = (nombreGrupo) => {
    setGruposGeneralesExpandidos(prev => ({ ...prev, [nombreGrupo]: !prev[nombreGrupo] }));
  };


  // 2. Resumen de Gastos por Áreas con desglose anidado por Módulos
  const resumenGastosAreas = useMemo(() => {
    const mapa = {};
    registrosFiltrados
      .filter(r => r.modulo !== 'Forecast de Ventas')
      .forEach(reg => {
        const area = reg.area || reg.detalle_columnas?.area || 'Sin Área';
        const modulo = reg.modulo || 'General';
        const costo = parseFloat(reg.totales?.costo_total || reg.detalle_columnas?.costo_total || 0);

        if (!mapa[area]) {
          mapa[area] = { totalArea: 0, modulos: {} };
        }
        mapa[area].totalArea += costo;

        if (!mapa[area].modulos[modulo]) {
          mapa[area].modulos[modulo] = 0;
        }
        mapa[area].modulos[modulo] += costo;
      });

    const lista = Object.entries(mapa).map(([area, data]) => ({
      area,
      total: data.totalArea,
      modulos: Object.entries(data.modulos).map(([modulo, monto]) => ({ modulo, monto }))
    }));

    return lista.sort((a, b) => {
      let valA = a[ordenGastos.columna];
      let valB = b[ordenGastos.columna];

      if (typeof valA === 'number' && typeof valB === 'number') {
        return ordenGastos.direccion === 'asc' ? valA - valB : valB - valA;
      }

      valA = valA !== undefined && valA !== null ? String(valA).toLowerCase() : '';
      valB = valB !== undefined && valB !== null ? String(valB).toLowerCase() : '';

      if (valA < valB) return ordenGastos.direccion === 'asc' ? -1 : 1;
      if (valA > valB) return ordenGastos.direccion === 'asc' ? 1 : -1;
      return 0;
    });
  }, [registrosFiltrados, ordenGastos]);

  const toggleArea = (area) => {
    setAreasExpandidas(prev => ({ ...prev, [area]: !prev[area] }));
  };

  // 3. Plan de Compras (Con filtro de fechas y buscador de producto integrado)
  const resumenPlanCompras = useMemo(() => {
    const modulosPermitidos = [
      'Uniforme - EPPs',
      'Utiles de Oficina',
      'Materias Primas',
      'Suministros',
      'Materiales Auxiliares y Suministros',
      'Envases y Embalajes'
    ];
    // Los insumos de los costeos llegan por sus registros DERIVADOS (Materias Primas, Envases...).
    // El forecast es venta, no compra: no entra aquí.

    const filasPlan = [];

    const cumpleFiltroFecha = (fechaStr) => {
      if (!fechaStr) return true;
      let fechaNorm = fechaStr;
      if (fechaStr.includes('/')) {
        const partes = fechaStr.split('/');
        if (partes.length === 3 && partes[2].length === 4) {
          fechaNorm = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
        }
      }
      if (fechaDesde && fechaNorm < fechaDesde) return false;
      if (fechaHasta && fechaNorm > fechaHasta) return false;
      return true;
    };

    registrosFiltrados.forEach(reg => {
      const dc = reg.detalle_columnas || {};
      const fechaBase = reg.fecha_proyeccion || '2027-01-01';
      const modulo = reg.modulo || 'General';
      const cuenta = dc.cuenta_afectada || dc.cuenta || dc.numero_cuenta || 'S/C';

      if (modulo.startsWith('Costeo de') || modulo === 'Forecast de Ventas') {
        return;
      }
      if (modulo === 'Uniforme - EPPs' || modulo === 'Uniformes - EPPs') {
        const filasEpps = reg.variables_registro?.filasEpps || [];
        if (filasEpps.length > 0) {
          filasEpps.forEach(itemEpp => {
            const nombreEpp = itemEpp.producto || itemEpp.epp_nombre || 'Artículo EPP';
            const cantidadEpp = parseFloat(itemEpp.cantidad) || 1;
            const costoTotalReg = parseFloat(reg.totales?.costo_total || dc.costo_total || 0);
            const costoUnitarioEpp = filasEpps.length > 0 ? (costoTotalReg / filasEpps.length) : costoTotalReg;

            if (cumpleFiltroFecha(fechaBase)) {
              filasPlan.push({
                fecha: fechaBase,
                modulo: 'Uniforme - EPPs',
                cuenta,
                producto: nombreEpp.trim(),
                cantidad: cantidadEpp,
                totalCosto: cantidadEpp * costoUnitarioEpp
              });
            }
          });
        } else {
          let productoLimpio = dc.producto || dc.epp_nombre || reg.empleado_nombre || dc.detalle || 'EPP / Uniforme';
          const costo = parseFloat(reg.totales?.costo_total || dc.costo_total || 0);
          const cantidad = dc.cantidad !== undefined ? parseFloat(dc.cantidad) || 1 : 1;

          if (cumpleFiltroFecha(fechaBase)) {
            filasPlan.push({
              fecha: fechaBase,
              modulo,
              cuenta,
              producto: productoLimpio.trim(),
              cantidad,
              totalCosto: costo
            });
          }
        }
      }
      else if (modulosPermitidos.includes(modulo) || dc.es_derivado) {
        // 🛠️ CORRECCIÓN: Priorizamos descripcion_material antes que el empleado_nombre
        let productoLimpio = dc.descripcion_material || dc.producto || dc.detalle || dc.descripcion_cuenta || 'Insumo / Gasto';
        
        if (productoLimpio.includes(' - ')) productoLimpio = productoLimpio.split(' - ').pop();
        if (productoLimpio.includes('COSTEO AUTOMÁTICO - ')) productoLimpio = productoLimpio.replace('COSTEO AUTOMÁTICO - ', '');

        const costo = parseFloat(reg.totales?.costo_total || dc.costo_total || 0);
        const cantidad = dc.cantidad !== undefined ? parseFloat(dc.cantidad) || 0 : (parseFloat(dc.unidades) || 1);

        if (cumpleFiltroFecha(fechaBase)) {
          filasPlan.push({
            fecha: fechaBase,
            modulo,
            cuenta,
            producto: productoLimpio.trim(),
            cantidad,
            totalCosto: costo
          });
        }
      }
    });

    let resultadoFinal = filasPlan;
    if (filtroPersona) {
      const queryBusqueda = filtroPersona.toLowerCase();
      resultadoFinal = filasPlan.filter(item => 
        item.producto.toLowerCase().includes(queryBusqueda) ||
        item.cuenta.toLowerCase().includes(queryBusqueda) ||
        item.modulo.toLowerCase().includes(queryBusqueda)
      );
    }

    return resultadoFinal.sort((a, b) => {
      let valA = a[ordenCompras.columna];
      let valB = b[ordenCompras.columna];

      if (typeof valA === 'number' && typeof valB === 'number') {
        return ordenCompras.direccion === 'asc' ? valA - valB : valB - valA;
      }

      valA = valA !== undefined && valA !== null ? String(valA).toLowerCase() : '';
      valB = valB !== undefined && valB !== null ? String(valB).toLowerCase() : '';

      if (valA < valB) return ordenCompras.direccion === 'asc' ? -1 : 1;
      if (valA > valB) return ordenCompras.direccion === 'asc' ? 1 : -1;
      return 0;
    });
  }, [registrosFiltrados, ordenCompras, fechaDesde, fechaHasta, filtroPersona]);


  // ===================== VISTAS GANTT =====================
  const numMesDe = (fecha) => {
    const m = String(fecha || '').match(/^(\d{4})-(\d{2})/);
    return m ? { anio: m[1], mes: parseInt(m[2], 10) - 1 } : null;
  };
  const anioDeRegistro = (reg) => String(reg.detalle_columnas?.anio_proyeccion || numMesDe(reg.fecha_proyeccion)?.anio || '');
  const esCosteoProduccion = (m) => String(m || '').startsWith('Costeo de') && m !== 'Costeo de Embalajes';

  // Años con datos en la pestaña actual (el Gantt muestra un año a la vez).
  // En Compras se toman solo los años que tienen COMPRAS: si se usaran todos los registros,
  // un año con solo remuneraciones (p. ej. 2026) quedaba elegido y la matriz salía vacía.
  const aniosGantt = useMemo(() => {
    const set = new Set();
    if (tipoReporte === 'compras') {
      resumenPlanCompras.forEach(item => { const f = numMesDe(item.fecha); if (f) set.add(f.anio); });
    } else {
      registrosTotales.forEach(reg => {
        const incluir = tipoReporte === 'forecast' ? reg.modulo === 'Forecast de Ventas'
          : tipoReporte === 'produccion' ? esCosteoProduccion(reg.modulo) : false;
        if (!incluir) return;
        const a = anioDeRegistro(reg);
        if (a) set.add(a);
      });
    }
    return Array.from(set).sort();
  }, [registrosTotales, resumenPlanCompras, tipoReporte]);

  const anioActivoGantt = aniosGantt.includes(anioGantt) ? anioGantt : (aniosGantt[0] || '');

  const unidadesNegocioDisponibles = useMemo(() => opcionesDe('unidad', r => r.detalle_columnas?.unidad_negocio, true), depsFiltros);

  const centrosProduccionDisponibles = useMemo(() => opcionesDe(null, r => (esCosteoProduccion(r.modulo) ? r.area : null)), depsFiltros);

  const agruparEnGrupos = (mapaGrupos) => Object.values(mapaGrupos)
    .map(g => ({ ...g, filas: Object.values(g.filas).sort((a, b) => a.titulo.localeCompare(b.titulo)) }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo));

  const acumular = (fila, mes, cantidad, monto, origen) => {
    const celda = fila.meses[mes];
    celda.cantidad += cantidad;
    celda.monto += monto;
    if (origen) celda.origen[origen] = (celda.origen[origen] || 0) + cantidad;
  };

  // PLAN DE COMPRAS: módulo (izquierda) -> producto; o todo totalizado por producto.
  const ganttCompras = useMemo(() => {
    const grupos = {};
    resumenPlanCompras.forEach(item => {
      const f = numMesDe(item.fecha);
      if (!f || f.anio !== anioActivoGantt) return;
      const nombreBase = item.producto.replace(/\s*\([^)]*\)\s*$/, '').trim() || item.producto;
      const paraQue = (item.producto.match(/\(([^)]*)\)\s*$/) || [])[1];
      const claveGrupo = modoCompras === 'modulo' ? item.modulo : 'TODOS';
      const titulo = modoCompras === 'modulo' ? item.modulo : 'Todos los productos a comprar';
      if (!grupos[claveGrupo]) grupos[claveGrupo] = { clave: claveGrupo, titulo, filas: {} };
      const claveFila = modoCompras === 'modulo' ? item.producto : nombreBase.toUpperCase();
      if (!grupos[claveGrupo].filas[claveFila]) {
        grupos[claveGrupo].filas[claveFila] = { clave: claveFila, titulo: modoCompras === 'modulo' ? item.producto : nombreBase, subtitulo: '', meses: mesesVacios(), _origenes: new Set() };
      }
      const fila = grupos[claveGrupo].filas[claveFila];
      const origen = paraQue ? `${item.modulo} · ${paraQue}` : item.modulo;
      fila._origenes.add(item.modulo);
      acumular(fila, f.mes, item.cantidad || 0, item.totalCosto || 0, origen);
    });
    Object.values(grupos).forEach(g => Object.values(g.filas).forEach(f => {
      f.subtitulo = modoCompras === 'total' ? `Origen: ${Array.from(f._origenes).join(', ')}` : '';
      delete f._origenes;
    }));
    return agruparEnGrupos(grupos);
  }, [resumenPlanCompras, anioActivoGantt, modoCompras]);

  // FORECAST: unidad de negocio -> producto (suma de clientes). Cantidad esperada e ingreso en soles.
  const ganttForecast = useMemo(() => {
    const grupos = {};
    const q = (filtroPersona || '').toLowerCase();
    registrosFiltrados.filter(r => r.modulo === 'Forecast de Ventas').forEach(reg => {
      const dc = reg.detalle_columnas || {};
      if (anioDeRegistro(reg) !== anioActivoGantt) return;
      const producto = dc.producto || 'Sin producto';
      if (q && !producto.toLowerCase().includes(q) && !String(dc.cliente || '').toLowerCase().includes(q)) return;
      const un = dc.unidad_negocio || 'Sin unidad de negocio';
      const tc = dc.moneda === 'US$' ? (parseFloat(dc.tipo_cambio) || 1) : 1;
      const precio = parseFloat(dc.precio_venta) || 0;
      const costo = parseFloat(dc.costo_unitario) || 0;
      if (!grupos[un]) grupos[un] = { clave: un, titulo: un, filas: {} };
      const claveFila = `${producto}|${dc.um || ''}`;
      if (!grupos[un].filas[claveFila]) {
        grupos[un].filas[claveFila] = { clave: claveFila, titulo: producto, unidad: dc.um || '', meses: mesesVacios(), _clientes: new Set(), _ingreso: 0, _costo: 0, _cant: 0 };
      }
      const fila = grupos[un].filas[claveFila];
      fila._clientes.add(dc.cliente || '-');
      MESES_CORTOS.forEach((m, i) => {
        const cant = parseFloat(dc.cantidades?.[m]) || 0;
        if (!cant) return;
        const prob = dc.tipo_probabilidad === 'general' || !dc.probabilidades_meses
          ? (parseFloat(dc.probabilidad_general ?? 100) || 0)
          : (parseFloat(dc.probabilidades_meses?.[m] ?? 100) || 0);
        const esperada = cant * prob / 100;
        const ingreso = esperada * precio * tc;
        fila._ingreso += ingreso;
        fila._costo += esperada * costo * tc;
        fila._cant += esperada;
        acumular(fila, i, esperada, ingreso, dc.cliente || '-');
      });
    });
    Object.values(grupos).forEach(g => Object.values(g.filas).forEach(f => {
      const margen = f._ingreso - f._costo;
      const pct = f._ingreso > 0 ? (margen / f._ingreso) * 100 : 0;
      const pvProm = f._cant > 0 ? f._ingreso / f._cant : 0;
      f.subtitulo = `${f._clientes.size} cliente(s) · PV prom. S/ ${pvProm.toFixed(2)} · Margen S/ ${margen.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${pct.toFixed(1)}%)`;
      ['_clientes', '_ingreso', '_costo', '_cant'].forEach(k => delete f[k]);
    }));
    return agruparEnGrupos(grupos);
  }, [registrosFiltrados, anioActivoGantt, filtroPersona]);

  // PLAN DE PRODUCCIÓN: centro de producción -> producto. Cantidad a producir y costo (cantidad × costo unitario).
  const ganttProduccion = useMemo(() => {
    const grupos = {};
    const q = (filtroPersona || '').toLowerCase();
    registrosFiltrados.filter(r => esCosteoProduccion(r.modulo)).forEach(reg => {
      const dc = reg.detalle_columnas || {};
      if (centroProduccion && reg.area !== centroProduccion) return;
      if (anioDeRegistro(reg) !== anioActivoGantt) return;
      const producto = dc.producto || reg.empleado_nombre || 'Sin producto';
      if (q && !producto.toLowerCase().includes(q)) return;
      const centro = reg.area || 'Sin centro';
      const cUnit = parseFloat(dc.costo_unitario_promedio) || 0;
      if (!grupos[centro]) grupos[centro] = { clave: centro, titulo: centro, filas: {} };
      if (!grupos[centro].filas[producto]) {
        grupos[centro].filas[producto] = { clave: producto, titulo: producto, meses: mesesVacios(), _cUnit: cUnit, _comercial: 0 };
      }
      const fila = grupos[centro].filas[producto];
      fila._comercial += parseFloat(dc.cantidad_total_comercial) || 0;
      MESES_CORTOS.forEach((m, i) => {
        const cant = parseFloat(dc.cantidades_produccion?.[m]) || 0;
        if (cant) acumular(fila, i, cant, cant * cUnit, reg.modulo);
      });
    });
    Object.values(grupos).forEach(g => Object.values(g.filas).forEach(f => {
      f.subtitulo = `Costo unit. S/ ${f._cUnit.toFixed(4)} · Demanda comercial ${f._comercial.toLocaleString('en-US')}`;
      delete f._cUnit; delete f._comercial;
    }));
    return agruparEnGrupos(grupos);
  }, [registrosFiltrados, anioActivoGantt, centroProduccion, filtroPersona]);

  const granTotal = useMemo(() => {
    if (tipoReporte === 'forecast') return totalMontoGrupos(ganttForecast);
    if (tipoReporte === 'compras') return totalMontoGrupos(ganttCompras);
    if (tipoReporte === 'produccion') return totalMontoGrupos(ganttProduccion);
    if (tipoReporte === 'gastos_areas') {
      return resumenGastosAreas.reduce((acc, i) => acc + i.total, 0);
    }
    return registrosFiltrados.reduce((acc, reg) => {
      const dc = reg.detalle_columnas || {};
      const valor = reg.modulo === 'Forecast de Ventas'
        ? parseFloat(reg.totales?.ingreso_total || dc.ingreso_total || 0)
        : parseFloat(reg.totales?.costo_total || dc.costo_total || 0);
      return acc + valor;
    }, 0);
  }, [registrosFiltrados, tipoReporte, resumenGastosAreas, ganttForecast, ganttCompras, ganttProduccion]);

  const limpiarFiltros = () => {
    setFiltroVersion('');
    setFiltroModulo('');
    setFiltroArea('');
    setFiltroPersona('');
    setFiltroCliente('');
    setFiltroVendedor('');
    setFiltroMoneda('');
    setFiltroUnidadNegocio('');
    setCentroProduccion('');
    setFechaDesde('');
    setFechaHasta('');
  };

  const exportarAExcel = () => {
    let headers = [];
    let filas = [];
    let nombreReporte = tipoReporte;

    const ganttActual = { forecast: ganttForecast, compras: ganttCompras, produccion: ganttProduccion }[tipoReporte];
    if (ganttActual) {
      if (ganttActual.length === 0) {
        alert('No hay datos para exportar con los filtros seleccionados.');
        return;
      }
      headers = ['Grupo', 'Detalle', 'Información', ...MESES_CORTOS.flatMap(m => [`${m} Cant.`, `${m} S/`]), 'Total Cant.', 'Total S/'];
      ganttActual.forEach(g => g.filas.forEach(f => {
        const totCant = f.meses.reduce((a, m) => a + m.cantidad, 0);
        const totMonto = f.meses.reduce((a, m) => a + m.monto, 0);
        filas.push([
          `"${g.titulo}"`, `"${f.titulo}"`, `"${f.subtitulo || ''}"`,
          ...f.meses.flatMap(m => [m.cantidad.toFixed(2), m.monto.toFixed(2)]),
          totCant.toFixed(2), totMonto.toFixed(2)
        ].join(';'));
      }));
      nombreReporte = `${tipoReporte}_${anioActivoGantt}`;
    }
    else if (tipoReporte === 'gastos_areas') {
      if (resumenGastosAreas.length === 0) {
        alert('No hay registros de Gastos por Áreas para exportar.');
        return;
      }
      headers = ['Área Organizacional', 'Módulo', 'Costo / Gasto Total (S/)'];
      resumenGastosAreas.forEach(item => {
        item.modulos.forEach(mod => {
          filas.push([
            `"${item.area}"`,
            `"${mod.modulo}"`,
            mod.monto.toFixed(2)
          ].join(';'));
        });
      });
    } 
    else {
      if (registrosFiltrados.length === 0) {
        alert('No hay registros para exportar con los filtros actuales.');
        return;
      }
      headers = ['Versión', 'Fecha Aplicación', 'Módulo', 'Área', 'Cuenta Contable', 'Concepto / Empleado', 'Total (S/)'];
      filas = registrosFiltrados.map(reg => {
        const dc = reg.detalle_columnas || {};
        const cuenta = dc.cuenta_afectada || dc.numero_cuenta || (Array.isArray(reg.desglose_contable) && reg.desglose_contable.length > 0 ? reg.desglose_contable[0].cuenta : null) || 'S/C';
        let monto = reg.modulo === 'Forecast de Ventas' ? parseFloat(reg.totales?.ingreso_total || dc.ingreso_total || 0) : parseFloat(reg.totales?.costo_total || dc.costo_total || 0);
        const concepto = (reg.empleado_nombre || dc.descripcion_activo || dc.descripcion_cuenta || 'N/A').replace(/"/g, '""');
        return [
          reg.id_version ? reg.id_version.toUpperCase() : 'N/A', 
          reg.fecha_proyeccion || 'N/A', 
          reg.modulo || 'General', 
          reg.area || dc.area || 'N/A', 
          `"${cuenta}"`, 
          `"${concepto}"`, 
          monto.toFixed(2)
        ].join(';');
      });
    }

    const contenidoCSV = [headers.join(';'), ...filas].join('\n');
    const blob = new Blob(["\ufeff" + contenidoCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Reporte_${nombreReporte}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: '24px', background: '#f8fafc', minHeight: '100vh' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '24px', fontWeight: 'bold' }}>Centro de Reportes Gerenciales</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Selecciona la vista de análisis financiero o operativo que deseas consultar</p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {tipoReporte !== 'eerr' && (
          <button onClick={exportarAExcel} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
            📥 Descargar CSV / Excel
          </button>
          )}
          
          {tipoReporte !== 'eerr' && (
          <div style={{ background: '#dcfce7', padding: '10px 20px', borderRadius: '8px', border: '1px solid #bbf7d0', textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#166534', fontWeight: 'bold' }}>
              {{ forecast: 'INGRESO PROYECTADO (US$ convertido a S/)', compras: 'COSTO DE COMPRAS', produccion: 'COSTO DE PRODUCCIÓN' }[tipoReporte] || 'TOTAL FILTRADO'}
            </div>
            <div style={{ fontSize: '20px', color: '#15803d', fontWeight: 800 }}>
              S/ {granTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px', overflowX: 'auto' }}>
        {[
          { id: 'general', label: '📋 Reporte General Consolidado' },
          { id: 'forecast', label: '📈 Forecast de Ventas' },
          { id: 'gastos_areas', label: '🏢 Gastos por Áreas' },
          { id: 'compras', label: '🛒 Plan de Compras' },
          { id: 'produccion', label: '⚙️ Plan de Producción' },
          { id: 'eerr', label: '📊 Estado de Resultados' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setTipoReporte(tab.id)}
            style={{
              padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              background: tipoReporte === tab.id ? '#2563eb' : 'white',
              color: tipoReporte === tab.id ? 'white' : '#475569',
              border: tipoReporte === tab.id ? '1px solid #2563eb' : '1px solid #cbd5e1'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========================================================= */}
      {/* PANEL DE FILTROS DINÁMICOS SEGÚN EL REPORTE ACTIVO        */}
      {/* ========================================================= */}
      <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          
          {/* Filtro común: Versión */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>VERSIÓN</label>
            <select value={filtroVersion} onChange={e => setFiltroVersion(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
              <option value="">Todas las versiones</option>
              {versionesDisponibles.map(v => <option key={v.id_version} value={v.id_version}>{v.id_version.toUpperCase()} - {v.nombre}</option>)}
            </select>
          </div>

          {/* Filtros exclusivos para FORECAST DE VENTAS */}
          {tipoReporte === 'forecast' && (
            <>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>AÑO</label>
                <select value={anioActivoGantt} onChange={e => setAnioGantt(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                  {aniosGantt.length === 0 && <option value="">Sin datos</option>}
                  {aniosGantt.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>UNIDAD DE NEGOCIO</label>
                <select value={filtroUnidadNegocio} onChange={e => setFiltroUnidadNegocio(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                  <option value="">Todas</option>
                  {unidadesNegocioDisponibles.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>CLIENTE</label>
                <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                  <option value="">Todos los clientes</option>
                  {clientesDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>VENDEDOR</label>
                <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                  <option value="">Todos los vendedores</option>
                  {vendedoresDisponibles.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>MONEDA</label>
                <select value={filtroMoneda} onChange={e => setFiltroMoneda(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                  <option value="">Todas (S/ y US$)</option>
                  <option value="S/">Soles (S/)</option>
                  <option value="US$">Dólares (US$)</option>
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>BUSCAR PRODUCTO / CLIENTE</label>
                <input type="text" placeholder="Producto o cliente..." value={filtroPersona} onChange={e => setFiltroPersona(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
              </div>
            </>
          )}

          {/* Filtros exclusivos para PLAN DE COMPRAS */}
          {tipoReporte === 'compras' && (
            <>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>AÑO</label>
                <select value={anioActivoGantt} onChange={e => setAnioGantt(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                  {aniosGantt.length === 0 && <option value="">Sin datos</option>}
                  {aniosGantt.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>MÓDULO</label>
                <select value={filtroModulo} onChange={e => setFiltroModulo(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                  <option value="">Todos los módulos</option>
                  {modulosDisponibles.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>ÁREA</label>
                <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                  <option value="">Todas las áreas</option>
                  {areasDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>BUSCAR PRODUCTO / INSUMO</label>
                <input type="text" placeholder="Ej. Crisol, EPP..." value={filtroPersona} onChange={e => setFiltroPersona(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>DESDE (MES/FECHA)</label>
                <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>HASTA (MES/FECHA)</label>
                <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
              </div>
            </>
          )}

          {/* Filtros exclusivos para PLAN DE PRODUCCIÓN (solo costeos de cada centro) */}
          {tipoReporte === 'produccion' && (
            <>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>AÑO</label>
                <select value={anioActivoGantt} onChange={e => setAnioGantt(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                  {aniosGantt.length === 0 && <option value="">Sin datos</option>}
                  {aniosGantt.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>CENTRO DE PRODUCCIÓN</label>
                <select value={centroProduccion} onChange={e => setCentroProduccion(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                  <option value="">Todos los centros</option>
                  {centrosProduccionDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>BUSCAR PRODUCTO</label>
                <input type="text" placeholder="Ej. Crisol 40..." value={filtroPersona} onChange={e => setFiltroPersona(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
              </div>
            </>
          )}

          {/* Filtros de REPORTE GENERAL y GASTOS POR ÁREAS */}
          {(tipoReporte === 'general' || tipoReporte === 'gastos_areas') && (
            <>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>MÓDULO</label>
                <select value={filtroModulo} onChange={e => setFiltroModulo(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                  <option value="">Todos los módulos</option>
                  {modulosDisponibles.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>ÁREA</label>
                <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                  <option value="">Todas las áreas</option>
                  {areasDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>BUSCAR</label>
                <input type="text" placeholder="Concepto, cuenta o empleado..." value={filtroPersona} onChange={e => setFiltroPersona(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>DESDE (MES/FECHA)</label>
                <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>HASTA (MES/FECHA)</label>
                <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
              </div>
            </>
          )}

        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
          <button onClick={limpiarFiltros} style={{ background: 'transparent', color: '#ef4444', border: '1px solid #fca5a5', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
            ✖ Limpiar Filtros
          </button>
        </div>
      </div>

      {/* 1. REPORTE FORECAST DE VENTAS */}
      {tipoReporte === 'forecast' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', margin: 0 }}>📈 Forecast de Ventas {anioActivoGantt}</h3>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Cantidad esperada (cantidad × probabilidad) e ingreso en soles</span>
          </div>
          <ReporteGantt grupos={ganttForecast} etiquetaCantidad="Cantidad a vender" etiquetaMonto="Ingreso" colorBase="14, 165, 233" vacio="No hay forecast para los filtros seleccionados." />
        </div>
      )}

      {/* 2. REPORTE GASTOS POR ÁREAS */}
      {tipoReporte === 'gastos_areas' && (
        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>🏢 Resumen Consolidado de Gastos por Área (Haga clic en un área para ver sus módulos)</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Ordenar por:</label>
              <select value={ordenGastos.columna} onChange={e => setOrdenGastos({ ...ordenGastos, columna: e.target.value })} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                <option value="total">Costo / Gasto Total (S/)</option>
                <option value="area">Área Organizacional</option>
              </select>
              <button type="button" onClick={() => setOrdenGastos(prev => ({ ...prev, direccion: prev.direccion === 'asc' ? 'desc' : 'asc' }))} style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                {ordenGastos.direccion === 'asc' ? '⬆️ Ascendente' : '⬇️ Descendente'}
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead style={{ background: '#f1f5f9', color: '#475569', fontWeight: 700, borderBottom: '2px solid #cbd5e1' }}>
                <tr>
                  <th style={{ padding: '10px 12px' }}>ÁREA ORGANIZACIONAL / MÓDULOS</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>COSTO / GASTO TOTAL (S/)</th>
                </tr>
              </thead>
              <tbody>
                {resumenGastosAreas.length > 0 ? (
                  resumenGastosAreas.map((item, idx) => {
                    const estaExpandido = !!areasExpandidas[item.area];
                    return (
                      <React.Fragment key={idx}>
                        <tr 
                          onClick={() => toggleArea(item.area)}
                          style={{ borderBottom: '1px solid #e2e8f0', background: estaExpandido ? '#f8fafc' : 'white', cursor: 'pointer', transition: 'background 0.2s' }}
                          title="Haz clic para ver/ocultar los módulos de esta área"
                        >
                          <td style={{ padding: '12px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: '#2563eb' }}>{estaExpandido ? '▼' : '▶'}</span>
                            <span>{item.area}</span>
                            <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                              {item.modulos.length} módulo(s)
                            </span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace', color: '#166534', fontWeight: 800, fontSize: '14px' }}>
                            S/ {item.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>

                        {estaExpandido && item.modulos.map((mod, subIdx) => (
                          <tr key={`sub-${idx}-${subIdx}`} style={{ borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                            <td style={{ padding: '10px 12px 10px 36px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ color: '#cbd5e1' }}>└─</span>
                              <span style={{ background: '#eff6ff', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                                {mod.modulo}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#334155', fontWeight: 600 }}>
                              S/ {mod.monto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr><td colSpan="2" style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>No hay gastos registrados por área.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. REPORTE PLAN DE COMPRAS */}
      {tipoReporte === 'compras' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', margin: 0 }}>🛒 Plan de Compras {anioActivoGantt}</h3>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Ver:</span>
              {[['modulo', 'Por módulo de origen'], ['total', 'Totalizado por producto']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setModoCompras(id)} style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, background: modoCompras === id ? '#2563eb' : 'white', color: modoCompras === id ? 'white' : '#475569', border: modoCompras === id ? '1px solid #2563eb' : '1px solid #cbd5e1' }}>{label}</button>
              ))}
            </div>
          </div>
          <ReporteGantt grupos={ganttCompras} etiquetaCantidad="Cantidad a comprar" etiquetaMonto="Costo" colorBase="22, 163, 74" vacio="No hay compras para los filtros seleccionados." />
        </div>
      )}

      {/* 4. REPORTE PLAN DE PRODUCCIÓN */}
      {tipoReporte === 'produccion' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', margin: 0 }}>⚙️ Plan de Producción {anioActivoGantt} — {centroProduccion || 'Todos los centros'}</h3>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Cantidad a producir por producto y costo de producción (cantidad × costo unitario del costeo)</span>
          </div>
          <ReporteGantt grupos={ganttProduccion} etiquetaCantidad="Cantidad a producir" etiquetaMonto="Costo de producción" colorBase="234, 88, 12" vacio="No hay costeos de producción guardados para este centro y año." />
        </div>
      )}

      {/* 5. REPORTE GENERAL CONSOLIDADO (CON VISTA AGRUPADA Y DETALLADA) */}
      {tipoReporte === 'eerr' && (
        <EstadoResultados registrosTotales={registrosTotales} versiones={versionesDisponibles} idVersionFiltro={filtroVersion} />
      )}

      {tipoReporte === 'general' && (
        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          
          {/* BARRA SUPERIOR DE OPCIONES DE AGRUPACIÓN Y ORDENAMIENTO */}
          <div style={{ padding: '16px 20px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            
            {/* SELECTOR DE MODO DE AGRUPACIÓN */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Agrupar por:</span>
              {[
                { id: 'detallado', label: '📄 Detallado' },
                { id: 'empleado', label: '👤 Empleado' },
                { id: 'cuenta', label: '🔢 Cuenta Contable' },
                { id: 'area', label: '🏢 Área' },
                { id: 'modulo', label: '📦 Módulo' }
              ].map(agrup => (
                <button
                  key={agrup.id}
                  onClick={() => setModoAgrupacionGeneral(agrup.id)}
                  style={{
                    padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    background: modoAgrupacionGeneral === agrup.id ? '#eff6ff' : 'white',
                    color: modoAgrupacionGeneral === agrup.id ? '#1d4ed8' : '#475569',
                    border: modoAgrupacionGeneral === agrup.id ? '1px solid #2563eb' : '1px solid #cbd5e1'
                  }}
                >
                  {agrup.label}
                </button>
              ))}
            </div>

            {/* ORDENAMIENTO */}
            {modoAgrupacionGeneral === 'detallado' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Ordenar por:</label>
                <select value={ordenGeneral.columna} onChange={e => setOrdenGeneral({ ...ordenGeneral, columna: e.target.value })} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                  <option value="monto">Total (S/)</option>
                  <option value="fecha_proyeccion">Fecha</option>
                  <option value="modulo">Módulo</option>
                  <option value="area">Área</option>
                </select>
                <button type="button" onClick={() => setOrdenGeneral(prev => ({ ...prev, direccion: prev.direccion === 'asc' ? 'desc' : 'asc' }))} style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                  {ordenGeneral.direccion === 'asc' ? '⬆️ Ascendente' : '⬇️ Descendente'}
                </button>
              </div>
            )}
          </div>

          {/* VISTA AGRUPADA */}
          {modoAgrupacionGeneral !== 'detallado' ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead style={{ background: '#f1f5f9', color: '#475569', fontWeight: 700, borderBottom: '2px solid #cbd5e1' }}>
                  <tr>
                    <th style={{ padding: '12px 16px' }}>GRUPO ({modoAgrupacionGeneral.toUpperCase()})</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>CANT. REGISTROS</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>COSTO / TOTAL ACUMULADO (S/)</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenGeneralAgrupado.length > 0 ? (
                    resumenGeneralAgrupado.map((grupo, idx) => {
                      const estaExpandido = !!gruposGeneralesExpandidos[grupo.nombreGrupo];
                      return (
                        <React.Fragment key={idx}>
                          <tr 
                            onClick={() => toggleGrupoGeneral(grupo.nombreGrupo)}
                            style={{ borderBottom: '1px solid #e2e8f0', background: estaExpandido ? '#f8fafc' : 'white', cursor: 'pointer', transition: 'background 0.2s' }}
                            title="Haz clic para desplegar los registros detallados de este grupo"
                          >
                            <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '12px', color: '#2563eb' }}>{estaExpandido ? '▼' : '▶'}</span>
                              <span style={{ fontFamily: modoAgrupacionGeneral === 'cuenta' ? 'monospace' : 'inherit' }}>{grupo.nombreGrupo}</span>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
                                {grupo.registros.length} ítems
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: '#166534', fontWeight: 800, fontSize: '14px' }}>
                              S/ {grupo.totalMonto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>

                          {estaExpandido && (
                            <tr>
                              <td colSpan="3" style={{ padding: '0', background: '#fafafa', borderBottom: '2px solid #cbd5e1' }}>
                                <div style={{ padding: '12px 24px' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', background: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                    <thead style={{ background: '#f8fafc', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                                      <tr>
                                        <th style={{ padding: '8px 10px' }}>Versión</th>
                                        <th style={{ padding: '8px 10px' }}>Fecha</th>
                                        <th style={{ padding: '8px 10px' }}>Módulo</th>
                                        <th style={{ padding: '8px 10px' }}>Área</th>
                                        <th style={{ padding: '8px 10px' }}>Cuenta Contable</th>
                                        <th style={{ padding: '8px 10px' }}>Concepto / Empleado</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total (S/)</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {grupo.registros.map((reg, subIdx) => {
                                        const dc = reg.detalle_columnas || {};
                                        return (
                                          <tr key={`sub-gen-${subIdx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px 10px' }}>{reg.id_version ? reg.id_version.toUpperCase() : 'N/A'}</td>
                                            <td style={{ padding: '8px 10px' }}>{reg.fecha_proyeccion ? reg.fecha_proyeccion.split('-').reverse().join('/') : 'N/A'}</td>
                                            <td style={{ padding: '8px 10px' }}><span style={{ background: '#eff6ff', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>{reg.modulo || 'General'}</span></td>
                                            <td style={{ padding: '8px 10px' }}>{reg.area || dc.area || 'N/A'}</td>
                                            <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#475569' }}>{reg.cuentaContable}</td>
                                            <td style={{ padding: '8px 10px', fontWeight: 500 }}>{reg.empleado_nombre || dc.descripcion_activo || dc.descripcion_cuenta || 'N/A'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#166534', fontFamily: 'monospace' }}>
                                              {reg.montoCalculado.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <tr><td colSpan="3" style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>No se encontraron registros agrupados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* VISTA DETALLADA TRADICIONAL */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead style={{ background: '#f1f5f9', color: '#475569', fontWeight: 700, borderBottom: '2px solid #cbd5e1' }}>
                  <tr>
                    <th style={{ padding: '12px 16px' }}>VERSIÓN</th>
                    <th style={{ padding: '12px 16px' }}>FECHA APLIC.</th>
                    <th style={{ padding: '12px 16px' }}>MÓDULO</th>
                    <th style={{ padding: '12px 16px' }}>ÁREA</th>
                    <th style={{ padding: '12px 16px' }}>CUENTA CONTABLE</th>
                    <th style={{ padding: '12px 16px' }}>CONCEPTO / EMPLEADO</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>TOTAL (S/)</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosFiltrados.length > 0 ? (
                    registrosFiltrados.map((reg, index) => {
                      const dc = reg.detalle_columnas || {};
                      const cuenta = dc.cuenta_afectada || dc.numero_cuenta || (Array.isArray(reg.desglose_contable) && reg.desglose_contable.length > 0 ? reg.desglose_contable[0].cuenta : null) || 'S/C';
                      let monto = reg.modulo === 'Forecast de Ventas' ? parseFloat(reg.totales?.ingreso_total || dc.ingreso_total || 0) : parseFloat(reg.totales?.costo_total || dc.costo_total || 0);
                      
                      return (
                        <tr key={reg.id_registro || index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '12px 16px' }}><span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>{reg.id_version ? reg.id_version.toUpperCase() : 'N/A'}</span></td>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>{reg.fecha_proyeccion ? reg.fecha_proyeccion.split('-').reverse().join('/') : 'N/A'}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ background: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                              {reg.modulo || 'General'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>{reg.area || dc.area || 'N/A'}</td>
                          <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#475569', fontWeight: 'bold' }}>{cuenta}</td>
                          <td style={{ padding: '12px 16px', fontWeight: 500 }}>{reg.empleado_nombre || dc.descripcion_activo || dc.descripcion_cuenta || 'N/A'}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', color: '#166534', fontFamily: 'monospace' }}>
                            {monto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr><td colSpan="7" style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>No se encontraron registros con los filtros aplicados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

    </div>
  );
}