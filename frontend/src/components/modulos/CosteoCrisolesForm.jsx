import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { maestroForecastComercial, maestroCuentas, configModulos, MESES } from '../../config/data';
import { listarForecastComercial, listarRegistrosParaCosteo, guardarRegistrosLote, obtenerProductosOdoo, obtenerCuentasOdoo, obtenerFormulasOdoo, obtenerCostoEmbalajePorProducto } from '../../data/store';
import '../../index.css';

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS_DISPONIBLES = Array.from({ length: 5 }, (_, i) => (ANIO_ACTUAL - 1 + i).toString());
const MODULOS_EXCLUIDOS_DESTINO = ['Costeo de Crisoles', 'Costeo de Fundente', 'Forecast de Ventas'];
// Los insumos del costeo solo pueden ir a los módulos de producción.
const MODULOS_DESTINO_DISPONIBLES = ['Materias Primas', 'Materiales Auxiliares y Suministros', 'Envases y Embalajes'];
const CUENTA_MATERIA_PRIMA = '6121000 - Materias primas - Materias primas';
const CUENTA_ENVASES = '6141000 - Envases y embalajes - Envases';
// Cuenta FIJA según el módulo destino (no se asigna manualmente):
// envases -> 6141000; materias primas e insumos -> 6121000. Luego se antepone el prefijo del área.
const cuentaSegunModulo = (modulo) => (modulo === 'Envases y Embalajes' ? CUENTA_ENVASES : CUENTA_MATERIA_PRIMA);

// ==========================================
// HELPERS
// ==========================================

// Devuelve el número de v; usa `def` SOLO si está vacío o no es número.
// (Antes se usaba `parseFloat(x) || 100`, que convertía un 0% en 100%.)
const numOr = (v, def) => {
  if (v === '' || v === null || v === undefined) return def;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
};

// Porcentaje de asignación: vacío = 100%, pero 0 se respeta como 0%.
const pct100 = (v) => numOr(v, 100);

const normalizarTexto = (t) =>
  String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Crisoles usa Primer Proceso, Segundo Proceso y CIF.
// 'Granel' y 'Sachet' son de Fundente: se ignoran aquí.
// Cualquier otro valor (CIF o sin proceso) se trata como CIF.
const clasificarProceso = (proceso) => {
  const s = normalizarTexto(proceso).trim();
  if (s === 'primer proceso') return 'Primer Proceso';
  if (s === 'segundo proceso') return 'Segundo Proceso';
  if (s === 'granel' || s === 'sachet') return null;
  return 'CIF';
};

// Cuenta con prefijo 91: conserva los últimos 7 dígitos y antepone 91.
// (Antes '946261000' salía como '91946261000', con 11 dígitos.)
const formatearCuentaConPrefijo91 = (cuentaOriginal) => {
  if (!cuentaOriginal) return '91';
  const cuentaLimpia = cuentaOriginal.trim();
  const matchCodigo = cuentaLimpia.match(/^(\d+)/);
  const codigo = matchCodigo ? matchCodigo[1] : '';
  const resto = codigo ? cuentaLimpia.slice(codigo.length).trim() : cuentaLimpia;
  const base = codigo.length > 7 ? codigo.slice(-7) : codigo;
  return `91${base} ${resto}`.trim();
};

