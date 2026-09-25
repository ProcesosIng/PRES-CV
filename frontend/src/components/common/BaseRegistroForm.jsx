import React, { useState, useMemo, useEffect } from 'react';
import {MESES } from '../../config/data';

// Diccionario normalizado a minúsculas para que coincida con .toLowerCase()
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
  'produccion': '91',
  'producción copelas': '93', 'produccion copelas': '93',
};

const AREAS = ['Administración', 'Comercial', 'Logística', 'Almacén', 'Producción Crisoles', 'Producción Fundente', 'Producción Copelas'];

const normalizarArea = (a) => String(a || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// Solo las áreas de producción tienen proceso. Vacío = CIF.
const PROCESOS_POR_AREA = {
  'produccion fundente': ['Granel', 'Sachet', 'CIF'],
  'produccion crisoles': ['Primer Proceso', 'Segundo Proceso', 'CIF'],
  'producción copelas': ['Primer Proceso', 'Segundo Proceso', 'CIF']
};

export default function BaseRegistroForm({ registro, onGuardar, onCancelar, modo, config, area }) {
  const isSoloLectura = modo === 'ver';

  // ==========================================
  // 1. ESTADOS
  // ==========================================
  const ANIO_ACTUAL = new Date().getFullYear();
  const ANIOS_DISPONIBLES = [ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1, ANIO_ACTUAL + 2].map(String);
  const [anioActivo, setAnioActivo] = useState(ANIO_ACTUAL.toString());
  const [fechasSeleccionadas, setFechasSeleccionadas] = useState([]);

  const [valorBuscador, setValorBuscador] = useState('');

  const [datosAuto, setDatosAuto] = useState({ area: area || '', dni: '', dist: '100', proceso: '', cargo: '' });
  
  const [listaCuentasOdoo, setListaCuentasOdoo] = useState([]);
  const [listaEmpleadosOdoo, setListaEmpleadosOdoo] = useState([]);
  const [empleadosSugeridos, setEmpleadosSugeridos] = useState([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);

  // NUEVOS ESTADOS PARA BÚSQUEDA FLOTANTE DE CUENTAS
  const [cuentasSugeridas, setCuentasSugeridas] = useState([]);
  const [mostrarSugerenciasCuentas, setMostrarSugerenciasCuentas] = useState(false);
  const [indiceFilaActiva, setIndiceFilaActiva] = useState(null);
  
  // Filas dinámicas de cuentas/ítems
  const [detalles, setDetalles] = useState([
    { id: Date.now(), cuenta: '', detalle: '', monto: '' }
  ]);

  // Obtener el área activa y buscar en el diccionario normalizado
  const areaActual = datosAuto.area || area || '';
  const areaNormalizada = areaActual.toLowerCase().trim();
  const prefijoArea = prefijosPorArea[areaNormalizada] || '';

  const AREAS = ['Administración', 'Comercial', 'Logística', 'Almacén', 'Producción Crisoles', 'Producción Fundente', 'Producción Copelas'];

  const normalizarArea = (a) => String(a || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  // Solo las áreas de producción tienen proceso. Vacío = CIF.
  const PROCESOS_POR_AREA = {
    'produccion fundente': ['Granel', 'Sachet', 'CIF'],
    'produccion crisoles': ['Primer Proceso', 'Segundo Proceso', 'CIF'],
    'producción copelas': ['Primer Proceso', 'Segundo Proceso', 'CIF']
  };

  const opcionesProceso = PROCESOS_POR_AREA[normalizarArea(areaActual)] || [];
  const opcionesArea = (!areaActual || AREAS.includes(areaActual)) ? AREAS : [areaActual, ...AREAS];   

  // Función robusta para aplicar el prefijo dinámico
  const aplicarPrefijoCuenta = (cuentaInput) => {
    if (!cuentaInput) return '';
    const partes = cuentaInput.split(' - ');
    let codigoLimpio = partes[0].trim();
    
    // Si no hay prefijo configurado para el área, se retorna intacto
    if (!prefijoArea) return cuentaInput;

    // Si ya empieza con el prefijo correcto y tiene 9 dígitos, está listo
    if (codigoLimpio.startsWith(prefijoArea) && codigoLimpio.length === 9) {
      return cuentaInput;
    }

    // Tomamos la base real de la cuenta (los últimos 7 dígitos) y anteponemos el prefijo del área
    const numeroBase = codigoLimpio.length >= 7 ? codigoLimpio.substring(codigoLimpio.length - 7) : codigoLimpio;
    const codigoFinal = `${prefijoArea}${numeroBase}`;
    
    const restoTexto = partes.slice(1).join(' - ');
    return restoTexto ? `${codigoFinal} - ${restoTexto}` : codigoFinal;
  };
  

  // ==========================================
  // 2. CARGA INICIAL (MODO EDICIÓN)
  // ==========================================

  // CARGA ASÍNCRONA DE CUENTAS DESDE ODOO
  useEffect(() => {
    async function cargarCuentasOdoo() {
      try {
        const respuesta = await fetch('http://localhost:5000/api/maestros/cuentas');
        if (respuesta.ok) {
          const data = await respuesta.json();
          setListaCuentasOdoo(data || []);
        }
      } catch (error) {
        console.error("Error al cargar cuentas contables desde Odoo:", error);
      }
    }
    cargarCuentasOdoo();
  }, []);

  // CARGA ASÍNCRONA DE EMPLEADOS DESDE ODOO
  useEffect(() => {
    async function cargarEmpleadosOdoo() {
      try {
        const respuesta = await fetch('http://localhost:5000/api/maestros/empleados');
        if (respuesta.ok) {
          const data = await respuesta.json();
          setListaEmpleadosOdoo(data || []);
        }
      } catch (error) {
        console.error("Error al cargar empleados desde Odoo:", error);
      }
    }
    cargarEmpleadosOdoo();
  }, [])

  useEffect(() => {
    // Si NO hay registro (es un registro nuevo), limpiamos la pantalla
    if (!registro) {
      setDetalles([{ id: Date.now(), cuenta: '', detalle: '', monto: '' }]);
      setFechasSeleccionadas([]);
      setValorBuscador('');
      setDatosAuto(prev => ({ ...prev, dni: '', dist: '100', area: area || '', proceso: '', cargo: 'Sin asignar' }));
      return;
    }

    // Si HAY registro, cargamos los datos INMEDIATAMENTE sin esperar a Odoo
    const dc = registro.detalle_columnas || {};
    
    setDatosAuto(prev => ({
      ...prev,
      dni: registro.empleado_dni || '',
      dist: dc.distribucion?.toString() || '100',
      area: dc.area || area || '',
      proceso: dc.proceso || ''
    }));

    setValorBuscador(`${registro.empleado_dni || ''} - ${registro.empleado_nombre || ''}`);
    
    const cuentaUnitaria = dc.cuenta_afectada || '';
    const detalleUnitario = dc.detalle || '';
    const montoUnitario = registro.totales?.costo_total ?? '';

    setDetalles([
      {
        id: registro.id_registro || Date.now(),
        cuenta: cuentaUnitaria,
        detalle: detalleUnitario,
        monto: montoUnitario
      }
    ]);

    if (registro.fecha_proyeccion) {
      setFechasSeleccionadas([registro.fecha_proyeccion]);
      // Sincronizar el año activo con el año del registro
      const anioReg = registro.fecha_proyeccion.split('-')[0];
      if (ANIOS_DISPONIBLES.includes(anioReg)) setAnioActivo(anioReg);
    }
  }, [registro, area]); // 👈 Quitamos listaEmpleadosOdoo para evitar que se borre todo

  // Efecto separado solo para actualizar el "Cargo" una vez que Odoo responde
  useEffect(() => {
    if (registro && listaEmpleadosOdoo.length > 0) {
      const emp = listaEmpleadosOdoo.find(e => (e.dni || e.id || e.id_empleado)?.toString() === registro.empleado_dni?.toString());
      if (emp) {
        setDatosAuto(prev => ({ ...prev, cargo: emp.cargo || emp.puesto || 'Sin asignar' }));
      }
    }
  }, [registro, listaEmpleadosOdoo]);

  // ==========================================
  // 3. FUNCIONES DE INTERFAZ
  // ==========================================
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

  // NUEVO MANEJADOR DE BÚSQUEDA DINÁMICO (MÍNIMO 3 CARACTERES)
  const handleAutocomplete = (e) => {
    const text = e.target.value;
    setValorBuscador(text);

    if (text.trim().length >= 3) {
      const textoMinus = text.toLowerCase();
      const resultados = listaEmpleadosOdoo.filter(emp => {
        const dniStr = (emp.dni || emp.id || '').toString();
        const nombreStr = (emp.nombre || '').toLowerCase();
        return dniStr.includes(textoMinus) || nombreStr.includes(textoMinus);
      });
      setEmpleadosSugeridos(resultados);
      setMostrarSugerencias(true);
    } else {
      setEmpleadosSugeridos([]);
      setMostrarSugerencias(false);
    }

    const idSeleccionado = text.split(' - ')[0];
    const emp = listaEmpleadosOdoo.find(e => (e.dni || e.id || e.id_empleado)?.toString() === idSeleccionado);
    
    if (emp) {
      setDatosAuto(prev => ({
        ...prev,
        dni: emp.dni || emp.id || emp.id_empleado,
        dist: emp.distribucion?.toString().replace('%', '') || '100',
        proceso: opcionesProceso.includes(emp.proceso) ? emp.proceso : '',
        cargo: emp.cargo || emp.puesto || 'Sin asignar'
      }));
    } else {
      setDatosAuto(prev => ({ ...prev, dni: '', dist: '100', cargo: '' }));
    }
  };

  const seleccionarEmpleado = (emp) => {
    const dniEmp = emp.dni || emp.id || emp.id_empleado || '';
    const nombreEmp = emp.nombre || '';
    const etiqueta = `${dniEmp} - ${nombreEmp}`;
    
    setValorBuscador(etiqueta);
    setMostrarSugerencias(false);

    setDatosAuto(prev => ({
      ...prev,
      dni: dniEmp,
      dist: emp.distribucion?.toString().replace('%', '') || '100',
      proceso: opcionesProceso.includes(emp.proceso) ? emp.proceso : '',
      cargo: emp.cargo || emp.puesto || 'Sin asignar'
    }));
  };

  // MANEJADOR DE BÚSQUEDA DE CUENTAS (MÍNIMO 2 DÍGITOS)
  const handleCuentaChange = (e, index) => {
    const text = e.target.value;
    
    // Actualizamos el valor en la fila correspondiente
    setDetalles(detalles.map(x => x.id === index ? { ...x, cuenta: text } : x));

    // Procesamos y limpiamos las cuentas de Odoo (únicas y sin prefijo de 2 dígitos)
    const cuentasUnicas = Array.from(
      new Map(
        listaCuentasOdoo.map(cta => {
          const codigoOriginal = (cta.codigo || '').toString();
          const codigoSinPrefijo = codigoOriginal.length === 9 ? codigoOriginal.substring(2) : codigoOriginal;
          const claveUnica = `${codigoSinPrefijo} - ${cta.nombre}`;
          return [claveUnica, { codigoSinPrefijo, nombre: cta.nombre }];
        })
      ).values()
    );

    // Si escribe al menos 2 caracteres, filtramos
    if (text.trim().length >= 2) {
      const textoMinus = text.toLowerCase();
      const filtradas = cuentasUnicas.filter(c => 
        c.codigoSinPrefijo.toLowerCase().includes(textoMinus) || 
        c.nombre.toLowerCase().includes(textoMinus)
      );
      setCuentasSugeridas(filtradas);
      setMostrarSugerenciasCuentas(true);
      setIndiceFilaActiva(index);
    } else {
      setCuentasSugeridas([]);
      setMostrarSugerenciasCuentas(false);
      setIndiceFilaActiva(null);
    }
  };

  const seleccionarCuenta = (cuentaObj, indexFila) => {
    const etiqueta = `${cuentaObj.codigoSinPrefijo} - ${cuentaObj.nombre}`;
    setDetalles(detalles.map(x => x.id === indexFila ? { ...x, cuenta: etiqueta } : x));
    setMostrarSugerenciasCuentas(false);
    setIndiceFilaActiva(null);
  };

  // Motor de cálculo proporcional
  const impactoContable = useMemo(() => {
    let totalLineas = 0;
    const cuentas = {};
    const porcentaje = parseFloat(datosAuto.dist) || 100;
    const factorDistribucion = porcentaje / 100;

    detalles.forEach(d => {
      const montoIngresado = parseFloat(d.monto) || 0;
      const montoProporcional = montoIngresado * factorDistribucion;

      if (montoProporcional > 0) {
        totalLineas += montoProporcional;
        if (d.cuenta) {
          const cuentaFinal = aplicarPrefijoCuenta(d.cuenta);
          cuentas[cuentaFinal] = (cuentas[cuentaFinal] || 0) + montoProporcional;
        }
      }
    });

    const dias = fechasSeleccionadas.length || 1;
    const totalProyectado = totalLineas * dias;
    return { totalProyectado, cuentas, dias, totalLineas };
  }, [detalles, fechasSeleccionadas, datosAuto, prefijoArea]);

  // Guardado Aplanado (Doble bucle Fecha x Fila)
  const handleGuardar = () => {
    const fechasFinales = [...fechasSeleccionadas];
    
    if (fechasFinales.length === 0) return alert('Por favor, ingrese al menos una fecha.');
    if (!valorBuscador) return alert('Por favor, seleccione un empleado.');
    if (!detalles || detalles.length === 0 || !detalles[0].cuenta) {
      return alert(config?.mensajeValidacion || 'Agregue al menos una cuenta contable.');
    }

    const idLoteActual = registro?.id_lote || `LOTE-${config?.prefijo || 'MOD'}-${Date.now()}`;

    const moduloActual = config?.modulo || config?.categoria || registro?.modulo || 'General';

    const dniEmp = datosAuto.dni || valorBuscador.split(' - ')[0] || '-';
    const empInfo = listaEmpleadosOdoo.find(e => (e.dni || e.id || e.id_empleado)?.toString() === dniEmp.toString());
    const nombreEmpleado = empInfo ? empInfo.nombre : (valorBuscador.split(' - ')[1] || 'Desconocido');

    const distVal = parseFloat(datosAuto.dist) || 100;
    
    let nuevosRegistros = [];

    fechasFinales.forEach((fecha, fechaIndex) => {
      detalles.forEach((fila, filaIndex) => {
        if (!fila.cuenta || fila.monto === '') return;

        const montoItem = parseFloat(fila.monto) || 0;
        const idFinalRegistro = registro ? registro.id_registro : `${config?.prefijo || 'MOD'}-${Date.now()}-${fechaIndex}-${filaIndex}`;
        
        // Aplica el prefijo contable utilizando el área actual del input
        const cuentaConPrefijo = aplicarPrefijoCuenta(fila.cuenta);

        const nuevoItem = {
          ...registro,
          id_registro: idFinalRegistro,
          id_lote: idLoteActual,
          fecha_proyeccion: fecha,
          fecha_registro: fecha,
          empleado_dni: dniEmp,
          empleado_nombre: nombreEmpleado,  
          modulo: moduloActual,
          categoria: config?.categoria || moduloActual,       
          detalle_columnas: {
            cuenta_afectada: cuentaConPrefijo,
            detalle: fila.detalle || '',
            distribucion: distVal,
            area: areaActual,
            proceso: opcionesProceso.includes(datosAuto.proceso) ? datosAuto.proceso : '',
            costo_total: montoItem,
            extras: fila.extras || {}
          },
          totales: { costo_total: montoItem },
          desglose_contable: [{ id: `cta-${fechaIndex}-${filaIndex}`, cuenta: cuentaConPrefijo, monto: montoItem.toFixed(2) }],
          variables_registro: detalles
        };

        nuevosRegistros.push(nuevoItem);
      });
    });

    onGuardar(nuevosRegistros);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '85vh', width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      <fieldset disabled={isSoloLectura} style={{ border: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div className="offcanvas-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', overflowX: 'hidden', padding: '16px', boxSizing: 'border-box' }}>

          {/* 0. FECHAS */}
          <div className="form-section">
            <div className="form-section-title">0. Fechas de Aplicación</div>

          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            {ANIOS_DISPONIBLES.map(anio => (
              <button key={anio} type="button" onClick={() => setAnioActivo(anio)}
                style={{
                  padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                  border: anio === anioActivo ? '1px solid var(--primary-600, #2563eb)' : '1px solid var(--line, #cbd5e1)',
                  background: anio === anioActivo ? 'var(--primary-600, #2563eb)' : 'white',
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
                <button key={mes} type="button" onClick={() => toggleMes(anioActivo, i)}
                  style={{
                    padding: '8px 4px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                    border: activo ? '1px solid #166534' : '1px solid var(--line, #cbd5e1)',
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
              {fechasSeleccionadas.map(f => (
                <div key={f} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '4px 10px', borderRadius: '99px', fontSize: '12px' }}>
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
          <div className="form-group" style={{ marginBottom: '16px', position: 'relative' }}>
            <label style={{ color: 'var(--primary-600, #2563eb)' }}>BUSCAR EMPLEADO (MÍNIMO 3 CARACTERES)</label>
            <input 
              type="text" 
              value={valorBuscador} 
              onChange={handleAutocomplete} 
              onFocus={() => { if (valorBuscador.trim().length >= 3) setMostrarSugerencias(true); }}
              placeholder="Escriba DNI o Nombre..." 
              autoComplete="off" 
              style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', background: 'white' }} 
            />

            {/* LISTA DESPLEGABLE FLOTANTE DE SUGERENCIAS DESDE ODOO */}
            {mostrarSugerencias && empleadosSugeridos.length > 0 && (
              <ul style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 99,
                background: 'white', border: '1px solid #cbd5e1', borderRadius: '0 0 6px 6px',
                maxHeight: '180px', overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
              }}>
                {empleadosSugeridos.map((emp, i) => (
                  <li
                    key={emp.dni || emp.id_empleado || i}
                    onClick={() => seleccionarEmpleado(emp)}
                    style={{
                      padding: '10px 12px', fontSize: '12px', borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer', display: 'flex', justifyContent: 'space-between'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <span style={{ fontWeight: 'bold' }}>{emp.dni}</span>
                    <span style={{ color: '#334155' }}>{emp.nombre}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>DISTRIBUCIÓN (%)</label>
              <input type="number" value={datosAuto.dist || ''} onChange={(e) => setDatosAuto({ ...datosAuto, dist: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', background: 'white' }} />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>ÁREA</label>
              <select
                value={datosAuto.area || ''}
                onChange={(e) => setDatosAuto({ ...datosAuto, area: e.target.value, proceso: '' })}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', background: 'white' }}>
                <option value="">-- Seleccione --</option>
                {opcionesArea.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>PROCESO</label>
              <select
                value={datosAuto.proceso || ''}
                disabled={opcionesProceso.length === 0}
                onChange={(e) => setDatosAuto({ ...datosAuto, proceso: e.target.value })}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', background: 'white' }}>
                <option value="">{opcionesProceso.length === 0 ? 'No aplica' : '-- Seleccione --'}</option>
                {opcionesProceso.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            
          </div>
        </div>

        {/* 2. VARIABLES DE REGISTRO (LÍNEAS DINÁMICAS) */}
        <div className="form-section">

          <div className="form-section-title">{config?.tituloSeccion2 || '2. Variables de Registro'}</div>

          {detalles.map((d, index) => (
            <div key={d.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              
              {/* CONTENEDOR GENERAL DE LA CELDA CON POSITION RELATIVE */}
              <div className="form-group" style={{ flex: 1, margin: 0, position: 'relative' }}>
                {index === 0 && <label>Nº CUENTA</label>}
                <input 
                  type="text" 
                  placeholder="Ej. 6311 o Nombre..." 
                  value={d.cuenta || ''} 
                  onChange={e => handleCuentaChange(e, d.id)}
                  onFocus={() => { if ((d.cuenta || '').trim().length >= 2) { setMostrarSugerenciasCuentas(true); setIndiceFilaActiva(d.id); } }}
                  autoComplete="new-password" /* EVITA QUE APAREZCA EL MENÚ NATIVO DEL NAVEGADOR */
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', background: 'white' }} 
                />

                {/* MENÚ DESPLEGABLE FLOTANTE ANCHO Y ALARGADO */}
                {mostrarSugerenciasCuentas && indiceFilaActiva === d.id && cuentasSugeridas.length > 0 && (
                  <ul style={{
                    position: 'absolute', 
                    top: '100%', 
                    left: 0, 
                    width: '380px', /* ANCHO MÍNIMO GRANDE PARA QUE NO SE AMONTONE */
                    zIndex: 9999,
                    background: 'white', 
                    border: '1px solid #cbd5e1', 
                    borderRadius: '0 0 6px 6px',
                    maxH: '200px', 
                    maxHeight: '200px',
                    overflowY: 'auto', 
                    margin: 0, 
                    padding: 0, 
                    listStyle: 'none',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                  }}>
                    {cuentasSugeridas.map((cta, i) => (
                      <li
                        key={`sug-cta-${i}`}
                        onClick={() => seleccionarCuenta(cta, d.id)}
                        style={{
                          padding: '10px 12px', 
                          fontSize: '13px', 
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer', 
                          display: 'flex', 
                          gap: '10px',
                          alignItems: 'center'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                      >
                        <span style={{ fontWeight: 'bold', color: '#2563eb', minWidth: '70px' }}>{cta.codigoSinPrefijo}</span>
                        <span style={{ color: '#334155', flex: 1 }}>{cta.nombre}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="form-group" style={{ flex: 2, margin: 0 }}>
                {index === 0 && <label>{config?.labelDetalle || 'DETALLE'}</label>}
                <input type="text" 
                    placeholder="Concepto" 
                    value={d.detalle || ''} 
                    onChange={e => setDetalles(detalles.map(x => x.id === d.id ? { ...x, detalle: e.target.value } : x))} 
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
              <div className="form-group" style={{ flex: 1, margin: 0 }}>
                {index === 0 && <label>SUBTOTAL</label>}
                <input type="number" 
                    step="0.01" 
                    placeholder="0.00" 
                    value={d.monto ?? ''} 
                    onChange={e => setDetalles(detalles.map(x => x.id === d.id ? { ...x, monto: e.target.value } : x))} 
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', textAlign: 'right' }} />
              </div>
              <div style={{ paddingTop: index === 0 ? '22px' : '0' }}>
                {detalles.length > 1 && (
                  <button type="button" onClick={() => setDetalles(detalles.filter(x => x.id !== d.id))} style={{ background: 'transparent', border: 'none', color: 'var(--danger, #ef4444)', fontSize: '20px', cursor: 'pointer' }}>&times;</button>
                )}
              </div>
            </div>
          ))}

            {config?.variablesRegistro && config.variablesRegistro.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginTop: '4px' }}>
                {config.variablesRegistro.map((campo) => (
                    <div className="form-group" key={campo.id} style={{ margin: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>{campo.label}</label>
                    <input 
                        type={campo.tipo || 'text'} 
                        placeholder={campo.label}
                        value={detalles[0]?.extras?.[campo.id] ?? campo.valorDefault ?? ''} 
                        onChange={e => {
                        const valor = e.target.value;
                        setDetalles(detalles.map(x => {
                            return {
                                ...x,
                                extras: { ...(x.extras || {}), [campo.id]: valor }
                            };
                        }));
                        }}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', background: 'white' }}
                    />
                    </div>
                ))}
                </div>
            )}

          <button type="button" onClick={() => setDetalles([...detalles, { id: Date.now(), cuenta: '', detalle: '', monto: '' }])} className="btn-ghost" style={{ width: '100%', marginTop: '8px', borderStyle: 'dashed', background: 'white' }}>
            + Agregar Línea
          </button>
        </div>

        {/* 3. IMPACTO CONTABLE UNIFICADO */}
        <div className="form-section" style={{ marginTop: 'auto' }}>
          <div className="form-section-title">3. Impacto Contable</div>
          {Object.keys(impactoContable.cuentas).length > 0 && (
            <div style={{ background: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', padding: '12px', marginBottom: '12px' }}>
              {Object.entries(impactoContable.cuentas).map(([cuenta, total]) => (
                <div key={cuenta} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#475569', borderBottom: '1px dashed #e2e8f0', paddingBottom: '6px', marginBottom: '6px' }}>
                  <span>{cuenta}</span>
                  <span style={{ fontWeight: 600 }}>S/ {total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
          )}
          <div className="calc-total" style={{ marginTop: '16px', padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#166534', fontSize: '16px' }}>
              <div>
                <span>Total Proyectado</span>
                {impactoContable.dias > 1 && <div style={{ fontSize: '11px', color: '#15803d', fontWeight: 'normal' }}>({impactoContable.totalLineas.toFixed(2)} × {impactoContable.dias} fechas)</div>}
              </div>
              <span>S/ {impactoContable.totalProyectado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
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
            Guardar Registro
          </button>
        )}
      </div>
    </div>
  );
}