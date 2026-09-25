import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { maestroForecastComercial, maestroCuentas, configModulos, MESES } from '../../config/data';
import { 
  listarForecastComercial, 
  listarRegistrosParaCosteo, 
  guardarRegistrosLote, 
  obtenerProductosOdoo, 
  obtenerCuentasOdoo,
  obtenerFormulasOdoo, obtenerCostoEmbalajePorProducto
} from '../../data/store';
import '../../index.css';

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS_DISPONIBLES = Array.from({ length: 5 }, (_, i) => (ANIO_ACTUAL - 1 + i).toString());
const MODULOS_EXCLUIDOS_DESTINO = ['Costeo de Crisoles', 'Costeo de Fundente', 'Forecast de Ventas'];
const MODULOS_DESTINO_DISPONIBLES = Object.keys(configModulos || {}).filter(m => !MODULOS_EXCLUIDOS_DESTINO.includes(m));
const CUENTA_MATERIA_PRIMA = '6121000 - Materias primas - Materias primas';
const CUENTA_ENVASES = '6141000 - Envases y embalajes - Envases';

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

// Fundente solo usa Granel, Sachet y CIF.
// 'Primer Proceso' y 'Segundo Proceso' son de Crisoles: se ignoran aquí.
// Internamente: Granel = mezclado (entre toda la producción), Sachet = ensachetado (solo sachet).
const clasificarProceso = (proceso) => {
  const s = normalizarTexto(proceso).trim();
  if (s === 'granel') return 'Primer Proceso';
  if (s === 'sachet') return 'Segundo Proceso';
  if (s === 'primer proceso' || s === 'segundo proceso') return null;
  return 'CIF';
};