export default function CosteoCrisolesForm({ registro, onGuardar, onCancelar, modo, idVersion, area }) {
  const isSoloLectura = modo === 'ver';

  const forecastCrisoles = useMemo(() => {
    const real = listarForecastComercial(idVersion);
    return real.length > 0 ? real : maestroForecastComercial;
  }, [idVersion]);

  // 0. Base de datos local de Maestros
  const [productosBD, setProductosBD] = useState([]);
  const [cuentasBD, setCuentasBD] = useState([]);
  const [formulasBD, setFormulasBD] = useState([]);

  useEffect(() => {
    let activo = true;
    async function cargarMaestros() {
      try {
        const prodRes = await obtenerProductosOdoo();
        if (activo && Array.isArray(prodRes)) setProductosBD(prodRes);

        const resCuentas = await obtenerCuentasOdoo();
        if (activo && Array.isArray(resCuentas)) {
          setCuentasBD(resCuentas);
        }

        if (typeof obtenerFormulasOdoo === 'function') {
          const formRes = await obtenerFormulasOdoo();
          if (activo && Array.isArray(formRes)) setFormulasBD(formRes);
        }
      } catch (e) {
        console.error("Error cargando maestros de BD local", e);
      }
    }
    cargarMaestros();
    return () => { activo = false; };
  }, []);

  // Filtrado ESTRICTO de productos por categoría para cada proceso
  const { insumosP1, insumosP2 } = useMemo(() => {
    const p1 = [];
    const p2 = [];
    productosBD.forEach(p => {
      const cat = String(p.categoria || p.categ_id || p.tipo || '').toLowerCase();
      
      const esProceso1 = (cat.includes('materia prima') || cat.includes('insumo')) 
                         && !cat.includes('aseo') 
                         && !cat.includes('limpieza') 
                         && !cat.includes('oficina');
                         
      const esProceso2 = cat.includes('suministro') || 
                         cat.includes('envase') || 
                         cat.includes('embalaje') || 
                         cat.includes('repuesto');

      if (esProceso1) p1.push(p);
      else if (esProceso2) p2.push(p);
    });
    return { insumosP1: p1, insumosP2: p2 };
  }, [productosBD]);

  // 1. Estados Generales
  const [anioSel, setAnioSel] = useState(ANIO_ACTUAL.toString());
  const [capacidadMaximaP2, setCapacidadMaximaP2] = useState('50000');
  const [productosBase, setProductosBase] = useState([]);

  const [isPrinting, setIsPrinting] = useState(false);

  // --- ESTADOS PARA LOS BUSCADORES FLOTANTES (Insumos y Cuentas) ---
  const [filaInsumoAbierta, setFilaInsumoAbierta] = useState(null);
  const [filaCuentaAbierta, setFilaCuentaAbierta] = useState(null);
  // Buscador de lista de materiales (BOM): producto cuyo buscador está abierto y texto escrito
  const [bomAbierto, setBomAbierto] = useState(null);
  const [bomBusqueda, setBomBusqueda] = useState('');

  useEffect(() => {
    if (!bomAbierto) return;
    const handleClickFueraBom = (event) => {
      if (!event.target.closest('[data-dropdown-bom]')) setBomAbierto(null);
    };
    document.addEventListener('mousedown', handleClickFueraBom);
    return () => document.removeEventListener('mousedown', handleClickFueraBom);
  }, [bomAbierto]);
  const [detallesComercialesPorProducto, setDetallesComercialesPorProducto] = useState({});

  useEffect(() => {
    const handleClickFuera = (event) => {
      if (filaInsumoAbierta && !event.target.closest(`[data-dropdown-row="${filaInsumoAbierta}"]`)) {
        setFilaInsumoAbierta(null);
      }
      if (filaCuentaAbierta && !event.target.closest(`[data-dropdown-cuenta="${filaCuentaAbierta}"]`)) {
        setFilaCuentaAbierta(null);
      }
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, [filaInsumoAbierta, filaCuentaAbierta]);

  const obtenerInsumosFiltrados = (lista, query) => {
    const q = (query || '').trim().toLowerCase();
    if (q.length < 1) return lista.slice(0, 30);
    return lista.filter(p => (p.nombre || p.descripcion || '').toLowerCase().includes(q)).slice(0, 30);
  };

  const obtenerCuentasFiltradas = (lista, query) => {
    // Solo cuentas de clase 6
    const cuentasClase6 = lista.filter(c => String(c.codigo || '').startsWith('6'));
    const q = (query || '').trim().toLowerCase();
    if (q.length < 1) return cuentasClase6.slice(0, 30);
    
    return cuentasClase6.filter(c => 
      String(c.nombre || '').toLowerCase().includes(q) || 
      String(c.codigo || '').toLowerCase().includes(q)
    ).slice(0, 30);
  };

  /**
   * Extrae el factor de conversión según el texto de la unidad de medida (ej. "Bx" = 25, "Bx 50 unid" = 50)
   */
  const obtenerFactorPorUnidad = (unidadMedida) => {
    if (!unidadMedida) return 1;
    const u = unidadMedida.toLowerCase().trim();

    if (u === 'bx' || u === 'box' || u === 'caja') {
      return 25;
    }

    const matchNumero = u.match(/(\d+)/);
    if (matchNumero) {
      return parseInt(matchNumero[1], 10);
    }

    return 1;
  };

  // Multi-producto (Checklist y configuración individual por producto)
  const [productosSeleccionados, setProductosSeleccionados] = useState([]);
  const [configProductos, setConfigProductos] = useState({}); 
  const [productoTabActivo, setProductoTabActivo] = useState('');

  // 2. Listas de Insumos con soporte de porcentaje de asignación mensual
  const [materiales, setMateriales] = useState([]);

  const [suministros, setSuministros] = useState([{ 
    id: 's1', 
    productoAsociado: '', 
    insumo: '', 
    cuenta: '', 
    moduloDestino: 'Envases y Embalajes', 
    udm: 'kg', 
    modoCalculoP2: 'ratio', 
    valor: '0', 
    montoManualMeses: MESES.reduce((acc, m) => ({ ...acc, [m]: '0' }), {}), 
    porcentajeAsignacionMeses: MESES.reduce((acc, m) => ({ ...acc, [m]: '100' }), {}), 
    costoUnitario: '0', 
    usarParticipacion: false 
  }]);
  
  // 3. Módulos dinámicos por proceso
  const [modulosP1, setModulosP1] = useState([]);
  const [modulosP2, setModulosP2] = useState([]);
  const [modulosCIF, setModulosCIF] = useState([]);

  function _crearItemVacio(tipo = 'insumo', esProceso2 = false, prodAsociado = '') {
      const id = String(Date.now() + Math.random());
      if (tipo === 'modulo') {
        return { id, moduloNombre: '', porcentajesMes: MESES.reduce((acc, m) => ({ ...acc, [m]: '100' }), {}), usarParticipacion: false };
      }
      if (esProceso2) {
        return { 
          id, productoAsociado: prodAsociado, insumo: '', cuenta: '', moduloDestino: 'Envases y Embalajes', 
          udm: 'unidad', modoCalculoP2: 'ratio', valor: '0', 
          formato: 'granel', 
          montoManualMeses: MESES.reduce((acc, m) => ({ ...acc, [m]: '0' }), {}), 
          porcentajeAsignacionMeses: MESES.reduce((acc, m) => ({ ...acc, [m]: '100' }), {}), 
          costoUnitario: '0', usarParticipacion: false 
        };
      }
      return { 
        id, productoAsociado: prodAsociado, insumo: '', cuenta: '', moduloDestino: 'Materias Primas', 
        udm: 'kg', tipoCalculo: 'ratio', valor: '0', 
        porcentajeAsignacionMeses: MESES.reduce((acc, m) => ({ ...acc, [m]: '100' }), {}), 
        costoUnitario: '0', usarParticipacion: false 
      };
    }

  // Lista de materiales (BOM): ya NO se asigna automáticamente al marcar un producto.
  // El usuario elige en el selector de cada producto qué lista de materiales usar.
  const nombreFormula = (f) => String(f.producto_terminado || f.nombre_producto || f.producto || '').trim();
  const idDeFormula = (f) => String(f.id ?? f.bom_id ?? f.codigo_formula ?? f.codigo ?? '');

  // Listas cuyo producto coincide con el producto costeado van primero; el resto se ofrece aparte.
  const formulasParaProducto = (nombreProducto) => {
    const prodLimpio = String(nombreProducto || '').trim().toLowerCase();
    const sugeridas = [];
    const otras = [];
    formulasBD.forEach(f => {
      const nombreEnBd = nombreFormula(f).toLowerCase();
      const coincide = nombreEnBd && (nombreEnBd === prodLimpio || prodLimpio.includes(nombreEnBd) || nombreEnBd.includes(prodLimpio));
      (coincide ? sugeridas : otras).push(f);
    });
    return { sugeridas, otras };
  };

  const materialesDesdeFormula = (nombreProducto, formula) => {
    const insumos = Array.isArray(formula?.materia_prima) ? formula.materia_prima : [];
    const codigoBOM = formula.codigo_formula || formula.codigo || formula.bom_id || 'BOM';
    // La cantidad de la BOM es para `cantidad_base` unidades: el ratio es por 1 unidad producida.
    const cantidadBase = parseFloat(formula.cantidad_base) > 0 ? parseFloat(formula.cantidad_base) : 1;

    return insumos.map((ins, idx) => {
      const nombreInsumo = Array.isArray(ins.insumo) ? String(ins.insumo[1]) : String(ins.insumo || ins.nombre || 'Insumo');
      const insumoLimpio = nombreInsumo.trim().toLowerCase();

      const productoEnMaestro = productosBD.find(p => {
        const pNombre = String(p.nombre || p.descripcion || '').trim().toLowerCase();
        return pNombre === insumoLimpio || pNombre.includes(insumoLimpio) || insumoLimpio.includes(pNombre);
      });

      const costoMaestro = productoEnMaestro ? (parseFloat(productoEnMaestro.costo) > 0 ? parseFloat(productoEnMaestro.costo) : parseFloat(productoEnMaestro.precio_venta) || 0) : 0;
      const costoDeFormula = parseFloat(ins.costo_estandar || ins.costo || ins.costo_unitario || 0);
      const costoFinal = costoDeFormula > 0 ? costoDeFormula : costoMaestro;
      const cantidad = parseFloat(ins.cantidad_por_unidad || ins.cantidad || 0) || 0;

      return {
        id: `bom-${Date.now()}-${idx}-${Math.random()}`,
        productoAsociado: nombreProducto,
        idFormula: idDeFormula(formula),
        codigoFormula: codigoBOM,
        insumo: nombreInsumo,
        cuenta: '',
        moduloDestino: 'Materias Primas',
        udm: String(ins.unidad_medida || ins.unidad || 'kg'),
        tipoCalculo: 'ratio',
        valor: String(+(cantidad / cantidadBase).toFixed(6)),
        porcentajeAsignacionMeses: MESES.reduce((acc, m) => ({ ...acc, [m]: '100' }), {}),
        costoUnitario: costoFinal > 0 ? costoFinal.toFixed(4) : '0',
        usarParticipacion: false
      };
    });
  };

  // Lista elegida para un producto (se deduce de sus materiales cargados)
  const formulaSeleccionadaDe = (nombreProducto) => {
    const item = materiales.find(m => m.productoAsociado === nombreProducto && (m.idFormula || m.codigoFormula));
    if (!item) return '';
    if (item.idFormula) return item.idFormula;
    const f = formulasBD.find(x => (x.codigo_formula || x.codigo) === item.codigoFormula);
    return f ? idDeFormula(f) : '';
  };

  // Cambiar la lista reemplaza los materiales que venían de una BOM (y filas vacías);
  // los insumos agregados manualmente se conservan.
  const seleccionarFormula = (nombreProducto, idFormula) => {
    const formula = formulasBD.find(f => idDeFormula(f) === idFormula);
    setMateriales(prev => {
      const resto = prev.filter(m => !(m.productoAsociado === nombreProducto && (m.idFormula || m.codigoFormula || !m.insumo)));
      const nuevos = formula ? materialesDesdeFormula(nombreProducto, formula) : [];
      const quedanDelProducto = resto.some(m => m.productoAsociado === nombreProducto);
      if (nuevos.length === 0 && !quedanDelProducto) nuevos.push(_crearItemVacio('insumo', false, nombreProducto));
      return [...resto, ...nuevos];
    });
  };

  const adaptarModulosLegacy = (lista) => (lista || []).map(item => ({
    ...item,
    porcentajesMes: item.porcentajesMes || MESES.reduce((acc, m) => ({ ...acc, [m]: item.porcentaje ?? '100' }), {}),
    usarParticipacion: item.usarParticipacion || false
  }));

  // Carga inicial
  useEffect(() => {
    if (registro) {
      const dc = registro.detalle_columnas || {};
      setAnioSel(dc.anio_proyeccion?.toString() || ANIO_ACTUAL.toString());
      if (dc.capacidad_maxima_p2) setCapacidadMaximaP2(dc.capacidad_maxima_p2.toString());
      if (dc.productos_base) setProductosBase(dc.productos_base);

      const productoUnico = dc.producto || (Array.isArray(dc.productos_seleccionados) ? dc.productos_seleccionados[0] : null);
      
      if (productoUnico) {
        setProductosSeleccionados([productoUnico]);
        setProductoTabActivo(productoUnico);
        
        const margenReg = dc.margen_produccion?.toString() || '0';
        const cantsReg = dc.cantidades_comercial || dc.cantidades || MESES.reduce((acc, m) => ({ ...acc, [m]: '0' }), {});
        
        setConfigProductos({
          [productoUnico]: {
            margen: margenReg,
            cantidades: cantsReg
          }
        });
      } else if (dc.productos_seleccionados) {
        setProductosSeleccionados(dc.productos_seleccionados);
        if (dc.productos_seleccionados.length > 0) setProductoTabActivo(dc.productos_seleccionados[0]);
        if (dc.config_productos) setConfigProductos(dc.config_productos);
      }

      const adaptarLegacyInsumos = (lista, moduloDestinoDefault) => (lista || []).map(item => ({
        ...item,
        productoAsociado: item.productoAsociado || '',
        porcentajeAsignacionMeses: item.porcentajeAsignacionMeses || MESES.reduce((acc, m) => ({ ...acc, [m]: item.porcentajeUso ?? '100' }), {}),
        modoCalculoP2: item.modoCalculoP2 || 'ratio',
        montoManualMeses: item.montoManualMeses || MESES.reduce((acc, m) => ({ ...acc, [m]: '0' }), {}),
        valor: item.valor || '0',
        usarParticipacion: item.usarParticipacion || false,
        cuenta: item.cuenta || '',
        moduloDestino: item.moduloDestino || moduloDestinoDefault
      }));

      const filtrarInsumosPorProducto = (listaInsumos, moduloDefault) => {
        if (!productoUnico) return adaptarLegacyInsumos(listaInsumos, moduloDefault);
        return adaptarLegacyInsumos(listaInsumos, moduloDefault).filter(item => !item.productoAsociado || item.productoAsociado === productoUnico);
      };

      if (dc.materiales && Array.isArray(dc.materiales)) setMateriales(filtrarInsumosPorProducto(dc.materiales, 'Materias Primas'));
      if (dc.suministros && Array.isArray(dc.suministros)) setSuministros(filtrarInsumosPorProducto(dc.suministros, 'Envases y Embalajes'));
      if (dc.modulosP1) setModulosP1(adaptarModulosLegacy(dc.modulosP1));
      if (dc.modulosP2) setModulosP2(adaptarModulosLegacy(dc.modulosP2));
      if (dc.modulosCIF) setModulosCIF(adaptarModulosLegacy(dc.modulosCIF));
    }
  }, [registro]);

  // FILTRADO DE FORECAST (por categoría/nombre y año seleccionado)
  const productosAgrupados = useMemo(() => {
    const mapa = new Map();
    const anioTarget = String(anioSel).trim();

    forecastCrisoles.forEach(reg => {
      const dc = reg.detalle_columnas || reg;
      const rawDate = String(dc.anio_proyeccion || reg.fecha_proyeccion || reg.fecha || ANIO_ACTUAL);
      const anioReg = (rawDate.match(/\b(20\d{2})\b/) || [null, ANIO_ACTUAL])[1];

      if (anioReg !== anioTarget) return;

      const categoriaProd = String(dc.categoria || reg.categoria || '').toLowerCase().trim();
      const nombreProd = String(dc.producto || '').toLowerCase().trim();
      
      const esApto = String(dc.unidad_negocio || '').toLowerCase().trim() === 'crisoles de arcilla';
      
      if (dc.producto && esApto && !mapa.has(dc.producto)) {
        mapa.set(dc.producto, { producto: dc.producto });
      }
    });
    return Array.from(mapa.values());
  }, [forecastCrisoles, anioSel]);

  useEffect(() => {
    if (productosSeleccionados.length > 0 && !registro) {
      const anioTarget = String(anioSel).trim();
      const nuevaConfig = { ...configProductos };
      const nuevosDetalles = { ...detallesComercialesPorProducto };

      productosSeleccionados.forEach(nombreProd => {
        const registrosDelProd = forecastCrisoles.filter(r => {
          const dc = r.detalle_columnas || r;
          const rawDate = String(dc.anio_proyeccion || r.fecha_proyeccion || r.fecha || ANIO_ACTUAL);
          const anioReg = (rawDate.match(/\b(20\d{2})\b/) || [null, ANIO_ACTUAL])[1];
          return String(dc.producto || '').trim().toLowerCase() === nombreProd.toLowerCase() && anioReg === anioTarget;
        });

        const sumas = MESES.reduce((acc, m) => ({ ...acc, [m]: 0 }), {});
        const detallesComerciales = MESES.reduce((acc, m) => ({ ...acc, [m]: [] }), {});
        
        registrosDelProd.forEach(reg => {
          const dc = reg.detalle_columnas || reg;
          let cants = dc.cantidades;
          if (typeof cants === 'string') { try { cants = JSON.parse(cants); } catch(e) {} }

          const unidadComercial = dc.um || dc.unidad_medida || dc.unid_med || dc.unidad || 'Unidad';
          const factorConversion = obtenerFactorPorUnidad(unidadComercial);

          if (cants && typeof cants === 'object') {
            MESES.forEach(m => {
              const cantidadComercial = parseFloat(cants[m]) || 0;
              if (cantidadComercial > 0) {
                const cantidadBase = cantidadComercial * factorConversion;
                sumas[m] += cantidadBase;
                detallesComerciales[m].push(`${cantidadComercial} ${unidadComercial} (= ${cantidadBase.toLocaleString()} und)`);
              }
            });
          }
        });

        nuevosDetalles[nombreProd] = detallesComerciales;

        if (!nuevaConfig[nombreProd] || registro) {
          nuevaConfig[nombreProd] = {
            margen: nuevaConfig[nombreProd]?.margen || '0',
            cantidades: MESES.reduce((acc, m) => ({ ...acc, [m]: sumas[m].toString() }), {})
          };
        }
      });
      setConfigProductos(nuevaConfig);
      setDetallesComercialesPorProducto(nuevosDetalles);
    }
  }, [anioSel, forecastCrisoles, productosSeleccionados]);

  const handleToggleProducto = (nombreProd) => {
    let nuevosSel = [...productosSeleccionados];
    const nuevaConfig = { ...configProductos };

    if (nuevosSel.includes(nombreProd)) {
      nuevosSel = nuevosSel.filter(p => p !== nombreProd);
      delete nuevaConfig[nombreProd];
      setMateriales(prev => prev.filter(m => m.productoAsociado !== nombreProd));
    } else {
      nuevosSel.push(nombreProd);

      // Sin autocarga: se agrega una fila vacía y el usuario elige la lista de materiales en el selector.
      setMateriales(prev => [...prev, _crearItemVacio('insumo', false, nombreProd)]);

      const anioTarget = String(anioSel).trim();
      const registrosDelProd = forecastCrisoles.filter(r => {
        const dc = r.detalle_columnas || r;
        const rawDate = String(dc.anio_proyeccion || r.fecha_proyeccion || r.fecha || ANIO_ACTUAL);
        const anioReg = (rawDate.match(/\b(20\d{2})\b/) || [null, ANIO_ACTUAL])[1];
        return String(dc.producto || '').trim().toLowerCase() === nombreProd.toLowerCase() && anioReg === anioTarget;
      });

      const sumas = MESES.reduce((acc, m) => ({ ...acc, [m]: 0 }), {});
      registrosDelProd.forEach(reg => {
        const dc = reg.detalle_columnas || reg;
        let cants = dc.cantidades;
        if (typeof cants === 'string') { try { cants = JSON.parse(cants); } catch(e) {} }

        const unidadComercial = dc.um || dc.unidad_medida || dc.unid_med || dc.unidad || 'Unidad';
        const factorConversion = obtenerFactorPorUnidad(unidadComercial);

        if (cants && typeof cants === 'object') {
          MESES.forEach(m => { 
            sumas[m] += (parseFloat(cants[m]) || 0) * factorConversion; 
          });
        }
      });
      nuevaConfig[nombreProd] = {
        margen: '0',
        cantidades: MESES.reduce((acc, m) => ({ ...acc, [m]: sumas[m].toString() }), {})
      };
    }

    setProductosSeleccionados(nuevosSel);
    setConfigProductos(nuevaConfig);
    if (!productoTabActivo && nuevosSel.length > 0) {
      setProductoTabActivo(nuevosSel[0]);
    } else if (nuevosSel.length === 0) {
      setProductoTabActivo('');
    }
  };

  const calcularProdPorProducto = (prodName) => {
    const conf = configProductos[prodName] || { margen: '0', cantidades: MESES.reduce((acc, m) => ({ ...acc, [m]: '0' }), {}) };
    const margen = parseFloat(conf.margen) || 0;
    return MESES.reduce((acc, m) => {
      const com = parseFloat(conf.cantidades?.[m]) || 0;
      acc[m] = Math.ceil(com * (1 + (margen / 100)));
      return acc;
    }, {});
  };

  const cantidadesProduccionTotal = useMemo(() => {
    const totales = MESES.reduce((acc, m) => ({ ...acc, [m]: 0 }), {});
    productosSeleccionados.forEach(prod => {
      const prodCants = calcularProdPorProducto(prod);
      MESES.forEach(m => { totales[m] += prodCants[m]; });
    });
    return totales;
  }, [productosSeleccionados, configProductos]);

  const cantidadTotalProduccionAnio = useMemo(() => MESES.reduce((acc, m) => acc + cantidadesProduccionTotal[m], 0), [cantidadesProduccionTotal]);

  const analisisCapacidadP2 = useMemo(() => {
    const maxCap = parseFloat(capacidadMaximaP2) || 0;
    const resultado = {};
    MESES.forEach(m => {
      const prodTotal = cantidadesProduccionTotal[m] || 0;
      const saturado = maxCap > 0 && prodTotal > maxCap;
      const prodEfectivaP2 = maxCap > 0 ? Math.min(prodTotal, maxCap) : prodTotal;
      const tandas = maxCap > 0 ? Math.ceil(prodTotal / maxCap) : 1;
      
      resultado[m] = { prod: prodTotal, prodEfectivaP2, maxCap, saturado, tandas };
    });
    return resultado;
  }, [cantidadesProduccionTotal, capacidadMaximaP2]);

  const calculoBaseDetallado = useMemo(() => {
    const totalesBaseComercial = MESES.reduce((acc, m) => ({ ...acc, [m]: 0 }), {});
    const anioTarget = String(anioSel).trim();

    productosBase.forEach(prodNombre => {
      const registrosDelProd = forecastCrisoles.filter(r => {
        const dc = r.detalle_columnas || r;
        const rawDate = String(dc.anio_proyeccion || r.fecha_proyeccion || r.fecha || ANIO_ACTUAL);
        const anioReg = (rawDate.match(/\b(20\d{2})\b/) || [null, ANIO_ACTUAL])[1];
        return String(dc.producto || '').trim().toLowerCase() === prodNombre.toLowerCase() && anioReg === anioTarget;
      });

      registrosDelProd.forEach(reg => {
        const dc = reg.detalle_columnas || reg;
        let cants = dc.cantidades;
        if (typeof cants === 'string') { try { cants = JSON.parse(cants); } catch (e) {} }

        const unidadComercial = dc.um || dc.unidad_medida || dc.unid_med || dc.unidad || 'Unidad';
        const factorConversion = obtenerFactorPorUnidad(unidadComercial);

        if (cants && typeof cants === 'object') {
          MESES.forEach(m => {
            const cantidadComercial = parseFloat(cants[m]) || 0;
            if (cantidadComercial > 0) {
              totalesBaseComercial[m] += cantidadComercial * factorConversion;
            }
          });
        }
      });
    });

    const porcentajesPorProducto = {};
    productosBase.forEach(prodNombre => {
      const conf = configProductos[prodNombre] || { cantidades: MESES.reduce((acc, m) => ({ ...acc, [m]: '0' }), {}) };
      const comProd = conf.cantidades || {};

      porcentajesPorProducto[prodNombre] = MESES.reduce((acc, m) => {
        const cantComercialProd = parseFloat(comProd[m]) || 0;
        const baseMes = totalesBaseComercial[m];
        acc[m] = baseMes > 0 ? ((cantComercialProd / baseMes) * 100).toFixed(2) : '0.00';
        return acc;
      }, {});
    });

    return { totalesBaseComercial, porcentajesPorProducto };
  }, [productosBase, forecastCrisoles, anioSel, configProductos]);

  const calculoBaseGlobal = useMemo(() => {
    const porcentajes = MESES.reduce((acc, m) => {
      const baseMes = calculoBaseDetallado.totalesBaseComercial[m];
      let sumaSel = 0;
      productosSeleccionados.forEach(p => {
        sumaSel += parseFloat(configProductos[p]?.cantidades?.[m] || 0);
      });
      acc[m] = baseMes > 0 ? ((sumaSel / baseMes) * 100).toFixed(2) : '0.00';
      return acc;
    }, {});
    return { totalesBase: calculoBaseDetallado.totalesBaseComercial, porcentajes };
  }, [calculoBaseDetallado, productosSeleccionados, configProductos]);

  const obtenerPorcentajesParticipacionProd = (prodName) => {
    return calculoBaseDetallado.porcentajesPorProducto[prodName] || MESES.reduce((acc, m) => ({ ...acc, [m]: '0.00' }), {});
  };

  const embalajePorProducto = useMemo(
    () => obtenerCostoEmbalajePorProducto({ idVersion, anio: anioSel, unidadNegocio: 'Crisoles de Arcilla' }),
    [idVersion, anioSel]
  );

  // Costos mensuales de los módulos (remuneraciones y otros) agrupados por etapa
  const agrupadosBD = useMemo(() => {
    const estructura = { 'Primer Proceso': {}, 'Segundo Proceso': {}, 'CIF': {} };
    if (idVersion && area) {
      const registrosArea = listarRegistrosParaCosteo({ idVersion, area });
      registrosArea.forEach(reg => {
        const dc = reg.detalle_columnas || {};
        if (dc.es_derivado) return;   // costos que generó el propio costeo (MP y envases)

        const nombreModulo = reg.modulo || dc.modulo || reg.categoria || 'Otros';
        if (MODULOS_EXCLUIDOS_DESTINO.includes(nombreModulo)) return;
        
        const anioReg = reg.fecha_proyeccion ? reg.fecha_proyeccion.split('-')[0] : null;
        if (anioReg && anioSel && anioReg !== anioSel) return;

        const procKey = clasificarProceso(dc.proceso);
        if (!procKey) return;   // Granel / Sachet son de Fundente

        if (!estructura[procKey][nombreModulo]) {
          estructura[procKey][nombreModulo] = MESES.reduce((acc, m) => ({ ...acc, [m]: 0 }), {});
        }
        const baseMeses = dc.costos_mensuales || dc.totales_mes || (typeof dc.cantidades === 'object' ? dc.cantidades : null);
        const costoUnico = parseFloat(reg.totales?.costo_total || dc.costo_total || dc.total || dc.monto || dc.sueldo_mensual || dc.costo || 0);

        if (baseMeses && typeof baseMeses === 'object') {
          MESES.forEach(m => { estructura[procKey][nombreModulo][m] += (parseFloat(baseMeses[m]) || 0); });
        } else if (reg.fecha_proyeccion) {
          const mesIndex = parseInt(reg.fecha_proyeccion.split('-')[1], 10) - 1;
          if (mesIndex >= 0 && mesIndex < 12) {
            estructura[procKey][nombreModulo][MESES[mesIndex]] += costoUnico;
          }
        }
      });
    }

    // Solo se retienen los módulos con al menos un mes con monto mayor a 0
    Object.keys(estructura).forEach(k => {
      Object.keys(estructura[k]).forEach(mod => {
        const tieneMontos = Object.values(estructura[k][mod]).some(val => val > 0);
        if (!tieneMontos) delete estructura[k][mod];
      });
    });

    return estructura;
  }, [idVersion, area, anioSel]);

  // Monto anual que cada módulo aporta a este costeo (antes de repartir entre productos)
  const calcularModulos = (listaAsignaciones, procKey) => {
    let totalAsignadoAnual = 0;
    const calculados = listaAsignaciones.map(item => {
      const dbMeses = agrupadosBD[procKey][item.moduloNombre] || MESES.reduce((acc, m) => ({ ...acc, [m]: 0 }), {});
      const pctMeses = item.porcentajesMes || MESES.reduce((acc, m) => ({ ...acc, [m]: '100' }), {});
      let costoAsignadoAnual = 0;
      const mesesAsignados = {};
      MESES.forEach(m => {
        const pctMes = item.usarParticipacion ? (parseFloat(calculoBaseGlobal.porcentajes[m]) || 0) : pct100(pctMeses[m]);
        const asig = (dbMeses[m] || 0) * (pctMes / 100);
        mesesAsignados[m] = asig;
        costoAsignadoAnual += asig;
      });
      totalAsignadoAnual += costoAsignadoAnual;
      return { ...item, dbMeses, mesesAsignados, costoAsignadoAnual };
    });
    return { calculados, totalAsignadoAnual };
  };

  const calcP1 = calcularModulos(modulosP1, 'Primer Proceso');
  const calcP2 = calcularModulos(modulosP2, 'Segundo Proceso');
  const calcCIF = calcularModulos(modulosCIF, 'CIF');

  // ==========================================================================
  // NÚCLEO DE CÁLCULO (única fuente para pantalla, impresión y guardado)
  //  - MOD Primer Proceso: se divide entre TODA la producción, proporcional al volumen
  //  - MOD Segundo Proceso: se divide entre TODA la producción, proporcional al volumen
  //  - CIF: proporcional a la producción total de cada mes
  //  - Embalaje: se LEE del Costeo de Embalajes de Logística (no se ingresa aquí)
  // ==========================================================================
  const datosFinancierosGlobales = useMemo(() => {
    const volMensualPlanta = {};
    MESES.forEach(m => { volMensualPlanta[m] = 0; });

    const cantsPorProd = {};
    productosSeleccionados.forEach(prod => {
      const cants = calcularProdPorProducto(prod);
      cantsPorProd[prod] = cants;
      MESES.forEach(m => { volMensualPlanta[m] += cants[m] || 0; });
    });
    const volAnualPlanta = MESES.reduce((s, m) => s + volMensualPlanta[m], 0);

    const pctModulo = (mod, m) => mod.usarParticipacion
      ? (parseFloat(calculoBaseGlobal.porcentajes[m]) || 0)
      : pct100(mod.porcentajesMes?.[m]);

    // Costo anual de un módulo que le toca a un producto (proporcional a su volumen de cada mes)
    const repartirModulo = (mod, procKey, cantsMes) => {
      const dbMeses = agrupadosBD[procKey][mod.moduloNombre] || {};
      return MESES.reduce((acc, m) => {
        const base = volMensualPlanta[m] || 0;
        const prop = base > 0 ? (cantsMes[m] || 0) / base : 0;
        return acc + (dbMeses[m] || 0) * (pctModulo(mod, m) / 100) * prop;
      }, 0);
    };

    const suma = (arr, k) => arr.reduce((s, x) => s + (k ? x[k] : x), 0);

    const filas = productosSeleccionados.map(prod => {
      const cantsMes = cantsPorProd[prod];
      const vol = MESES.reduce((s, m) => s + (cantsMes[m] || 0), 0);
      const pct = volAnualPlanta > 0 ? vol / volAnualPlanta : 0;
      const pctPartMap = obtenerPorcentajesParticipacionProd(prod);
      const propMes = (m) => {
        const base = volMensualPlanta[m] || 0;
        return base > 0 ? (cantsMes[m] || 0) / base : 0;
      };

      // --- Materias primas e insumos (Proceso 1) ---
      const detMat = [];
      materiales.forEach(mat => {
        if (!mat.insumo || (mat.productoAsociado && mat.productoAsociado !== prod)) return;
        const factor = mat.tipoCalculo === 'porcentaje' ? (parseFloat(mat.valor) / 100 || 0) : (parseFloat(mat.valor) || 0);
        const meses = MESES.map((m, iM) => {
          const pctAsig = pct100(mat.porcentajeAsignacionMeses?.[m]);
          const pctIns = mat.usarParticipacion ? (parseFloat(pctPartMap[m]) || 0) : 100;
          const consumo = (cantsMes[m] || 0) * factor * (pctAsig / 100) * (pctIns / 100);
          return { mes: m, iM, consumo, costo: consumo * (parseFloat(mat.costoUnitario) || 0) };
        });
        detMat.push({
          itemId: mat.id, insumo: mat.insumo, udm: mat.udm, costoUnitario: mat.costoUnitario,
          cuenta: mat.cuenta, moduloDestino: mat.moduloDestino,
          meses, consumo: suma(meses, 'consumo'), costo: suma(meses, 'costo')
        });
      });

      // --- Suministros y empaques (Proceso 2) ---
      const detSum = [];
      suministros.forEach(sum => {
        if (!sum.insumo || (sum.productoAsociado && sum.productoAsociado !== prod)) return;
        const meses = MESES.map((m, iM) => {
          const cantM = cantsMes[m] || 0;
          const infoCap = analisisCapacidadP2[m] || { prod: 1, prodEfectivaP2: 1 };
          const prop = infoCap.prod > 0 ? cantM / infoCap.prod : 1;
          const cantP2 = infoCap.prodEfectivaP2 * prop;
          const pctAsig = pct100(sum.porcentajeAsignacionMeses?.[m]);
          const pctIns = sum.usarParticipacion ? (parseFloat(pctPartMap[m]) || 0) : 100;

          let consumo = 0;
          let costo = 0;
          if (sum.modoCalculoP2 === 'manual') {
            // Un insumo "General" con monto manual se reparte entre productos por volumen
            // (antes se aplicaba el monto completo a CADA producto).
            const reparto = sum.productoAsociado ? 1 : propMes(m);
            const bruto = parseFloat(sum.montoManualMeses?.[m]) || 0;
            costo = bruto * (pctAsig / 100) * (pctIns / 100) * reparto;
            consumo = costo / (parseFloat(sum.costoUnitario) || 1);
          } else {
            consumo = cantP2 * (parseFloat(sum.valor) || 0) * (pctAsig / 100) * (pctIns / 100);
            costo = consumo * (parseFloat(sum.costoUnitario) || 0);
          }
          return { mes: m, iM, consumo, costo };
        });
        detSum.push({
          itemId: sum.id, insumo: sum.insumo, udm: sum.udm, costoUnitario: sum.costoUnitario,
          cuenta: sum.cuenta, moduloDestino: sum.moduloDestino,
          meses, consumo: suma(meses, 'consumo'), costo: suma(meses, 'costo')
        });
      });

      // --- Mano de obra y CIF: cada uno con su propio reparto ---
      const modP1 = modulosP1.map(mod => repartirModulo(mod, 'Primer Proceso', cantsMes));
      const modP2 = modulosP2.map(mod => repartirModulo(mod, 'Segundo Proceso', cantsMes));
      const modCIF = modulosCIF.map(mod => repartirModulo(mod, 'CIF', cantsMes));

      // --- Embalaje: se lee del Costeo de Embalajes de Logística (solo lectura) ---
      const costoEmbalajeUnit = embalajePorProducto[prod] ?? null; // null = "sin costeo de Logística"
      const embalaje = costoEmbalajeUnit != null ? costoEmbalajeUnit * vol : 0;

      const p1Mat = suma(detMat, 'costo');
      const p2Sum = suma(detSum, 'costo');
      const p1Mod = suma(modP1);
      const p2Mod = suma(modP2);
      const cif = suma(modCIF);
      const total = p1Mat + p2Sum + embalaje + p1Mod + p2Mod + cif;

      return {
        prod, vol, pct, detMat, detSum, modP1, modP2, modCIF,
        p1Mat, p1Mod, p1: p1Mat + p1Mod, p2Sum, p2Mod, p2: p2Sum + p2Mod,
        embalaje, embalajePendiente: costoEmbalajeUnit == null,
        cif, total, cUnit: vol > 0 ? total / vol : 0
      };
    });

    const CLAVES = ['vol', 'p1Mat', 'p2Sum', 'embalaje', 'p1Mod', 'p2Mod', 'cif', 'total'];
    const totalPlanta = CLAVES.reduce((acc, k) => ({ ...acc, [k]: filas.reduce((s, f) => s + f[k], 0) }), {});

    return { volMensualPlanta, volAnualPlanta, cantsPorProd, filas, totalPlanta };
  }, [productosSeleccionados, materiales, modulosP1, suministros, modulosP2, modulosCIF, configProductos, analisisCapacidadP2, calculoBaseGlobal, agrupadosBD, embalajePorProducto]);

  const costoTotalAnual = datosFinancierosGlobales.totalPlanta.total;
  const costoUnitarioPromedio = cantidadTotalProduccionAnio > 0 ? (costoTotalAnual / cantidadTotalProduccionAnio) : 0;

  const seleccionarInsumoP1 = (id, prodBd) => {
    setMateriales(prev => prev.map(m => {
      if (m.id === id) {
        const costoReal = parseFloat(prodBd.costo) > 0 ? parseFloat(prodBd.costo) : (parseFloat(prodBd.precio_venta) || 0);
        return {
          ...m,
          insumo: prodBd.nombre || prodBd.descripcion,
          costoUnitario: costoReal.toFixed(4),
          udm: prodBd.unidad || m.udm
        };
      }
      return m;
    }));
    setFilaInsumoAbierta(null);
  };

  const seleccionarInsumoP2 = (id, prodBd) => {
    setSuministros(prev => prev.map(s => {
      if (s.id === id) {
        const costoReal = parseFloat(prodBd.costo) > 0 ? parseFloat(prodBd.costo) : (parseFloat(prodBd.precio_venta) || 0);
        return {
          ...s,
          insumo: prodBd.nombre || prodBd.descripcion,
          costoUnitario: costoReal.toFixed(4),
          udm: prodBd.unidad || s.udm
        };
      }
      return s;
    }));
    setFilaInsumoAbierta(null);
  };

  const actMat = (id, c, v) => setMateriales(materiales.map(m => m.id === id ? { ...m, [c]: v } : m));
  const actSum = (id, c, v) => setSuministros(suministros.map(s => s.id === id ? { ...s, [c]: v } : s));
  const actModP1 = (id, c, v) => setModulosP1(modulosP1.map(m => m.id === id ? { ...m, [c]: v } : m));
  const actModP2 = (id, c, v) => setModulosP2(modulosP2.map(m => m.id === id ? { ...m, [c]: v } : m));
  const actModCIF = (id, c, v) => setModulosCIF(modulosCIF.map(m => m.id === id ? { ...m, [c]: v } : m));

  const renderAsignacionProceso = (titulo, procKey, lista, setter, actor, calculosReales, nota) => {
    const modulosDisponibles = Object.keys(agrupadosBD[procKey] || {});
    const actualizarPct = (id, mes, valor) => {
      setter(lista.map(m => m.id === id ? { ...m, porcentajesMes: { ...(m.porcentajesMes || {}), [mes]: valor } } : m));
    };

    return (
      <div style={{ marginBottom: '16px', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ background: '#f8fafc', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1' }}>
          <span style={{ fontWeight: 700, color: '#1e293b' }}>{titulo}</span>
          <button type="button" onClick={() => setter([...lista, _crearItemVacio('modulo')])} style={{ background: 'white', color: '#2563eb', border: '1px solid #2563eb', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>+ Agregar Módulo</button>
        </div>

        <div style={{ padding: '12px', background: 'white' }}>
          {nota && (
            <div style={{ fontSize: '11px', color: '#475569', background: '#f1f5f9', padding: '6px 8px', borderRadius: '4px', marginBottom: '10px' }}>
              {nota}
            </div>
          )}

          {lista.length === 0 && <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', textAlign: 'center' }}>No hay módulos asignados a esta etapa.</div>}

          {lista.map((item, idx) => {
            const dataCalc = calculosReales.calculados.find(c => c.id === item.id);
            const mesesAsig = dataCalc?.mesesAsignados || MESES.reduce((acc, m) => ({ ...acc, [m]: 0 }), {});
            const pctMeses = item.porcentajesMes || MESES.reduce((acc, m) => ({ ...acc, [m]: '100' }), {});

            return (
              <div key={item.id} style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: idx < lista.length - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>MÓDULO ORIGEN ({procKey})</label>
                    <select value={item.moduloNombre} onChange={e => actor(item.id, 'moduloNombre', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}>
                      <option value="">-- Elija un Módulo --</option>
                      {modulosDisponibles.map(mod => <option key={mod} value={mod}>{mod}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={() => setter(lista.filter(i => i.id !== item.id))} style={{ padding: '6px', color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer' }}>🗑️</button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>% asignado por mes:</div>
                  <button type="button" onClick={() => actor(item.id, 'usarParticipacion', !item.usarParticipacion)} style={{ background: item.usarParticipacion ? '#2563eb' : '#f1f5f9', color: item.usarParticipacion ? 'white' : '#64748b', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>
                    {item.usarParticipacion ? "🔗 Vinculado a Distribución" : "🔗 Vincular a Distribución"}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
                  {MESES.map(m => (
                    <div key={m} style={{ background: '#f0fdf4', padding: '4px', borderRadius: '4px', border: '1px solid #bbf7d0', textAlign: 'center' }}>
                      <span style={{ fontSize: '9px', display: 'block', color: '#166534', fontWeight: 'bold' }}>{m}</span>
                      <input
                        type="number"
                        step="0.1"
                        value={item.usarParticipacion ? (calculoBaseGlobal.porcentajes[m] || '0') : (pctMeses[m] ?? '100')}
                        disabled={item.usarParticipacion}
                        onChange={e => actualizarPct(item.id, m, e.target.value)}
                        style={{ width: '100%', padding: '2px', margin: '2px 0', border: '1px solid #2563eb', borderRadius: '3px', fontSize: '10px', fontWeight: 'bold', textAlign: 'center', background: item.usarParticipacion ? '#eff6ff' : 'white' }}
                      />
                      <span style={{ fontSize: '10px', display: 'block', color: '#15803d', fontWeight: 600 }}>S/{mesesAsig[m].toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleImprimirReporte = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 200);
  };

  const handleGuardar = () => {
    if (productosSeleccionados.length === 0) return alert('Seleccione al menos un producto a costear.');
    if (cantidadTotalProduccionAnio <= 0) return alert('La cantidad total de producción debe ser mayor a 0.');

    const pendientes = datosFinancierosGlobales.filas.filter(f => f.embalajePendiente).map(f => f.prod);
    if (pendientes.length > 0) {
      return alert(`Falta el costeo de embalaje (Logística) para: ${pendientes.join(', ')}. Coordina con Logística antes de guardar.`);
    }

    const idLoteBase = registro ? (registro.id_lote || registro.id_registro) : `LOTE-CRI-${Date.now()}`;
    const registrosAGuardar = [];

    productosSeleccionados.forEach((nombreProd, pIdx) => {
      const fila = datosFinancierosGlobales.filas.find(f => f.prod === nombreProd);
      if (!fila) return;

      const idRegistroProd = (registro && nombreProd === registro.detalle_columnas?.producto)
        ? registro.id_registro
        : `CRI-${Date.now()}-${pIdx}`;
      const prodCantsComercial = configProductos[nombreProd]?.cantidades || MESES.reduce((acc, m) => ({ ...acc, [m]: '0' }), {});
      const margenProd = parseFloat(configProductos[nombreProd]?.margen) || 0;
      const prodCantsProduccion = calcularProdPorProducto(nombreProd);

      const totalComercialProd = MESES.reduce((acc, m) => acc + (parseFloat(prodCantsComercial[m]) || 0), 0);
      const totalProduccionProd = MESES.reduce((acc, m) => acc + (prodCantsProduccion[m] || 0), 0);

      const desgloseProdContable = [];

      // Registros derivados mes a mes (materias primas y envases) a partir del mismo motor de cálculo
      const derivar = (detalleLista, tag, moduloPorDefecto) => {
        detalleLista.forEach((d, idx) => {
          const moduloDestino = d.moduloDestino || moduloPorDefecto;
          const cuentaConPrefijo = formatearCuentaConPrefijo91(cuentaSegunModulo(moduloDestino));

          d.meses.forEach(({ mes, iM, consumo, costo }) => {
            if (!(costo > 0 || consumo > 0)) return;
            const mesNum = String(iM + 1).padStart(2, '0');
            registrosAGuardar.push({
              id_registro: `DERIV-${tag}-${idRegistroProd}-${idx}-${mes}`,
              id_lote: idLoteBase,
              modulo: moduloDestino,
              categoria: moduloDestino,
              area,
              idVersion,
              fecha_proyeccion: `${anioSel}-${mesNum}-01`,
              empleado_dni: '-',
              empleado_nombre: `COSTEO AUTOMÁTICO - ${d.insumo.toUpperCase()}`,
              detalle_columnas: {
                cuenta_afectada: cuentaConPrefijo,
                producto: `${d.insumo.toUpperCase()} (${nombreProd})`,
                detalle: `${d.insumo.toUpperCase()} - Para: ${nombreProd}`,
                unidad_medida: d.udm,
                costo_unitario: d.costoUnitario,
                cantidad: consumo,
                costo_total: costo,
                es_derivado: true,
                extras: { producto: `${d.insumo.toUpperCase()} (${nombreProd})` }
              },
              totales: { costo_total: costo }
            });
          });

          if (d.costo > 0) {
            desgloseProdContable.push({ id: `${tag.toLowerCase()}-${idx}`, cuenta: `${cuentaConPrefijo} - ${d.insumo}`, monto: d.costo.toFixed(2) });
          }
        });
      };

      derivar(fila.detMat, 'MAT', 'Materias Primas');
      derivar(fila.detSum, 'SUM', 'Envases y Embalajes');

      // Desglose contable de mano de obra (por etapa) y CIF
      const agregarModulos = (lista, montos, etiqueta) => {
        lista.forEach((mod, i) => {
          const monto = montos[i] || 0;
          if (monto > 0) {
            desgloseProdContable.push({
              id: `mod-${etiqueta}-${i}`,
              cuenta: formatearCuentaConPrefijo91(`946261000 - ${mod.moduloNombre || etiqueta} (${etiqueta})`),
              monto: monto.toFixed(2)
            });
          }
        });
      };
      agregarModulos(modulosP1, fila.modP1, 'Primer Proceso');
      agregarModulos(modulosP2, fila.modP2, 'Segundo Proceso');
      agregarModulos(modulosCIF, fila.modCIF, 'CIF');

      if (fila.embalaje > 0) {
        desgloseProdContable.push({
          id: 'embalaje-logistica',
          cuenta: 'Embalaje (Costeo de Logística) - Referencia informativa',
          monto: fila.embalaje.toFixed(2)
        });
      }

      const regForecast = forecastCrisoles.find(r => {
        const dc = r.detalle_columnas || r;
        return String(dc.producto || '').trim().toLowerCase() === nombreProd.toLowerCase();
      });
      const precioVentaRef = parseFloat(regForecast?.detalle_columnas?.precio_venta_unit || regForecast?.precio_venta || 0);

      const registroMaestroProd = {
        id_registro: idRegistroProd,
        id_lote: idLoteBase,
        modulo: 'Costeo de Crisoles',
        categoria: 'Costeo de Crisoles',
        area,
        idVersion,
        fecha_proyeccion: `${anioSel}-01-01`,
        empleado_dni: '-',
        empleado_nombre: nombreProd,
        detalle_columnas: {
          producto: nombreProd,
          anio_proyeccion: anioSel,
          margen_produccion: margenProd,
          capacidad_maxima_p2: parseFloat(capacidadMaximaP2) || 0,
          productos_base: productosBase,
          productos_seleccionados: productosSeleccionados,
          config_productos: configProductos,
          cantidades_comercial: prodCantsComercial,
          cantidad_total_comercial: totalComercialProd,
          cantidades_produccion: prodCantsProduccion,
          cantidad_total_produccion: totalProduccionProd,
          precio_venta_unit: precioVentaRef,
          materiales, suministros, modulosP1, modulosP2, modulosCIF,
          costo_embalaje_unitario: embalajePorProducto[nombreProd] ?? 0,
          costo_total_anual: fila.total,
          costo_unitario_promedio: fila.cUnit
        },
        totales: { cantidad_total: totalProduccionProd, costo_total: fila.total },
        desglose_contable: desgloseProdContable
      };

      registrosAGuardar.push(registroMaestroProd);
    });

    guardarRegistrosLote(registrosAGuardar, registro ? { reemplazar: registro.id_registro } : undefined);

    if (typeof onGuardar === 'function') {
      onGuardar(registrosAGuardar);
    }
    if (typeof onCancelar === 'function') {
      onCancelar();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>

      <datalist id="lista-cuentas-costeo">
        {maestroCuentas.map((c, i) => <option key={i} value={c.nombre} />)}
      </datalist>
      
      <datalist id="lista-insumos-p1">
        {insumosP1.map((p, i) => <option key={`p1-${i}`} value={p.nombre || p.descripcion} />)}
      </datalist>
      
      <datalist id="lista-insumos-p2">
        {insumosP2.map((p, i) => <option key={`p2-${i}`} value={p.nombre || p.descripcion} />)}
      </datalist>

      <fieldset disabled={isSoloLectura} style={{ border: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '0' }}>
        <div className="offcanvas-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', padding: '16px' }}>

          {/* 1. CHECKLIST DE PRODUCTOS */}
          <div className="form-section" style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div className="form-section-title" style={{ fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>1. Productos a Costear (Checklist del Forecast - Solo Terminados)</div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb' }}>AÑO</label>
                <select value={anioSel} onChange={e => setAnioSel(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }}>
                  {ANIOS_DISPONIBLES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#1e40af' }}>CAPACIDAD MÁXIMA P2</label>
                <input type="number" value={capacidadMaximaP2} onChange={e => setCapacidadMaximaP2(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', background: 'white', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
              {productosAgrupados.length > 0 ? (
                productosAgrupados.map(p => (
                  <label key={p.producto} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, color: '#334155' }}>
                    <input type="checkbox" checked={productosSeleccionados.includes(p.producto)} onChange={() => handleToggleProducto(p.producto)} />
                    {p.producto}
                  </label>
                ))
              ) : (
                <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>No se detectaron Productos Terminados o Crisoles en el Forecast para este año.</span>
              )}
            </div>
          </div>

          {/* 1.1 PESTAÑAS DE VISTA PREVIA Y CONFIGURACIÓN INDIVIDUAL DE MARGEN Y CANTIDADES */}
          {productosSeleccionados.length > 0 && (
            <div className="form-section" style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Configuración y Cantidades por Producto:</div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                {productosSeleccionados.map(prod => (
                  <button key={prod} type="button" onClick={() => setProductoTabActivo(prod)} style={{ padding: '6px 12px', borderRadius: '4px', background: productoTabActivo === prod ? '#2563eb' : '#f1f5f9', color: productoTabActivo === prod ? 'white' : '#334155', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                    {prod}
                  </button>
                ))}
              </div>

              {productoTabActivo && configProductos[productoTabActivo] && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#059669' }}>Margen de Producción para {productoTabActivo} (%):</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      value={configProductos[productoTabActivo].margen} 
                      onChange={e => {
                        const val = e.target.value;
                        setConfigProductos({
                          ...configProductos,
                          [productoTabActivo]: { ...configProductos[productoTabActivo], margen: val }
                        });
                      }} 
                      style={{ width: '80px', padding: '4px', border: '1px solid #10b981', borderRadius: '4px', background: '#ecfdf5', fontWeight: 'bold' }} 
                    />
                  </div>

                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>Cantidades (Comercial vs Producción con holgura):</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
                    {MESES.map(m => {
                      const com = parseFloat(configProductos[productoTabActivo].cantidades[m]) || 0;
                      const margenP = parseFloat(configProductos[productoTabActivo].margen) || 0;
                      const prodCalc = Math.ceil(com * (1 + (margenP / 100)));
                      const detalleMes = (detallesComercialesPorProducto[productoTabActivo] || {})[m] || [];

                      return (
                        <div key={m} style={{ background: '#f0fdf4', padding: '6px', borderRadius: '4px', textAlign: 'center', border: '1px solid #bbf7d0' }}>
                          <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#166534', display: 'block' }}>{m}</span>
                          <input type="number" value={configProductos[productoTabActivo].cantidades[m] || '0'} onChange={e => {
                            const val = e.target.value;
                            setConfigProductos({
                              ...configProductos,
                              [productoTabActivo]: {
                                ...configProductos[productoTabActivo],
                                cantidades: { ...configProductos[productoTabActivo].cantidades, [m]: val }
                              }
                            });
                          }} style={{ width: '100%', padding: '2px', textAlign: 'center', fontSize: '11px', border: '1px solid #cbd5e1', borderRadius: '3px', marginBottom: '2px' }} title="Comercial" />
                          <span style={{ fontSize: '10px', fontWeight: '700', color: '#047857', display: 'block' }}>Prod: {prodCalc}</span>
                          
                          <div style={{ fontSize: '9px', color: '#0369a1', marginTop: '3px', fontStyle: 'italic', borderTop: '1px dashed #bbf7d0', paddingTop: '2px' }}>
                            {detalleMes.length > 0 ? detalleMes.map((d, i) => <div key={i}>{d}</div>) : '0 und'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* RESUMEN CONSOLIDADO DE PRODUCCIÓN TOTAL DE PLANTA POR MES */}
                  <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1', background: '#f8fafc', padding: '8px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#1e40af', marginBottom: '6px' }}>
                      Resumen Consolidado: Producción Total de Planta (Todos los productos seleccionados)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
                      {MESES.map(m => {
                        const totalMesProd = cantidadesProduccionTotal[m] || 0;
                        return (
                          <div key={`tot-${m}`} style={{ background: '#eff6ff', padding: '4px', borderRadius: '4px', textAlign: 'center', border: '1px solid #bfdbfe' }}>
                            <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#1e40af', display: 'block' }}>{m}</span>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#1d4ed8', display: 'block' }}>{totalMesProd.toLocaleString()} und</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* BASE DE DISTRIBUCIÓN CON PORCENTAJES SEPARADOS POR PRODUCTO */}
          <div className="form-section" style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '8px', fontSize: '12px' }}>Base de Distribución (% Participación Comercial por Producto)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', background: 'white', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '12px' }}>
              {productosAgrupados.map(p => (
                <label key={p.producto} style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#334155' }}>
                  <input type="checkbox" checked={productosBase.includes(p.producto)} onChange={(e) => {
                    if (e.target.checked) setProductosBase([...productosBase, p.producto]);
                    else setProductosBase(productosBase.filter(prod => prod !== p.producto));
                  }} />
                  {p.producto}
                </label>
              ))}
            </div>

            {productosBase.filter(prodBaseName => !isSoloLectura || !productoTabActivo || prodBaseName === productoTabActivo).map(prodBaseName => {
              const porcentajesIndiv = obtenerPorcentajesParticipacionProd(prodBaseName);
              return (
                <div key={prodBaseName} style={{ marginBottom: '10px', background: 'white', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', marginBottom: '4px' }}>Participación Comercial de: {prodBaseName}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
                    {MESES.map(m => (
                      <div key={m} style={{ background: '#f8fafc', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                        <span style={{ fontSize: '9px', display: 'block', color: '#64748b', fontWeight: 'bold' }}>{m}</span>
                        <span style={{ fontSize: '11px', display: 'block', color: '#2563eb', fontWeight: 700, marginTop: '2px' }}>{porcentajesIndiv[m]}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 2. MATERIALES (PROCESO 1) - AGRUPADO POR PRODUCTO, CON SELECTOR DE LISTA DE MATERIALES */}
          <div className="form-section" style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div className="form-section-title" style={{ fontWeight: 700, color: '#1e293b', marginBottom: '10px' }}>2. Materiales (Proceso 1 - Materias Primas e Insumos)</div>

            {materiales.length === 0 && productosSeleccionados.length === 0 && <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>Selecciona un producto arriba y luego elige su lista de materiales.</div>}

            {[...new Set([...productosSeleccionados, ...materiales.map(m => m.productoAsociado)])].map(prodAsociado => {
              const itemsDelGrupo = materiales.filter(m => m.productoAsociado === prodAsociado);
              const esGeneral = !prodAsociado;
              const prodCants = calcularProdPorProducto(prodAsociado);
              const volumenProyectado = MESES.reduce((acc, m) => acc + (prodCants[m] || 0), 0);

              return (
                <div key={prodAsociado || 'general'} style={{ marginBottom: '16px', background: 'white', borderRadius: '6px', border: `1px solid ${esGeneral ? '#cbd5e1' : '#93c5fd'}`, overflow: 'visible' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: esGeneral ? '#f1f5f9' : '#eff6ff', padding: '8px 12px', borderBottom: `1px solid ${esGeneral ? '#cbd5e1' : '#bfdbfe'}`, flexWrap: 'wrap', gap: '8px' }}>
                    <span style={{ fontWeight: 'bold', color: esGeneral ? '#475569' : '#1e3a8a', fontSize: '12px' }}>
                      📦 {prodAsociado || 'Insumos Generales'} — Vol. Proyectado: {volumenProyectado.toLocaleString()} und
                    </span>
                    {!esGeneral && (() => {
                      const { sugeridas, otras } = formulasParaProducto(prodAsociado);
                      const etiqueta = f => `${f.codigo_formula || f.codigo || 'BOM'} — ${nombreFormula(f)}${parseFloat(f.cantidad_base) > 1 ? ` (base ${f.cantidad_base})` : ''}`;
                      const idSel = formulaSeleccionadaDe(prodAsociado);
                      const formulaSel = formulasBD.find(f => idDeFormula(f) === idSel);
                      const abierto = bomAbierto === prodAsociado;
                      const q = normalizarTexto(bomBusqueda).trim();
                      const filtrar = lista => (q ? lista.filter(f => normalizarTexto(etiqueta(f)).includes(q)) : lista).slice(0, 50);
                      const sugFiltradas = filtrar(sugeridas);
                      const otrasFiltradas = filtrar(otras);
                      const elegir = (id) => { seleccionarFormula(prodAsociado, id); setBomAbierto(null); setBomBusqueda(''); };
                      const opcion = (f) => (
                        <div key={idDeFormula(f)} onMouseDown={e => { e.preventDefault(); elegir(idDeFormula(f)); }}
                          style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '11px', borderBottom: '1px solid #f1f5f9', background: idDeFormula(f) === idSel ? '#eff6ff' : 'white', fontWeight: idDeFormula(f) === idSel ? 700 : 400 }}
                          onMouseEnter={ev => { ev.currentTarget.style.background = '#f1f5f9'; }}
                          onMouseLeave={ev => { ev.currentTarget.style.background = idDeFormula(f) === idSel ? '#eff6ff' : 'white'; }}>
                          {etiqueta(f)}
                        </div>
                      );
                      const tituloGrupo = t => <div style={{ padding: '4px 10px', fontSize: '10px', fontWeight: 700, color: '#64748b', background: '#f8fafc', textTransform: 'uppercase' }}>{t}</div>;
                      return (
                        <div data-dropdown-bom={prodAsociado} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#1e3a8a', fontWeight: 600, marginLeft: 'auto', position: 'relative' }}>
                          Lista de materiales:
                          <input type="text" autoComplete="off"
                            value={abierto ? bomBusqueda : (formulaSel ? etiqueta(formulaSel) : '')}
                            placeholder={abierto ? 'Escriba para buscar...' : '— Manual (sin lista) —'}
                            onFocus={() => { setBomAbierto(prodAsociado); setBomBusqueda(''); }}
                            onChange={e => { setBomAbierto(prodAsociado); setBomBusqueda(e.target.value); }}
                            onKeyDown={e => { if (e.key === 'Escape') { setBomAbierto(null); e.currentTarget.blur(); } }}
                            title={formulaSel ? etiqueta(formulaSel) : ''}
                            style={{ padding: '4px 8px', border: '1px solid #93c5fd', borderRadius: '4px', fontSize: '11px', width: '300px', background: 'white' }} />
                          {abierto && (
                            <div style={{ position: 'absolute', top: '100%', right: 0, width: '420px', maxWidth: '80vw', marginTop: '2px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', boxShadow: '0 8px 16px rgba(0,0,0,0.12)', maxHeight: '260px', overflowY: 'auto', zIndex: 60, fontWeight: 400, color: '#1e293b' }}>
                              <div onMouseDown={e => { e.preventDefault(); elegir(''); }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '11px', fontStyle: 'italic', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>— Manual (sin lista) —</div>
                              {sugFiltradas.length > 0 && <>{tituloGrupo('Para este producto')}{sugFiltradas.map(opcion)}</>}
                              {otrasFiltradas.length > 0 && <>{tituloGrupo('Otras listas')}{otrasFiltradas.map(opcion)}</>}
                              {sugFiltradas.length === 0 && otrasFiltradas.length === 0 && (
                                <div style={{ padding: '8px 10px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>{formulasBD.length === 0 ? 'No hay listas de materiales cargadas.' : 'Sin coincidencias.'}</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <button type="button" onClick={() => setMateriales([...materiales, _crearItemVacio('insumo', false, prodAsociado)])} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                      + Agregar Insumo Manual
                    </button>
                  </div>

                  <div style={{ padding: '10px', overflowX: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 2fr) 55px 75px 65px 65px 1.5fr 90px auto', gap: '6px', minWidth: '750px' }}>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Insumo / Materia Prima</span>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textAlign: 'center' }}>UdM</span>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Método</span>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Valor</span>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Costo U.</span>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Cuenta</span>
                      <span style={{ fontSize: '10px', color: '#0f172a', fontWeight: 'bold', textAlign: 'center', background: '#f1f5f9', borderRadius: '4px' }}>Total Proy.</span>
                      <span></span>
                    </div>

                    {itemsDelGrupo.map((item) => {
                      const factor = item.tipoCalculo === 'porcentaje' ? (parseFloat(item.valor) / 100 || 0) : (parseFloat(item.valor) || 0);
                      const consumoTotal = MESES.reduce((acc, m) => {
                        const cantMes = prodCants[m] || 0;
                        const pctPart = item.usarParticipacion ? (parseFloat(obtenerPorcentajesParticipacionProd(prodAsociado)[m]) || 0) : 100;
                        return acc + (cantMes * factor) * (pct100(item.porcentajeAsignacionMeses?.[m]) / 100) * (pctPart / 100);
                      }, 0);
                      const costoTotal = consumoTotal * (parseFloat(item.costoUnitario) || 0);

                      return (
                        <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 2fr) 50px 80px 65px 65px 1.5fr 95px auto', gap: '6px', alignItems: 'center', marginBottom: '6px', minWidth: '750px' }}>
                          <div data-dropdown-row={item.id} style={{ position: 'relative' }}>
                            <input type="text" value={item.insumo} onChange={e => { actMat(item.id, 'insumo', e.target.value); setFilaInsumoAbierta(item.id); }} onFocus={() => setFilaInsumoAbierta(item.id)} placeholder="Buscar insumo..." style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }} />
                            {filaInsumoAbierta === item.id && (
                              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '0 0 6px 6px', maxHeight: '200px', overflowY: 'auto', zIndex: 50 }}>
                                {obtenerInsumosFiltrados(insumosP1, item.insumo).map((p, idx) => (
                                  <div key={idx} onClick={() => seleccionarInsumoP1(item.id, p)} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '11px', borderBottom: '1px solid #f1f5f9' }}>
                                    {p.nombre || p.descripcion}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <input type="text" value={item.udm} onChange={e => actMat(item.id, 'udm', e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', textAlign: 'center' }} />
                          <select value={item.tipoCalculo} onChange={e => actMat(item.id, 'tipoCalculo', e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}>
                            <option value="ratio">Ratio</option>
                            <option value="porcentaje">%</option>
                          </select>
                          <input type="number" step="0.0001" value={item.valor} onChange={e => actMat(item.id, 'valor', e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }} />
                          <input type="number" step="0.01" value={item.costoUnitario} onChange={e => actMat(item.id, 'costoUnitario', e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }} />
                          <input type="text" value={item.cuenta || ''} readOnly placeholder={`(fija: ${formatearCuentaConPrefijo91('6121000')})`} style={{ padding: '6px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '10px', background: '#f8fafc', color: '#94a3b8' }} title="La cuenta de materias primas e insumos es fija: 6121000 con el prefijo del área" />
                          <div style={{ background: '#f8fafc', padding: '4px 6px', borderRadius: '4px', textAlign: 'right', border: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#0f172a', display: 'block' }}>{consumoTotal.toLocaleString('en-US', { maximumFractionDigits: 1 })} {item.udm}</span>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#166534', display: 'block' }}>S/ {costoTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <button type="button" onClick={() => setMateriales(materiales.filter(i => i.id !== item.id))} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>🗑️</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 3. SUMINISTROS (PROCESO 2) CON BÚSQUEDA EN BD LOCAL */}
          <div className="form-section" style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div className="form-section-title" style={{ fontWeight: 700, color: '#1e293b' }}>3. Suministros y Calcinación (Proceso 2 - Suministros y Embalajes)</div>
              <button type="button" onClick={() => setSuministros([...suministros, _crearItemVacio('insumo', true)])} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>+ Agregar Insumo (P2)</button>
            </div>

            <div style={{ background: '#eff6ff', padding: '8px', borderRadius: '6px', border: '1px solid #bfdbfe', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#1e40af' }}>Capacidad Máxima P2 (Horno/Calcinación):</span>
              <input type="number" value={capacidadMaximaP2} onChange={e => setCapacidadMaximaP2(e.target.value)} style={{ width: '90px', padding: '4px', border: '1px solid #3b82f6', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold' }} />
            </div>

            {suministros.map((item) => {
              const factor = parseFloat(item.valor) || 0;

              return (
                <div key={item.id} style={{ marginBottom: '12px', background: 'white', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <div style={{ marginBottom: '8px', background: '#f1f5f9', padding: '6px', borderRadius: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155' }}>Asociar a Producto:</label>
                    <select value={item.productoAsociado} onChange={e => {
                      const val = e.target.value;
                      setSuministros(suministros.map(s => s.id === item.id ? { ...s, productoAsociado: val } : s));
                    }} style={{ padding: '4px', fontSize: '11px', flex: 1, border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                      <option value="">-- General (Toda la Planta) --</option>
                      {productosSeleccionados.map(prod => <option key={prod} value={prod}>{prod}</option>)}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 70px 100px 100px 1fr auto', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <div data-dropdown-row={item.id} style={{ position: 'relative' }}>
                      <label style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Buscar Suministro / Empaque</label>
                      <input 
                        type="text" 
                        placeholder="Escriba para buscar..."
                        value={item.insumo} 
                        onChange={e => {
                          actSum(item.id, 'insumo', e.target.value);
                          setFilaInsumoAbierta(item.id);
                        }} 
                        onFocus={() => setFilaInsumoAbierta(item.id)}
                        autoComplete="off"
                        style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', background: 'white' }} 
                      />

                      {filaInsumoAbierta === item.id && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
                          border: '1px solid #cbd5e1', borderRadius: '0 0 6px 6px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                          maxHeight: '220px', overflowY: 'auto', zIndex: 50, marginTop: '2px'
                        }}>
                          {obtenerInsumosFiltrados(insumosP2, item.insumo).map((p, idx) => (
                            <div
                              key={`p2-${item.id}-${idx}`}
                              onClick={() => seleccionarInsumoP2(item.id, p)}
                              style={{ 
                                padding: '8px 12px', 
                                cursor: 'pointer', 
                                borderBottom: '1px solid #f1f5f9', 
                                color: '#1e293b', 
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: '4px' 
                              }}
                              onMouseEnter={(ev) => ev.currentTarget.style.background = '#f8fafc'}
                              onMouseLeave={(ev) => ev.currentTarget.style.background = 'white'}
                            >
                              <span style={{ fontSize: '11px', fontWeight: 600 }}>{p.nombre || p.descripcion}</span>
                              <span style={{ fontSize: '9px', color: '#64748b' }}>{p.categoria}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><label style={{ fontSize: '10px', color: '#64748b' }}>UdM</label><input type="text" value={item.udm} onChange={e => actSum(item.id, 'udm', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} /></div>
                    <div>
                      <label style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>MODO</label>
                      <select value={item.modoCalculoP2 || 'ratio'} onChange={e => actSum(item.id, 'modoCalculoP2', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #2563eb', borderRadius: '4px', fontSize: '12px', background: '#eff6ff' }}>
                        <option value="ratio">Ratio</option>
                        <option value="manual">Manual S/</option>
                      </select>
                    </div>
                    {item.modoCalculoP2 === 'ratio' ? (
                      <div><label style={{ fontSize: '10px', color: '#64748b' }}>Ratio Unit.</label><input type="number" step="0.0001" value={item.valor} onChange={e => actSum(item.id, 'valor', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} /></div>
                    ) : (
                      <div><label style={{ fontSize: '10px', color: '#64748b' }}>Costo Ref.</label><input type="number" step="0.01" value={item.costoUnitario} onChange={e => actSum(item.id, 'costoUnitario', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} /></div>
                    )}
                    <div><label style={{ fontSize: '10px', color: '#64748b' }}>Costo U.</label><input type="number" step="0.01" value={item.costoUnitario} onChange={e => actSum(item.id, 'costoUnitario', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} /></div>
                    {suministros.length > 1 && <button type="button" onClick={() => setSuministros(suministros.filter(i => i.id !== item.id))} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', marginTop: '14px' }}>🗑️</button>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#fffbeb', padding: '6px', borderRadius: '4px', border: '1px solid #fde68a', marginBottom: '8px' }}>
                    {/* CUENTA FIJA según el módulo destino (no se asigna manualmente) */}
                    <input type="text" readOnly value={formatearCuentaConPrefijo91(cuentaSegunModulo(item.moduloDestino || 'Envases y Embalajes'))} title="Cuenta fija: envases -> 6141000, materias primas e insumos -> 6121000 (con el prefijo del área)" style={{ width: '100%', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '11px', background: '#f8fafc', color: '#475569' }} />
                    <select value={item.moduloDestino || 'Envases y Embalajes'} onChange={e => actSum(item.id, 'moduloDestino', e.target.value)} style={{ padding: '4px', fontSize: '11px' }}>
                      {MODULOS_DESTINO_DISPONIBLES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '2px' }}>
                    {item.modoCalculoP2 === 'manual' ? '% Asignación y Costo Manual por Mes (S/):' : '% Asignación y Consumo Proyectado (P2 - Acotado a Capacidad):'}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
                    {MESES.map(m => {
                      const cantsProd = item.productoAsociado ? calcularProdPorProducto(item.productoAsociado) : cantidadesProduccionTotal;
                      const cantMesTotalProd = cantsProd[m] || 0;
                      
                      const infoCap = analisisCapacidadP2[m] || { prod: 1, prodEfectivaP2: 1, saturado: false };
                      const propornP2 = infoCap.prod > 0 ? (cantMesTotalProd / infoCap.prod) : 1;
                      const cantMesP2Efectiva = infoCap.prodEfectivaP2 * propornP2;

                      const pctAsigMes = pct100(item.porcentajeAsignacionMeses?.[m]);
                      const pctMap = item.productoAsociado ? obtenerPorcentajesParticipacionProd(item.productoAsociado) : calculoBaseGlobal.porcentajes;
                      const pctPart = item.usarParticipacion ? (parseFloat(pctMap[m]) || 0) : 100;
                      
                      let consumoU = 0;
                      let costoM = 0;

                      if (item.modoCalculoP2 === 'manual') {
                        const brutoManual = parseFloat(item.montoManualMeses?.[m]) || 0;
                        costoM = brutoManual * (pctAsigMes / 100) * (pctPart / 100);
                        consumoU = costoM / (parseFloat(item.costoUnitario) || 1);
                      } else {
                        consumoU = (cantMesP2Efectiva * factor) * (pctAsigMes / 100) * (pctPart / 100);
                        costoM = consumoU * (parseFloat(item.costoUnitario) || 0);
                      }

                      return (
                        <div key={m} style={{ background: infoCap.saturado ? '#fef2f2' : '#f8fafc', padding: '4px', borderRadius: '3px', textAlign: 'center', border: `1px solid ${infoCap.saturado ? '#fecaca' : '#e2e8f0'}`, fontSize: '10px' }}>
                          <span style={{ color: '#64748b', fontWeight: 'bold', display: 'block' }}>{m} {infoCap.saturado && '⚠️'}</span>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px', margin: '2px 0' }}>
                            <input 
                              type="number"
                              step="0.1"
                              value={item.porcentajeAsignacionMeses?.[m] !== undefined ? item.porcentajeAsignacionMeses[m] : '100'}
                              onChange={e => {
                                const val = e.target.value;
                                setSuministros(suministros.map(s => s.id === item.id ? {
                                  ...s,
                                  porcentajeAsignacionMeses: { ...(s.porcentajeAsignacionMeses || {}), [m]: val }
                                } : s));
                              }}
                              style={{ width: '45px', padding: '1px', textAlign: 'center', fontSize: '10px', border: '1px solid #2563eb', borderRadius: '2px', fontWeight: 'bold' }}
                              title="% de Asignación este mes"
                            />
                            <span style={{ fontSize: '9px', color: '#2563eb' }}>%</span>
                          </div>

                          {item.modoCalculoP2 === 'manual' ? (
                            <input 
                              type="number"
                              step="0.1"
                              value={item.montoManualMeses?.[m] || ''}
                              onChange={e => {
                                const nuevoMonto = e.target.value;
                                setSuministros(suministros.map(s => s.id === item.id ? {
                                  ...s,
                                  montoManualMeses: { ...(s.montoManualMeses || {}), [m]: nuevoMonto }
                                } : s));
                              }}
                              placeholder="S/ 0"
                              style={{ width: '100%', padding: '1px', fontSize: '10px', textAlign: 'center', border: '1px solid #2563eb', borderRadius: '2px', marginTop: '2px' }}
                            />
                          ) : (
                            <>
                              <span style={{ color: '#166534', display: 'block' }}>{consumoU.toFixed(1)} {item.udm}</span>
                              <span style={{ color: '#334155', fontWeight: 600, display: 'block' }}>S/ {costoM.toFixed(1)}</span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 4. MANO DE OBRA DIRECTA (POR PROCESO) */}
          <div className="form-section">
            <div className="form-section-title" style={{ fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>4. Mano de Obra Directa (Remuneraciones por Proceso)</div>
            {renderAsignacionProceso(
              'Etapa: Primer Proceso', 'Primer Proceso', modulosP1, setModulosP1, actModP1, calcP1,
              'Se divide entre TODA la producción de crisoles, proporcional al volumen de cada producto.'
            )}
            {renderAsignacionProceso(
              'Etapa: Segundo Proceso', 'Segundo Proceso', modulosP2, setModulosP2, actModP2, calcP2,
              'Se divide entre TODA la producción de crisoles, proporcional al volumen de cada producto.'
            )}
          </div>

          {/* 5. CIF */}
          <div className="form-section">
            <div className="form-section-title" style={{ fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>5. Costos Indirectos de Fabricación (CIF)</div>
            {renderAsignacionProceso(
              'Módulos CIF (solo montos mayores a cero)', 'CIF', modulosCIF, setModulosCIF, actModCIF, calcCIF,
              'Se reparte entre toda la producción de crisoles, proporcional al volumen de cada producto.'
            )}
          </div>

          {/* 6. EMBALAJE (SOLO LECTURA — se costea en Logística) */}
          <div className="form-section" style={{ background: '#fdf4ff', padding: '12px', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
            <div className="form-section-title" style={{ fontWeight: 700, color: '#6b21a8', marginBottom: '8px' }}>6. Embalaje (Costeo de Logística — solo lectura)</div>
            <div style={{ fontSize: '11px', color: '#7e22ce', background: 'white', padding: '8px', borderRadius: '4px', marginBottom: '10px', border: '1px solid #e9d5ff' }}>
              El embalaje (paletas, zuncho, grapas, film) se costea en el módulo "Costeo de Embalajes" de Logística. Aquí solo se muestra el costo ya calculado, por producto.
            </div>
            {productosSeleccionados.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', textAlign: 'center' }}>Selecciona productos arriba para ver su costo de embalaje.</div>
            ) : (
              <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '4px' }}>Producto</th>
                    <th style={{ padding: '4px', textAlign: 'right' }}>Costo Unit. Embalaje</th>
                    <th style={{ padding: '4px', textAlign: 'right' }}>Costo Total Anual</th>
                    <th style={{ padding: '4px', textAlign: 'center' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {datosFinancierosGlobales.filas.map(f => (
                    <tr key={f.prod} style={{ borderTop: '1px solid #e9d5ff' }}>
                      <td style={{ padding: '4px', fontWeight: 600 }}>{f.prod}</td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>S/ {(embalajePorProducto[f.prod] || 0).toFixed(4)}</td>
                      <td style={{ padding: '4px', textAlign: 'right', fontWeight: 700 }}>S/ {f.embalaje.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '4px', textAlign: 'center' }}>
                        {f.embalajePendiente
                          ? <span style={{ color: '#dc2626', fontWeight: 700 }}>⚠ Pendiente</span>
                          : <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ Costeado</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* RESUMEN FINAL */}
          <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            {[
              ['Materias primas e insumos', datosFinancierosGlobales.totalPlanta.p1Mat],
              ['Suministros y envases', datosFinancierosGlobales.totalPlanta.p2Sum],
              ['Embalaje (Logística)', datosFinancierosGlobales.totalPlanta.embalaje],
              ['Mano de obra - Primer Proceso', datosFinancierosGlobales.totalPlanta.p1Mod],
              ['Mano de obra - Segundo Proceso', datosFinancierosGlobales.totalPlanta.p2Mod],
              ['CIF', datosFinancierosGlobales.totalPlanta.cif]
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#166534', borderBottom: '1px dashed #bbf7d0', paddingBottom: '4px', marginBottom: '4px' }}>
                <span>{etiqueta}</span>
                <span>S/ {valor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#166534', fontSize: '18px', marginTop: '8px' }}>
              <span>COSTO TOTAL ANUAL:</span>
              <span>S/ {costoTotalAnual.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#15803d', fontSize: '14px', marginTop: '4px' }}>
              <span>Costo Unitario Promedio:</span>
              <span>S/ {costoUnitarioPromedio.toFixed(4)} / unid.</span>
            </div>
          </div>

        </div>
      </fieldset>

      {/* 🖨️ BLOQUE DE IMPRESIÓN: solo lee datosFinancierosGlobales, no calcula por su cuenta */}
      {isPrinting && createPortal(
        (() => {
          const { filas, cantsPorProd, volAnualPlanta, totalPlanta } = datosFinancierosGlobales;
          const fmt = (n, d = 2) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
          const pct = (parte, total) => total > 0 ? ((parte / total) * 100).toFixed(2) : '0.00';

          const tablaInsumos = (detalle, subtotal, etiqueta) => (
            <table>
              <thead>
                <tr><th>{etiqueta}</th><th>Consumo</th><th>Costo U.</th><th>Cuenta</th><th>Costo Total</th></tr>
              </thead>
              <tbody>
                {detalle.map((d, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: 'left' }}>{d.insumo}</td>
                    <td>{fmt(d.consumo, 1)} {d.udm}</td>
                    <td>S/ {fmt(d.costoUnitario, 4)}</td>
                    <td style={{ textAlign: 'left' }}>{d.cuenta || 'Sin cuenta'}</td>
                    <td style={{ fontWeight: 'bold' }}>S/ {fmt(d.costo)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 'bold', background: '#f1f5f9' }}>
                  <td colSpan={4} style={{ textAlign: 'left' }}>Subtotal</td>
                  <td>S/ {fmt(subtotal)}</td>
                </tr>
              </tbody>
            </table>
          );

          const tablaModulos = (lista, calculos, campo) => {
            if (lista.length === 0) return <div style={{ fontSize: '9.5px', fontStyle: 'italic', color: '#64748b' }}>No hay módulos asignados en esta etapa.</div>;
            return (
              <>
                <table>
                  <thead>
                    <tr><th>Módulo origen</th><th>Monto asignado anual</th><th>Distribuido a productos</th></tr>
                  </thead>
                  <tbody>
                    {lista.map((mod, i) => {
                      const asignado = calculos.calculados.find(c => c.id === mod.id)?.costoAsignadoAnual || 0;
                      const distribuido = filas.reduce((s, f) => s + (f[campo][i] || 0), 0);
                      return (
                        <tr key={mod.id}>
                          <td style={{ textAlign: 'left' }}>{mod.moduloNombre || '(sin módulo)'}</td>
                          <td>S/ {fmt(asignado)}</td>
                          <td style={{ fontWeight: 'bold' }}>S/ {fmt(distribuido)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <table style={{ marginTop: '4px' }}>
                  <thead>
                    <tr>
                      <th>Producto</th><th>Volumen (und)</th><th>% del reparto</th>
                      {lista.map(mod => <th key={mod.id}>{mod.moduloNombre || '(sin módulo)'}</th>)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(f => (
                      <tr key={f.prod}>
                        <td style={{ textAlign: 'left' }}>{f.prod}</td>
                        <td>{fmt(f.vol, 0)}</td>
                        <td>{pct(f.vol, volAnualPlanta)}%</td>
                        {lista.map((mod, i) => <td key={mod.id}>S/ {fmt(f[campo][i])}</td>)}
                        <td style={{ fontWeight: 'bold' }}>S/ {fmt(f[campo].reduce((s, v) => s + v, 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            );
          };

          const consolidar = (campo) => {
            const mapa = {};
            filas.forEach(f => f[campo].forEach(d => {
              const nombre = String(d.insumo || '').trim();
              const clave = `${nombre}_${d.udm}`;
              if (!mapa[clave]) mapa[clave] = { insumo: nombre, udm: d.udm, consumo: 0, costo: 0 };
              mapa[clave].consumo += d.consumo;
              mapa[clave].costo += d.costo;
            }));
            return Object.values(mapa);
          };

          const encabezadoProducto = (f) => (
            <div style={{ fontSize: '11px', fontWeight: 'bold', background: '#e2e8f0', padding: '3px 6px', marginBottom: '4px', color: '#1e293b' }}>
              📦 {f.prod} ({fmt(f.vol, 0)} und)
            </div>
          );

          return (
            <div className="reporte-impresion-solo">
              <div className="reporte-header">
                <div className="reporte-titulo">REPORTE DE TRAZABILIDAD - COSTEO DE CRISOLES</div>
                <div style={{ fontSize: '10px', marginTop: '4px', textAlign: 'center' }}>
                  Año Proyección: <strong>{anioSel}</strong> | Capacidad Máxima P2: <strong>{capacidadMaximaP2}</strong>
                </div>
              </div>

              {/* 1. PRODUCTOS Y PROYECCIÓN */}
              <div className="reporte-seccion">
                <div className="reporte-seccion-titulo">1. Productos Seleccionados y Proyección Mensual</div>
                {filas.map(f => {
                  const conf = configProductos[f.prod] || {};
                  const prodCants = cantsPorProd[f.prod];
                  const totalComercial = MESES.reduce((acc, m) => acc + (parseFloat(conf.cantidades?.[m]) || 0), 0);
                  return (
                    <div key={f.prod} style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '2px' }}>
                        Producto: {f.prod} (Margen Producción: {conf.margen || 0}%)
                      </div>
                      <table>
                        <thead>
                          <tr>
                            <th style={{ width: '70px' }}>Tipo</th>
                            {MESES.map(m => <th key={m}>{m}</th>)}
                            <th style={{ backgroundColor: '#e2e8f0', color: '#1e293b' }}>Total Anual</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ fontWeight: 'bold' }}>Comercial</td>
                            {MESES.map(m => <td key={m}>{conf.cantidades?.[m] || 0}</td>)}
                            <td style={{ fontWeight: 'bold', backgroundColor: '#f8fafc' }}>{totalComercial.toLocaleString()}</td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 'bold' }}>Producción</td>
                            {MESES.map(m => <td key={m}>{prodCants[m] || 0}</td>)}
                            <td style={{ fontWeight: 'bold', backgroundColor: '#f8fafc' }}>{fmt(f.vol, 0)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>

              {/* 2. MATERIAS PRIMAS POR PRODUCTO */}
              <div className="reporte-seccion">
                <div className="reporte-seccion-titulo">2. Materias Primas e Insumos por Producto (Proceso 1)</div>
                {filas.map(f => (
                  <div key={`mp-${f.prod}`} style={{ marginBottom: '10px' }}>
                    {encabezadoProducto(f)}
                    {tablaInsumos(f.detMat, f.p1Mat, 'Materia Prima / Insumo')}
                  </div>
                ))}
              </div>

              {/* 3. SUMINISTROS POR PRODUCTO */}
              <div className="reporte-seccion">
                <div className="reporte-seccion-titulo">3. Suministros y Envases por Producto (Proceso 2)</div>
                {filas.map(f => (
                  <div key={`env-${f.prod}`} style={{ marginBottom: '10px' }}>
                    {encabezadoProducto(f)}
                    {tablaInsumos(f.detSum, f.p2Sum, 'Suministro / Empaque')}
                  </div>
                ))}
              </div>

              {/* 4. MANO DE OBRA DIRECTA */}
              <div className="reporte-seccion">
                <div className="reporte-seccion-titulo">4. Mano de Obra Directa (Remuneraciones)</div>
                <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#1e40af', margin: '4px 0' }}>
                  • MOD Primer Proceso: se divide entre TODA la producción ({fmt(volAnualPlanta, 0)} und)
                </div>
                {tablaModulos(modulosP1, calcP1, 'modP1')}
                <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#c2410c', margin: '8px 0 4px 0' }}>
                  • MOD Segundo Proceso: se divide entre TODA la producción ({fmt(volAnualPlanta, 0)} und)
                </div>
                {tablaModulos(modulosP2, calcP2, 'modP2')}
              </div>

              {/* 5. CIF */}
              <div className="reporte-seccion">
                <div className="reporte-seccion-titulo">5. Costos Indirectos de Fabricación (CIF) - Proporcional a la producción total</div>
                {tablaModulos(modulosCIF, calcCIF, 'modCIF')}
              </div>

              {/* 6. EMBALAJE */}
              <div className="reporte-seccion">
                <div className="reporte-seccion-titulo">6. Embalaje (Costeo de Logística)</div>
                <table>
                  <thead><tr><th>Producto</th><th>Costo Unit. Embalaje</th><th>Costo Total</th></tr></thead>
                  <tbody>
                    {filas.map(f => (
                      <tr key={f.prod}>
                        <td style={{ textAlign: 'left' }}>{f.prod}</td>
                        <td>S/ {fmt(embalajePorProducto[f.prod] || 0, 4)}</td>
                        <td style={{ fontWeight: 'bold' }}>S/ {fmt(f.embalaje)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 7. RESUMEN FINANCIERO */}
              <div className="reporte-seccion">
                <div className="reporte-seccion-titulo">7. Resumen Financiero Consolidado por Producto</div>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '16%' }}>Producto</th><th>Volumen (und)</th><th>% Part.</th>
                      <th>Mat. Primas</th><th>Suministros</th><th>Embalaje</th><th>MOD 1er Proceso</th><th>MOD 2do Proceso</th><th>CIF</th>
                      <th style={{ backgroundColor: '#e2e8f0', color: '#1e293b' }}>Costo Total</th>
                      <th style={{ backgroundColor: '#e2e8f0', color: '#1e293b' }}>Costo Unit.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(f => (
                      <tr key={f.prod}>
                        <td style={{ textAlign: 'left', fontWeight: 'bold' }}>{f.prod}</td>
                        <td>{fmt(f.vol, 0)}</td>
                        <td>{pct(f.vol, volAnualPlanta)}%</td>
                        <td>S/ {fmt(f.p1Mat)}</td>
                        <td>S/ {fmt(f.p2Sum)}</td>
                        <td>S/ {fmt(f.embalaje)}</td>
                        <td>S/ {fmt(f.p1Mod)}</td>
                        <td>S/ {fmt(f.p2Mod)}</td>
                        <td>S/ {fmt(f.cif)}</td>
                        <td style={{ fontWeight: 'bold', backgroundColor: '#f8fafc' }}>S/ {fmt(f.total)}</td>
                        <td style={{ fontWeight: 'bold', backgroundColor: '#f8fafc', color: '#166534' }}>S/ {fmt(f.cUnit, 4)}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 'bold', borderTop: '2px solid #94a3b8', background: '#e2e8f0' }}>
                      <td style={{ textAlign: 'left' }}>TOTAL CONSOLIDADO</td>
                      <td>{fmt(totalPlanta.vol, 0)}</td>
                      <td>100.00%</td>
                      <td>S/ {fmt(totalPlanta.p1Mat)}</td>
                      <td>S/ {fmt(totalPlanta.p2Sum)}</td>
                      <td>S/ {fmt(totalPlanta.embalaje)}</td>
                      <td>S/ {fmt(totalPlanta.p1Mod)}</td>
                      <td>S/ {fmt(totalPlanta.p2Mod)}</td>
                      <td>S/ {fmt(totalPlanta.cif)}</td>
                      <td>S/ {fmt(totalPlanta.total)}</td>
                      <td>S/ {fmt(totalPlanta.vol > 0 ? totalPlanta.total / totalPlanta.vol : 0, 4)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 8. ANEXO: CONSOLIDADO DE INSUMOS */}
              <div className="reporte-seccion">
                <div className="reporte-seccion-titulo">8. Anexo: Consumo Consolidado de Insumos y Suministros (Total Planta)</div>
                {[['Materias Primas', 'detMat', '#1e40af'], ['Suministros y Envases', 'detSum', '#c2410c']].map(([titulo, campo, color]) => (
                  <div key={campo}>
                    <div style={{ fontSize: '10px', fontWeight: 'bold', color, margin: '6px 0 2px 0' }}>{titulo}</div>
                    <table>
                      <thead><tr><th>Insumo</th><th>Consumo Total Planta</th><th>Costo Total (S/)</th></tr></thead>
                      <tbody>
                        {consolidar(campo).map((it, i) => (
                          <tr key={i}>
                            <td style={{ textAlign: 'left' }}>{it.insumo}</td>
                            <td style={{ fontWeight: 'bold' }}>{fmt(it.consumo, 1)} {it.udm}</td>
                            <td style={{ fontWeight: 'bold' }}>S/ {fmt(it.costo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* FOOTER DE BOTONES */}
      <div className="offcanvas-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', gap: '12px', justifyContent: 'flex-end', background: 'white' }}>
        <button 
          type="button" 
          onClick={handleImprimirReporte} 
          style={{ background: '#475569', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          🖨️ Imprimir / Exportar PDF
        </button>

        <button type="button" onClick={onCancelar} className="btn-back m-0" style={{ background: 'white', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer' }}>{isSoloLectura ? 'Cerrar' : 'Cancelar'}</button>
        {!isSoloLectura && <button type="button" onClick={handleGuardar} className="btn-add m-0" style={{ background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>Guardar Costeo</button>}
      </div>
      
    </div>
  );
}
