import React, { useState, useMemo } from 'react';
import { listarVersiones } from '../../data/store';

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

  // Estados de ordenamiento seguros
  const [ordenGeneral, setOrdenGeneral] = useState({ columna: 'fecha_proyeccion', direccion: 'asc' });
  const [ordenForecast, setOrdenForecast] = useState({ columna: 'ingresosTotal', direccion: 'desc' });
  const [ordenGastos, setOrdenGastos] = useState({ columna: 'total', direccion: 'desc' });
  const [ordenCompras, setOrdenCompras] = useState({ columna: 'fecha', direccion: 'asc' });
  const [ordenProduccion, setOrdenProduccion] = useState({ columna: 'fecha', direccion: 'asc' });

  const versionesDisponibles = useMemo(() => {
    try {
      return listarVersiones();
    } catch {
      return [];
    }
  }, []);

  const modulosDisponibles = useMemo(() => {
    const modulos = registrosTotales.map(r => r.modulo).filter(Boolean);
    return [...new Set(modulos)].sort();
  }, [registrosTotales]);

  const areasDisponibles = useMemo(() => {
    const areas = registrosTotales.map(r => r.area || r.detalle_columnas?.area).filter(Boolean);
    return [...new Set(areas)].sort();
  }, [registrosTotales]);

  const clientesDisponibles = useMemo(() => {
    const clientes = registrosTotales.map(r => r.detalle_columnas?.cliente).filter(Boolean);
    return [...new Set(clientes)].sort();
  }, [registrosTotales]);

  const vendedoresDisponibles = useMemo(() => {
    const vendedores = registrosTotales.map(r => r.detalle_columnas?.vendedor).filter(Boolean);
    return [...new Set(vendedores)].sort();
  }, [registrosTotales]);

  // Registros Filtrados y Ordenados de forma Segura
  const registrosFiltrados = useMemo(() => {
    const filtrados = registrosTotales.filter(reg => {
      const dc = reg.detalle_columnas || {};

      if (filtroVersion && reg.id_version !== filtroVersion) return false;
      if (filtroModulo && reg.modulo !== filtroModulo) return false;
      
      const areaReg = reg.area || dc.area || '';
      if (filtroArea && areaReg !== filtroArea) return false;

      const clienteReg = dc.cliente || '';
      if (filtroCliente && clienteReg !== filtroCliente) return false;

      const vendedorReg = dc.vendedor || '';
      if (filtroVendedor && vendedorReg !== filtroVendedor) return false;

      const monedaReg = dc.moneda || '';
      if (filtroMoneda && monedaReg !== filtroMoneda) return false;

      // Si estamos en Forecast o Compras, omitimos este filtro global de texto porque se procesa de forma específica en su propio useMemo
      if (tipoReporte !== 'forecast' && tipoReporte !== 'compras' && filtroPersona) {
        const nombre = (reg.empleado_nombre || dc.producto || '').toLowerCase();
        const dni = (reg.empleado_dni || '').toLowerCase();
        const busqueda = filtroPersona.toLowerCase();
        if (!nombre.includes(busqueda) && !dni.includes(busqueda)) return false;
      }

      // Filtro de fechas robusto con normalización de barras
      const fechaRegStr = reg.fecha_proyeccion;
      if (fechaRegStr) {
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
    });

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
  }, [registrosTotales, filtroVersion, filtroModulo, filtroArea, filtroPersona, fechaDesde, fechaHasta, filtroCliente, filtroVendedor, filtroMoneda, ordenGeneral, tipoReporte]);

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

  // 1. Forecast de Ventas por Producto y Moneda (Con soporte de búsqueda por texto integrado)
  const resumenForecast = useMemo(() => {
    const mapa = {};
    registrosFiltrados
      .filter(r => r.modulo === 'Forecast de Ventas')
      .forEach(reg => {
        const dc = reg.detalle_columnas || {};
        const prod = dc.producto || 'Sin Producto';
        const unidadNeg = dc.unidad_negocio || 'General';
        const um = dc.um || 'und';
        const moneda = dc.moneda || 'S/';
        
        const claveMapa = `${prod}_${moneda}`;
        const cantidadAnio = parseFloat(dc.cantidad_total_anio) || 0;
        const ingresos = parseFloat(reg.totales?.ingreso_total || dc.ingreso_total) || 0;
        const costos = parseFloat(reg.totales?.costo_total || dc.costo_total) || 0;
        const margen = parseFloat(reg.totales?.margen_bruto || dc.margen_bruto) || 0;

        if (!mapa[claveMapa]) {
          mapa[claveMapa] = { producto: prod, unidadNegocio: unidadNeg, um, moneda, cantidadTotal: 0, ingresosTotal: 0, costosTotal: 0, margenTotal: 0 };
        }
        mapa[claveMapa].cantidadTotal += cantidadAnio;
        mapa[claveMapa].ingresosTotal += ingresos;
        mapa[claveMapa].costosTotal += costos;
        mapa[claveMapa].margenTotal += margen;
      });

    let lista = Object.values(mapa);

    // Filtrar por texto escrito en BUSCAR PRODUCTO
    if (filtroPersona) {
      const queryBusqueda = filtroPersona.toLowerCase();
      lista = lista.filter(item => 
        item.producto.toLowerCase().includes(queryBusqueda) ||
        item.unidadNegocio.toLowerCase().includes(queryBusqueda)
      );
    }

    return lista.sort((a, b) => {
      let valA = a[ordenForecast.columna];
      let valB = b[ordenForecast.columna];

      if (typeof valA === 'number' && typeof valB === 'number') {
        return ordenForecast.direccion === 'asc' ? valA - valB : valB - valA;
      }

      valA = valA !== undefined && valA !== null ? String(valA).toLowerCase() : '';
      valB = valB !== undefined && valB !== null ? String(valB).toLowerCase() : '';

      if (valA < valB) return ordenForecast.direccion === 'asc' ? -1 : 1;
      if (valA > valB) return ordenForecast.direccion === 'asc' ? 1 : -1;
      return 0;
    });
  }, [registrosFiltrados, ordenForecast, filtroPersona]);

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
      'Envases y Embalajes',
      'Costeo de Crisoles',
      'Costeo de Fundente'
    ];

    const filasPlan = [];
    const mesesMap = { Ene: '01', Feb: '02', Mar: '03', Abr: '04', May: '05', Jun: '06', Jul: '07', Ago: '08', Set: '09', Oct: '10', Nov: '11', Dic: '12' };

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
      const anioReg = fechaBase.split('-')[0];
      const modulo = reg.modulo || 'General';
      const cuenta = dc.cuenta_afectada || dc.cuenta || dc.numero_cuenta || 'S/C';

      if (modulo === 'Costeo de Crisoles' || modulo === 'Costeo de Fundente') {
        const listaInsumos = [...(reg.materiales || []), ...(reg.suministros || [])];

        listaInsumos.forEach(item => {
          const nombreInsumo = item.insumo || 'Insumo Planta';
          const cuentaInsumo = item.cuenta || cuenta;
          const costoUnit = parseFloat(item.costoUnitario || item.valor || 0);

          if (item.cantidadesMeses && typeof item.cantidadesMeses === 'object') {
            Object.entries(item.cantidadesMeses).forEach(([mesStr, cantVal]) => {
              const cantidadMes = parseFloat(cantVal) || 0;
              if (cantidadMes > 0) {
                const numMes = mesesMap[mesStr] || '01';
                const fechaFila = `${anioReg}-${numMes}-01`;
                
                if (cumpleFiltroFecha(fechaFila)) {
                  const costoMes = cantidadMes * costoUnit;
                  filasPlan.push({
                    fecha: fechaFila,
                    modulo: `${modulo} (Insumo)`,
                    cuenta: cuentaInsumo,
                    producto: nombreInsumo.trim(),
                    cantidad: cantidadMes,
                    totalCosto: costoMes
                  });
                }
              }
            });
          } else {
            const cantidadTotalItem = parseFloat(item.cantidadTotal || item.valor || 1);
            if (cumpleFiltroFecha(fechaBase)) {
              filasPlan.push({
                fecha: fechaBase,
                modulo: `${modulo} (Insumo)`,
                cuenta: cuentaInsumo,
                producto: nombreInsumo.trim(),
                cantidad: cantidadTotalItem,
                totalCosto: cantidadTotalItem * costoUnit
              });
            }
          }
        });
      } 
      else if (modulo === 'Uniforme - EPPs' || modulo === 'Uniformes - EPPs') {
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
      else if (modulo === 'Forecast de Ventas' && dc.cantidades && typeof dc.cantidades === 'object') {
        const productoLimpio = dc.producto || 'Producto Forecast';
        const costoUni = parseFloat(dc.costo_unitario || dc.cv_2025) || 0;

        Object.entries(dc.cantidades).forEach(([mesStr, cantVal]) => {
          const cantidadMes = parseFloat(cantVal) || 0;
          if (cantidadMes > 0) {
            const numMes = mesesMap[mesStr] || '01';
            const fechaFila = `${anioReg}-${numMes}-01`;

            if (cumpleFiltroFecha(fechaFila)) {
              const costoMes = cantidadMes * costoUni;
              filasPlan.push({
                fecha: fechaFila,
                modulo: 'Forecast de Ventas (Demanda)',
                cuenta: 'Requerimiento de Producción/Compras',
                producto: productoLimpio.trim(),
                cantidad: cantidadMes,
                totalCosto: costoMes
              });
            }
          }
        });
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

  // 4. Plan de Producción
  const resumenProduccion = useMemo(() => {
    const modulosProd = ['Costeo de Crisoles', 'Costeo de Fundente'];
    let filtrados = registrosFiltrados.filter(r => modulosProd.includes(r.modulo));

    if (filtroPersona) {
      const queryBusqueda = filtroPersona.toLowerCase();
      filtrados = filtrados.filter(reg => {
        const dc = reg.detalle_columnas || {};
        const nombre = (reg.empleado_nombre || dc.detalle || '').toLowerCase();
        const cuenta = (dc.cuenta_afectada || dc.numero_cuenta || '').toLowerCase();
        return nombre.includes(queryBusqueda) || cuenta.includes(queryBusqueda);
      });
    }

    return filtrados.sort((a, b) => {
      let valA = a[ordenProduccion.columna];
      let valB = b[ordenProduccion.columna];

      if (ordenProduccion.columna === 'monto') {
        valA = parseFloat(a.totales?.costo_total || a.detalle_columnas?.costo_total || 0);
        valB = parseFloat(b.totales?.costo_total || b.detalle_columnas?.costo_total || 0);
        return ordenProduccion.direccion === 'asc' ? valA - valB : valB - valA;
      }

      valA = valA !== undefined && valA !== null ? String(valA).toLowerCase() : '';
      valB = valB !== undefined && valB !== null ? String(valB).toLowerCase() : '';

      if (valA < valB) return ordenProduccion.direccion === 'asc' ? -1 : 1;
      if (valA > valB) return ordenProduccion.direccion === 'asc' ? 1 : -1;
      return 0;
    });
  }, [registrosFiltrados, ordenProduccion, filtroPersona]);

  const granTotal = useMemo(() => {
    if (tipoReporte === 'forecast') {
      return resumenForecast.reduce((acc, i) => acc + i.ingresosTotal, 0);
    }
    if (tipoReporte === 'gastos_areas') {
      return resumenGastosAreas.reduce((acc, i) => acc + i.total, 0);
    }
    if (tipoReporte === 'compras') {
      return resumenPlanCompras.reduce((acc, i) => acc + i.totalCosto, 0);
    }
    if (tipoReporte === 'produccion') {
      return resumenProduccion.reduce((acc, reg) => {
        const dc = reg.detalle_columnas || {};
        return acc + parseFloat(reg.totales?.costo_total || dc.costo_total || 0);
      }, 0);
    }
    return registrosFiltrados.reduce((acc, reg) => {
      const dc = reg.detalle_columnas || {};
      const valor = reg.modulo === 'Forecast de Ventas'
        ? parseFloat(reg.totales?.ingreso_total || dc.ingreso_total || 0)
        : parseFloat(reg.totales?.costo_total || dc.costo_total || 0);
      return acc + valor;
    }, 0);
  }, [registrosFiltrados, tipoReporte, resumenForecast, resumenGastosAreas, resumenPlanCompras, resumenProduccion]);

  const limpiarFiltros = () => {
    setFiltroVersion('');
    setFiltroModulo('');
    setFiltroArea('');
    setFiltroPersona('');
    setFiltroCliente('');
    setFiltroVendedor('');
    setFiltroMoneda('');
    setFechaDesde('');
    setFechaHasta('');
  };

  const exportarAExcel = () => {
    let headers = [];
    let filas = [];
    let nombreReporte = tipoReporte;

    if (tipoReporte === 'forecast') {
      if (resumenForecast.length === 0) {
        alert('No hay registros de Forecast para exportar.');
        return;
      }
      headers = ['Unidad de Negocio', 'Producto', 'UM', 'Moneda', 'Cantidad Total', 'Ingresos', 'Costos', 'Margen Bruto'];
      filas = resumenForecast.map(item => {
        const pct = item.ingresosTotal > 0 ? ((item.margenTotal / item.ingresosTotal) * 100).toFixed(1) + '%' : '0%';
        return [
          `"${item.unidadNegocio}"`,
          `"${item.producto}"`,
          `"${item.um}"`,
          `"${item.moneda}"`,
          item.cantidadTotal,
          item.ingresosTotal.toFixed(2),
          item.costosTotal.toFixed(2),
          `"${item.margenTotal.toFixed(2)} (${pct})"`
        ].join(';');
      });
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
    else if (tipoReporte === 'compras') {
      if (resumenPlanCompras.length === 0) {
        alert('No hay registros en el Plan de Compras para exportar.');
        return;
      }
      headers = ['Fecha', 'Módulo de Origen', 'Cuenta Contable', 'Producto / Insumo', 'Cantidad Mensual', 'Costo / Valor Total (S/)'];
      filas = resumenPlanCompras.map(item => {
        return [
          `"${item.fecha}"`,
          `"${item.modulo}"`,
          `"${item.cuenta}"`,
          `"${item.producto}"`,
          item.cantidad,
          item.totalCosto.toFixed(2)
        ].join(';');
      });
    } 
    else if (tipoReporte === 'produccion') {
      if (resumenProduccion.length === 0) {
        alert('No hay registros en el Plan de Producción para exportar.');
        return;
      }
      headers = ['Fecha', 'Módulo', 'Área', 'Concepto / Cuenta', 'Total (S/)'];
      filas = resumenProduccion.map(reg => {
        const dc = reg.detalle_columnas || {};
        const cuenta = dc.cuenta_afectada || dc.numero_cuenta || 'S/C';
        const monto = parseFloat(reg.totales?.costo_total || dc.costo_total || 0);
        return [
          `"${reg.fecha_proyeccion || 'N/A'}"`,
          `"${reg.modulo || 'N/A'}"`,
          `"${reg.area || dc.area || 'N/A'}"`,
          `"${cuenta} - ${reg.empleado_nombre || dc.detalle || 'N/A'}"`,
          monto.toFixed(2)
        ].join(';');
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
          <button onClick={exportarAExcel} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
            📥 Descargar CSV / Excel
          </button>
          
          {tipoReporte === 'forecast' ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ background: '#dcfce7', padding: '10px 16px', borderRadius: '8px', border: '1px solid #bbf7d0', textAlign: 'right' }}>
                <div style={{ fontSize: '10px', color: '#166534', fontWeight: 'bold' }}>TOTAL SOLES (S/)</div>
                <div style={{ fontSize: '18px', color: '#15803d', fontWeight: 800 }}>
                  S/ {resumenForecast.filter(i => i.moneda === 'S/' || !i.moneda).reduce((acc, i) => acc + i.ingresosTotal, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div style={{ background: '#fef3c7', padding: '10px 16px', borderRadius: '8px', border: '1px solid #fde68a', textAlign: 'right' }}>
                <div style={{ fontSize: '10px', color: '#92400e', fontWeight: 'bold' }}>TOTAL DÓLARES (US$)</div>
                <div style={{ fontSize: '18px', color: '#b45309', fontWeight: 800 }}>
                  US$ {resumenForecast.filter(i => i.moneda === 'US$').reduce((acc, i) => acc + i.ingresosTotal, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: '#dcfce7', padding: '10px 20px', borderRadius: '8px', border: '1px solid #bbf7d0', textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#166534', fontWeight: 'bold' }}>TOTAL FILTRADO</div>
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
          { id: 'produccion', label: '⚙️ Plan de Producción' }
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
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>BUSCAR PRODUCTO</label>
                <input type="text" placeholder="Nombre de producto..." value={filtroPersona} onChange={e => setFiltroPersona(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
              </div>
            </>
          )}

          {/* Filtros exclusivos para PLAN DE COMPRAS */}
          {tipoReporte === 'compras' && (
            <>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>MÓDULO</label>
                <select value={filtroModulo} onChange={e => setFiltroModulo(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                  <option value="">Todos los módulos</option>
                  {modulosDisponibles.map(m => <option key={m} value={m}>{m}</option>)}
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

          {/* Filtros exclusivos para REPORTES OPERATIVOS Y GENERALES */}
          {tipoReporte !== 'forecast' && tipoReporte !== 'compras' && (
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
        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>📈 Consolidado de Forecast de Ventas por Producto</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Ordenar por:</label>
              <select value={ordenForecast.columna} onChange={e => setOrdenForecast({ ...ordenForecast, columna: e.target.value })} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                <option value="ingresosTotal">Ingresos</option>
                <option value="margenTotal">Margen Bruto</option>
                <option value="cantidadTotal">Cantidad Total</option>
                <option value="producto">Producto</option>
              </select>
              <button type="button" onClick={() => setOrdenForecast(prev => ({ ...prev, direccion: prev.direccion === 'asc' ? 'desc' : 'asc' }))} style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                {ordenForecast.direccion === 'asc' ? '⬆️ Ascendente' : '⬇️ Descendente'}
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead style={{ background: '#f1f5f9', color: '#475569', fontWeight: 700, borderBottom: '2px solid #cbd5e1' }}>
                <tr>
                  <th style={{ padding: '10px 12px' }}>UNIDAD DE NEGOCIO</th>
                  <th style={{ padding: '10px 12px' }}>PRODUCTO</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>UM</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>MONEDA</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>CANTIDAD TOTAL</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>INGRESOS</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>COSTOS</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>MARGEN BRUTO</th>
                </tr>
              </thead>
              <tbody>
                {resumenForecast.length > 0 ? (
                  resumenForecast.map((item, idx) => {
                    const pct = item.ingresosTotal > 0 ? (item.margenTotal / item.ingresosTotal) * 100 : 0;
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 12px' }}><span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>{item.unidadNegocio}</span></td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{item.producto}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b' }}>{item.um}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ background: item.moneda === 'US$' ? '#fef3c7' : '#e0f2fe', color: item.moneda === 'US$' ? '#92400e' : '#0369a1', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                            {item.moneda}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{item.cantidadTotal.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#166534', fontWeight: 700 }}>
                          {item.ingresosTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#991b1b' }}>
                          {item.costosTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#047857', fontWeight: 700 }}>
                          {item.margenTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span style={{ fontSize: '11px', color: '#64748b' }}>({pct.toFixed(1)}%)</span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr><td colSpan="8" style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>No hay datos de forecast registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
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
        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>🛒 Detalle Mensualizado del Plan de Compras e Insumos</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Ordenar por:</label>
              <select value={ordenCompras.columna} onChange={e => setOrdenCompras({ ...ordenCompras, columna: e.target.value })} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                <option value="totalCosto">Costo / Valor Total (S/)</option>
                <option value="fecha">Fecha</option>
                <option value="cantidad">Cantidad Mensual</option>
                <option value="producto">Producto / Insumo</option>
              </select>
              <button type="button" onClick={() => setOrdenCompras(prev => ({ ...prev, direccion: prev.direccion === 'asc' ? 'desc' : 'asc' }))} style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                {ordenCompras.direccion === 'asc' ? '⬆️ Ascendente' : '⬇️ Descendente'}
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead style={{ background: '#f1f5f9', color: '#475569', fontWeight: 700, borderBottom: '2px solid #cbd5e1' }}>
                <tr>
                  <th style={{ padding: '10px 12px' }}>FECHA</th>
                  <th style={{ padding: '10px 12px' }}>MÓDULO DE ORIGEN</th>
                  <th style={{ padding: '10px 12px' }}>CUENTA CONTABLE</th>
                  <th style={{ padding: '10px 12px' }}>PRODUCTO / INSUMO</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>CANTIDAD MENSUAL</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>COSTO / VALOR TOTAL (S/)</th>
                </tr>
              </thead>
              <tbody>
                {resumenPlanCompras.length > 0 ? (
                  resumenPlanCompras.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                        {item.fecha !== 'N/A' ? item.fecha.split('-').reverse().join('/') : 'N/A'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ background: '#eff6ff', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                          {item.modulo}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600, color: '#475569' }}>{item.cuenta}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>{item.producto}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                        {item.cantidad.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#166534' }}>
                        S/ {item.totalCosto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                      No se encontraron registros de compras, suministros o forecast vinculados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. REPORTE PLAN DE PRODUCCIÓN */}
      {tipoReporte === 'produccion' && (
        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>⚙️ Detalle del Plan de Producción y Costeos</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Ordenar por:</label>
              <select value={ordenProduccion.columna} onChange={e => setOrdenProduccion({ ...ordenProduccion, columna: e.target.value })} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}>
                <option value="monto">Total (S/)</option>
                <option value="fecha_proyeccion">Fecha</option>
                <option value="modulo">Módulo</option>
              </select>
              <button type="button" onClick={() => setOrdenProduccion(prev => ({ ...prev, direccion: prev.direccion === 'asc' ? 'desc' : 'asc' }))} style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                {ordenProduccion.direccion === 'asc' ? '⬆️ Ascendente' : '⬇️ Descendente'}
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead style={{ background: '#f1f5f9', color: '#475569', fontWeight: 700, borderBottom: '2px solid #cbd5e1' }}>
                <tr>
                  <th style={{ padding: '10px 12px' }}>FECHA</th>
                  <th style={{ padding: '10px 12px' }}>MÓDULO</th>
                  <th style={{ padding: '10px 12px' }}>ÁREA</th>
                  <th style={{ padding: '10px 12px' }}>CONCEPTO / CUENTA</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>TOTAL (S/)</th>
                </tr>
              </thead>
              <tbody>
                {resumenProduccion.length > 0 ? (
                  resumenProduccion.map((reg, idx) => {
                    const dc = reg.detalle_columnas || {};
                    const cuenta = dc.cuenta_afectada || dc.numero_cuenta || 'S/C';
                    const monto = parseFloat(reg.totales?.costo_total || dc.costo_total || 0);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 12px' }}>{reg.fecha_proyeccion}</td>
                        <td style={{ padding: '10px 12px' }}><span style={{ background: '#eff6ff', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>{reg.modulo}</span></td>
                        <td style={{ padding: '10px 12px' }}>{reg.area || dc.area}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{cuenta} - {reg.empleado_nombre || dc.detalle || 'N/A'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#166534' }}>S/ {monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr><td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>No se encontraron registros para este plan.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. REPORTE GENERAL CONSOLIDADO (CON VISTA AGRUPADA Y DETALLADA) */}
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