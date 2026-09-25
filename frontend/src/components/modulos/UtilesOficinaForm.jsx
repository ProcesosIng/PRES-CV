import React, { useState, useEffect, useMemo, useRef } from 'react';
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

export default function UtilesOficinaForm({ registro, onGuardar, onCancelar, modo, area }) {
  const isSoloLectura = modo === 'ver';

  const [datosAuto, setDatosAuto] = useState({});
  const [anioActivo, setAnioActivo] = useState(ANIO_ACTUAL.toString());
  const [fechasSeleccionadas, setFechasSeleccionadas] = useState([]);
  const [valorBuscador, setValorBuscador] = useState('');
  const [proceso, setProceso] = useState('');
  const [finesDeUso, setFinesDeUso] = useState('');

  // Cada fila ahora incluye el `tipo` ('oficina' o 'aseo')
  const [filasItems, setFilasItems] = useState([
    { id: 'util-0', tipo: 'oficina', producto: '', busqueda: '', cantidad: 1, precioUnit: '', unidMed: 'Unidad' }
  ]);
  const [filasCuentas, setFilasCuentas] = useState([]);

  // Estados para Odoo
  const [listaEmpleados, setListaEmpleados] = useState([]);
  const [listaProductos, setListaProductos] = useState([]);
  const [listaCuentas, setListaCuentas] = useState([]);
  const [cargandoMaestros, setCargandoMaestros] = useState(true);

  // Estados para buscadores flotantes
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const contenedorBuscadorRef = useRef(null);
  const [filaProductoAbierta, setFilaProductoAbierta] = useState(null);

  const contadorFilaRef = useRef(1);
  const nuevoIdFila = () => `util-${Date.now()}-${contadorFilaRef.current++}`;

  const areaNormalizada = (area || '').toLowerCase().trim();
  const prefijoArea = prefijosPorArea[areaNormalizada] || '95';

  // 1. CARGA EN VIVO DESDE ODOO
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
          if (Array.isArray(empRes)) setListaEmpleados(empRes);
          if (Array.isArray(prodRes)) setListaProductos(prodRes);
          if (Array.isArray(ctaRes)) setListaCuentas(ctaRes);
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

  // Cerrar menús al hacer clic fuera
  useEffect(() => {
    const handleClickFuera = (event) => {
      if (contenedorBuscadorRef.current && !contenedorBuscadorRef.current.contains(event.target)) {
        setMostrarSugerencias(false);
      }

      if (filaProductoAbierta && !event.target.closest(`[data-producto-row="${filaProductoAbierta}"]`)) {
        setFilasItems(prev => prev.map(f =>
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
      const dc = registro.detalle_columnas || {};
      setDatosAuto({
        'auto-dni': registro.empleado_dni || '',
        'auto-dist': dc.distribucion?.toString() || '100',
      });

      setProceso(dc.proceso || '');
      setFinesDeUso(dc.fines_de_uso || '');
      setValorBuscador(registro.empleado_dni ? `${registro.empleado_dni} - ${registro.empleado_nombre || ''}` : '');

      const materialEspecifico = dc.descripcion_material || '';
      const cantidadEspecifica = dc.cantidad || 1;
      const precioEspecifico = dc.precio_unit?.toString() || '';
      
      // Detectar tipo según la cuenta guardada o descripción
      const cuentaGuardada = dc.cuenta_afectada || '';
      const tipoDetectado = cuentaGuardada.endsWith('6562000') ? 'aseo' : 'oficina';

      setFilasItems([
        {
          id: registro.id_registro || nuevoIdFila(),
          tipo: tipoDetectado,
          producto: materialEspecifico,
          busqueda: materialEspecifico,
          cantidad: cantidadEspecifica,
          precioUnit: precioEspecifico,
          unidMed: dc.unid_med || 'Unidad'
        }
      ]);

      setFilasCuentas(registro.desglose_contable || []);
      setFechasSeleccionadas([registro.fecha_proyeccion].filter(Boolean));
    } else {
      setFilasItems([{ id: nuevoIdFila(), tipo: 'oficina', producto: '', busqueda: '', cantidad: 1, precioUnit: '', unidMed: 'Unidad' }]);
      setFilasCuentas([]);
      setFechasSeleccionadas([]);
      setValorBuscador('');
      setProceso('');
      setFinesDeUso('');
      setDatosAuto({});
    }
  }, [registro]);

  const empleadosFiltrados = useMemo(() => {
    const query = (valorBuscador || '').trim().toLowerCase();
    const base = query.length >= 1
      ? listaEmpleados.filter(e => {
          const dniStr = String(e.dni || e.id || '');
          const nombreStr = String(e.nombre || '').toLowerCase();
          return dniStr.includes(query) || nombreStr.includes(query);
        })
      : listaEmpleados;
    return base.slice(0, 15);
  }, [valorBuscador, listaEmpleados]);

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

  const actualizarFila = (id, campo, valor) => {
    setFilasItems(prev => prev.map(f => f.id === id ? { ...f, [campo]: valor } : f));
  };

  // 🎯 FILTRO INTELIGENTE SEGÚN EL TIPO SELECCIONADO (Oficina o Aseo)
  const productosFiltrados = (textoBusqueda, tipoFila) => {
    const query = (textoBusqueda || '').trim().toLowerCase();

    const productosFiltradosCat = listaProductos.filter(p => {
      const categoria = String(p.categoria || p.categ_id || p.tipo || '').toLowerCase();
      const nombreProd = String(p.nombre || p.descripcion || p.item || '').toLowerCase();
      
      if (tipoFila === 'aseo') {
        return categoria.includes('aseo') || 
               categoria.includes('limpieza') || 
               categoria.includes('sanit') || 
               nombreProd.includes('jabón') || 
               nombreProd.includes('jabon') || 
               nombreProd.includes('papel higiénico') || 
               nombreProd.includes('papel higienico') || 
               nombreProd.includes('toalla') || 
               nombreProd.includes('detergente') || 
               nombreProd.includes('lejía') || 
               nombreProd.includes('lejia') || 
               nombreProd.includes('desinfectante') ||
               nombreProd.includes('escoba') ||
               nombreProd.includes('trapo') ||
               nombreProd.includes('alcohol');
      } else {
        return categoria.includes('util') || 
               categoria.includes('útil') || 
               categoria.includes('oficina') || 
               categoria.includes('papeleria') || 
               categoria.includes('papelería') ||
               categoria.includes('escritorio') ||
               nombreProd.includes('papel') || 
               nombreProd.includes('lapicero') || 
               nombreProd.includes('cuaderno') || 
               nombreProd.includes('folder') || 
               nombreProd.includes('archivador') ||
               nombreProd.includes('lapiz') ||
               nombreProd.includes('lápiz') ||
               nombreProd.includes('borrador') ||
               nombreProd.includes('corrector') ||
               nombreProd.includes('post-it') ||
               nombreProd.includes('tijera') ||
               nombreProd.includes('grapas') ||
               nombreProd.includes('marcador') ||
               nombreProd.includes('resaltador');
      }
    });

    const base = query.length >= 1
      ? productosFiltradosCat.filter(p => {
          const nombreStr = String(p.nombre || p.descripcion || p.item || '').toLowerCase();
          const codigoStr = String(p.codigo || p.id || '').toLowerCase();
          return nombreStr.includes(query) || codigoStr.includes(query);
        })
      : productosFiltradosCat;

    return base.slice(0, 20);
  };

  const seleccionarProducto = (idFila, prod) => {
    const nombreProd = prod.nombre || prod.descripcion || prod.item || '';
    const costoRef = prod.costo !== undefined ? prod.costo : (prod.pv !== undefined ? prod.pv : (prod.precio || 0));
    const unidadRef = prod.unidad || 'Unidad';

    setFilasItems(prev => prev.map(f => {
      if (f.id === idFila) {
        return {
          ...f,
          producto: nombreProd,
          busqueda: nombreProd,
          precioUnit: costoRef.toString(),
          unidMed: unidadRef
        };
      }
      return f;
    }));
    setFilaProductoAbierta(null);
  };

  // Motor contable dinámico (Oficina: 6561000 / Aseo: 6562000)
  useEffect(() => {
    const cuentasAgrupadas = {};

    filasItems.forEach((fila) => {
      if (!fila.producto) return;
      const cant = parseFloat(fila.cantidad) || 0;
      const precio = parseFloat(fila.precioUnit) || 0;
      const subtotal = cant * precio;

      if (subtotal > 0) {
        const cuentaBase = fila.tipo === 'aseo' ? '6562000' : '6561000';
        const cuentaFinal = `${prefijoArea}${cuentaBase}`;
        
        if (!cuentasAgrupadas[cuentaFinal]) {
          const infoCta = listaCuentas.find(c => String(c.codigo || c.id) === String(cuentaFinal));
          const nombreLabel = fila.tipo === 'aseo' ? 'Útiles de Aseo y Limpieza' : 'Útiles de Oficina';
          cuentasAgrupadas[cuentaFinal] = {
            cuenta: `${cuentaFinal}${infoCta ? ' - ' + infoCta.nombre : ' - ' + nombreLabel}`,
            monto: 0
          };
        }
        cuentasAgrupadas[cuentaFinal].monto += subtotal;
      }
    });

    const nuevasCuentas = Object.entries(cuentasAgrupadas).map(([_, datos], idx) => ({
      id: `cta-util-${idx}`,
      cuenta: datos.cuenta,
      monto: datos.monto.toFixed(2)
    }));

    setFilasCuentas(nuevasCuentas);
  }, [filasItems, prefijoArea, listaCuentas]);

  // Manejo de Fechas
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

  const handleGuardar = () => {
    const fechasFinales = [...fechasSeleccionadas];

    if (fechasFinales.length === 0) return alert('Por favor, ingrese al menos una fecha de aplicación.');
    if (!datosAuto['auto-dni']) return alert('Selecciona o busca un empleado/responsable válido.');
    if (filasItems.length === 0 || !filasItems[0].producto) return alert('Agrega al menos un material.');

    const empInfo = listaEmpleados.find(e => String(e.dni || e.id) === String(datosAuto['auto-dni']));
    const nombreEmpleado = empInfo ? empInfo.nombre : 'Área Responsable';

    let nuevosRegistros = [];

    fechasFinales.forEach((fecha, fechaIndex) => {
      filasItems.forEach((fila, prodIndex) => {
        if (!fila.producto) return;

        const cantidadNum = parseFloat(fila.cantidad) || 1;
        const precioNum = parseFloat(fila.precioUnit) || 0;
        const costoTotalItem = cantidadNum * precioNum;

        const cuentaBase = fila.tipo === 'aseo' ? '6562000' : '6561000';
        const cuentaFinal = `${prefijoArea}${cuentaBase}`;

        const idFinalRegistro = registro ? registro.id_registro : `REG-UTI-${Date.now()}-${fechaIndex}-${prodIndex}`;
        const idLoteFinal = registro ? registro.id_lote : `LOTE-UTI-${Date.now()}`;

        const nuevoItem = {
          id_registro: idFinalRegistro,
          id_lote: idLoteFinal,
          fecha_proyeccion: fecha,
          empleado_dni: datosAuto['auto-dni'] || '-',
          empleado_nombre: nombreEmpleado,
          area: area || 'Comercial',
          detalle_columnas: {
            cuenta_afectada: cuentaFinal,
            tipo_material: fila.tipo,
            descripcion_material: fila.producto,
            cantidad: cantidadNum,
            precio_unit: precioNum,
            unid_med: fila.unidMed,
            proceso: proceso,
            fines_de_uso: finesDeUso,
            costo_total: costoTotalItem,
            distribucion: parseFloat(datosAuto['auto-dist']) || 100
          },
          totales: { costo_total: costoTotalItem },
          desglose_contable: [
            {
              id: `cta-${fechaIndex}-${prodIndex}`,
              cuenta: cuentaFinal,
              monto: costoTotalItem.toFixed(2)
            }
          ],
          variables_registro: { filasItems }
        };

        nuevosRegistros.push(nuevoItem);
      });
    });

    onGuardar(nuevosRegistros);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <fieldset disabled={isSoloLectura} style={{ border: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="offcanvas-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', position: 'relative', padding: '16px' }}>

          {cargandoMaestros && (
            <div style={{ padding: '6px 12px', background: '#eff6ff', color: '#1e40af', borderRadius: '6px', fontSize: '11px' }}>
              Sincronizando empleados y materiales desde Odoo...
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

          {/* 1. INFORMACIÓN GENERAL */}
          <div className="form-section">
            <div className="form-section-title">1. Información General</div>

            <div className="form-group" style={{ marginBottom: '16px', position: 'relative' }} ref={contenedorBuscadorRef}>
              <label style={{ color: '#2563eb', fontWeight: 600, fontSize: '11px' }}>EMPLEADO / RESPONSABLE</label>
              <input
                type="text"
                value={valorBuscador}
                onChange={(e) => {
                  setValorBuscador(e.target.value);
                  setMostrarSugerencias(true);
                }}
                onFocus={() => setMostrarSugerencias(true)}
                placeholder="Escriba para buscar responsable..."
                autoComplete="off"
                style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }}
              />

              {mostrarSugerencias && empleadosFiltrados.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
                  border: '1px solid #cbd5e1', borderRadius: '0 0 6px 6px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                  maxHeight: '180px', overflowY: 'auto', zIndex: 50, marginTop: '2px'
                }}>
                  {empleadosFiltrados.map((e, index) => {
                    const identificador = e.dni || e.id || 'sin-id';
                    return (
                      <div
                        key={`emp-${index}-${identificador}`}
                        onClick={() => seleccionarEmpleado(e)}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#1e293b' }}
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

            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>PROCESO</label>
                <select value={proceso} onChange={e => setProceso(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }}>
                  <option value="">-- Seleccione --</option>
                  {PROCESOS_PRODUCTIVOS.map((p, idxProc) => <option key={`proc-${idxProc}-${p}`} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>FINES DE USO</label>
                <input type="text" value={finesDeUso} onChange={e => setFinesDeUso(e.target.value)} placeholder="Ej. Oficina Administrativa" style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }} />
              </div>
            </div>
          </div>

          {/* 2. MATERIALES (ÚTILES DE OFICINA Y ASEO) */}
          <div className="form-section">
            <div className="form-section-title">2. Materiales (Útiles de Oficina y Aseo)</div>
            {filasItems.map((fila, index) => {
              const productosSugeridos = productosFiltrados(fila.busqueda, fila.tipo);
              const dropdownAbierto = filaProductoAbierta === fila.id;

              return (
                <div key={fila.id} style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'flex-start', background: '#f8fafc', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  
                  {/* Selector de Tipo (Oficina / Aseo) */}
                  <div className="form-group" style={{ flex: 1.2, margin: 0 }}>
                    {index === 0 && <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>TIPO</label>}
                    <select
                      value={fila.tipo}
                      onChange={e => {
                        const nuevoTipo = e.target.value;
                        setFilasItems(prev => prev.map(f => f.id === fila.id ? { ...f, tipo: nuevoTipo, producto: '', busqueda: '' } : f));
                      }}
                      style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white', fontSize: '12px', fontWeight: 'bold', color: fila.tipo === 'aseo' ? '#0284c7' : '#2563eb' }}
                    >
                      <option value="oficina">✏️ Oficina</option>
                      <option value="aseo">🧼 Aseo</option>
                    </select>
                  </div>

                  {/* Descripción del Material con Buscador */}
                  <div
                    className="form-group"
                    style={{ flex: 3.5, margin: 0, position: 'relative' }}
                    data-producto-row={fila.id}
                  >
                    {index === 0 && <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>DESCRIPCIÓN MATERIAL</label>}
                    <input
                      type="text"
                      value={fila.busqueda}
                      onChange={(e) => {
                        actualizarFila(fila.id, 'busqueda', e.target.value);
                        actualizarFila(fila.id, 'producto', '');
                        setFilaProductoAbierta(fila.id);
                      }}
                      onFocus={() => setFilaProductoAbierta(fila.id)}
                      placeholder={fila.tipo === 'aseo' ? 'Buscar jabón, papel higiénico, etc...' : 'Buscar útiles, papel, lapiceros...'}
                      autoComplete="off"
                      style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }}
                    />

                    {dropdownAbierto && productosSugeridos.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
                        border: '1px solid #cbd5e1', borderRadius: '0 0 6px 6px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                        maxHeight: '220px', overflowY: 'auto', zIndex: 50, marginTop: '2px'
                      }}>
                        {productosSugeridos.map((p, pIdx) => {
                          const identificadorProd = p.codigo || p.id || 'sin-codigo';
                          return (
                            <div
                              key={`prod-${fila.id}-${pIdx}-${identificadorProd}`}
                              onClick={() => seleccionarProducto(fila.id, p)}
                              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#1e293b', display: 'flex', justifyContent: 'space-between', gap: '8px' }}
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
                  </div>

                  {/* Cantidad */}
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    {index === 0 && <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>CANT.</label>}
                    <input
                      type="number"
                      min="1"
                      value={fila.cantidad}
                      onChange={e => actualizarFila(fila.id, 'cantidad', e.target.value)}
                      style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'center', width: '100%', background: 'white' }}
                    />
                  </div>

                  {/* Precio Unitario */}
                  <div className="form-group" style={{ flex: 1.2, margin: 0 }}>
                    {index === 0 && <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>PRECIO UNIT.</label>}
                    <input
                      type="number"
                      step="0.01"
                      value={fila.precioUnit}
                      onChange={e => actualizarFila(fila.id, 'precioUnit', e.target.value)}
                      style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'right', width: '100%', background: 'white' }}
                    />
                  </div>

                  {filasItems.length > 1 && (
                    <button type="button" onClick={() => setFilasItems(filasItems.filter(f => f.id !== fila.id))} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '22px', cursor: 'pointer', lineHeight: 1, padding: '6px 0', alignSelf: 'center' }}>
                      &times;
                    </button>
                  )}
                </div>
              );
            })}

            <button type="button" onClick={() => setFilasItems([...filasItems, { id: nuevoIdFila(), tipo: 'oficina', producto: '', busqueda: '', cantidad: 1, precioUnit: '', unidMed: 'Unidad' }])} className="btn-ghost" style={{ width: '100%', marginTop: '4px', borderStyle: 'dashed', background: 'white', padding: '8px', cursor: 'pointer' }}>
              + Agregar otro material (Oficina / Aseo)
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