import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MESES } from '../../config/data';
import { obtenerCuentasOdoo, obtenerClientesOdoo, obtenerProductosOdoo, obtenerEmpleadosOdoo } from '../../data/store';

const PROCESOS_PRODUCTIVOS = ['Primer Proceso', 'Segundo Proceso', 'CIF', 'Granel', 'Sachet'];

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

export default function PlanViajeForm({ registro, onGuardar, onCancelar, modo, idVersion, area }) {
  const isSoloLectura = modo === 'ver';

  const [viaje, setViaje] = useState('');
  const [valorBuscador, setValorBuscador] = useState('');
  const [datosAuto, setDatosAuto] = useState({ dni: '', area: area || '', proceso: '' });
  const [duracionDias, setDuracionDias] = useState('');
  const [estado, setEstado] = useState('Planeado');
  const [cantPersonas, setCantPersonas] = useState('1');
  const [unidMed, setUnidMed] = useState('Viaje');

  const [clienteBuscador, setClienteBuscador] = useState('');
  
  const [mesesSeleccionados, setMesesSeleccionados] = useState(['Ene']);

  // Lista dinámica de rubros incluyendo el tipo de cálculo y cuenta
  const [rubrosLista, setRubrosLista] = useState([
    { id: 'alimentacion', label: 'ALIMENTACIÓN', monto: '0', tipo: 'persona', cuenta: '' },
    { id: 'movilidad', label: 'MOVILIDAD', monto: '0', tipo: 'persona', cuenta: '' },
    { id: 'otros_movilidad', label: 'OTROS MOVILIDAD', monto: '0', tipo: 'persona', cuenta: '' },
    { id: 'alojamiento', label: 'ALOJAMIENTO', monto: '0', tipo: 'persona', cuenta: '' },
    { id: 'combustible', label: 'COMBUSTIBLE', monto: '0', tipo: 'total', cuenta: '' },
    { id: 'peajes', label: 'PEAJES', monto: '0', tipo: 'total', cuenta: '' },
    { id: 'otros_adicionales_int', label: 'OTROS ADICIONALES INT.', monto: '0', tipo: 'persona', cuenta: '' },
    { id: 'otros_adicionales_ext', label: 'OTROS ADICIONALES EXT.', monto: '0', tipo: 'persona', cuenta: '' }
  ]);

  const [montosMensuales, setMontosMensuales] = useState(
    MESES.reduce((acc, m) => ({ ...acc, [m]: '0' }), {})
  );

  // Maestros sincronizados en vivo desde Odoo (Cuentas, Clientes, Productos y Empleados)
  const [listaCuentas, setListaCuentas] = useState([]);
  const [listaClientes, setListaClientes] = useState([]);
  const [listaProductos, setListaProductos] = useState([]);
  const [listaEmpleados, setListaEmpleados] = useState([]);
  const [cargandoDatos, setCargandoDatos] = useState(true);

  const [selectorEmpleadoAbierto, setSelectorEmpleadoAbierto] = useState(false);
  const [selectorClienteAbierto, setSelectorClienteAbierto] = useState(false);
  const [activoDropdownCuentaId, setActivoDropdownCuentaId] = useState(null);

  // CARGA EN VIVO DESDE ODOO
  useEffect(() => {
    let activo = true;
    async function cargarDatosOdoo() {
      setCargandoDatos(true);
      try {
        const [ctaRes, cliRes, prodRes, empRes] = await Promise.all([
          obtenerCuentasOdoo(),
          obtenerClientesOdoo(),
          obtenerProductosOdoo(),
          obtenerEmpleadosOdoo()
        ]);
        if (!activo) return;
        if (Array.isArray(ctaRes) && ctaRes.length > 0) setListaCuentas(ctaRes);
        if (Array.isArray(cliRes) && cliRes.length > 0) setListaClientes(cliRes);
        if (Array.isArray(prodRes) && prodRes.length > 0) setListaProductos(prodRes);
        if (Array.isArray(empRes) && empRes.length > 0) setListaEmpleados(empRes);
      } catch (error) {
        console.error('Error al conectar con Odoo:', error);
      } finally {
        if (activo) setCargandoDatos(false);
      }
    }
    cargarDatosOdoo();
    return () => { activo = false; };
  }, []);

  // Cerrar dropdowns flotantes al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-dropdown-container]')) {
        setSelectorEmpleadoAbierto(false);
        setSelectorClienteAbierto(false);
        setActivoDropdownCuentaId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (registro) {
      const dc = registro.detalle_columnas || {};
      setViaje(dc.viaje ? dc.viaje.replace(/ - [A-Za-z]{3}$/, '') : '');
      setValorBuscador(`${registro.empleado_dni || ''} - ${registro.empleado_nombre || ''}`);
      setDatosAuto({ dni: registro.empleado_dni || '', area: dc.area || area || '', proceso: dc.proceso || '' });
      setDuracionDias(dc.duracion_dias?.toString() || '');
      setEstado(dc.estado || 'Planeado');
      setCantPersonas(dc.cant_personas?.toString() || '1');
      setUnidMed(dc.unid_med || 'Viaje');
      setClienteBuscador(dc.cliente || '');

      if (dc.rubros_lista && Array.isArray(dc.rubros_lista)) {
        setRubrosLista(dc.rubros_lista.map(r => ({ ...r, tipo: r.tipo || 'persona' })));
      }

      const mesDelRegistro = dc.mes_inicio || (registro.id_registro ? registro.id_registro.split('-').pop() : 'Ene');
      const costoDelRegistro = dc.costo_total?.toString() || '0';

      const grillaAislada = MESES.reduce((acc, m) => {
        acc[m] = m === mesDelRegistro ? costoDelRegistro : '0';
        return acc;
      }, {});

      setMontosMensuales(grillaAislada);
      setMesesSeleccionados([mesDelRegistro]);
    }
  }, [registro, area]);

  // Filtrado de empleados (en vivo desde Odoo)
  const empleadosFiltrados = useMemo(() => {
    const query = (valorBuscador || '').trim().toLowerCase();
    if (!query) return listaEmpleados.slice(0, 30);
    return listaEmpleados.filter(emp => {
      const nombre = (emp.nombre || emp.name || '').toLowerCase();
      const dni = (emp.dni || emp.id || emp.identification_id || '').toLowerCase();
      return nombre.includes(query) || dni.includes(query);
    }).slice(0, 30);
  }, [valorBuscador, listaEmpleados]);

  const seleccionarEmpleado = (emp) => {
    const dniEmp = emp.dni || emp.id || emp.identification_id || '';
    const nombreEmp = emp.nombre || emp.name || '';
    const texto = `${dniEmp} - ${nombreEmp}`;
    setValorBuscador(texto);
    setDatosAuto(prev => ({ ...prev, dni: dniEmp }));
    setSelectorEmpleadoAbierto(false);
  };

  // Filtrado de clientes (en vivo desde Odoo)
  const clientesFiltrados = useMemo(() => {
    const query = (clienteBuscador || '').trim().toLowerCase();
    if (!query) return listaClientes.slice(0, 30);
    return listaClientes.filter(c => {
      const nombre = (c.nombre || c.razon_social || c.id || '').toLowerCase();
      return nombre.includes(query);
    }).slice(0, 30);
  }, [clienteBuscador, listaClientes]);

  const seleccionarCliente = (c) => {
    const nombreCli = c.nombre || c.razon_social || c.id || '';
    setClienteBuscador(nombreCli);
    setSelectorClienteAbierto(false);
  };

  // Cuentas BASE de clase 6, sin repetir: las que vienen con prefijo de área (9 dígitos,
  // p. ej. 906311100) se muestran sin él, porque el prefijo se aplica solo según el área.
  const cuentasBase = useMemo(() => {
    const mapa = new Map();
    listaCuentas.forEach(c => {
      const original = (c.codigo || c.id || '').toString();
      const base = original.length === 9 ? original.substring(2) : original;
      if (!base.startsWith('6') || mapa.has(base)) return;
      mapa.set(base, { ...c, codigoBase: base });
    });
    return Array.from(mapa.values()).sort((a, b) => a.codigoBase.localeCompare(b.codigoBase));
  }, [listaCuentas]);

  // Filtrado de cuentas para cada rubro
  const cuentasFiltradas = (texto) => {
    const query = (texto || '').trim().toLowerCase();
    if (query.length === 0) return cuentasBase.slice(0, 50);
    const coincidencias = cuentasBase.filter(c =>
      c.codigoBase.toLowerCase().includes(query) || String(c.nombre || '').toLowerCase().includes(query)
    );
    coincidencias.sort((a, b) => (a.codigoBase.startsWith(query) ? 0 : 1) - (b.codigoBase.startsWith(query) ? 0 : 1));
    return coincidencias.slice(0, 50);
  };

  const seleccionarCuentaRubro = (index, c) => {
    const codigoOriginal = (c.codigo || c.id || '').toString();
    const idSinPrefijo = codigoOriginal.length === 9 ? codigoOriginal.substring(2) : codigoOriginal;
    actualizarRubro(index, 'cuenta', `${idSinPrefijo} - ${c.nombre}`);
    setActivoDropdownCuentaId(null);
  };

  // Motor de cálculo total
  const calculo = useMemo(() => {
    const personas = parseFloat(cantPersonas) || 1;
    let cantidadTotalBase = 0;

    rubrosLista.forEach(r => {
      const val = parseFloat(r.monto) || 0;
      if (r.tipo === 'total') {
        cantidadTotalBase += val;
      } else {
        cantidadTotalBase += val * personas;
      }
    });

    return { cantidadTotalBase };
  }, [rubrosLista, cantPersonas]);

  useEffect(() => {
    const totalBase = calculo.cantidadTotalBase;
    const cantMeses = mesesSeleccionados.length || 1;
    const montoPorMes = (totalBase / cantMeses).toFixed(2);

    setMontosMensuales(prev => {
      const nuevaGrilla = { ...prev };
      MESES.forEach(m => {
        if (mesesSeleccionados.includes(m)) {
          nuevaGrilla[m] = montoPorMes;
        } else {
          nuevaGrilla[m] = '0';
        }
      });
      return nuevaGrilla;
    });
  }, [calculo.cantidadTotalBase, mesesSeleccionados]);

  const toggleMesSeleccionado = (mes) => {
    if (mesesSeleccionados.includes(mes)) {
      if (mesesSeleccionados.length === 1) return;
      setMesesSeleccionados(mesesSeleccionados.filter(m => m !== mes));
    } else {
      setMesesSeleccionados([...mesesSeleccionados, mes]);
    }
  };

  const handleReplicarEnMeses = () => {
    const totalBase = calculo.cantidadTotalBase;
    const montoStr = totalBase.toFixed(2);

    setMontosMensuales(MESES.reduce((acc, m) => {
      acc[m] = mesesSeleccionados.includes(m) ? montoStr : '0';
      return acc;
    }, {}));
  };

  const handleDividirEnMeses = () => {
    const totalBase = calculo.cantidadTotalBase;
    const cantMeses = mesesSeleccionados.length || 1;
    const montoPorMes = (totalBase / cantMeses).toFixed(2);

    setMontosMensuales(MESES.reduce((acc, m) => {
      acc[m] = mesesSeleccionados.includes(m) ? montoPorMes : '0';
      return acc;
    }, {}));
  };

  const costoTotalAnualCalculado = useMemo(() => {
    return MESES.reduce((acc, m) => acc + (parseFloat(montosMensuales[m]) || 0), 0);
  }, [montosMensuales]);

  const agregarRubroAdicional = () => {
    const nuevoId = `adicional_${Date.now()}`;
    setRubrosLista([
      ...rubrosLista,
      { id: nuevoId, label: 'NUEVO GASTO', monto: '0', tipo: 'persona', cuenta: '' }
    ]);
  };

  const eliminarRubro = (index) => {
    if (rubrosLista.length <= 1) return alert('Debe mantener al menos un rubro.');
    const nuevaLista = [...rubrosLista];
    nuevaLista.splice(index, 1);
    setRubrosLista(nuevaLista);
  };

  const actualizarRubro = (index, campo, valor) => {
    const nuevaLista = [...rubrosLista];
    nuevaLista[index][campo] = valor;
    setRubrosLista(nuevaLista);
  };

  const obtenerCuentaConPrefijoArea = (cuentaInput, areaActual) => {
    if (!cuentaInput) return '';
    const partes = cuentaInput.split(' - ');
    let codigoLimpio = partes[0].trim();
    
    const areaKey = (areaActual || area || '').toLowerCase().trim();
    const prefijo = prefijosPorArea[areaKey] || '90';

    if (codigoLimpio.length >= 9 && codigoLimpio.startsWith(prefijo)) return codigoLimpio;
    const numeroBase = codigoLimpio.length > 7 ? codigoLimpio.substring(codigoLimpio.length - 7) : codigoLimpio;
    return `${prefijo}${numeroBase}`;
  };

  const handleGuardar = () => {
    if (!viaje) return alert('Por favor, ingrese el nombre/motivo del viaje.');
    if (!valorBuscador) return alert('Por favor, seleccione a quién se asigna el viaje.');
    if (costoTotalAnualCalculado <= 0) return alert('El costo total del viaje debe ser mayor a 0.');

    const nombre = valorBuscador.split(' - ')[1] || valorBuscador;
    const idRegistroBase = registro ? registro.id_registro.split('-')[0] : `VIA-${Date.now()}`;
    const idLote = registro ? (registro.id_lote || idRegistroBase) : `LOTE-VIA-${Date.now()}`;

    const registrosAGuardar = [];

    MESES.forEach((mes, idx) => {
      const montoMes = parseFloat(montosMensuales[mes]) || 0;
      if (montoMes > 0) {
        const mesNum = String(idx + 1).padStart(2, '0');
        const idRegMes = `${idRegistroBase}-${mes}`;

        const cuentasDesglose = rubrosLista
          .filter(r => (parseFloat(r.monto) || 0) > 0)
          .map(r => {
            const cuentaBase = r.cuenta || '6261000';
            const cuentaAsignada = obtenerCuentaConPrefijoArea(cuentaBase, datosAuto.area || area);
            
            const infoCta = listaCuentas.find(c => {
              const codigoOriginal = (c.codigo || c.id || '').toString();
              return codigoOriginal === cuentaAsignada || codigoOriginal.endsWith(cuentaBase);
            });
            
            const personas = parseFloat(cantPersonas) || 1;
            const subtotalRubro = r.tipo === 'total' ? (parseFloat(r.monto) || 0) : (parseFloat(r.monto) || 0) * personas;
            const proporcionRubro = calculo.cantidadTotalBase > 0 ? subtotalRubro / calculo.cantidadTotalBase : 0;
            const montoRubroMes = montoMes * proporcionRubro;

            return {
              id: `cta-${r.id}-${mes}`,
              cuenta: `${cuentaAsignada}${infoCta ? ' - ' + infoCta.nombre : ''} (Viaje - ${r.label})`,
              monto: montoRubroMes.toFixed(2)
            };
          });

        const personas = parseFloat(cantPersonas) || 1;
        const montoUnitarioCalculado = montoMes / personas;
        registrosAGuardar.push({
          id_registro: idRegMes,
          id_lote: idLote,
          modulo: 'Plan de Viaje',
          categoria: 'Plan de Viaje',
          area: datosAuto.area || area || 'Operaciones',
          idVersion,
          fecha_proyeccion: `2026-${mesNum}-01`,
          empleado_dni: datosAuto.dni || '-',
          empleado_nombre: `${nombre} (${mes})`,
          detalle_columnas: {
            viaje: `${viaje} - ${mes}`,
            cliente: clienteBuscador,
            area: datosAuto.area,
            proceso: datosAuto.proceso,
            mes_inicio: mes,
            duracion_dias: parseFloat(duracionDias) || 0,
            estado,
            cant_personas: parseFloat(cantPersonas) || 1,
            unid_med: unidMed,
            rubros_lista: rubrosLista,
            montos_mensuales: montosMensuales,
            monto_unit: montoUnitarioCalculado,
            costo_total: montoMes,
          },
          totales: { costo_total: montoMes },
          desglose_contable: cuentasDesglose,
          variables_registro: { rubros_lista: rubrosLista },
        });
      }
    });

    onGuardar(registrosAGuardar);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <fieldset disabled={isSoloLectura} style={{ border: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="offcanvas-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', padding: '16px' }}>

          {cargandoDatos && (
            <div style={{ padding: '6px 12px', background: '#eff6ff', color: '#1e40af', borderRadius: '6px', fontSize: '11px' }}>
              Sincronizando datos desde Odoo (Cuentas, Clientes, Productos y Empleados)...
            </div>
          )}

          <div className="form-section">
            <div className="form-section-title">1. Datos del Viaje</div>
            
            <div className="form-group" style={{ marginBottom: '8px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>VIAJE (MOTIVO)</label>
              <input type="text" value={viaje} onChange={e => setViaje(e.target.value)} placeholder="Ej. Visita técnica cliente Ares"
                style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              
              {/* BUSCADOR FLOTANTE PARA CLIENTE (EN VIVO ODOO) */}
              <div className="form-group" style={{ margin: 0, position: 'relative' }} data-dropdown-container>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>CLIENTE</label>
                <input 
                  type="text" 
                  value={clienteBuscador} 
                  onChange={e => {
                    setClienteBuscador(e.target.value);
                    setSelectorClienteAbierto(true);
                  }}
                  onFocus={() => setSelectorClienteAbierto(true)}
                  placeholder="Buscar cliente..." 
                  autoComplete="off"
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', background: 'white' }} 
                />

                {selectorClienteAbierto && clientesFiltrados.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
                    border: '1px solid #cbd5e1', borderRadius: '0 0 8px 8px',
                    boxShadow: '0 8px 16px -4px rgba(15,23,42,0.15)', maxHeight: '180px', overflowY: 'auto', zIndex: 60, marginTop: '2px'
                  }}>
                    {clientesFiltrados.map((c, i) => (
                      <div
                        key={`cli-${i}`}
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          seleccionarCliente(c);
                        }}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#1e293b' }}
                        onMouseEnter={ev => ev.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={ev => ev.currentTarget.style.background = 'white'}
                      >
                        {c.nombre || c.razon_social || c.id}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* BUSCADOR FLOTANTE PARA EMPLEADO (EN VIVO ODOO) */}
              <div className="form-group" style={{ margin: 0, position: 'relative' }} data-dropdown-container>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>ASIGNADO A</label>
                <input 
                  type="text" 
                  value={valorBuscador} 
                  onChange={e => {
                    setValorBuscador(e.target.value);
                    setSelectorEmpleadoAbierto(true);
                    const idSeleccionado = e.target.value.split(' - ')[0];
                    const emp = listaEmpleados.find(emp => (emp.dni || emp.id || emp.identification_id) === idSeleccionado);
                    if (emp) setDatosAuto(prev => ({ ...prev, dni: emp.dni || emp.id || emp.identification_id }));
                  }}
                  onFocus={() => setSelectorEmpleadoAbierto(true)}
                  placeholder="Buscar empleado..." 
                  autoComplete="off"
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', background: 'white' }} 
                />

                {selectorEmpleadoAbierto && empleadosFiltrados.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
                    border: '1px solid #cbd5e1', borderRadius: '0 0 8px 8px',
                    boxShadow: '0 8px 16px -4px rgba(15,23,42,0.15)', maxHeight: '180px', overflowY: 'auto', zIndex: 60, marginTop: '2px'
                  }}>
                    {empleadosFiltrados.map((e, i) => {
                      const dniEmp = e.dni || e.id || e.identification_id || '';
                      const nombreEmp = e.nombre || e.name || '';
                      return (
                        <div
                          key={`emp-${i}`}
                          onMouseDown={(ev) => {
                            ev.preventDefault();
                            seleccionarEmpleado(e);
                          }}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#1e293b' }}
                          onMouseEnter={ev => ev.currentTarget.style.background = '#f8fafc'}
                          onMouseLeave={ev => ev.currentTarget.style.background = 'white'}
                        >
                          <span style={{ fontWeight: 600, fontFamily: 'monospace', color: '#2563eb' }}>{dniEmp}</span> - <span>{nombreEmp}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>DURACIÓN (DÍAS)</label>
                <input type="number" value={duracionDias} onChange={e => setDuracionDias(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>PLANEADO / EJECUTADO</label>
                <select value={estado} onChange={e => setEstado(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }}>
                  <option value="Planeado">Planeado</option>
                  <option value="Ejecutado">Ejecutado</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>ÁREA</label>
                <input type="text" value={datosAuto.area} onChange={e => setDatosAuto({ ...datosAuto, area: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>PROCESO</label>
                <select value={datosAuto.proceso} onChange={e => setDatosAuto({ ...datosAuto, proceso: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }}>
                  <option value="">-- Seleccione --</option>
                  {PROCESOS_PRODUCTIVOS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div className="form-section-title" style={{ margin: 0 }}>2. Rubros de Gasto, Cuentas y Tipo de Asignación</div>
              {!isSoloLectura && (
                <button type="button" onClick={agregarRubroAdicional} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                  + Agregar Ítem Adicional
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
              {rubrosLista.map((r, idx) => {
                const sugerenciasCuentas = cuentasFiltradas(r.cuenta);
                const dropdownAbierto = activoDropdownCuentaId === r.id;

                return (
                  <div key={r.id} style={{ background: '#f8fafc', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <input 
                        type="text" 
                        value={r.label}
                        onChange={e => actualizarRubro(idx, 'label', e.target.value.toUpperCase())}
                        placeholder="Nombre del rubro"
                        style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', background: 'white' }}
                      />
                    </div>
                    <div style={{ width: '100px' }}>
                      <input 
                        type="number" 
                        step="0.01" 
                        value={r.monto}
                        onChange={e => actualizarRubro(idx, 'monto', e.target.value)}
                        placeholder="Monto S/"
                        style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} 
                      />
                    </div>
                    <div style={{ width: '110px' }}>
                      <select
                        value={r.tipo}
                        onChange={e => actualizarRubro(idx, 'tipo', e.target.value)}
                        style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', background: 'white', fontWeight: 600 }}
                      >
                        <option value="persona">Por Persona</option>
                        <option value="total">Total Viaje</option>
                      </select>
                    </div>

                    {/* SELECTOR DE CUENTA CONTABLE CON BUSCADOR FLOTANTE */}
                    <div style={{ width: '150px', position: 'relative' }} data-dropdown-container>
                      <input 
                        type="text" 
                        value={r.cuenta}
                        onChange={e => {
                          actualizarRubro(idx, 'cuenta', e.target.value);
                          setActivoDropdownCuentaId(r.id);
                        }}
                        onFocus={() => setActivoDropdownCuentaId(r.id)}
                        placeholder="Cuenta..."
                        title={r.cuenta || ''}
                        autoComplete="off"
                        style={{ width: '100%', padding: '6px', border: '1px solid #2563eb', borderRadius: '4px', fontSize: '11px', background: 'white' }} 
                      />

                      {dropdownAbierto && sugerenciasCuentas.length > 0 && (
                        <div style={{
                          position: 'absolute', top: '100%', right: 0, width: '420px', maxWidth: '80vw', background: 'white',
                          border: '1px solid #cbd5e1', borderRadius: '0 0 8px 8px',
                          boxShadow: '0 8px 16px -4px rgba(15,23,42,0.15)', maxHeight: '260px', overflowY: 'auto', zIndex: 90, marginTop: '2px'
                        }}>
                          {sugerenciasCuentas.map((c, cIdx) => {
                            const codOrig = c.codigoBase || (c.codigo || c.id || '').toString();
                            return (
                              <div
                                key={`cta-rub-${cIdx}`}
                                onMouseDown={(ev) => {
                                  ev.preventDefault();
                                  seleccionarCuentaRubro(idx, c);
                                }}
                                title={`${codOrig} - ${c.nombre}`}
                                style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#1e293b', display: 'flex', gap: '8px', alignItems: 'flex-start' }}
                                onMouseEnter={ev => ev.currentTarget.style.background = '#f8fafc'}
                                onMouseLeave={ev => ev.currentTarget.style.background = 'white'}
                              >
                                <span style={{ fontFamily: 'monospace', color: '#2563eb', fontWeight: 700, flexShrink: 0 }}>{codOrig}</span>
                                <span style={{ color: '#334155', whiteSpace: 'normal', lineHeight: 1.35 }}>{c.nombre}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {!isSoloLectura && rubrosLista.length > 1 && (
                      <button type="button" onClick={() => eliminarRubro(idx)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '4px' }} title="Eliminar rubro">
                        🗑️
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>CANT. PERSONAS</label>
                <input type="number" min="1" value={cantPersonas} onChange={e => setCantPersonas(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>UNIDAD DE MEDIDA</label>
                <input type="text" value={unidMed} onChange={e => setUnidMed(e.target.value)} placeholder="Viaje, Día, etc."
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
            </div>
          </div>

          {/* GRILLA DE DISTRIBUCIÓN MENSUAL CON SELECCIÓN MÚLTIPLE DE MESES */}
          <div className="form-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div className="form-section-title" style={{ margin: 0 }}>3. Distribución Mensual del Gasto (S/)</div>
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>Haz clic en los meses para seleccionarlos y aplica una de las opciones</div>
              </div>
              {!isSoloLectura && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={handleReplicarEnMeses} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    ⚡ Replicar Total ({mesesSeleccionados.length})
                  </button>
                  <button type="button" onClick={handleDividirEnMeses} style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '6px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    ➗ Dividir entre Meses ({mesesSeleccionados.length})
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
              {MESES.map(m => {
                const seleccionado = mesesSeleccionados.includes(m);
                return (
                  <div key={m} style={{ background: seleccionado ? '#eff6ff' : '#f8fafc', padding: '6px', borderRadius: '4px', border: `1px solid ${seleccionado ? '#2563eb' : '#cbd5e1'}`, textAlign: 'center' }}>
                    <div 
                      onClick={() => !isSoloLectura && toggleMesSeleccionado(m)}
                      style={{ fontSize: '9px', fontWeight: 'bold', color: seleccionado ? '#1d4ed8' : '#64748b', cursor: isSoloLectura ? 'default' : 'pointer', marginBottom: '2px', userSelect: 'none' }}
                      title="Haz clic para seleccionar/deseleccionar este mes"
                    >
                      {m} {seleccionado && '✓'}
                    </div>
                    <input 
                      type="number"
                      step="0.01"
                      value={montosMensuales[m] !== undefined ? montosMensuales[m] : '0'}
                      onChange={e => {
                        const val = e.target.value;
                        setMontosMensuales({ ...montosMensuales, [m]: val });
                      }}
                      style={{ width: '100%', padding: '4px', textAlign: 'center', fontSize: '11px', border: '1px solid #2563eb', borderRadius: '3px', fontWeight: 'bold' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="form-section" style={{ marginTop: 'auto' }}>
            <div className="form-section-title">4. Impacto Contable y Desglose de Gastos</div>
            
            <div style={{ background: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', padding: '12px', marginBottom: '8px', fontSize: '12px' }}>
              <div style={{ fontWeight: 'bold', color: '#334155', marginBottom: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                Resumen de Costos por Viaje (Base)
              </div>
              {rubrosLista.map(r => {
                const montoVal = parseFloat(r.monto) || 0;
                const personas = parseFloat(cantPersonas) || 1;
                const subtotal = r.tipo === 'total' ? montoVal : montoVal * personas;
                if (montoVal <= 0) return null;

                return (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', padding: '3px 0' }}>
                    <span>
                      {r.label} ({r.tipo === 'total' ? 'Total Fijo' : `S/ ${montoVal.toFixed(2)} × ${personas} pers.`})
                    </span>
                    <span style={{ fontWeight: 600 }}>S/ {subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                );
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#1e293b', borderTop: '1px solid #e2e8f0', marginTop: '6px', paddingTop: '6px' }}>
                <span>Subtotal por Viaje (1 Ciclo Mensual)</span>
                <span>S/ {calculo.cantidadTotalBase.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div style={{ background: '#f8fafc', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '10px', marginBottom: '8px', fontSize: '12px' }}>
              <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>
                Meses de Ejecución Seleccionados:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {MESES.filter(m => parseFloat(montosMensuales[m]) > 0).map(m => (
                  <span key={m} style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, fontSize: '11px' }}>
                    {m}: S/ {parseFloat(montosMensuales[m]).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                ))}
              </div>
            </div>

            <div className="calc-total" style={{ padding: '14px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#166534', fontSize: '16px' }}>
                <span>Costo Total Anual Distribuido</span>
                <span>S/ {costoTotalAnualCalculado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
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