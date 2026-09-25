import React, { useState, useEffect, useRef } from 'react';
import { PROCESOS_PRODUCTIVOS, MESES } from '../../config/data';
import { obtenerEmpleadosOdoo, obtenerProductosOdoo, obtenerCuentasOdoo } from '../../data/store';

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS_DISPONIBLES = [ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1, ANIO_ACTUAL + 2].map(String);

const prefijosPorArea = {
  'administración': '94',
  'administracion': '94',
  'comercial': '95',
  'logística': '98',
  'logistica': '98',
  'almacén': '99',
  'almacen': '99',
  'producción crisoles': '91',
  'produccion crisoles': '91',
  'producción fundente': '92',
  'produccion fundente': '92',
  'producción': '91',
  'produccion': '91'
};

export default function UniformesForm({ registro, onGuardar, onCancelar, modo, area }) {
  const isSoloLectura = modo === 'ver';

  const [datosAuto, setDatosAuto] = useState({});
  const [anioActivo, setAnioActivo] = useState(ANIO_ACTUAL.toString());
  const [fechasSeleccionadas, setFechasSeleccionadas] = useState([]);
  const [valorBuscador, setValorBuscador] = useState('');
  const [proceso, setProceso] = useState('');

  // Cada fila ahora guarda también `busqueda` (texto que el usuario está
  // escribiendo en su propio buscador de producto) separado de `producto`
  // (el nombre ya confirmado/seleccionado) — así una búsqueda a medio
  // escribir nunca sobreescribe silenciosamente la selección guardada.
  const [filasEpps, setFilasEpps] = useState([{ id: 'epp-0', producto: '', busqueda: '', cantidad: 1 }]);
  const [filasCuentas, setFilasCuentas] = useState([]);

  // Estados limpios para Odoo
  const [listaEmpleados, setListaEmpleados] = useState([]);
  const [listaProductos, setListaProductos] = useState([]);
  const [listaCuentas, setListaCuentas] = useState([]);
  const [cargandoMaestros, setCargandoMaestros] = useState(true);

  // Estados para controlar el buscador interno seguro (empleado)
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const contenedorBuscadorRef = useRef(null);

  // Estado para el buscador de producto: guarda el id de la FILA que
  // tiene su lista de sugerencias abierta (solo una a la vez).
  const [filaProductoAbierta, setFilaProductoAbierta] = useState(null);

  // Contador propio para generar ids de fila siempre únicos, aunque el
  // usuario haga clic en "+ Agregar otro EPP" varias veces en el mismo
  // milisegundo (Date.now() solo puede repetirse en ese escenario).
  const contadorFilaRef = useRef(1);
  const nuevoIdFila = () => `epp-${Date.now()}-${contadorFilaRef.current++}`;

  const areaNormalizada = (area || '').toLowerCase().trim();
  const prefijoArea = prefijosPorArea[areaNormalizada] || '';

  // 1. CARGA EN VIVO DESDE ODOO CON MANEJO DE PROMESAS
  useEffect(() => {
    let activo = true;
    async function cargarDatosOdoo() {
      setCargandoMaestros(true);
      try {
        const [empRes, prodRes, ctaRes] = await Promise.all([
          obtenerEmpleadosOdoo(),
          obtenerProductosOdoo(),
          obtenerCuentasOdoo()
        ]);

        if (activo) {
          if (Array.isArray(empRes) && empRes.length > 0) setListaEmpleados(empRes);
          if (Array.isArray(prodRes) && prodRes.length > 0) setListaProductos(prodRes);
          if (Array.isArray(ctaRes) && ctaRes.length > 0) setListaCuentas(ctaRes);
        }
      } catch (error) {
        console.error("Error al conectar con Odoo:", error);
      } finally {
        if (activo) setCargandoMaestros(false);
      }
    }
    cargarDatosOdoo();
    return () => { activo = false; };
  }, []);

  // Cerrar CUALQUIER menú desplegable (empleado o producto) al hacer
  // clic fuera de su propio contenedor.
  useEffect(() => {
    const handleClickFuera = (event) => {
      if (contenedorBuscadorRef.current && !contenedorBuscadorRef.current.contains(event.target)) {
        setMostrarSugerencias(false);
      }

      if (filaProductoAbierta && !event.target.closest(`[data-producto-row="${filaProductoAbierta}"]`)) {
        // Si el usuario cierra sin elegir una sugerencia nueva, la caja de
        // texto vuelve a mostrar el producto ya confirmado (revierte lo
        // que haya quedado escrito a medias).
        setFilasEpps(prev => prev.map(f =>
          f.id === filaProductoAbierta ? { ...f, busqueda: f.producto } : f
        ));
        setFilaProductoAbierta(null);
      }
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, [filaProductoAbierta]);

  // 2. CARGA INICIAL DE REGISTRO
  useEffect(() => {
    if (registro) {
      setDatosAuto({
        'auto-dni': registro.empleado_dni || '',
        'auto-dist': registro.detalle_columnas?.distribucion?.toString() || '100',
      });

      setProceso(registro.detalle_columnas?.proceso || '');
      setValorBuscador(registro.empleado_dni ? `${registro.empleado_dni} - ${registro.empleado_nombre || ''}` : '');

      const productoEspecifico = registro.detalle_columnas?.epp_nombre || '';
      const cantidadEspecifica = registro.detalle_columnas?.cantidad || 1;

      setFilasEpps([
        {
          id: registro.id_registro || nuevoIdFila(),
          producto: productoEspecifico,
          busqueda: productoEspecifico,
          cantidad: cantidadEspecifica
        }
      ]);

      setFilasCuentas(registro.desglose_contable || []);
      setFechasSeleccionadas([registro.fecha_proyeccion].filter(Boolean));
    } else {
      setFilasEpps([{ id: nuevoIdFila(), producto: '', busqueda: '', cantidad: 1 }]);
      setFilasCuentas([]);
      setFechasSeleccionadas([]);
      setValorBuscador('');
      setProceso('');
      setDatosAuto({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registro]);

  // Filtrado de empleados (SOLO DNI Y NOMBRE, sin puestos)
  const empleadosFiltrados = valorBuscador.trim().length >= 1
    ? listaEmpleados.filter(e => {
        const dniStr = String(e.dni || e.id || '');
        const nombreStr = String(e.nombre || '').toLowerCase();
        const query = valorBuscador.toLowerCase();
        return dniStr.includes(query) || nombreStr.includes(query);
      })
    : listaEmpleados.slice(0, 15);

  const seleccionarEmpleado = (emp) => {
    const dniId = emp.dni || emp.id;
    const nombreEmp = emp.nombre;
    setValorBuscador(`${dniId} - ${nombreEmp}`);
    setDatosAuto({
      'auto-dni': dniId,
      'auto-dist': emp.distribucion?.toString().replace('%', '') || '100',
    });
    setMostrarSugerencias(false);
  };

  // Helper genérico para actualizar un campo de una fila de EPP puntual.
  const actualizarFila = (id, campo, valor) => {
    setFilasEpps(prev => prev.map(f => f.id === id ? { ...f, [campo]: valor } : f));
  };

  // Productos que matchean lo que el usuario escribió en la fila `id`
  // (por nombre o código), limitado a 20 resultados para que la lista
  // siga siendo manejable con catálogos grandes de Odoo.
  const productosFiltrados = (textoBusqueda) => {
    const query = (textoBusqueda || '').trim().toLowerCase();

    // 1. Filtramos primero para conservar únicamente los EPPs y Uniformes
    const productosEpps = listaProductos.filter(p => {
      const categoria = String(p.categoria || p.categ_id || p.tipo || '').toLowerCase();
      const nombreProd = String(p.nombre || '').toLowerCase();
      
      return categoria.includes('epp') || 
             categoria.includes('uniforme') || 
             nombreProd.includes('epp') || 
             nombreProd.includes('uniforme') ||
             nombreProd.includes('casco') || 
             nombreProd.includes('lentes') || 
             nombreProd.includes('guantes') || 
             nombreProd.includes('respirador') ||
             nombreProd.includes('zapato') ||
             nombreProd.includes('bota');
    });

    // 2. Aplicamos la búsqueda por texto (nombre o código) sobre el conjunto filtrado
    const base = query.length >= 1
      ? productosEpps.filter(p => {
          const nombreStr = String(p.nombre || '').toLowerCase();
          const codigoStr = String(p.codigo || p.id || '').toLowerCase();
          return nombreStr.includes(query) || codigoStr.includes(query);
        })
      : productosEpps;

    return base.slice(0, 20);
  };

  const seleccionarProducto = (idFila, prod) => {
    actualizarFila(idFila, 'producto', prod.nombre);
    actualizarFila(idFila, 'busqueda', prod.nombre);
    setFilaProductoAbierta(null);
  };

  // 3. MOTOR MATEMÁTICO CONTABLE
  useEffect(() => {
    const cuentaEPP = listaCuentas.find(c =>
      (c.nombre && c.nombre.toLowerCase().includes('uniforme')) ||
      (c.codigo && String(c.codigo).startsWith('65')) ||
      (c.id && String(c.id).startsWith('65'))
    ) || { codigo: '6561000', nombre: 'Suministros y EPPs' };

    const idString = (cuentaEPP.codigo || cuentaEPP.id || '6561000').toString();
    const codigoBaseLimpio = idString.length > 7 ? idString.substring(idString.length - 7) : idString;
    const codigoFinal = prefijoArea ? `${prefijoArea}${codigoBaseLimpio}` : codigoBaseLimpio;

    const nuevasCuentas = [];

    filasEpps.forEach((fila, idx) => {
      if (!fila.producto) return;
      const prod = listaProductos.find(p => p.nombre === fila.producto || p.codigo === fila.producto);
      const costoUnitario = prod ? parseFloat(prod.costo || prod.pv) || 0 : 0;
      const cantidad = parseFloat(fila.cantidad) || 0;
      const subtotal = costoUnitario * cantidad;

      if (subtotal > 0) {
        nuevasCuentas.push({
          id: `cta-epp-${idx}`,
          cuenta: codigoFinal,
          monto: subtotal.toFixed(2)
        });
      }
    });

    setFilasCuentas(nuevasCuentas);
  }, [filasEpps, prefijoArea, listaProductos, listaCuentas]);

  // Fechas mensuales
  const construirFecha = (anio, mesIndex) => `${anio}-${(mesIndex + 1).toString().padStart(2, '0')}-01`;
  const estaSeleccionado = (anio, mesIndex) => fechasSeleccionadas.includes(construirFecha(anio, mesIndex));

  const toggleMes = (anio, mesIndex) => {
    const fecha = construirFecha(anio, mesIndex);
    setFechasSeleccionadas(prev =>
      prev.includes(fecha) ? prev.filter(f => f !== fecha) : [...prev, fecha].sort()
    );
  };

  const seleccionarAnioCompleto = (anio) => {
    const fechasDelAnio = MESES.map((_, i) => construirFecha(anio, i));
    setFechasSeleccionadas(prev => Array.from(new Set([...prev, ...fechasDelAnio])).sort());
  };

  const limpiarAnio = (anio) => {
    setFechasSeleccionadas(prev => prev.filter(f => !f.startsWith(`${anio}-`)));
  };

  const formatearEtiqueta = (fechaStr) => {
    const [anio, mes] = fechaStr.split('-');
    const nombreMes = MESES[parseInt(mes, 10) - 1] || mes;
    return `${nombreMes} ${anio}`;
  };

  // 4. GUARDADO
  const handleGuardar = () => {
    const fechasFinales = [...fechasSeleccionadas];

    if (fechasFinales.length === 0) return alert('Por favor, ingrese al menos una fecha (mes).');
    if (!datosAuto['auto-dni']) return alert('Selecciona o busca un empleado válido.');
    if (filasEpps.length === 0 || !filasEpps[0].producto) return alert('Agrega al menos un producto EPP.');

    const empInfo = listaEmpleados.find(e => String(e.dni || e.id) === String(datosAuto['auto-dni']));
    const nombreEmpleado = empInfo ? empInfo.nombre : 'Desconocido';

    let nuevosRegistros = [];

    fechasFinales.forEach((fecha, fechaIndex) => {
      filasEpps.forEach((fila, prodIndex) => {
        if (!fila.producto) return;

        const prod = listaProductos.find(p => p.nombre === fila.producto || p.codigo === fila.producto);
        const costoUnitario = prod ? parseFloat(prod.costo || prod.pv) || 0 : 0;
        const cantidadNum = parseFloat(fila.cantidad) || 1;
        const costoTotalItem = costoUnitario * cantidadNum;

        const cuentaEPP = listaCuentas.find(c =>
          (c.nombre && c.nombre.toLowerCase().includes('epp')) ||
          (c.codigo && String(c.codigo).startsWith('65'))
        ) || { codigo: '6561000', nombre: 'Suministros y EPPs' };

        const idString = (cuentaEPP.codigo || cuentaEPP.id || '6561000').toString();
        const codigoBaseLimpio = idString.length > 7 ? idString.substring(idString.length - 7) : idString;
        const codigoFinal = prefijoArea ? `${prefijoArea}${codigoBaseLimpio}` : codigoBaseLimpio;

        const idFinalRegistro = registro ? registro.id_registro : `REG-EPP-${Date.now()}-${fechaIndex}-${prodIndex}`;
        const idLoteFinal = registro ? registro.id_lote : `LOTE-EPP-${Date.now()}`;

        const nuevoItem = {
          id_registro: idFinalRegistro,
          id_lote: idLoteFinal,
          fecha_proyeccion: fecha,
          empleado_dni: datosAuto['auto-dni'],
          empleado_nombre: nombreEmpleado,
          detalle_columnas: {
            cuenta_afectada: codigoFinal,
            epp_nombre: fila.producto,
            cantidad: cantidadNum,
            proceso: proceso,
            costo_total: costoTotalItem,
            distribucion: parseFloat(datosAuto['auto-dist']) || 100
          },
          totales: { costo_total: costoTotalItem },
          desglose_contable: [
            {
              id: `cta-${fechaIndex}-${prodIndex}`,
              cuenta: codigoFinal,
              monto: costoTotalItem.toFixed(2)
            }
          ],
          variables_registro: { filasEpps }
        };

        nuevosRegistros.push(nuevoItem);
      });
    });

    onGuardar(nuevosRegistros);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <fieldset disabled={isSoloLectura} style={{ border: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="offcanvas-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', position: 'relative' }}>

          {cargandoMaestros && (
            <div style={{ padding: '6px 12px', background: '#eff6ff', color: '#1e40af', borderRadius: '6px', fontSize: '11px' }}>
              Sincronizando empleados, productos y cuentas desde Odoo...
            </div>
          )}

          {/* 0. FECHAS */}
          <div className="form-section">
            <div className="form-section-title">0. Fechas de Aplicación</div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              {ANIOS_DISPONIBLES.map((anio, idxAnio) => (
                <button key={`anio-${idxAnio}-${anio}`} type="button" onClick={() => setAnioActivo(anio)}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                    border: anio === anioActivo ? '1px solid #2563eb' : '1px solid #cbd5e1',
                    background: anio === anioActivo ? '#2563eb' : 'white',
                    color: anio === anioActivo ? 'white' : '#475569',
                  }}>
                  {anio}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px', marginBottom: '10px' }}>
              {MESES.map((mes, i) => {
                const activo = estaSeleccionado(anioActivo, i);
                return (
                  <button key={`mes-${i}-${mes}`} type="button" onClick={() => toggleMes(anioActivo, i)}
                    style={{
                      padding: '8px 4px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                      border: activo ? '1px solid #166534' : '1px solid #cbd5e1',
                      background: activo ? '#f0fdf4' : 'white',
                      color: activo ? '#166534' : '#475569',
                    }}>
                    {mes}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button type="button" onClick={() => seleccionarAnioCompleto(anioActivo)} className="btn-ghost" style={{ background: 'white', fontSize: '12px', padding: '6px 10px' }}>
                + Seleccionar {anioActivo} completo
              </button>
              <button type="button" onClick={() => limpiarAnio(anioActivo)} className="btn-ghost" style={{ background: 'white', fontSize: '12px', padding: '6px 10px', color: '#ef4444' }}>
                Limpiar {anioActivo}
              </button>
            </div>

            {fechasSeleccionadas.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {fechasSeleccionadas.map((f, idxFecha) => (
                  <div key={`fecha-${idxFecha}-${f}`} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '4px 10px', borderRadius: '99px', fontSize: '12px' }}>
                    {formatearEtiqueta(f)}
                    <span onClick={() => setFechasSeleccionadas(fechasSeleccionadas.filter(x => x !== f))} style={{ cursor: 'pointer', fontWeight: 'bold', marginLeft: '6px' }}>&times;</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 1. INFORMACIÓN GENERAL - BUSCADOR INTERNO SEGURO (SOLO DNI Y NOMBRE) */}
          <div className="form-section">
            <div className="form-section-title">1. Información General</div>

            <div className="form-group" style={{ marginBottom: '16px', position: 'relative' }} ref={contenedorBuscadorRef}>
              <label style={{ color: '#2563eb', fontWeight: 600, fontSize: '11px' }}>BUSCAR EMPLEADO (DNI O NOMBRE)</label>
              <input
                type="text"
                value={valorBuscador}
                onChange={(e) => {
                  setValorBuscador(e.target.value);
                  setMostrarSugerencias(true);
                }}
                onFocus={() => setMostrarSugerencias(true)}
                placeholder="Escriba para buscar operario..."
                autoComplete="off"
                style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
              />

              {/* LISTA DESPLEGABLE INTERNA RESTRINGIDA ESTRICTAMENTE AL CONTENEDOR */}
              {mostrarSugerencias && empleadosFiltrados.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0 0 6px 6px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  zIndex: 50
                }}>
                  {/* La key SIEMPRE incluye el índice del .map: un dni/id
                      repetido o con placeholder (ej. "-") en los datos de
                      Odoo ya no puede colisionar con otra fila. */}
                  {empleadosFiltrados.map((e, index) => {
                    const identificador = e.dni || e.id || 'sin-id';
                    return (
                      <div
                        key={`emp-${index}-${identificador}`}
                        onClick={() => seleccionarEmpleado(e)}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f1f5f9',
                          fontSize: '12px',
                          color: '#1e293b'
                        }}
                        onMouseEnter={(ev) => ev.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={(ev) => ev.currentTarget.style.background = 'white'}
                      >
                        <strong>{identificador}</strong> - {e.nombre}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>DNI / ID</label>
                <input type="text" value={datosAuto['auto-dni'] || ''} readOnly style={{ background: '#f8fafc', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', width: '100%' }} />
              </div>
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Distribución (%)</label>
                <input type="text" value={datosAuto['auto-dist'] || '100'} onChange={e => setDatosAuto({ ...datosAuto, 'auto-dist': e.target.value })} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', width: '100%' }} />
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '10px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>PROCESO</label>
              <select value={proceso} onChange={e => setProceso(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }}>
                <option value="">-- Seleccione --</option>
                {PROCESOS_PRODUCTIVOS.map((p, idxProc) => <option key={`proc-${idxProc}-${p}`} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* 2. EPPs (CATÁLOGO ODOO) — selector con buscador propio, ya no
              es un <select> nativo gigante sin filtro. */}
          <div className="form-section">
            <div className="form-section-title">2. Asignación de EPPs / Productos</div>
            {filasEpps.map((fila, index) => {
              const productosSugeridos = productosFiltrados(fila.busqueda);
              const dropdownAbierto = filaProductoAbierta === fila.id;

              return (
                <div key={fila.id} style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'flex-start' }}>
                  <div
                    className="form-group"
                    style={{ flex: 3, margin: 0, position: 'relative' }}
                    data-producto-row={fila.id}
                  >
                    <input
                      type="text"
                      value={fila.busqueda}
                      onChange={(e) => {
                        actualizarFila(fila.id, 'busqueda', e.target.value);
                        // Escribir invalida la selección previa hasta que
                        // el usuario elija explícitamente una sugerencia.
                        actualizarFila(fila.id, 'producto', '');
                        setFilaProductoAbierta(fila.id);
                      }}
                      onFocus={() => setFilaProductoAbierta(fila.id)}
                      placeholder="Escriba para buscar EPP o artículo..."
                      autoComplete="off"
                      style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }}
                    />

                    {dropdownAbierto && productosSugeridos.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'white',
                        border: '1px solid #cbd5e1',
                        borderRadius: '0 0 6px 6px',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                        maxHeight: '220px',
                        overflowY: 'auto',
                        zIndex: 50
                      }}>
                        {productosSugeridos.map((p, pIdx) => {
                          const identificadorProd = p.codigo || p.id || 'sin-codigo';
                          return (
                            <div
                              key={`prod-${fila.id}-${pIdx}-${identificadorProd}`}
                              onClick={() => seleccionarProducto(fila.id, p)}
                              style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #f1f5f9',
                                fontSize: '12px',
                                color: '#1e293b',
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: '8px'
                              }}
                              onMouseEnter={(ev) => ev.currentTarget.style.background = '#f8fafc'}
                              onMouseLeave={(ev) => ev.currentTarget.style.background = 'white'}
                            >
                              <span>{p.nombre}</span>
                              <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>
                                S/ {parseFloat(p.costo || p.pv || 0).toFixed(2)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {dropdownAbierto && fila.busqueda.trim().length >= 1 && productosSugeridos.length === 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
                        border: '1px solid #cbd5e1', borderRadius: '0 0 6px 6px', padding: '10px 12px',
                        fontSize: '12px', color: '#94a3b8', zIndex: 50
                      }}>
                        Sin resultados para "{fila.busqueda}"
                      </div>
                    )}
                  </div>

                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    <input
                      type="number"
                      min="1"
                      value={fila.cantidad}
                      onChange={e => actualizarFila(fila.id, 'cantidad', e.target.value)}
                      style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'center', width: '100%' }}
                    />
                  </div>

                  {filasEpps.length > 1 && (
                    <button type="button" onClick={() => setFilasEpps(filasEpps.filter(f => f.id !== fila.id))} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '22px', cursor: 'pointer', lineHeight: 1, padding: '6px 0' }}>
                      &times;
                    </button>
                  )}
                </div>
              );
            })}

            <button type="button" onClick={() => setFilasEpps([...filasEpps, { id: nuevoIdFila(), producto: '', busqueda: '', cantidad: 1 }])} className="btn-ghost" style={{ width: '100%', marginTop: '4px', borderStyle: 'dashed', background: 'white', padding: '8px', cursor: 'pointer' }}>
              + Agregar otro EPP
            </button>
          </div>

          {/* 3. IMPACTO CONTABLE */}
          <div className="form-section" style={{ marginTop: 'auto' }}>
            <div className="form-section-title">3. Impacto Contable (Desglosado)</div>
            <div style={{ background: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', padding: '12px' }}>
              {filasCuentas.map((f, idxCta) => (
                <div key={`cta-${idxCta}-${f.id ?? f.cuenta}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '13px', color: '#475569' }}>
                  <span>Cuenta: <strong>{f.cuenta}</strong></span>
                  <span style={{ fontWeight: 600 }}>S/ {parseFloat(f.monto).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>

            <div className="calc-total" style={{ marginTop: '16px', padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#166534', fontSize: '16px' }}>
                <span>Total General Proyectado</span>
                <span>S/ {filasCuentas.reduce((acc, curr) => acc + parseFloat(curr.monto || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

        </div>
      </fieldset>

      <div className="offcanvas-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', gap: '12px', justifyContent: 'flex-end', background: 'white' }}>
        <button type="button" onClick={onCancelar} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer' }}>
          {isSoloLectura ? 'Cerrar' : 'Cancelar'}
        </button>
        {!isSoloLectura && (
          <button type="button" onClick={handleGuardar} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>
            Guardar Registro
          </button>
        )}
      </div>
    </div>
  );
}
