import React, { useState, useEffect, useMemo } from 'react';
import { UNIDADES_NEGOCIO, TIPOS_CLIENTE, TIPOS_ZONA, MESES } from '../../config/data';
import { cuentasForecast, tipoNegocioDe } from '../../config/cuentasForecast';
import { obtenerClientesOdoo, obtenerProductosOdoo, obtenerEmpleadosOdoo, obtenerUnidadesMedida, obtenerHistorialProducto, obtenerTipoCambioPromedio } from '../../data/store';

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS_DISPONIBLES = Array.from({ length: 5 }, (_, i) => (ANIO_ACTUAL - 1 + i).toString());

const simboloMoneda = (m) => ({ PEN: 'S/', USD: 'US$' }[String(m || '').toUpperCase()] || m || '-');
const fmt = (n, d = 2) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const mismaUnidad = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export default function ForecastComercialForm({ registro, onGuardar, onCancelar, modo }) {
  const isSoloLectura = modo === 'ver';

  const [listaClientes, setListaClientes] = useState([]);
  const [listaProductos, setListaProductos] = useState([]);
  const [listaEmpleados, setListaEmpleados] = useState([]);
  const [cargandoMaestros, setCargandoMaestros] = useState(true);

  // Estados del formulario
  const [cliente, setCliente] = useState('');
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [tipoCliente, setTipoCliente] = useState(TIPOS_CLIENTE[0]);
  const [zona, setZona] = useState(TIPOS_ZONA[0]);
  const [pais, setPais] = useState('Perú');
  const [unidadNegocio, setUnidadNegocio] = useState(UNIDADES_NEGOCIO[0]);
  const [producto, setProducto] = useState('');
  const [codigoProducto, setCodigoProducto] = useState('');
  const [um, setUm] = useState('Unidad');
  
  const [anioProyeccion, setAnioProyeccion] = useState(ANIO_ACTUAL.toString());
  
  const [precioVentaDisplay, setPrecioVentaDisplay] = useState('0.00');
  const [costoUnitarioDisplay, setCostoUnitarioDisplay] = useState('0.00');
  const [pv2025Display, setPv2025Display] = useState('0.00');
  const [cv2025Display, setCv2025Display] = useState('0.00');

  // Los precios del forecast se trabajan en dólares.
  const [moneda, setMoneda] = useState('US$');
  const [tipoCambio, setTipoCambio] = useState('3.75');

  const [tipoProbabilidad, setTipoProbabilidad] = useState('general');
  const [probabilidadGeneral, setProbabilidadGeneral] = useState('100');
  const [probabilidadesMeses, setProbabilidadesMeses] = useState(
    MESES.reduce((acc, m) => ({ ...acc, [m]: '100' }), {})
  );

  const [cantidades, setCantidades] = useState(
    MESES.reduce((acc, m) => ({ ...acc, [m]: '0' }), {})
  );

  const [busquedaVendedor, setBusquedaVendedor] = useState('');
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [busquedaUnidad, setBusquedaUnidad] = useState('');
  const [selectorAbierto, setSelectorAbierto] = useState(null);

  const [listaUnidades, setListaUnidades] = useState([]);

  const [historial, setHistorial] = useState({ ventas: [], compras: [], salidas: [], costoPromedio: 0 });
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  const [soloClienteActual, setSoloClienteActual] = useState(false);

  // Datos del maestro (ya sincronizados con Odoo) del producto elegido
  const refProducto = useMemo(
    () => listaProductos.find(p => String(p.codigo) === String(codigoProducto)),
    [listaProductos, codigoProducto]
  );

    useEffect(() => {
    if (!codigoProducto || codigoProducto === '-') {
      setHistorial({ ventas: [], compras: [], salidas: [], costoPromedio: 0 });
      return;
    }
    let activo = true;
    setCargandoHistorial(true);
    obtenerHistorialProducto(codigoProducto, soloClienteActual ? cliente : '')
      .then(h => { if (activo) setHistorial(h); })
      .finally(() => { if (activo) setCargandoHistorial(false); });
    return () => { activo = false; };
  }, [codigoProducto, soloClienteActual, cliente]);

  // Estados específicos para Fundentes
  const [presentacionFundente, setPresentacionFundente] = useState('Granel'); // 'Granel' o 'Sachet'
  const [unidadSachet, setUnidadSachet] = useState('');
  const [busquedaUnidadSachet, setBusquedaUnidadSachet] = useState('');

  useEffect(() => {
    let activo = true;
    async function cargarMaestros() {
      setCargandoMaestros(true);
      try {
        const [clientesRes, productosRes, empleadosRes, unidadesRes] = await Promise.all([
          obtenerClientesOdoo(),
          obtenerProductosOdoo(),
          obtenerEmpleadosOdoo(),
          obtenerUnidadesMedida(),
        ]);
        if (activo) {
          setListaClientes(clientesRes || []);
          setListaProductos(productosRes || []);
          setListaEmpleados(empleadosRes || []);
          setListaUnidades(unidadesRes || []);
        }
      } catch (err) {
        console.error('Error al conectar con Odoo:', err);
      } finally {
        if (activo) setCargandoMaestros(false);
      }
    }
    cargarMaestros();
    return () => { activo = false; };
  }, []);

  const [tcReferencia, setTcReferencia] = useState(3.75);
  useEffect(() => {
    let activo = true;
    obtenerTipoCambioPromedio().then(tc => { if (activo) setTcReferencia(tc); });
    return () => { activo = false; };
  }, []);

  // Solo para forecasts NUEVOS: precarga el tipo de cambio promedio de Odoo como default.
  // Si el registro ya existe, se respeta el TC guardado (ver useEffect de carga del registro).
  useEffect(() => {
    if (registro) return;
    let activo = true;
    obtenerTipoCambioPromedio().then(tc => {
      if (activo) setTipoCambio(tc.toString());
    });
    return () => { activo = false; };
  }, [registro]);

  useEffect(() => {
    if (registro) {
      const dc = registro.detalle_columnas || {};
      setCliente(dc.cliente || '');
      setBusquedaCliente(dc.cliente || '');
      setVendedor(dc.vendedor || '');
      setBusquedaVendedor(dc.vendedor || '');
      setTipoCliente(dc.tipo || TIPOS_CLIENTE[0]);
      setZona(dc.zona || TIPOS_ZONA[0]);
      setPais(dc.pais || 'Perú');
      setUnidadNegocio(dc.unidad_negocio || dc.uninegocio || UNIDADES_NEGOCIO[0]);
      setProducto(dc.producto || '');
      setCodigoProducto(dc.codigo_producto || '');
      setBusquedaProducto(dc.producto || '');
      
      setPresentacionFundente(dc.presentacion_fundente || 'Granel');
      setUnidadSachet(dc.unidad_sachet || '');
      setBusquedaUnidadSachet(dc.unidad_sachet || '');
      
      const unidadGuardada = dc.um || 'Unidad';
      setUm(unidadGuardada);
      setBusquedaUnidad(unidadGuardada);

      setAnioProyeccion(dc.anio_proyeccion?.toString() || ANIO_ACTUAL.toString());

      setPv2025Display((parseFloat(dc.pv_2025) || 0).toFixed(2));
      setCv2025Display((parseFloat(dc.cv_2025) || 0).toFixed(2));
      setPrecioVentaDisplay((parseFloat(dc.precio_venta) || 0).toFixed(2));
      setCostoUnitarioDisplay((parseFloat(dc.costo_unitario) || 0).toFixed(2));

      setMoneda(dc.moneda || 'US$');
      if (dc.tipo_cambio) setTipoCambio(dc.tipo_cambio.toString());

      if (dc.tipo_probabilidad) setTipoProbabilidad(dc.tipo_probabilidad);
      if (dc.probabilidad_general) setProbabilidadGeneral(dc.probabilidad_general.toString());
      if (dc.probabilidades_meses) {
        setProbabilidadesMeses(
          MESES.reduce((acc, m) => ({ ...acc, [m]: (dc.probabilidades_meses[m] ?? 100).toString() }), {})
        );
      }

      setCantidades(
        MESES.reduce((acc, m) => ({ ...acc, [m]: (dc.cantidades?.[m] ?? 0).toString() }), {})
      );
    }
  }, [registro]);

  useEffect(() => {
    const handleClickFuera = (event) => {
      if (!selectorAbierto) return;
      if (event.target.closest(`[data-selector-forecast="${selectorAbierto}"]`)) return;

      if (selectorAbierto === 'cliente') setBusquedaCliente(cliente);
      if (selectorAbierto === 'vendedor') setBusquedaVendedor(vendedor);
      if (selectorAbierto === 'producto') setBusquedaProducto(producto);
      if (selectorAbierto === 'unidad') setBusquedaUnidad(um);
      if (selectorAbierto === 'unidadSachet') setBusquedaUnidadSachet(unidadSachet);
      setSelectorAbierto(null);
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, [selectorAbierto, cliente, vendedor, producto, um, unidadSachet]);

  const cantidadTotalAnio = useMemo(
    () => MESES.reduce((s, m) => s + (parseFloat(cantidades[m]) || 0), 0),
    [cantidades]
  );

  const precio = parseFloat(precioVentaDisplay) || 0;
  const costo = parseFloat(costoUnitarioDisplay) || 0;

  const { ingresoTotalProyectado, costoTotalProyectado } = useMemo(() => {
    let ingresosAcc = 0;
    let costosAcc = 0;

    MESES.forEach(m => {
      const cantMes = parseFloat(cantidades[m]) || 0;
      const subIngreso = cantMes * precio;
      const subCosto = cantMes * costo;

      const prob = tipoProbabilidad === 'general'
        ? (parseFloat(probabilidadGeneral) || 0)
        : (parseFloat(probabilidadesMeses[m]) || 0);

      const factor = prob / 100;
      ingresosAcc += subIngreso * factor;
      costosAcc += subCosto * factor;
    });

    return { ingresoTotalProyectado: ingresosAcc, costoTotalProyectado: costosAcc };
  }, [cantidades, precio, costo, tipoProbabilidad, probabilidadGeneral, probabilidadesMeses]);

  const margenBruto = ingresoTotalProyectado - costoTotalProyectado;
  const porcentajeMargen = ingresoTotalProyectado > 0
    ? ((margenBruto / ingresoTotalProyectado) * 100)
    : 0;

  // Cuenta de venta (70x) y de costo (69x) según la unidad de negocio y la zona.
  const cuentas = cuentasForecast(unidadNegocio, zona);
  const tipoNegocio = tipoNegocioDe(unidadNegocio);

  const handleGuardar = () => {
    if (!cliente) return alert('Por favor, seleccione un cliente.');
    if (!producto) return alert('Por favor, seleccione un producto.');
    if (!anioProyeccion) return alert('Por favor, seleccione el año de proyección.');
    if (unidadNegocio === 'Fundente' && presentacionFundente === 'Sachet' && !unidadSachet) {
      return alert('Por favor, seleccione el peso o formato del sachet.');
    }

    const idRegistro = registro ? registro.id_registro : `FCO-${Date.now()}`;
    const idLote = registro ? (registro.id_lote || idRegistro) : `LOTE-FCO-${Date.now()}`;
    const cantidadesNum = MESES.reduce((acc, m) => ({ ...acc, [m]: parseFloat(cantidades[m]) || 0 }), {});
    const probabilidadesNum = MESES.reduce((acc, m) => ({ ...acc, [m]: parseFloat(probabilidadesMeses[m]) || 100 }), {});

    const nuevoRegistro = {
      id_registro: idRegistro,
      id_lote: idLote,
      fecha_proyeccion: `${anioProyeccion}-01-01`,
      empleado_dni: '-',
      empleado_nombre: vendedor || '-',
      detalle_columnas: {
        cliente, vendedor,
        tipo_cliente: tipoCliente,
        zona, pais,
        unidad_negocio: unidadNegocio,
        producto, codigo_producto: codigoProducto, 
        um, 
        moneda,
        tipo_cambio: moneda === 'US$' ? parseFloat(tipoCambio) || 1 : null,
        anio_proyeccion: anioProyeccion,
        pv_2025: parseFloat(pv2025Display) || 0,
        cv_2025: parseFloat(cv2025Display) || 0,
        precio_venta: parseFloat(precioVentaDisplay) || 0,
        costo_unitario: parseFloat(costoUnitarioDisplay) || 0,
        tipo_probabilidad: tipoProbabilidad,
        probabilidad_general: parseFloat(probabilidadGeneral) || 100,
        probabilidades_meses: probabilidadesNum,
        cantidades: cantidadesNum,
        cantidad_total_anio: cantidadTotalAnio,
        ingreso_total: ingresoTotalProyectado,
        costo_total: costoTotalProyectado,
        margen_bruto: margenBruto,
        tipo_negocio: tipoNegocio,
        cuenta_venta: cuentas.venta?.texto || null,
        cuenta_costo: cuentas.costo?.texto || null,
        presentacion_fundente: unidadNegocio === 'Fundente' ? presentacionFundente : null,
        unidad_sachet: unidadNegocio === 'Fundente' && presentacionFundente === 'Sachet' ? unidadSachet : null,
      },
      totales: {
        ingreso_total: ingresoTotalProyectado,
        costo_total: costoTotalProyectado,
        margen_bruto: margenBruto
      },
      // Montos en soles, en la cuenta 70x de venta y 69x de costo que corresponde a la línea y zona.
      desglose_contable: [
        {
          id: 'v1',
          cuenta: cuentas.venta?.texto || `Ventas sin cuenta asignada · ${unidadNegocio} · ${zona}`,
          monto: (ingresoTotalProyectado * (moneda === 'US$' ? parseFloat(tipoCambio) || 1 : 1)).toFixed(2)
        },
        ...(cuentas.costo ? [{
          id: 'c1',
          cuenta: cuentas.costo.texto,
          monto: (costoTotalProyectado * (moneda === 'US$' ? parseFloat(tipoCambio) || 1 : 1)).toFixed(2)
        }] : [])
      ],
    };

    onGuardar([nuevoRegistro]);
  };

  const seleccionarCliente = (dataCliente) => {
    const nombreCliente = dataCliente.nombre;
    setCliente(nombreCliente);
    setBusquedaCliente(nombreCliente);
    setSelectorAbierto(null);

    if (dataCliente) {
      const vendedorSugerido = dataCliente.vendedor || '';
      setVendedor(vendedorSugerido);
      setBusquedaVendedor(vendedorSugerido);
      setPais(dataCliente.pais || 'Perú');

      const zonaSugerida = dataCliente.zona || '';
      if (TIPOS_ZONA.includes(zonaSugerida)) {
        setZona(zonaSugerida);
      } else {
        const zonaCoincidente = TIPOS_ZONA.find(z => z.toLowerCase() === zonaSugerida.toLowerCase());
        setZona(zonaCoincidente || TIPOS_ZONA[0]);
      }

      const tipoSugerido = dataCliente.tipo || '';
      if (TIPOS_CLIENTE.includes(tipoSugerido)) {
        setTipoCliente(tipoSugerido);
      } else {
        setTipoCliente(TIPOS_CLIENTE[0]);
      }
    } else {
      setVendedor('');
      setBusquedaVendedor('');
      setPais('Perú');
      setZona(TIPOS_ZONA[0]);
      setTipoCliente(TIPOS_CLIENTE[0]);
    }
  };

  const aplicarProductoSeleccionado = (dataProducto) => {
    setProducto(dataProducto.nombre);
    setCodigoProducto((dataProducto.codigo || dataProducto.id || '').toString());
    setBusquedaProducto(dataProducto.nombre);
    setSelectorAbierto(null);

    const unidadProd = dataProducto.unidad || 'Unidad';
    setUm(unidadProd);
    setBusquedaUnidad(unidadProd);

    const tc = parseFloat(tipoCambio) || 1;
    const factor = moneda === 'US$' ? tc : 1;
    const precioProductoSoles = parseFloat(dataProducto.precio_venta || dataProducto.pv || 0);
    const costoProductoSoles = parseFloat(dataProducto.costo || 0);
    const pvMostrar = (factor > 0 ? precioProductoSoles / factor : precioProductoSoles).toFixed(2);
    const cvMostrar = (factor > 0 ? costoProductoSoles / factor : costoProductoSoles).toFixed(2);

    setPv2025Display(pvMostrar);
    setPrecioVentaDisplay(pvMostrar);
    setCv2025Display(cvMostrar);
    setCostoUnitarioDisplay(cvMostrar);
    
    const unidadSugerida = dataProducto.uninegocio || dataProducto.categoria || '';
    if (UNIDADES_NEGOCIO.includes(unidadSugerida)) {
      setUnidadNegocio(unidadSugerida);
    } else {
      const unidadCoincidente = UNIDADES_NEGOCIO.find(un => un.toLowerCase() === unidadSugerida.toLowerCase());
      setUnidadNegocio(unidadCoincidente || UNIDADES_NEGOCIO[0]);
    }
  };

  const seleccionarVendedor = (emp) => {
    setVendedor(emp.nombre);
    setBusquedaVendedor(emp.nombre);
    setSelectorAbierto(null);
  };

  const seleccionarUnidad = (uni) => {
    setUm(uni.nombre);
    setBusquedaUnidad(uni.nombre);
    setSelectorAbierto(null);
  };

  const clientesFiltrados = (texto) => {
    const query = (texto || '').trim().toLowerCase();
    const base = query.length >= 1
      ? listaClientes.filter(c => {
          const nombreStr = String(c.nombre || '').toLowerCase();
          const rucStr = String(c.ruc || '').toLowerCase();
          return nombreStr.includes(query) || rucStr.includes(query);
        })
      : listaClientes;
    return base.slice(0, 20);
  };

  const vendedoresFiltrados = (texto) => {
    const query = (texto || '').trim().toLowerCase();
    const empleadosComerciales = listaEmpleados.filter(e => {
      const areaEmpleado = (e.area || e.departamento || '').toLowerCase().trim();
      return areaEmpleado.includes('comercial');
    });

    const base = query.length >= 1
      ? empleadosComerciales.filter(e => {
          const nombreStr = String(e.nombre || '').toLowerCase();
          const idStr = String(e.dni || e.id || '').toLowerCase();
          return nombreStr.includes(query) || idStr.includes(query);
        })
      : empleadosComerciales;
      
    return base.slice(0, 20);
  };

  const productosFiltrados = (texto) => {
    const query = (texto || '').trim().toLowerCase();
    const base = query.length >= 1
      ? listaProductos.filter(p => {
          const nombreStr = String(p.nombre || '').toLowerCase();
          const codigoStr = String(p.codigo || p.id || '').toLowerCase();
          return nombreStr.includes(query) || codigoStr.includes(query);
        })
      : listaProductos;
    return base.slice(0, 20);
  };

  const unidadesFiltradas = (texto) => {
    const query = (texto || '').trim().toLowerCase();
    const base = query.length >= 1
      ? listaUnidades.filter(u => String(u.nombre || '').toLowerCase().includes(query))
      : listaUnidades;
    return base.slice(0, 20);
  };

  // 🔍 Filtro inteligente para buscar únicamente unidades que contengan la palabra "sachet"
  const unidadesSachetFiltradas = (texto) => {
    const query = (texto || '').trim().toLowerCase();
    const soloSachets = listaUnidades.filter(u => String(u.nombre || '').toLowerCase().includes('sachet'));
    const base = query.length >= 1
      ? soloSachets.filter(u => String(u.nombre || '').toLowerCase().includes(query))
      : soloSachets;
    return base.slice(0, 20);
  };

  const renderBuscador = ({ clave, busqueda, setBusqueda, onSeleccionar, opciones, renderOpcion, label, placeholder, obligatorio }) => {
    const abierto = selectorAbierto === clave;

    return (
      <div className="form-group" style={{ margin: 0, position: 'relative' }} data-selector-forecast={clave}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: obligatorio ? '#2563eb' : '#64748b' }}>{label}</label>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setSelectorAbierto(clave);
          }}
          onFocus={() => setSelectorAbierto(clave)}
          placeholder={placeholder}
          autoComplete="off"
          style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }}
        />

        {abierto && opciones.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
            border: '1px solid #cbd5e1', borderRadius: '0 0 8px 8px',
            boxShadow: '0 8px 16px -4px rgba(15,23,42,0.15)',
            maxHeight: '240px', overflowY: 'auto', zIndex: 60, marginTop: '2px'
          }}>
            {opciones.map((op, idx) => (
              <div
                key={`${clave}-${idx}-${op.codigo || op.id || op.dni || op.ruc || op.nombre || 'sin-id'}`}
                onClick={() => onSeleccionar(op)}
                style={{
                  padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                  fontSize: '12px', color: '#1e293b', display: 'flex', justifyContent: 'space-between', gap: '10px'
                }}
                onMouseEnter={(ev) => ev.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={(ev) => ev.currentTarget.style.background = 'white'}
              >
                {renderOpcion(op)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderTablaHistorial = (titulo, filas, etiquetaTercero) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>{titulo}</div>
      {filas.length === 0 ? (
        <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>Sin registros en Odoo.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr style={{ color: '#64748b', textAlign: 'left' }}>
              <th style={{ padding: '2px 3px', fontWeight: 600 }}>Fecha</th>
              <th style={{ padding: '2px 3px', fontWeight: 600 }}>{etiquetaTercero}</th>
              <th style={{ padding: '2px 3px', fontWeight: 600, textAlign: 'right' }}>Precio</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const distinta = um && !mismaUnidad(f.unidad, um);
              const tcDia = parseFloat(f.tc_dia);
              const tieneConversion = Number.isFinite(tcDia) && tcDia > 0;
              const precioMostrar = tieneConversion && moneda === 'US$'
                ? (Number(f.precio) || 0) * tcDia
                : Number(f.precio) || 0;
              const monedaMostrar = tieneConversion ? moneda : simboloMoneda(f.moneda);

              return (
                <tr key={i} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '3px 3px', whiteSpace: 'nowrap', color: '#475569' }}>{f.fecha || '-'}</td>
                  <td style={{ padding: '3px 3px', color: '#334155', wordBreak: 'break-word' }}>
                    {f.tercero || '-'}
                    {distinta && <span style={{ color: '#b45309', fontWeight: 600 }}> · {f.unidad}</span>}
                  </td>
                  <td style={{ padding: '3px 3px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {monedaMostrar} {fmt(precioMostrar)}
                    {tieneConversion && (
                      <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 400 }}>S/ {fmt(f.precio)} · TC {fmt(tcDia, 3)}</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  const tituloVentas = soloClienteActual && cliente ? `Ventas a ${cliente}` : 'Últimas ventas (Ventas)';
  const tituloSalidas = soloClienteActual && cliente ? `Salidas a ${cliente} (Almacén)` : 'Costo de salidas (Almacén)'; 

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <fieldset disabled={isSoloLectura} style={{ border: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="offcanvas-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>

          {cargandoMaestros && (
            <div style={{ padding: '6px 12px', background: '#eff6ff', color: '#1e40af', borderRadius: '6px', fontSize: '11px' }}>
              Sincronizando clientes, productos y vendedores desde Odoo...
            </div>
          )}

          <div className="form-section">
            <div className="form-section-title">1. Cliente y Vendedor</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>

              <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb' }}>AÑO DE PROYECCIÓN</label>
                <select value={anioProyeccion} onChange={e => setAnioProyeccion(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', fontWeight: 600 }}>
                  {ANIOS_DISPONIBLES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              {renderBuscador({
                clave: 'cliente',
                busqueda: busquedaCliente,
                setBusqueda: (texto) => {
                  setBusquedaCliente(texto);
                  if (texto.trim() === '') {
                    setCliente('');
                    setVendedor('');
                    setBusquedaVendedor('');
                  }
                },
                onSeleccionar: seleccionarCliente,
                opciones: clientesFiltrados(busquedaCliente),
                renderOpcion: (cli) => (
                  <>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{cli.nombre}</span>
                    {cli.ruc && cli.ruc !== '-' && <span style={{ color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>RUC: {cli.ruc}</span>}
                  </>
                ),
                label: 'CLIENTE',
                placeholder: 'Buscar por nombre o RUC...',
                obligatorio: true,
              })}

              {renderBuscador({
                clave: 'vendedor',
                busqueda: busquedaVendedor,
                setBusqueda: setBusquedaVendedor,
                onSeleccionar: seleccionarVendedor,
                opciones: vendedoresFiltrados(busquedaVendedor),
                renderOpcion: (emp) => (
                  <>
                    <span>{emp.nombre}</span>
                    {(emp.dni || emp.id) && <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{emp.dni || emp.id}</span>}
                  </>
                ),
                label: 'VENDEDOR',
                placeholder: 'Busca por nombre o DNI...',
              })}

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>TIPO DE CLIENTE</label>
                <select value={tipoCliente} onChange={e => setTipoCliente(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #64748b)', borderRadius: '4px', background: 'white' }}>
                  <option value="">Seleccione tipo...</option>
                  {TIPOS_CLIENTE.map((tipo, idx) => <option key={idx} value={tipo}>{tipo}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>ZONA</label>
                <select value={zona} onChange={e => setZona(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #64748b)', borderRadius: '4px', background: 'white' }}>
                  <option value="">Seleccione zona...</option>
                  {TIPOS_ZONA.map((z, idx) => <option key={idx} value={z}>{z}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>PAÍS</label>
                <input type="text" value={pais} onChange={e => setPais(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">2. Producto y Precios</div>
            
            <div style={{ marginBottom: '8px' }}>
              {renderBuscador({
                clave: 'producto',
                busqueda: busquedaProducto,
                setBusqueda: (texto) => {
                  setBusquedaProducto(texto);
                  if (texto.trim() === '') {
                    setProducto('');
                    setCodigoProducto('');
                    setUm('Unidad');
                    setBusquedaUnidad('Unidad');
                    setPv2025Display('0.00');
                    setCv2025Display('0.00');
                    setPrecioVentaDisplay('0.00');
                    setCostoUnitarioDisplay('0.00');
                    setUnidadNegocio(UNIDADES_NEGOCIO[0]);
                  } else {
                    setProducto('');
                    setCodigoProducto('');
                  }
                },
                onSeleccionar: aplicarProductoSeleccionado,
                opciones: productosFiltrados(busquedaProducto),
                renderOpcion: (p) => {
                  const codigoProd = (p.codigo || p.id || '').toString();
                  return (
                    <>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: '10px', minWidth: 0 }}>
                        {codigoProd && codigoProd !== '-' && (
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#2563eb', fontWeight: 700, flexShrink: 0 }}>
                            {codigoProd}
                          </span>
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                      </span>
                      {p.pv != null && <span style={{ color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>S/ {parseFloat(p.pv || 0).toFixed(2)}</span>}
                    </>
                  );
                },
                label: 'PRODUCTO',
                placeholder: 'Busca por nombre o código...',
                obligatorio: true,
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>CÓDIGO DE PRODUCTO</label>
                <input
                  type="text"
                  value={codigoProducto}
                  readOnly
                  placeholder="Auto"
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', background: '#f8fafc', fontFamily: 'monospace', color: '#2563eb', fontWeight: 700, fontSize: '12px' }}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>UNIDAD DE NEGOCIO</label>
                <select value={unidadNegocio} onChange={e => setUnidadNegocio(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', background: 'white', fontSize: '11px' }}>
                  <option value="">Seleccione...</option>
                  {UNIDADES_NEGOCIO.map((un, idx) => <option key={idx} value={un}>{un}</option>)}
                </select>
              </div>

              <div>
                {renderBuscador({
                  clave: 'unidad',
                  busqueda: busquedaUnidad,
                  setBusqueda: (texto) => {
                    setBusquedaUnidad(texto);
                    if (texto.trim() === '') setUm('');
                  },
                  onSeleccionar: seleccionarUnidad,
                  opciones: unidadesFiltradas(busquedaUnidad),
                  renderOpcion: (uni) => (
                    <span style={{ fontWeight: 500 }}>{uni.nombre}</span>
                  ),
                  label: 'UNIDAD DE MEDIDA',
                  placeholder: 'Buscar unidad...',
                  obligatorio: false,
                })}
              </div>
            </div>

            {/* Cuentas contables que tomará el EERR: dependen de la unidad de negocio y la zona */}
            <div style={{ marginBottom: '8px', background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 700, color: '#64748b' }}>TIPO DE NEGOCIO</span>
              <span><b style={{ color: tipoNegocio === 'Fire Assay' ? '#b45309' : '#0369a1' }}>{tipoNegocio}</b></span>
              <span style={{ fontWeight: 700, color: '#64748b' }}>CUENTA VENTA</span>
              <span style={{ color: cuentas.venta ? '#0f172a' : '#b91c1c' }}>{cuentas.venta?.texto || `Sin cuenta para ${unidadNegocio || '-'} · ${zona || '-'}`}</span>
              <span style={{ fontWeight: 700, color: '#64748b' }}>CUENTA COSTO</span>
              <span style={{ color: cuentas.costo ? '#0f172a' : '#94a3b8' }}>{cuentas.costo?.texto || (unidadNegocio === 'Servicios' ? 'Servicios: solo venta' : `Sin cuenta para ${unidadNegocio || '-'} · ${zona || '-'}`)}</span>
            </div>

            {/* 🌟 BLOQUE CONDICIONAL PARA FUNDENTES (GRANEL / SACHET Y PESO) */}
            {unidadNegocio === 'Fundente' && (
              <div style={{ marginBottom: '8px', background: '#eff6ff', padding: '10px', borderRadius: '6px', border: '1px solid #bfdbfe', display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '8px', alignItems: 'center' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#1d4ed8' }}>PRESENTACIÓN</label>
                  <select
                    value={presentacionFundente}
                    onChange={e => setPresentacionFundente(e.target.value)}
                    style={{ width: '100%', padding: '7px', border: '1px solid #2563eb', borderRadius: '4px', background: 'white', fontWeight: 'bold', fontSize: '12px' }}
                  >
                    <option value="Granel">Granel</option>
                    <option value="Sachet">Sachet</option>
                  </select>
                </div>

                {presentacionFundente === 'Sachet' && (
                  <div>
                    {renderBuscador({
                      clave: 'unidadSachet',
                      busqueda: busquedaUnidadSachet,
                      setBusqueda: (texto) => {
                        setBusquedaUnidadSachet(texto);
                        if (texto.trim() === '') setUnidadSachet('');
                      },
                      onSeleccionar: (uni) => {
                        setUnidadSachet(uni.nombre);
                        setBusquedaUnidadSachet(uni.nombre);
                        setSelectorAbierto(null);
                      },
                      opciones: unidadesSachetFiltradas(busquedaUnidadSachet),
                      renderOpcion: (uni) => (
                        <span style={{ fontWeight: 500 }}>{uni.nombre}</span>
                      ),
                      label: 'PESO / FORMATO DE SACHET',
                      placeholder: 'Buscar sachet (ej. Sachet 1kg)...',
                      obligatorio: true,
                    })}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: moneda === 'US$' ? '1fr 1.5fr' : '1fr', gap: '8px', marginBottom: '8px', background: '#f8fafc', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', alignItems: 'center' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#1e293b' }}>MONEDA</label>
                <select
                  value={moneda}
                  onChange={e => {
                    const nuevaMoneda = e.target.value;
                    const tc = parseFloat(tipoCambio) || 1;
                    const convertir = (valStr) => {
                      const val = parseFloat(valStr) || 0;
                      if (moneda === 'S/' && nuevaMoneda === 'US$') return (val / tc).toFixed(2);
                      if (moneda === 'US$' && nuevaMoneda === 'S/') return (val * tc).toFixed(2);
                      return valStr;
                    };
                    setPv2025Display(prev => convertir(prev));
                    setCv2025Display(prev => convertir(prev));
                    setPrecioVentaDisplay(prev => convertir(prev));
                    setCostoUnitarioDisplay(prev => convertir(prev));
                    setMoneda(nuevaMoneda);
                  }}
                  style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontWeight: 'bold', background: 'white', fontSize: '12px' }}
                >
                  <option value="S/">Soles (S/)</option>
                  <option value="US$">Dólares (US$)</option>
                </select>
              </div>

              {moneda === 'US$' && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#1d4ed8' }}>TIPO DE CAMBIO (S/ POR US$)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={tipoCambio}
                    onChange={e => setTipoCambio(e.target.value)}
                    style={{ width: '100%', padding: '6px', border: '1px solid #2563eb', borderRadius: '4px', background: 'white', fontWeight: 'bold', fontSize: '12px' }}
                    placeholder="3.750"
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>PV ANT ({moneda})</label>
                <input 
                  type="number" step="0.01" 
                  value={pv2025Display} 
                  onChange={e => setPv2025Display(e.target.value)} 
                  style={{ width: '100%', padding: '7px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', fontSize: '12px' }} 
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>CV ANT ({moneda})</label>
                <input 
                  type="number" step="0.01" 
                  value={cv2025Display} 
                  onChange={e => setCv2025Display(e.target.value)} 
                  style={{ width: '100%', padding: '7px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', fontSize: '12px' }} 
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#2563eb' }}>PRECIO VENTA ({moneda})</label>
                <input 
                  type="number" step="0.01" 
                  value={precioVentaDisplay} 
                  onChange={e => setPrecioVentaDisplay(e.target.value)} 
                  style={{ width: '100%', padding: '7px', border: '1px solid #2563eb', borderRadius: '4px', background: '#eff6ff', fontWeight: 'bold', fontSize: '12px' }} 
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: 600, color: '#2563eb' }}>COSTO UNITARIO ({moneda})</label>
                <input 
                  type="number" step="0.01" 
                  value={costoUnitarioDisplay} 
                  onChange={e => setCostoUnitarioDisplay(e.target.value)} 
                  style={{ width: '100%', padding: '7px', border: '1px solid #2563eb', borderRadius: '4px', background: '#eff6ff', fontWeight: 'bold', fontSize: '12px' }} 
                />
              </div>
            </div>

            {codigoProducto && (
              <div style={{ marginTop: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <span>
                    Referencia en Odoo · UdM del producto: {refProducto?.unidad || um || '-'}
                    {cargandoHistorial && <span style={{ fontWeight: 400, color: '#64748b' }}> · consultando...</span>}
                  </span>
                  {cliente && (
                    <label style={{ fontSize: '10px', fontWeight: 600, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={soloClienteActual} onChange={e => setSoloClienteActual(e.target.checked)} />
                      Solo {cliente}
                    </label>
                  )}
                </div>

                {refProducto && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '10px' }}>
                    {[
                      ['Últ. precio venta', refProducto.ultimo_precio_venta],
                      ['Precio prom. venta', refProducto.precio_promedio_venta],
                      ['Últ. costo', refProducto.costo],
                      ['Costo promedio', historial.costoPromedio],
                    ].map(([etiqueta, valorSoles]) => (
                      <div key={etiqueta} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px 8px' }}>
                        <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 600 }}>{etiqueta}</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>S/ {fmt(valorSoles)}</div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>US$ {fmt((Number(valorSoles) || 0) / (tcReferencia || 1))}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  {renderTablaHistorial(tituloVentas, historial.ventas || [], 'Cliente')}
                  {renderTablaHistorial(tituloSalidas, historial.salidas || [], 'Referencia')}  
                  {renderTablaHistorial('Últimas compras (Contabilidad)', historial.compras || [], 'Proveedor')}
                </div>
              </div>
            )}
            
          </div>

          <div className="form-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div className="form-section-title" style={{ margin: 0 }}>3. Probabilidad de Éxito de la Oportunidad</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setTipoProbabilidad('general')}
                  style={{
                    padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                    background: tipoProbabilidad === 'general' ? '#2563eb' : 'white',
                    color: tipoProbabilidad === 'general' ? 'white' : '#475569',
                    border: '1px solid #cbd5e1'
                  }}
                >
                  General
                </button>
                <button
                  type="button"
                  onClick={() => setTipoProbabilidad('mensual')}
                  style={{
                    padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                    background: tipoProbabilidad === 'mensual' ? '#2563eb' : 'white',
                    color: tipoProbabilidad === 'mensual' ? 'white' : '#475569',
                    border: '1px solid #cbd5e1'
                  }}
                >
                  Por Mes
                </button>
              </div>
            </div>

            {tipoProbabilidad === 'general' ? (
              <div className="form-group" style={{ maxWidth: '200px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#1d4ed8' }}>PROBABILIDAD (%)</label>
                <input
                  type="number" min="0" max="100" step="1"
                  value={probabilidadGeneral}
                  onChange={e => setProbabilidadGeneral(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #2563eb', borderRadius: '4px', fontWeight: 'bold', background: '#eff6ff' }}
                />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
                {MESES.map(m => (
                  <div className="form-group" key={`prob-${m}`} style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: '#1d4ed8' }}>{m} (%)</label>
                    <input
                      type="number" min="0" max="100" step="1"
                      value={probabilidadesMeses[m]}
                      onChange={e => setProbabilidadesMeses({ ...probabilidadesMeses, [m]: e.target.value })}
                      style={{ width: '100%', padding: '6px', border: '1px solid #2563eb', borderRadius: '4px', textAlign: 'center', background: '#eff6ff', fontSize: '11px', fontWeight: 'bold' }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-section">
            <div className="form-section-title">4. Cantidades Proyectadas (mes a mes)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
              {MESES.map(m => (
                <div className="form-group" key={m} style={{ margin: 0 }}>
                  <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>{m}</label>
                  <input type="number" value={cantidades[m]} onChange={e => setCantidades({ ...cantidades, [m]: e.target.value })}
                    style={{ width: '100%', padding: '6px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', textAlign: 'center' }} />
                </div>
              ))}
            </div>
          </div>

          <div className="form-section" style={{ marginTop: 'auto' }}>
            <div className="form-section-title">5. Resumen Ponderado ({moneda})</div>

            <div className="calc-total" style={{ marginTop: '8px', padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#166534', paddingBottom: '6px' }}>
                <span>Cantidad Total del Año (Nominal)</span>
                <span style={{ fontWeight: 600 }}>{cantidadTotalAnio.toLocaleString('en-US')}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#166534', paddingBottom: '6px', borderTop: '1px dashed #bbf7d0', paddingTop: '6px' }}>
                <span>Ingresos Proyectados ({moneda})</span>
                <span style={{ fontWeight: 600 }}>{ingresoTotalProyectado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#991b1b', paddingBottom: '6px' }}>
                <span>Costos Proyectados ({moneda})</span>
                <span style={{ fontWeight: 600 }}>- {costoTotalProyectado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#166534', fontSize: '16px', borderTop: '1px solid #bbf7d0', paddingTop: '6px' }}>
                <span>Margen Bruto Ponderado <span style={{ fontSize: '13px', color: '#15803d', marginLeft: '8px' }}>({porcentajeMargen.toFixed(1)}%)</span></span>
                <span>{moneda} {margenBruto.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

        </div>
      </fieldset>

      <div className="offcanvas-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', gap: '12px', justifyContent: 'flex-end', background: 'white' }}>
        <button type="button" onClick={onCancelar} className="btn-back m-0" style={{ background: 'white', border: '1px solid var(--line, #cbd5e1)', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer' }}>
          {isSoloLectura ? 'Cerrar' : 'Cancelar'}
        </button>
        {!isSoloLectura && (
          <button type="button" onClick={handleGuardar} className="btn-add m-0" style={{ background: 'var(--primary-600, #2563eb)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>
            Guardar Forecast
          </button>
        )}
      </div>
    </div>
  );
}