export default function CosteoFundenteForm({ registro, onGuardar, onCancelar, modo, idVersion, area }) {
  const isSoloLectura = modo === 'ver';

  const forecastFundentes = useMemo(() => {
    const real = listarForecastComercial(idVersion);
    return real.length > 0 ? real : maestroForecastComercial;
  }, [idVersion]);

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
        if (activo && Array.isArray(resCuentas)) setCuentasBD(resCuentas);

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

  const { insumosP1, insumosP2 } = useMemo(() => {
    const p1 = [];
    const p2 = [];
    productosBD.forEach(p => {
      const cat = String(p.categoria || p.categ_id || p.tipo || '').toLowerCase();
      const esProceso1 = (cat.includes('materia prima') || cat.includes('insumo') || cat.includes('quimico')) 
                         && !cat.includes('aseo') && !cat.includes('limpieza') && !cat.includes('oficina');
      const esProceso2 = cat.includes('suministro') || cat.includes('envase') || cat.includes('embalaje') || cat.includes('saco') || cat.includes('sachet') || cat.includes('bobina');

      if (esProceso1) p1.push(p);
      else if (esProceso2) p2.push(p);
    });
    return { insumosP1: p1, insumosP2: p2 };
  }, [productosBD]);

  const [anioSel, setAnioSel] = useState(ANIO_ACTUAL.toString());
  const [capacidadMaximaP2, setCapacidadMaximaP2] = useState('100000');
  const [productosBase, setProductosBase] = useState([]);
  const [isPrinting, setIsPrinting] = useState(false);

  const [filaInsumoAbierta, setFilaInsumoAbierta] = useState(null);
  const [filaCuentaAbierta, setFilaCuentaAbierta] = useState(null);
  const [detallesComercialesPorProducto, setDetallesComercialesPorProducto] = useState({});

  useEffect(() => {
    const handleClickFuera = (event) => {
      if (filaInsumoAbierta && !event.target.closest(`[data-dropdown-row="${filaInsumoAbierta}"]`)) setFilaInsumoAbierta(null);
      if (filaCuentaAbierta && !event.target.closest(`[data-dropdown-cuenta="${filaCuentaAbierta}"]`)) setFilaCuentaAbierta(null);
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, [filaInsumoAbierta, filaCuentaAbierta]);

  const obtenerInsumosFiltrados = (lista, query) => {
    const textoFiltro = Array.isArray(query) ? query[1] : query;
    const q = String(textoFiltro || '').trim().toLowerCase();
    if (q.length < 1) return lista.slice(0, 30);
    return lista.filter(p => String(p.nombre || p.descripcion || '').toLowerCase().includes(q)).slice(0, 30);
  };

  const obtenerFactorPorUnidad = (unidadMedida) => {
    if (!unidadMedida) return 1;
    const u = unidadMedida.toLowerCase().trim();
    if (u === 'saco 25kg' || u === 'bolsa 25kg') return 25;
    const matchNumero = u.match(/(\d+)/);
    if (matchNumero) return parseInt(matchNumero[1], 10);
    return 1;
  };

  const [productosSeleccionados, setProductosSeleccionados] = useState([]);
  const [configProductos, setConfigProductos] = useState({}); 
  const [productoTabActivo, setProductoTabActivo] = useState('');

  const [materiales, setMateriales] = useState([]);
  const [suministros, setSuministros] = useState([]);
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

  const cargarFormulaDeProducto = (nombreProducto) => {
    if (!nombreProducto) return { materialesNuevos: [], suministrosNuevos: [] };

    const esSachet = productosSachet.some(p => p.producto.toLowerCase().trim() === nombreProducto.trim().toLowerCase());
    const tipoPresentacionLabel = esSachet ? 'SACHET' : 'GRANEL';

    const prodLimpio = nombreProducto.trim().toLowerCase();
    const nombreFormula = (f) => String(f.producto_terminado || f.nombre_producto || f.producto || '').trim().toLowerCase();
    // Primero la coincidencia EXACTA: con búsqueda parcial, "FUNDENTE #1" tomaba la
    // lista de "FUNDENTE #104" si aparecía antes. La parcial queda solo como respaldo.
    const formulaEncontrada =
      formulasBD.find(f => nombreFormula(f) === prodLimpio) ||
      formulasBD.find(f => {
        const nombreEnBd = nombreFormula(f);
        return nombreEnBd && (prodLimpio.includes(nombreEnBd) || nombreEnBd.includes(prodLimpio));
      });

    if (!formulaEncontrada || !Array.isArray(formulaEncontrada.materia_prima) || formulaEncontrada.materia_prima.length === 0) {
      return { 
        materialesNuevos: [_crearItemVacio('insumo', false, nombreProducto)], 
        suministrosNuevos: [{ ..._crearItemVacio('insumo', true, nombreProducto), formato: tipoPresentacionLabel }] 
      };
    }

    const codigoBOM = formulaEncontrada.codigo_formula || formulaEncontrada.codigo || formulaEncontrada.bom_id || 'BOM-Auto';
    // La cantidad de la BOM es para `cantidad_base` unidades: el ratio es por 1 unidad producida.
    const cantidadBase = parseFloat(formulaEncontrada.cantidad_base) > 0 ? parseFloat(formulaEncontrada.cantidad_base) : 1;
    const listaMateriales = [];
    const listaSuministros = [];

    formulaEncontrada.materia_prima.forEach((ins, idx) => {
      const nombreInsumo = Array.isArray(ins.insumo) ? String(ins.insumo[1]) : String(ins.insumo || ins.nombre || 'Insumo');
      const insumoLimpio = nombreInsumo.trim().toLowerCase();

      const productoEnMaestro = productosBD.find(p => {
        const pNombre = String(p.nombre || p.descripcion || '').trim().toLowerCase();
        return pNombre === insumoLimpio || pNombre.includes(insumoLimpio) || insumoLimpio.includes(pNombre);
      });

      const catProd = String(productoEnMaestro?.categoria || productoEnMaestro?.categ_id || ins.categoria || '').toLowerCase();
      const esMateriaPrimaOInsumo = catProd.includes('materia prima') || catProd.includes('insumo') || catProd.includes('químico');
      const esEnvaseOEmbalaje = !esMateriaPrimaOInsumo && (
        catProd.includes('envase') || catProd.includes('embalaje') || catProd.includes('saco') || catProd.includes('sachet') ||
        insumoLimpio.includes('bolsa') || insumoLimpio.includes('balde') || insumoLimpio.includes('precinto') || insumoLimpio.includes('caja') || insumoLimpio.includes('bobina')
      );

      const costoMaestro = productoEnMaestro ? (parseFloat(productoEnMaestro.costo) > 0 ? parseFloat(productoEnMaestro.costo) : parseFloat(productoEnMaestro.precio_venta) || 0) : 0;
      const costoDeFormula = parseFloat(ins.costo_estandar || ins.costo || ins.costo_unitario || 0);
      const costoFinal = costoDeFormula > 0 ? costoDeFormula : costoMaestro;

      const itemFormateado = {
        id: `auto-${Date.now()}-${idx}-${Math.random()}`,
        productoAsociado: nombreProducto,
        codigoFormula: codigoBOM,
        insumo: nombreInsumo,
        cuenta: String(ins.cuenta_contable || ins.cuenta || ''),
        moduloDestino: esEnvaseOEmbalaje ? 'Envases y Embalajes' : 'Materias Primas',
        udm: String(ins.unidad_medida || ins.unidad || (esEnvaseOEmbalaje ? 'unidad' : 'kg')),
        tipoCalculo: 'ratio',
        modoCalculoP2: 'ratio',
        formato: tipoPresentacionLabel,
        valor: String(+((parseFloat(ins.cantidad_por_unidad || ins.cantidad || 0) || 0) / cantidadBase).toFixed(6)),
        // FIX: el reduce ahora tiene valor inicial {} (antes generaba claves basura 0, 1, 2...)
        porcentajeAsignacionMeses: MESES.reduce((acc, m) => ({ ...acc, [m]: '100' }), {}),
        costoUnitario: costoFinal > 0 ? costoFinal.toFixed(4) : '0',
        usarParticipacion: false
      };

      if (esEnvaseOEmbalaje) {
        listaSuministros.push(itemFormateado);
      } else {
        listaMateriales.push(itemFormateado);
      }
    });

    if (listaSuministros.length === 0) {
      listaSuministros.push({ ..._crearItemVacio('insumo', true, nombreProducto), formato: tipoPresentacionLabel });
    }

    return { materialesNuevos: listaMateriales, suministrosNuevos: listaSuministros };
  };

  // Los módulos ya no llevan `tipoAsignacionCIF`: el CIF se reparte proporcional a la producción total.
  const adaptarModulosLegacy = (lista) => (lista || []).map(item => {
    const { tipoAsignacionCIF, ...resto } = item;
    return {
      ...resto,
      porcentajesMes: item.porcentajesMes || MESES.reduce((acc, m) => ({ ...acc, [m]: item.porcentaje ?? '100' }), {}),
      usarParticipacion: item.usarParticipacion || false
    };
  });

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
        setConfigProductos({ [productoUnico]: { margen: dc.margen_produccion?.toString() || '0', cantidades: dc.cantidades_comercial || dc.cantidades || MESES.reduce((acc, m) => ({ ...acc, [m]: '0' }), {}) } });
      } else if (dc.productos_seleccionados) {
        setProductosSeleccionados(dc.productos_seleccionados);
        if (dc.productos_seleccionados.length > 0) setProductoTabActivo(dc.productos_seleccionados[0]);
        if (dc.config_productos) setConfigProductos(dc.config_productos);
      }

      const adaptarInsumos = (lista, modDefault) => (lista || []).map(item => ({
        ...item,
        productoAsociado: item.productoAsociado || '',
        porcentajeAsignacionMeses: item.porcentajeAsignacionMeses || MESES.reduce((acc, m) => ({ ...acc, [m]: '100' }), {}),
        modoCalculoP2: item.modoCalculoP2 || 'ratio',
        formato: item.formato || 'granel',
        montoManualMeses: item.montoManualMeses || MESES.reduce((acc, m) => ({ ...acc, [m]: '0' }), {}),
        valor: item.valor || '0',
        usarParticipacion: item.usarParticipacion || false,
        moduloDestino: item.moduloDestino || modDefault
      }));

      if (dc.materiales) setMateriales(adaptarInsumos(dc.materiales, 'Materias Primas'));
      if (dc.suministros) setSuministros(adaptarInsumos(dc.suministros, 'Envases y Embalajes'));
      if (dc.modulosP1) setModulosP1(adaptarModulosLegacy(dc.modulosP1));
      if (dc.modulosP2) setModulosP2(adaptarModulosLegacy(dc.modulosP2));
      if (dc.modulosCIF) setModulosCIF(adaptarModulosLegacy(dc.modulosCIF));
    }
  }, [registro]);

  const { productosGranel, productosSachet, formatosSachet } = useMemo(() => {
  const mapaGranel = new Map();
  const mapaSachet = new Map();
  const formatos = {};
  const anioTarget = String(anioSel).trim();

  forecastFundentes.forEach(reg => {
    const dc = reg.detalle_columnas || reg;
    const rawDate = String(dc.anio_proyeccion || reg.fecha_proyeccion || reg.fecha || ANIO_ACTUAL);
    const anioReg = (rawDate.match(/\b(20\d{2})\b/) || [null, ANIO_ACTUAL])[1];

    if (anioReg !== anioTarget) return;

    const categoriaProd = String(dc.categoria || reg.categoria || '').toLowerCase().trim();
    const nombreProd = String(dc.producto || '').toLowerCase().trim();
    
    const esApto = String(dc.unidad_negocio || '').toLowerCase().trim() === 'fundente';
    
    if (dc.producto && esApto) {
      const presentacionValor = dc.presentacion_fundente || reg.presentacion_fundente || dc.presentacion || reg.presentacion || dc.tipo_presentacion || reg.tipo_presentacion || 'granel';
      const presentacion = String(presentacionValor).toLowerCase().trim();
      const nombreLimpio = String(dc.producto).trim();

      if (presentacion.includes('sachet')) {
        if (!mapaSachet.has(nombreLimpio)) mapaSachet.set(nombreLimpio, { producto: nombreLimpio });
        if (dc.unidad_sachet && !formatos[nombreLimpio]) formatos[nombreLimpio] = dc.unidad_sachet;
      } else {
        if (!mapaGranel.has(nombreLimpio)) mapaGranel.set(nombreLimpio, { producto: nombreLimpio });
      }
    }
  });

  return {
    productosGranel: Array.from(mapaGranel.values()),
    productosSachet: Array.from(mapaSachet.values()),
    formatosSachet: formatos
  };
}, [forecastFundentes, anioSel]);

  const productosAgrupados = useMemo(() => [...productosGranel, ...productosSachet], [productosGranel, productosSachet]);

  useEffect(() => {
    if (productosSeleccionados.length > 0 && !registro) {
      const anioTarget = String(anioSel).trim();
      const nuevaConfig = { ...configProductos };
      const nuevosDetalles = { ...detallesComercialesPorProducto };

      productosSeleccionados.forEach(nombreProd => {
        const registrosDelProd = forecastFundentes.filter(r => {
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
                detallesComerciales[m].push(`${cantidadComercial} ${unidadComercial} (= ${cantidadBase.toLocaleString()} kg)`);
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
  }, [anioSel, forecastFundentes, productosSeleccionados]);

  const handleToggleProducto = (nombreProd) => {
    let nuevosSel = [...productosSeleccionados];
    const nuevaConfig = { ...configProductos };

    if (nuevosSel.includes(nombreProd)) {
      nuevosSel = nuevosSel.filter(p => p !== nombreProd);
      delete nuevaConfig[nombreProd];
      
      setMateriales(prev => prev.filter(m => m.productoAsociado !== nombreProd));
      setSuministros(prev => prev.filter(s => s.productoAsociado !== nombreProd));
    } else {
      nuevosSel.push(nombreProd);
      
      const resultadoFormula = cargarFormulaDeProducto(nombreProd);
      setMateriales(prev => [...prev, ...resultadoFormula.materialesNuevos]);
      setSuministros(prev => [...prev, ...resultadoFormula.suministrosNuevos]);

      const anioTarget = String(anioSel).trim();
      const registrosDelProd = forecastFundentes.filter(r => {
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
      resultado[m] = { prod: prodTotal, prodEfectivaP2, maxCap, saturado };
    });
    return resultado;
  }, [cantidadesProduccionTotal, capacidadMaximaP2]);

  const calculoBaseDetallado = useMemo(() => {
    const totalesBaseComercial = MESES.reduce((acc, m) => ({ ...acc, [m]: 0 }), {});
    const anioTarget = String(anioSel).trim();

    productosBase.forEach(prodNombre => {
      const registrosDelProd = forecastFundentes.filter(r => {
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
  }, [productosBase, forecastFundentes, anioSel, configProductos]);

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
  () => obtenerCostoEmbalajePorProducto({ idVersion, anio: anioSel, unidadNegocio: 'Fundente' }),
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
        if (!procKey) return;   // Primer/Segundo Proceso son de Crisoles

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
        if (!tieneMontos) {
          delete estructura[k][mod];
        }
      });
    });

    return estructura;
  }, [idVersion, area, anioSel]);

  const procesarListaInsumosP1 = (lista) => {
    let totalAnual = 0;
    const calculados = lista.map(item => {
      const factor = item.tipoCalculo === 'porcentaje' ? (parseFloat(item.valor) / 100 || 0) : (parseFloat(item.valor) || 0);
      let costoTotal = 0;
      let consumoTotal = 0;
      
      MESES.forEach(m => {
        const cantsProd = item.productoAsociado ? calcularProdPorProducto(item.productoAsociado) : cantidadesProduccionTotal;
        const cantMes = cantsProd[m] || 0;
        const pctAsignacionMes = pct100(item.porcentajeAsignacionMeses?.[m]);
        const pctMap = item.productoAsociado ? obtenerPorcentajesParticipacionProd(item.productoAsociado) : calculoBaseGlobal.porcentajes;
        const pctPart = item.usarParticipacion ? (parseFloat(pctMap[m]) || 0) : 100;
        
        const consumo = (cantMes * factor) * (pctAsignacionMes / 100) * (pctPart / 100);
        
        consumoTotal += consumo;
        costoTotal += consumo * (parseFloat(item.costoUnitario) || 0);
      });
      totalAnual += costoTotal;
      return { ...item, costoTotal, consumoTotal };
    });
    return { calculados, totalAnual };
  };

  const procesarListaInsumosP2 = (lista) => {
    let totalAnual = 0;
    const calculados = lista.map(item => {
      let costoTotal = 0;
      let consumoTotal = 0;
      
      MESES.forEach(m => {
        const cantsProd = item.productoAsociado ? calcularProdPorProducto(item.productoAsociado) : cantidadesProduccionTotal;
        const cantMesTotalProd = cantsProd[m] || 0;
        
        const infoCap = analisisCapacidadP2[m] || { prod: 1, prodEfectivaP2: 1 };
        const propornP2 = infoCap.prod > 0 ? (cantMesTotalProd / infoCap.prod) : 1;
        const cantMesP2Efectiva = infoCap.prodEfectivaP2 * propornP2;

        const pctAsigMes = pct100(item.porcentajeAsignacionMeses?.[m]);
        const pctMap = item.productoAsociado ? obtenerPorcentajesParticipacionProd(item.productoAsociado) : calculoBaseGlobal.porcentajes;
        const pctPart = item.usarParticipacion ? (parseFloat(pctMap[m]) || 0) : 100;
        
        let costoMes = 0;
        let consumo = 0;

        if (item.modoCalculoP2 === 'manual') {
          const bruto = parseFloat(item.montoManualMeses?.[m]) || 0;
          costoMes = bruto * (pctAsigMes / 100) * (pctPart / 100);
          consumo = costoMes / (parseFloat(item.costoUnitario) || 1);
        } else {
          let factor = parseFloat(item.valor) || 0;
          consumo = (cantMesP2Efectiva * factor) * (pctAsigMes / 100) * (pctPart / 100);
          costoMes = consumo * (parseFloat(item.costoUnitario) || 0);
        }
        
        consumoTotal += consumo;
        costoTotal += costoMes;
      });
      totalAnual += costoTotal;
      return { ...item, costoTotal, consumoTotal };
    });
    return { calculados, totalAnual };
  };

  const matCalc = procesarListaInsumosP1(materiales);
  const sumCalc = procesarListaInsumosP2(suministros);

  const calcularModulosConPorcentajes = (listaAsignaciones, procKey) => {
    let totalAsignadoAnual = 0;
    const calculados = listaAsignaciones.map(item => {
      const dbMeses = agrupadosBD[procKey][item.moduloNombre] || MESES.reduce((acc, m) => ({ ...acc, [m]: 0 }), {});
      const pctMeses = item.porcentajesMes || MESES.reduce((acc, m) => ({ ...acc, [m]: '100' }), {});
      let costoAsignadoAnual = 0;
      const mesesAsignados = {};

      MESES.forEach(m => {
        const costoBaseModulo = dbMeses[m] || 0;
        const pctMes = item.usarParticipacion ? (parseFloat(calculoBaseGlobal.porcentajes[m]) || 0) : pct100(pctMeses[m]);
        const asig = costoBaseModulo * (pctMes / 100);
        mesesAsignados[m] = asig;
        costoAsignadoAnual += asig;
      });

      totalAsignadoAnual += costoAsignadoAnual;
      return { ...item, dbMeses, mesesAsignados, costoAsignadoAnual };
    });
    return { calculados, totalAsignadoAnual };
  };

  const calcP1 = calcularModulosConPorcentajes(modulosP1, 'Primer Proceso');
  const calcP2 = calcularModulosConPorcentajes(modulosP2, 'Segundo Proceso');
  const calcCIF = calcularModulosConPorcentajes(modulosCIF, 'CIF');

  // ==========================================================================
  // NÚCLEO DE CÁLCULO FINANCIERO (única fuente para pantalla, impresión y guardado)
  //  - MOD mezclado (Primer Proceso): se divide entre TODA la producción (granel + sachet)
  //  - MOD ensachetado (Segundo Proceso): solo se suma a los fundentes en sachet
  //  - CIF: proporcional a la producción total de cada mes
  // ==========================================================================
  const datosFinancierosGlobales = useMemo(() => {
    const volMensualPlanta = {}, volMensualSachet = {}, volMensualGranel = {};
    MESES.forEach(m => { volMensualPlanta[m] = 0; volMensualSachet[m] = 0; volMensualGranel[m] = 0; });

    const cantsPorProd = {};
    productosSeleccionados.forEach(prod => {
      const cants = calcularProdPorProducto(prod);
      const esSachet = productosSachet.some(p => p.producto.toLowerCase().trim() === prod.toLowerCase().trim());
      cantsPorProd[prod] = cants;
      MESES.forEach(m => {
        const val = cants[m] || 0;
        volMensualPlanta[m] += val;
        if (esSachet) volMensualSachet[m] += val; else volMensualGranel[m] += val;
      });
    });

    const sumaAnual = (o) => MESES.reduce((s, m) => s + o[m], 0);
    const volAnualPlanta = sumaAnual(volMensualPlanta);
    const volAnualSachet = sumaAnual(volMensualSachet);
    const volAnualGranel = sumaAnual(volMensualGranel);

    const pctModulo = (mod, m) => mod.usarParticipacion
      ? (parseFloat(calculoBaseGlobal.porcentajes[m]) || 0)
      : pct100(mod.porcentajesMes?.[m]);

    // Costo anual de un módulo que le toca a un producto, según la base de reparto
    const repartirModulo = (mod, procKey, cantsMes, volMensualBase) => {
      const dbMeses = agrupadosBD[procKey][mod.moduloNombre] || {};
      return MESES.reduce((acc, m) => {
        const base = volMensualBase[m] || 0;
        const prop = base > 0 ? (cantsMes[m] || 0) / base : 0;
        return acc + (dbMeses[m] || 0) * (pctModulo(mod, m) / 100) * prop;
      }, 0);
    };

    const filas = productosSeleccionados.map(prod => {
      const esSachet = productosSachet.some(p => p.producto.toLowerCase().trim() === prod.toLowerCase().trim());
      const cantsMes = cantsPorProd[prod];
      const vol = MESES.reduce((s, m) => s + (cantsMes[m] || 0), 0);
      const pct = volAnualPlanta > 0 ? vol / volAnualPlanta : 0;
      const pctPartMap = obtenerPorcentajesParticipacionProd(prod);
      const costoEmbalajeUnit = embalajePorProducto[prod] ?? null; // null = "sin costeo de Logística"
      const embalaje = costoEmbalajeUnit != null ? costoEmbalajeUnit * vol : 0;

      // --- Materias primas ---
      const detMat = [];
      materiales.forEach(mat => {
        if (!mat.insumo || (mat.productoAsociado && mat.productoAsociado !== prod)) return;
        const factor = mat.tipoCalculo === 'porcentaje' ? (parseFloat(mat.valor) / 100 || 0) : (parseFloat(mat.valor) || 0);
        let consumo = 0, costo = 0;
        MESES.forEach(m => {
          const pctAsig = pct100(mat.porcentajeAsignacionMeses?.[m]);
          const pctIns = mat.usarParticipacion ? (parseFloat(pctPartMap[m]) || 0) : 100;
          const c = (cantsMes[m] || 0) * factor * (pctAsig / 100) * (pctIns / 100);
          consumo += c;
          costo += c * (parseFloat(mat.costoUnitario) || 0);
        });
        detMat.push({ insumo: mat.insumo, udm: mat.udm, costoUnitario: mat.costoUnitario, consumo, costo });
      });

      // --- Envases y embalajes ---
      const detSum = [];
      suministros.forEach(sum => {
        if (!sum.insumo || (sum.productoAsociado && sum.productoAsociado !== prod)) return;
        let consumo = 0, costo = 0;
        MESES.forEach(m => {
          const cantM = cantsMes[m] || 0;
          const infoCap = analisisCapacidadP2[m] || { prod: 1, prodEfectivaP2: 1 };
          const prop = infoCap.prod > 0 ? cantM / infoCap.prod : 1;
          const cantP2 = infoCap.prodEfectivaP2 * prop;
          const pctAsig = pct100(sum.porcentajeAsignacionMeses?.[m]);
          const pctIns = sum.usarParticipacion ? (parseFloat(pctPartMap[m]) || 0) : 100;
          if (sum.modoCalculoP2 === 'manual') {
            const costoMes = (parseFloat(sum.montoManualMeses?.[m]) || 0) * (pctAsig / 100) * (pctIns / 100);
            costo += costoMes;
            consumo += costoMes / (parseFloat(sum.costoUnitario) || 1);
          } else {
            const c = cantP2 * (parseFloat(sum.valor) || 0) * (pctAsig / 100) * (pctIns / 100);
            consumo += c;
            costo += c * (parseFloat(sum.costoUnitario) || 0);
          }
        });
        detSum.push({ insumo: sum.insumo, udm: sum.udm, costoUnitario: sum.costoUnitario, consumo, costo });
      });

      // --- MOD mezclado: entre TODA la producción ---
      const modP1 = modulosP1.map(mod => repartirModulo(mod, 'Primer Proceso', cantsMes, volMensualPlanta));
      // --- MOD ensachetado: solo entre los productos en sachet ---
      const modP2 = modulosP2.map(mod => esSachet ? repartirModulo(mod, 'Segundo Proceso', cantsMes, volMensualSachet) : 0);
      // --- CIF: proporcional a TODA la producción ---
      const modCIF = modulosCIF.map(mod => repartirModulo(mod, 'CIF', cantsMes, volMensualPlanta));

      const suma = (arr, k) => arr.reduce((s, x) => s + (k ? x[k] : x), 0);
      const p1Mat = suma(detMat, 'costo');
      const p2Sum = suma(detSum, 'costo');
      const p1Mod = suma(modP1);
      const p2Mod = suma(modP2);
      const cif = suma(modCIF);
      const total = p1Mat + p2Sum + embalaje + p1Mod + p2Mod + cif;
      return { prod, esSachet, vol, pct, detMat, detSum, modP1, modP2, modCIF, p1Mat, p1Mod, p1: p1Mat + p1Mod, p2Sum, p2Mod, p2: p2Sum + p2Mod, embalaje, embalajePendiente: costoEmbalajeUnit == null, cif, total, cUnit: vol > 0 ? total / vol : 0 };
    });

    const CLAVES = ['vol', 'p1Mat', 'p2Sum', 'embalaje', 'p1Mod', 'p2Mod', 'cif', 'total'];
    const resumir = (rows) => CLAVES.reduce(
      (acc, k) => ({ ...acc, [k]: rows.reduce((s, f) => s + f[k], 0) }),
      { nombres: rows.map(f => f.prod) }
    );
    

    return {
      volMensualPlanta, volMensualSachet, volMensualGranel,
      volAnualPlanta, volAnualSachet, volAnualGranel,
      cantsPorProd, filas,
      totalPlanta: resumir(filas),
      totalesSachet: resumir(filas.filter(f => f.esSachet)),
      totalesGranel: resumir(filas.filter(f => !f.esSachet))
    };
  }, [productosSeleccionados, productosSachet, materiales, modulosP1, suministros, modulosP2, modulosCIF, configProductos, analisisCapacidadP2, calculoBaseGlobal, agrupadosBD]);


  const seleccionarInsumoP1 = (id, prodBd) => {
    setMateriales(prev => prev.map(m => {
      if (m.id === id) {
        const costoReal = parseFloat(prodBd.costo) > 0 ? parseFloat(prodBd.costo) : (parseFloat(prodBd.precio_venta) || 0);
        return { ...m, insumo: prodBd.nombre || prodBd.descripcion, costoUnitario: costoReal.toFixed(4), udm: prodBd.unidad || m.udm };
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
          costoUnitario: costoReal > 0 ? costoReal.toFixed(4) : '0', 
          udm: prodBd.unidad || prodBd.uom || s.udm || 'unidad'
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
                        type="number" step="0.1" value={item.usarParticipacion ? (calculoBaseGlobal.porcentajes[m] || '0') : (pctMeses[m] ?? '100')}
                        disabled={item.usarParticipacion} onChange={e => actualizarPct(item.id, m, e.target.value)}
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
    setTimeout(() => { window.print(); setIsPrinting(false); }, 200);
  };

  const handleGuardar = () => {
    if (productosSeleccionados.length === 0) return alert('Seleccione al menos un producto a costear.');
    if (cantidadTotalProduccionAnio <= 0) return alert('La cantidad total de producción debe ser mayor a 0.');

    const pendientes = datosFinancierosGlobales.filas.filter(f => f.embalajePendiente).map(f => f.prod);
    if (pendientes.length > 0) {
      return alert(`Falta el costeo de embalaje (Logística) para: ${pendientes.join(', ')}. Coordina con Logística antes de guardar.`);
    }

    const idLoteBase = registro ? (registro.id_lote || registro.id_registro) : `LOTE-FUN-${Date.now()}`;
    const registrosAGuardar = [];

    const formatearCuentaConPrefijo92 = (cuentaOriginal) => {
      if (!cuentaOriginal) return '92';
      const cuentaLimpia = cuentaOriginal.trim();
      const matchCodigo = cuentaLimpia.match(/^(\d+)/);
      const codigo = matchCodigo ? matchCodigo[1] : '';
      const resto = codigo ? cuentaLimpia.slice(codigo.length).trim() : cuentaLimpia;
      const base = codigo.length > 7 ? codigo.slice(-7) : codigo;
      return `92${base} ${resto}`.trim();
    };

    productosSeleccionados.forEach((nombreProd, pIdx) => {
      const idRegistroProd = (registro && nombreProd === registro.detalle_columnas?.producto)
        ? registro.id_registro
        : `FUN-${Date.now()}-${pIdx}`;
      const prodCantsComercial = configProductos[nombreProd]?.cantidades || MESES.reduce((acc, m) => ({ ...acc, [m]: '0' }), {});
      const margenProd = parseFloat(configProductos[nombreProd]?.margen) || 0;
      
      const prodCantsProduccion = MESES.reduce((acc, m) => {
        const com = parseFloat(prodCantsComercial[m]) || 0;
        acc[m] = Math.ceil(com * (1 + (margenProd / 100)));
        return acc;
      }, {});

      const totalComercialProd = MESES.reduce((acc, m) => acc + (parseFloat(prodCantsComercial[m]) || 0), 0);
      const totalProduccionProd = MESES.reduce((acc, m) => acc + (prodCantsProduccion[m] || 0), 0);

      const desgloseProdContable = [];
      const datosFinancierosProd = datosFinancierosGlobales.filas.find(f => f.prod === nombreProd);

      materiales.forEach((mat, mIdx) => {
        if (mat.insumo && (!mat.productoAsociado || mat.productoAsociado === nombreProd)) {
          const factor = mat.tipoCalculo === 'porcentaje' ? (parseFloat(mat.valor) / 100 || 0) : (parseFloat(mat.valor) || 0);
          let costoMatProd = 0;
          const cuentaConPrefijo = formatearCuentaConPrefijo92(CUENTA_MATERIA_PRIMA);

          MESES.forEach((mes, iM) => {
            const mesNum = String(iM + 1).padStart(2, '0');
            const cantMes = prodCantsProduccion[mes] || 0;
            const pctAsig = pct100(mat.porcentajeAsignacionMeses?.[mes]);
            const pctPart = mat.usarParticipacion ? (parseFloat(obtenerPorcentajesParticipacionProd(nombreProd)[mes]) || 0) : 100;
            
            const consumo = (cantMes * factor) * (pctAsig / 100) * (pctPart / 100);
            const costoMes = consumo * (parseFloat(mat.costoUnitario) || 0);
            costoMatProd += costoMes;

            if (costoMes > 0 || consumo > 0) {
              registrosAGuardar.push({
                id_registro: `DERIV-MAT-${idRegistroProd}-${mIdx}-${mes}`,
                id_lote: idLoteBase,
                modulo: mat.moduloDestino || 'Materias Primas',
                categoria: mat.moduloDestino || 'Materias Primas',
                area,
                idVersion,
                fecha_proyeccion: `${anioSel}-${mesNum}-01`,
                empleado_dni: '-',
                empleado_nombre: `COSTEO AUTOMÁTICO - ${mat.insumo.toUpperCase()}`,
                detalle_columnas: {
                  cuenta_afectada: cuentaConPrefijo,
                  producto: `${mat.insumo.toUpperCase()} (${nombreProd})`,
                  detalle: `${mat.insumo.toUpperCase()} - Para: ${nombreProd}`,
                  unidad_medida: mat.udm,
                  costo_unitario: mat.costoUnitario,
                  cantidad: consumo,
                  costo_total: costoMes,
                  es_derivado: true,
                  extras: { producto: `${mat.insumo.toUpperCase()} (${nombreProd})` }
                },
                totales: { costo_total: costoMes }
              });
            }
          });
          if (costoMatProd > 0) desgloseProdContable.push({ id: `mat-${mIdx}`, cuenta: `${cuentaConPrefijo} - ${mat.insumo}`, monto: costoMatProd.toFixed(2) });
        }
      });

      suministros.forEach((sum, sIdx) => {
        if (sum.insumo && (!sum.productoAsociado || sum.productoAsociado === nombreProd)) {
          let costoSumProd = 0;
          const cuentaSumPrefijo = formatearCuentaConPrefijo92(CUENTA_ENVASES);

          MESES.forEach((mes, iM) => {
            const mesNum = String(iM + 1).padStart(2, '0');
            const cantMesTotalProd = prodCantsProduccion[mes] || 0;
            
            const infoCap = analisisCapacidadP2[mes] || { prod: 1, prodEfectivaP2: 1 };
            const propornP2 = infoCap.prod > 0 ? (cantMesTotalProd / infoCap.prod) : 1;
            const cantMesP2Efectiva = infoCap.prodEfectivaP2 * propornP2;

            const pctAsig = pct100(sum.porcentajeAsignacionMeses?.[mes]);
            const pctPart = sum.usarParticipacion ? (parseFloat(obtenerPorcentajesParticipacionProd(nombreProd)[mes]) || 0) : 100;
            let costoMes = 0;
            let consumo = 0;

            if (sum.modoCalculoP2 === 'manual') {
              const bruto = parseFloat(sum.montoManualMeses?.[mes]) || 0;
              costoMes = bruto * (pctAsig / 100) * (pctPart / 100);
              consumo = costoMes / (parseFloat(sum.costoUnitario) || 1);
            } else {
              let factor = parseFloat(sum.valor) || 0;
              consumo = (cantMesP2Efectiva * factor) * (pctAsig / 100) * (pctPart / 100);
              costoMes = consumo * (parseFloat(sum.costoUnitario) || 0);
            }
            costoSumProd += costoMes;

            if (costoMes > 0 || consumo > 0) {
              registrosAGuardar.push({
                id_registro: `DERIV-SUM-${idRegistroProd}-${sIdx}-${mes}`,
                id_lote: idLoteBase,
                modulo: sum.moduloDestino || 'Envases y Embalajes',
                categoria: sum.moduloDestino || 'Envases y Embalajes',
                area,
                idVersion,
                fecha_proyeccion: `${anioSel}-${mesNum}-01`,
                empleado_dni: '-',
                empleado_nombre: `COSTEO AUTOMÁTICO - ${sum.insumo.toUpperCase()}`,
                detalle_columnas: {
                  cuenta_afectada: cuentaSumPrefijo,
                  producto: `${sum.insumo.toUpperCase()} (${nombreProd})`,
                  detalle: `${sum.insumo.toUpperCase()} - Para: ${nombreProd}`,
                  unidad_medida: sum.udm,
                  costo_unitario: sum.costoUnitario,
                  cantidad: consumo,
                  costo_total: costoMes,
                  es_derivado: true,
                  extras: { producto: `${sum.insumo.toUpperCase()} (${nombreProd})` }
                },
                totales: { costo_total: costoMes }
              });
            }
          });
          if (costoSumProd > 0) desgloseProdContable.push({ id: `sum-${sIdx}`, cuenta: `${cuentaSumPrefijo} - ${sum.insumo}`, monto: costoSumProd.toFixed(2) });
        }
      });

      // Módulos (MOD y CIF) desde el mismo calculador global
      if (datosFinancierosProd.p1Mod > 0) desgloseProdContable.push({ id: `mod-p1`, cuenta: formatearCuentaConPrefijo92(`946261000 - Modulos Primer Proceso`), monto: datosFinancierosProd.p1Mod.toFixed(2) });
      if (datosFinancierosProd.p2Mod > 0) desgloseProdContable.push({ id: `mod-p2`, cuenta: formatearCuentaConPrefijo92(`946261000 - Modulos Segundo Proceso`), monto: datosFinancierosProd.p2Mod.toFixed(2) });
      if (datosFinancierosProd.cif > 0) desgloseProdContable.push({ id: `mod-cif`, cuenta: formatearCuentaConPrefijo92(`946261000 - Modulos CIF`), monto: datosFinancierosProd.cif.toFixed(2) });

      const regForecast = forecastFundentes.find(r => {
        const dc = r.detalle_columnas || r;
        return String(dc.producto || '').trim().toLowerCase() === nombreProd.toLowerCase();
      });
      const precioVentaRef = parseFloat(regForecast?.detalle_columnas?.precio_venta_unit || regForecast?.precio_venta || 0);

      const presentacion = datosFinancierosProd.esSachet ? 'Sachet' : 'Granel';

      const registroMaestroProd = {
        id_registro: idRegistroProd,
        id_lote: idLoteBase,
        modulo: 'Costeo de Fundente',
        categoria: 'Costeo de Fundente',
        area,
        idVersion,
        fecha_proyeccion: `${anioSel}-01-01`,
        empleado_dni: '-',
        empleado_nombre: nombreProd,
        detalle_columnas: {
          producto: nombreProd,
          presentacion,
          presentacion_fundente: presentacion,
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
          costo_total_anual: datosFinancierosProd.total,
          costo_unitario_promedio: datosFinancierosProd.cUnit
        },
        totales: { cantidad_total: totalProduccionProd, costo_total: datosFinancierosProd.total },
        desglose_contable: desgloseProdContable
      };

      registrosAGuardar.push(registroMaestroProd);
    });

    guardarRegistrosLote(registrosAGuardar, registro ? { reemplazar: registro.id_registro } : undefined);
    if (typeof onGuardar === 'function') onGuardar(registrosAGuardar);
    if (typeof onCancelar === 'function') onCancelar();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '82vh', width: '100%', maxWidth: '850px', margin: '0 auto', boxSizing: 'border-box', overflow: 'hidden' }}>

      <datalist id="lista-cuentas-costeo">
        {maestroCuentas.map((c, i) => <option key={i} value={c.nombre} />)}
      </datalist>
      <datalist id="lista-insumos-p1">
        {insumosP1.map((p, i) => <option key={`p1-${i}`} value={p.nombre || p.descripcion} />)}
      </datalist>
      <datalist id="lista-insumos-p2">
        {insumosP2.map((p, i) => <option key={`p2-${i}`} value={p.nombre || p.descripcion} />)}
      </datalist>

      <fieldset disabled={isSoloLectura} style={{ border: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div className="offcanvas-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', overflowX: 'hidden', padding: '16px', boxSizing: 'border-box' }}>

          {/* 1. CHECKLIST DE PRODUCTOS */}
          <div className="form-section" style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', boxSizing: 'border-box' }}>
            <div className="form-section-title" style={{ fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>1. Fundentes a Costear (Checklist del Forecast)</div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb' }}>AÑO</label>
                <select value={anioSel} onChange={e => setAnioSel(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }}>
                  {ANIOS_DISPONIBLES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#1e40af' }}>CAPACIDAD MÁXIMA P2 (KG)</label>
                <input type="number" value={capacidadMaximaP2} onChange={e => setCapacidadMaximaP2(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }} />
              </div>
            </div>

            {/* BLOQUE DE SACHET */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#c2410c', marginBottom: '4px' }}>🟠 Fundentes en Sachet:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', background: 'white', padding: '10px', borderRadius: '6px', border: '1px solid #fed7aa' }}>
                {productosSachet.length > 0 ? (
                  productosSachet.map(p => (
                    <label key={`sachet-${p.producto}`} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, color: '#334155' }}>
                      <input type="checkbox" checked={productosSeleccionados.includes(p.producto)} onChange={() => handleToggleProducto(p.producto)} />
                      {p.producto}
                      {formatosSachet[p.producto] && (
                        <span style={{ fontSize: '10px', color: '#c2410c', fontWeight: 400 }}>({formatosSachet[p.producto]})</span>
                      )}
                    </label>
                  ))
                ) : (
                  <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>No hay fundentes en sachet registrados para este año.</span>
                )}
              </div>
            </div>

            {/* BLOQUE DE GRANEL */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#1e40af', marginBottom: '4px' }}>🟢 Fundentes a Granel:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', background: 'white', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                {productosGranel.length > 0 ? (
                  productosGranel.map(p => (
                    <label key={`granel-${p.producto}`} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600, color: '#334155' }}>
                      <input type="checkbox" checked={productosSeleccionados.includes(p.producto)} onChange={() => handleToggleProducto(p.producto)} />
                      {p.producto}
                    </label>
                  ))
                ) : (
                  <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>No hay fundentes a granel registrados para este año.</span>
                )}
              </div>
            </div>

          </div>

          {/* 1.1 CONFIGURACIÓN INDIVIDUAL */}
          {productosSeleccionados.length > 0 && (
            <div className="form-section" style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Configuración y Cantidades por Fundente:</div>
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
                    <input type="number" step="0.1" value={configProductos[productoTabActivo].margen} onChange={e => setConfigProductos({ ...configProductos, [productoTabActivo]: { ...configProductos[productoTabActivo], margen: e.target.value }})} style={{ width: '80px', padding: '4px', border: '1px solid #10b981', borderRadius: '4px', background: '#ecfdf5', fontWeight: 'bold' }} />
                  </div>

                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>Volumen Mensual a Producir (KG):</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
                    {MESES.map(m => {
                      const com = parseFloat(configProductos[productoTabActivo].cantidades[m]) || 0;
                      const margenP = parseFloat(configProductos[productoTabActivo].margen) || 0;
                      const prodCalc = Math.ceil(com * (1 + (margenP / 100)));
                      const detalleMes = (detallesComercialesPorProducto[productoTabActivo] || {})[m] || [];
                      return (
                        <div key={m} style={{ background: '#f0fdf4', padding: '6px', borderRadius: '4px', textAlign: 'center', border: '1px solid #bbf7d0' }}>
                          <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#166534', display: 'block' }}>{m}</span>
                          <input type="number" value={configProductos[productoTabActivo].cantidades[m] || '0'} onChange={e => setConfigProductos({ ...configProductos, [productoTabActivo]: { ...configProductos[productoTabActivo], cantidades: { ...configProductos[productoTabActivo].cantidades, [m]: e.target.value } }})} style={{ width: '100%', padding: '2px', textAlign: 'center', fontSize: '11px', border: '1px solid #cbd5e1', borderRadius: '3px', marginBottom: '2px' }} title="Comercial (KG)" />
                          <span style={{ fontSize: '10px', fontWeight: '700', color: '#047857', display: 'block' }}>Prod: {prodCalc} KG</span>
                          <div style={{ fontSize: '9px', color: '#0369a1', marginTop: '3px', fontStyle: 'italic', borderTop: '1px dashed #bbf7d0', paddingTop: '2px' }}>
                            {detalleMes.length > 0 ? detalleMes.map((d, i) => <div key={i}>{d}</div>) : '0 KG'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* BASE DE DISTRIBUCIÓN */}
          <div className="form-section" style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '8px', fontSize: '12px' }}>Base de Distribución (% Participación Comercial)</div>
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
          </div>

          {/* 2. MATERIALES (PROCESO 1) */}
          <div className="form-section" style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div className="form-section-title" style={{ fontWeight: 700, color: '#1e293b', margin: 0 }}>2. Materiales (Mezcla - Selección de Lista de Materiales / BOM)</div>
            </div>
            
            {materiales.length === 0 && <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>Selecciona un fundente arriba para cargar sus materias primas.</div>}

            {[...new Set(materiales.map(m => m.productoAsociado))].map(prodAsociado => {
              const itemsDelGrupo = materiales.filter(m => m.productoAsociado === prodAsociado);
              const esGeneral = !prodAsociado;

              const prodLimpioBom = String(prodAsociado || '').trim().toLowerCase();
              const nombreBom = (f) => String(f.producto_terminado || f.nombre_producto || f.producto || '').trim().toLowerCase();
              // Si hay listas con el nombre EXACTO del producto se muestran solo esas
              // (evita que "FUNDENTE #1" ofrezca las de "FUNDENTE #104", "#118"...).
              const bomExactas = formulasBD.filter(f => nombreBom(f) === prodLimpioBom);
              const bomDisponiblesParaEsteProducto = bomExactas.length > 0 ? bomExactas : formulasBD.filter(f => {
                const nombreEnBd = nombreBom(f);
                return nombreEnBd && (prodLimpioBom.includes(nombreEnBd) || nombreEnBd.includes(prodLimpioBom));
              });

              const prodCants = calcularProdPorProducto(prodAsociado);
              const volumenProyectado = MESES.reduce((acc, m) => acc + (prodCants[m] || 0), 0);
              
              return (
                <div key={prodAsociado || 'general'} style={{ marginBottom: '16px', background: 'white', borderRadius: '6px', border: `1px solid ${esGeneral ? '#cbd5e1' : '#93c5fd'}`, overflow: 'hidden', width: '100%', boxSizing: 'border-box' }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: esGeneral ? '#f1f5f9' : '#eff6ff', padding: '8px 12px', borderBottom: `1px solid ${esGeneral ? '#cbd5e1' : '#bfdbfe'}`, flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 'bold', color: esGeneral ? '#475569' : '#1e3a8a', fontSize: '12px' }}>
                        📦 {prodAsociado || 'Insumos Generales'} — Vol. Proyectado: {volumenProyectado.toLocaleString()} KG
                      </span>
                      {prodAsociado && (() => {
                        const _esSachet = productosSachet.some(p => p.producto.toLowerCase().trim() === String(prodAsociado).toLowerCase().trim());
                        const _bg = _esSachet ? '#ffedd5' : '#dcfce7';
                        const _text = _esSachet ? '#9a3412' : '#166534';
                        const _label = _esSachet ? '🟠 SACHET' : '🟢 GRANEL';
                        return (
                          <span style={{ background: _bg, color: _text, padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, border: '1px solid #cbd5e1' }}>
                            {_label}{_esSachet && formatosSachet[prodAsociado] ? ` · ${formatosSachet[prodAsociado]}` : ''}
                          </span>
                        );
                      })()}
                    </div>


                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      {!esGeneral && bomDisponiblesParaEsteProducto.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 600, color: '#1e40af' }}>Seleccionar BOM:</span>
                          <select 
                            value={itemsDelGrupo[0]?.codigoFormula || ''}
                            onChange={(e) => {
                              const codigoSeleccionado = e.target.value;
                              const formulaElegida = bomDisponiblesParaEsteProducto.find(f => (f.codigo_formula || f.codigo || f.bom_id) === codigoSeleccionado);
                              if (formulaElegida && Array.isArray(formulaElegida.materia_prima)) {
                                const cantidadBase = parseFloat(formulaElegida.cantidad_base) > 0 ? parseFloat(formulaElegida.cantidad_base) : 1;
                                const nuevosInsumos = formulaElegida.materia_prima.map((ins, idx) => {
                                  const nombreInsumo = Array.isArray(ins.insumo) ? String(ins.insumo[1]) : String(ins.insumo || ins.nombre || 'Insumo');
                                  const productoEnMaestro = productosBD.find(p => String(p.nombre || p.descripcion || '').trim().toLowerCase() === nombreInsumo.trim().toLowerCase());
                                  const costoFinal = productoEnMaestro ? (parseFloat(productoEnMaestro.costo) || parseFloat(productoEnMaestro.precio_venta) || 0) : 0;
                                  
                                  return {
                                    id: `auto-${Date.now()}-${idx}`,
                                    productoAsociado: prodAsociado,
                                    codigoFormula: codigoSeleccionado,
                                    insumo: nombreInsumo,
                                    cuenta: String(ins.cuenta_contable || ins.cuenta || ''),
                                    moduloDestino: 'Materias Primas',
                                    udm: String(ins.unidad_medida || ins.unidad || 'kg'),
                                    tipoCalculo: 'ratio',
                                    valor: String(+((parseFloat(ins.cantidad_por_unidad || ins.cantidad || 0) || 0) / cantidadBase).toFixed(6)),
                                    porcentajeAsignacionMeses: MESES.reduce((acc, m) => ({ ...acc, [m]: '100' }), {}),
                                    costoUnitario: costoFinal > 0 ? costoFinal.toFixed(4) : '0',
                                    usarParticipacion: false
                                  };
                                });
                                setMateriales(prev => [...prev.filter(m => m.productoAsociado !== prodAsociado), ...nuevosInsumos]);
                              }
                            }}
                            style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', border: '1px solid #3b82f6', background: 'white', fontWeight: 'bold', color: '#1e40af', cursor: 'pointer' }}
                          >
                            {bomDisponiblesParaEsteProducto.map((b, i) => {
                              const cod = b.codigo_formula || b.codigo || b.bom_id || `BOM-${i+1}`;
                              return <option key={cod} value={cod}>{cod} ({b.nombre_formula || 'Estándar'})</option>;
                            })}
                          </select>
                        </div>
                      )}

                      <button type="button" onClick={() => setMateriales([...materiales, _crearItemVacio('insumo', false, prodAsociado)])} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                        + Agregar Insumo Manual
                      </button>
                    </div>
                  </div>
                  
                  <div style={{ padding: '10px', overflowX: 'auto', width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 2fr) 55px 75px 65px 65px 90px auto', gap: '6px', width: '100%', boxSizing: 'border-box' }}>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Insumo Químico / Materia Prima</span>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textAlign: 'center' }}>UdM</span>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Método</span>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Cant x KG</span>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Costo U.</span>
                      <span style={{ fontSize: '10px', color: '#0f172a', fontWeight: 'bold', textAlign: 'center', background: '#f1f5f9', borderRadius: '4px' }}>Totales Proy.</span>
                      <span></span>
                    </div>

                    {itemsDelGrupo.map((item) => {
                      const calculoReal = matCalc.calculados.find(c => c.id === item.id) || { consumoTotal: 0, costoTotal: 0 };

                      return (
                        <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 2fr) 50px 80px 65px 65px 95px auto', gap: '6px', alignItems: 'center', marginBottom: '6px', minWidth: '650px' }}>
                          <div data-dropdown-row={item.id} style={{ position: 'relative' }}>
                            <input type="text" value={item.insumo} onChange={e => { actMat(item.id, 'insumo', e.target.value); setFilaInsumoAbierta(item.id); }} onFocus={() => setFilaInsumoAbierta(item.id)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', background: 'white', boxSizing: 'border-box' }} placeholder="Buscar insumo..." />
                            {filaInsumoAbierta === item.id && (
                              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '0 0 6px 6px', maxHeight: '220px', overflowY: 'auto', zIndex: 50 }}>
                                {obtenerInsumosFiltrados(insumosP1, item.insumo).map((p, idx) => (
                                  <div key={idx} onClick={() => seleccionarInsumoP1(item.id, p)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 600 }}>{p.nombre || p.descripcion}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <input type="text" value={item.udm} onChange={e => actMat(item.id, 'udm', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', textAlign: 'center', boxSizing: 'border-box' }} />
                          <select value={item.tipoCalculo} onChange={e => actMat(item.id, 'tipoCalculo', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box' }}>
                            <option value="ratio">Ratio / KG</option>
                            <option value="porcentaje">% Formula</option>
                          </select>
                          <input type="number" step="0.0001" value={item.valor} onChange={e => actMat(item.id, 'valor', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box' }} />
                          <input type="number" step="0.01" value={item.costoUnitario} onChange={e => actMat(item.id, 'costoUnitario', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box' }} />
                          
                          <div style={{ background: '#f8fafc', padding: '4px 6px', borderRadius: '4px', textAlign: 'right', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxSizing: 'border-box' }}>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#0f172a' }}>{calculoReal.consumoTotal.toLocaleString('en-US', {maximumFractionDigits: 1})} {item.udm}</span>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#166534' }}>S/ {calculoReal.costoTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                          </div>

                          <button type="button" onClick={() => setMateriales(materiales.filter(i => i.id !== item.id))} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Eliminar Insumo">🗑️</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 3. SUMINISTROS envase (PROCESO 2) */}
          <div className="form-section" style={{ background: '#fdf8f6', padding: '12px', borderRadius: '8px', border: '1px solid #f97316' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div className="form-section-title" style={{ fontWeight: 700, color: '#9a3412', margin: 0 }}>3. Suministros de Envasado (Proceso 2)</div>
            </div>

            {suministros.length === 0 && <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>No hay suministros de envasado registrados.</div>}

            {[...new Set(suministros.map(s => s.productoAsociado))].map(prodAsociado => {
              const itemsDelGrupo = suministros.filter(s => s.productoAsociado === prodAsociado);
              const prodCants = calcularProdPorProducto(prodAsociado);
              const volumenProyectado = MESES.reduce((acc, m) => acc + (prodCants[m] || 0), 0);
              
              const esSachetGrupo = productosSachet.some(p => p.producto.toLowerCase().trim() === String(prodAsociado || '').toLowerCase().trim());
              const badgePresentacion = esSachetGrupo ? '🟠 SACHET' : '🟢 GRANEL';
              const colorBadgeBg = esSachetGrupo ? '#ffedd5' : '#dcfce7';
              const colorBadgeText = esSachetGrupo ? '#9a3412' : '#166534';

              return (
                <div key={prodAsociado || 'general-p2'} style={{ marginBottom: '16px', background: 'white', borderRadius: '6px', border: '1px solid #fed7aa', overflow: 'hidden', width: '100%', boxSizing: 'border-box' }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffedd5', padding: '8px 12px', borderBottom: '1px solid #fed7aa', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 'bold', color: '#9a3412', fontSize: '12px' }}>
                        📦 Empaque para: {prodAsociado || 'Insumos Generales'} — Vol. Proyectado: {volumenProyectado.toLocaleString()} KG
                      </span>
                      {prodAsociado && (
                        <span style={{ background: colorBadgeBg, color: colorBadgeText, padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, border: '1px solid #cbd5e1' }}>
                          {badgePresentacion}{esSachetGrupo && formatosSachet[prodAsociado] ? ` · ${formatosSachet[prodAsociado]}` : ''}
                        </span>
                      )}
                    </div>

                    <button 
                      type="button" 
                      onClick={() => setSuministros([...suministros, { ..._crearItemVacio('insumo', true, prodAsociado), formato: esSachetGrupo ? 'SACHET' : 'granel' }])} 
                      style={{ background: '#f97316', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                    >
                      + Agregar Empaque
                    </button>
                  </div>

                  <div style={{ padding: '10px', overflowX: 'auto', width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 2fr) 55px 90px 65px 65px 95px auto', gap: '6px', width: '100%', boxSizing: 'border-box' }}>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Suministro / Empaque</span>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textAlign: 'center' }}>UdM</span>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Modo</span>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Ratio</span>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Costo U.</span>
                      <span style={{ fontSize: '10px', color: '#0f172a', fontWeight: 'bold', textAlign: 'center', background: '#f1f5f9', borderRadius: '4px' }}>Totales Proy.</span>
                      <span></span>
                    </div>

                    {itemsDelGrupo.map((item) => {
                      const ratioNum = parseFloat(item.valor) || 0;
                      const costoUnNum = parseFloat(item.costoUnitario) || 0;
                      const cantidadTotalReq = volumenProyectado * ratioNum;
                      const costoTotalReq = cantidadTotalReq * costoUnNum;

                      return (
                        <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 2fr) 50px 90px 65px 65px 95px auto', gap: '6px', alignItems: 'center', marginBottom: '6px', minWidth: '650px' }}>
                          
                          <div data-dropdown-row={item.id} style={{ position: 'relative' }}>
                            <input 
                              type="text" 
                              value={item.insumo} 
                              onChange={e => { 
                                actSum(item.id, 'insumo', e.target.value); 
                                setFilaInsumoAbierta(item.id); 
                              }} 
                              onFocus={() => setFilaInsumoAbierta(item.id)} 
                              style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', background: 'white', boxSizing: 'border-box' }} 
                              placeholder="Buscar empaque..." 
                              autoComplete="off"
                            />
                            {filaInsumoAbierta === item.id && (
                              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '0 0 6px 6px', maxHeight: '220px', overflowY: 'auto', zIndex: 50, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                {obtenerInsumosFiltrados(insumosP2, item.insumo).map((p, idx) => (
                                  <div 
                                    key={idx} 
                                    onClick={() => seleccionarInsumoP2(item.id, p)} 
                                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                  >
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#1e293b' }}>{p.nombre || p.descripcion}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <input type="text" value={item.udm} onChange={e => actSum(item.id, 'udm', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', textAlign: 'center', boxSizing: 'border-box' }} />
                          
                          <select value={item.tipoCalculo} onChange={e => actSum(item.id, 'tipoCalculo', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box' }}>
                            <option value="ratio">Ratio / KG</option>
                            <option value="fijo">Cantidad Fija</option>
                          </select>

                          <input type="number" step="0.0001" value={item.valor} onChange={e => actSum(item.id, 'valor', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box' }} />
                          <input type="number" step="0.01" value={item.costoUnitario} onChange={e => actSum(item.id, 'costoUnitario', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box' }} />
                          
                          <div style={{ background: '#f8fafc', padding: '4px 6px', borderRadius: '4px', textAlign: 'right', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxSizing: 'border-box' }}>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#0f172a' }}>{cantidadTotalReq.toLocaleString('en-US', {maximumFractionDigits: 1})} {item.udm}</span>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#166534' }}>S/ {costoTotalReq.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                          </div>

                          <button type="button" onClick={() => setSuministros(suministros.filter(i => i.id !== item.id))} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Eliminar Suministro">🗑️</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 3.1. SUMINISTROS embalaje) */}
          <div>Embalaje (Logística): S/ {datosFinancierosGlobales.totalPlanta.embalaje.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>

          

          {/* 4. MANO DE OBRA DIRECTA */}
          <div className="form-section">
            <div className="form-section-title" style={{ fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>4. Mano de Obra Directa (Remuneraciones por Proceso)</div>
            {renderAsignacionProceso(
              'Etapa: Primer Proceso (Mezclado - Granel)', 'Primer Proceso', modulosP1, setModulosP1, actModP1, calcP1,
              'Todo el fundente pasa por mezclado: este costo se divide entre TODA la producción (granel + sachet), proporcional al volumen.'
            )}
            {renderAsignacionProceso(
              'Etapa: Segundo Proceso (Ensachetado - Sachet)', 'Segundo Proceso', modulosP2, setModulosP2, actModP2, calcP2,
              'Solo se suma al costo de los fundentes en sachet, proporcional a su volumen.'
            )}
          </div>

          

          {/* 5. CIF */}
          <div className="form-section">
            <div className="form-section-title" style={{ fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>5. Costos Indirectos de Fabricación (CIF)</div>
            {renderAsignacionProceso(
              'Módulos CIF (solo montos mayores a cero)', 'CIF', modulosCIF, setModulosCIF, actModCIF, calcCIF,
              'Se reparte entre toda la producción (granel + sachet), proporcional al volumen de cada fundente.'
            )}
          </div>

        </div>
      </fieldset>

      {/* BLOQUE DE IMPRESIÓN: solo lee datosFinancierosGlobales, no calcula por su cuenta */}
      {isPrinting && createPortal(
        (() => {
          const { filas, cantsPorProd, volAnualPlanta, volAnualSachet, volAnualGranel, totalPlanta, totalesSachet, totalesGranel } = datosFinancierosGlobales;
          const fmt = (n, d = 2) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
          const pct = (parte, total) => total > 0 ? ((parte / total) * 100).toFixed(2) : '0.00';
          const filasSachet = filas.filter(f => f.esSachet);

          const tablaInsumos = (detalle, subtotal, etiqueta) => (
            <table>
              <thead>
                <tr><th>{etiqueta}</th><th>Consumo</th><th>Costo U.</th><th>Costo Total</th></tr>
              </thead>
              <tbody>
                {detalle.map((d, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: 'left' }}>{d.insumo}</td>
                    <td>{fmt(d.consumo, 1)} {d.udm}</td>
                    <td>S/ {fmt(d.costoUnitario, 4)}</td>
                    <td style={{ fontWeight: 'bold' }}>S/ {fmt(d.costo)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 'bold', background: '#f1f5f9' }}>
                  <td colSpan={3} style={{ textAlign: 'left' }}>Subtotal</td>
                  <td>S/ {fmt(subtotal)}</td>
                </tr>
              </tbody>
            </table>
          );

          const tablaModulos = (lista, calculos, campo, filasBase, volBase) => {
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
                      const distribuido = filasBase.reduce((s, f) => s + (f[campo][i] || 0), 0);
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
                      <th>Producto</th><th>Volumen (KG)</th><th>% del reparto</th>
                      {lista.map(mod => <th key={mod.id}>{mod.moduloNombre || '(sin módulo)'}</th>)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasBase.map(f => (
                      <tr key={f.prod}>
                        <td style={{ textAlign: 'left' }}>{f.prod}</td>
                        <td>{fmt(f.vol, 0)}</td>
                        <td>{pct(f.vol, volBase)}%</td>
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
              📦 {f.prod} — {f.esSachet ? '🟠 SACHET' : '🟢 GRANEL'} ({fmt(f.vol, 0)} KG)
            </div>
          );

          return (
            <div className="reporte-impresion-solo">
              <div className="reporte-header">
                <div className="reporte-titulo">REPORTE DE TRAZABILIDAD Y COSTEO - FUNDENTES</div>
                <div style={{ fontSize: '10px', marginTop: '4px', textAlign: 'center' }}>
                  Año Proyección: <strong>{anioSel}</strong> | Capacidad P2: <strong>{capacidadMaximaP2}</strong>
                </div>
              </div>

              {/* 1. PRODUCCIÓN Y BASE DE REPARTO */}
              <div className="reporte-seccion">
                <div className="reporte-seccion-titulo">1. Proyección de Producción (KG) y Base de Reparto</div>
                {filas.map(f => {
                  const prodCants = cantsPorProd[f.prod];
                  return (
                    <div key={f.prod} style={{ marginBottom: '6px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '2px' }}>
                        {f.prod} — {f.esSachet ? 'Sachet' : 'Granel'} (Margen: {configProductos[f.prod]?.margen || 0}%)
                      </div>
                      <table>
                        <thead>
                          <tr>{MESES.map(m => <th key={m}>{m}</th>)}<th style={{ backgroundColor: '#e2e8f0' }}>Total</th></tr>
                        </thead>
                        <tbody>
                          <tr>
                            {MESES.map(m => <td key={m}>{prodCants[m] || 0}</td>)}
                            <td style={{ fontWeight: 'bold', backgroundColor: '#f8fafc' }}>{fmt(f.vol, 0)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}
                <div style={{ fontSize: '10px', fontWeight: 'bold', margin: '6px 0 2px 0' }}>Base de reparto para MOD y CIF</div>
                <table>
                  <thead><tr><th>Presentación</th><th>Volumen anual (KG)</th><th>% de la producción</th></tr></thead>
                  <tbody>
                    <tr><td style={{ textAlign: 'left' }}>🟢 Granel</td><td>{fmt(volAnualGranel, 0)}</td><td>{pct(volAnualGranel, volAnualPlanta)}%</td></tr>
                    <tr><td style={{ textAlign: 'left' }}>🟠 Sachet</td><td>{fmt(volAnualSachet, 0)}</td><td>{pct(volAnualSachet, volAnualPlanta)}%</td></tr>
                    <tr style={{ fontWeight: 'bold' }}><td style={{ textAlign: 'left' }}>Total planta</td><td>{fmt(volAnualPlanta, 0)}</td><td>100.00%</td></tr>
                  </tbody>
                </table>
              </div>

              {/* 2. MATERIAS PRIMAS POR FUNDENTE */}
              <div className="reporte-seccion">
                <div className="reporte-seccion-titulo">2. Materias Primas e Insumos por Fundente</div>
                {filas.map(f => (
                  <div key={`mp-${f.prod}`} style={{ marginBottom: '10px' }}>
                    {encabezadoProducto(f)}
                    {tablaInsumos(f.detMat, f.p1Mat, 'Materia Prima / Insumo')}
                  </div>
                ))}
              </div>

              {/* 3. ENVASES POR FUNDENTE */}
              <div className="reporte-seccion">
                <div className="reporte-seccion-titulo">3. Envases y Embalajes por Fundente</div>
                {filas.map(f => (
                  <div key={`env-${f.prod}`} style={{ marginBottom: '10px' }}>
                    {encabezadoProducto(f)}
                    {tablaInsumos(f.detSum, f.p2Sum, 'Empaque / Suministro')}
                  </div>
                ))}
              </div>

              {/* 4. MANO DE OBRA DIRECTA */}
              <div className="reporte-seccion">
                <div className="reporte-seccion-titulo">4. Mano de Obra Directa (Remuneraciones)</div>
                <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#1e40af', margin: '4px 0' }}>
                  • MOD Mezclado (Granel): se divide entre TODA la producción ({fmt(volAnualPlanta, 0)} KG)
                </div>
                {tablaModulos(modulosP1, calcP1, 'modP1', filas, volAnualPlanta)}
                <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#c2410c', margin: '8px 0 4px 0' }}>
                  • MOD Ensachetado (Sachet): se suma solo a los productos en sachet ({fmt(volAnualSachet, 0)} KG)
                </div>
                {tablaModulos(modulosP2, calcP2, 'modP2', filasSachet, volAnualSachet)}
              </div>

              {/* 5. CIF */}
              <div className="reporte-seccion">
                <div className="reporte-seccion-titulo">5. Costos Indirectos de Fabricación (CIF) - Proporcional a la producción total</div>
                {tablaModulos(modulosCIF, calcCIF, 'modCIF', filas, volAnualPlanta)}
              </div>

              {/* 6. RESUMEN FINANCIERO */}
              <div className="reporte-seccion">
                <div className="reporte-seccion-titulo">6. Resumen Financiero Consolidado por Producto</div>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '18%' }}>Producto</th><th>Pres.</th><th>Volumen (KG)</th><th>% Part.</th>
                      <th>Mat. Primas</th><th>Envases</th><th>MOD Mezclado</th><th>MOD Ensachet.</th><th>CIF</th>
                      <th style={{ backgroundColor: '#e2e8f0', color: '#1e293b' }}>Costo Total</th>
                      <th style={{ backgroundColor: '#e2e8f0', color: '#1e293b' }}>Costo Unit.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(f => (
                      <tr key={f.prod}>
                        <td style={{ textAlign: 'left', fontWeight: 'bold' }}>{f.prod}</td>
                        <td>{f.esSachet ? 'Sachet' : 'Granel'}</td>
                        <td>{fmt(f.vol, 0)}</td>
                        <td>{pct(f.vol, volAnualPlanta)}%</td>
                        <td>S/ {fmt(f.p1Mat)}</td>
                        <td>S/ {fmt(f.p2Sum)}</td>
                        <td>S/ {fmt(f.p1Mod)}</td>
                        <td>S/ {fmt(f.p2Mod)}</td>
                        <td>S/ {fmt(f.cif)}</td>
                        <td style={{ fontWeight: 'bold', backgroundColor: '#f8fafc' }}>S/ {fmt(f.total)}</td>
                        <td style={{ fontWeight: 'bold', backgroundColor: '#f8fafc', color: '#166534' }}>S/ {fmt(f.cUnit, 4)}</td>
                      </tr>
                    ))}
                    {[['Subtotal Granel', totalesGranel, '#f0fdf4'], ['Subtotal Sachet', totalesSachet, '#fff7ed'], ['TOTAL CONSOLIDADO', totalPlanta, '#e2e8f0']].map(([label, t, bg]) => (
                      <tr key={label} style={{ fontWeight: 'bold', background: bg }}>
                        <td colSpan={2} style={{ textAlign: 'left' }}>{label}</td>
                        <td>{fmt(t.vol, 0)}</td>
                        <td>{pct(t.vol, volAnualPlanta)}%</td>
                        <td>S/ {fmt(t.p1Mat)}</td>
                        <td>S/ {fmt(t.p2Sum)}</td>
                        <td>S/ {fmt(t.p1Mod)}</td>
                        <td>S/ {fmt(t.p2Mod)}</td>
                        <td>S/ {fmt(t.cif)}</td>
                        <td>S/ {fmt(t.total)}</td>
                        <td>S/ {fmt(t.vol > 0 ? t.total / t.vol : 0, 4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 7. ANEXO: CONSOLIDADO DE INSUMOS */}
              <div className="reporte-seccion">
                <div className="reporte-seccion-titulo">7. Anexo: Consumo Consolidado de Insumos y Envases (Total Planta)</div>
                {[['Materias Primas', 'detMat', '#1e40af'], ['Envases y Suministros', 'detSum', '#c2410c']].map(([titulo, campo, color]) => (
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
        <button type="button" onClick={handleImprimirReporte} style={{ background: '#475569', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          🖨️ Imprimir Reporte
        </button>
        <button type="button" onClick={onCancelar} className="btn-back m-0" style={{ background: 'white', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer' }}>{isSoloLectura ? 'Cerrar' : 'Cancelar'}</button>
        {!isSoloLectura && <button type="button" onClick={handleGuardar} className="btn-add m-0" style={{ background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>Guardar Costeo de Fundente</button>}
      </div>
    </div>
  );
}
