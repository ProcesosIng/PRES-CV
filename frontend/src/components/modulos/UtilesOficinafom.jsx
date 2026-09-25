import React, { useState, useEffect, useMemo, useRef } from 'react';
import { maestroEmpleados, maestroCuentas, MESES, PROCESOS_PRODUCTIVOS, maestroProductos } from '../../config/data';

const prefijosPorArea = {
  'Administración': '94',
  'Comercial': '95',
  'Logística': '98',
  'Almacen': '99',
  'Producción Crisoles': '91',
  'Producción Fundente': '92'
};

export default function UtilesOficinaForm({ registro, onGuardar, onCancelar, modo, area }) {
  const isSoloLectura = modo === 'ver';

  const [valorBuscador, setValorBuscador] = useState('');
  const [datosAuto, setDatosAuto] = useState({ dni: '', dist: '100' });
  const [proceso, setProceso] = useState('');
  const [finesDeUso, setFinesDeUso] = useState('');

  // Selección múltiple de meses para la distribución
  const [mesesSeleccionados, setMesesSeleccionados] = useState(['Ene']);

  const [filasItems, setFilasItems] = useState([
    { id: Date.now(), descripcion: '', cantidad: 1, precioUnit: '', unidMed: 'Unidad' }
  ]);

  // Identificar el área activa y su respectivo prefijo contable (ej. '95' para Comercial)
  const areaActiva = area || 'Comercial';
  const prefijoArea = prefijosPorArea[areaActiva] || '95';

  // Estado para controlar qué fila tiene el buscador desplegado
  const [activoDropdownId, setActivoDropdownId] = useState(null);
  const dropdownRef = useRef(null);

  // Cerrar el dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setActivoDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Grilla mensual de distribución
  const [montosMensuales, setMontosMensuales] = useState(
    MESES.reduce((acc, m) => ({ ...acc, [m]: '0' }), {})
  );

  useEffect(() => {
    if (registro) {
      const dc = registro.detalle_columnas || {};
      setValorBuscador(`${registro.empleado_dni || ''} - ${registro.empleado_nombre || ''}`);
      setDatosAuto({ dni: registro.empleado_dni || '', dist: dc.distribucion?.toString() || '100' });
      setProceso(dc.proceso || '');
      setFinesDeUso(dc.fines_de_uso || '');
      
      const mesDelRegistro = dc.mes_uso || 'Ene';
      const costoReg = dc.costo_total?.toString() || '0';

      const grillaAislada = MESES.reduce((acc, m) => {
        acc[m] = m === mesDelRegistro ? costoReg : '0';
        return acc;
      }, {});

      setMontosMensuales(grillaAislada);
      setMesesSeleccionados([mesDelRegistro]);

      setFilasItems([{
        id: registro.id_registro,
        descripcion: dc.descripcion_material || '',
        cantidad: dc.cantidad || 1,
        precioUnit: dc.precio_unit?.toString() || '',
        unidMed: dc.unid_med || 'Unidad'
      }]);
    }
  }, [registro]);

  const handleAutocomplete = (e) => {
    const text = e.target.value;
    setValorBuscador(text);
    const idSeleccionado = text.split(' - ')[0];
    const emp = maestroEmpleados.find(emp => (emp.dni || emp.id) === idSeleccionado);
    if (emp) setDatosAuto({ dni: emp.dni || emp.id, dist: emp.distribucion?.toString().replace('%', '') || '100' });
  };

  const actualizarFila = (id, campo, valor) => {
    setFilasItems(filasItems.map(f => f.id === id ? { ...f, [campo]: valor } : f));
  };

  // Seleccionar producto del maestro y autocompletar costo y unidad
  const handleSeleccionarProducto = (idFila, prod) => {
    const nombreProd = prod.nombre || prod.descripcion || prod.item || '';
    const costoRef = prod.costo !== undefined ? prod.costo : (prod.pv !== undefined ? prod.pv : (prod.precio || 0));
    const unidadRef = prod.unidad || 'Unidad';

    setFilasItems(prevFilas => prevFilas.map(f => {
      if (f.id === idFila) {
        return {
          ...f,
          descripcion: nombreProd,
          precioUnit: costoRef.toString(),
          unidMed: unidadRef
        };
      }
      return f;
    }));

    setActivoDropdownId(null);
  };

  // Costo total base de los materiales (1 ciclo)
  const totalBaseMateriales = useMemo(() => {
    return filasItems.reduce((s, f) => s + ((parseFloat(f.precioUnit) || 0) * (parseFloat(f.cantidad) || 0)), 0);
  }, [filasItems]);

  // Sincronización automática de montos mensuales al cambiar los materiales o los meses seleccionados
  useEffect(() => {
    const cantMeses = mesesSeleccionados.length || 1;
    const montoPorMes = (totalBaseMateriales / cantMeses).toFixed(2);

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
  }, [totalBaseMateriales, mesesSeleccionados]);

  const toggleMesSeleccionado = (mes) => {
    if (mesesSeleccionados.includes(mes)) {
      if (mesesSeleccionados.length === 1) return;
      setMesesSeleccionados(mesesSeleccionados.filter(m => m !== mes));
    } else {
      setMesesSeleccionados([...mesesSeleccionados, mes]);
    }
  };

  const handleReplicarEnMeses = () => {
    const montoStr = totalBaseMateriales.toFixed(2);
    setMontosMensuales(MESES.reduce((acc, m) => {
      acc[m] = mesesSeleccionados.includes(m) ? montoStr : '0';
      return acc;
    }, {}));
  };

  const handleDividirEnMeses = () => {
    const cantMeses = mesesSeleccionados.length || 1;
    const montoPorMes = (totalBaseMateriales / cantMeses).toFixed(2);
    setMontosMensuales(MESES.reduce((acc, m) => {
      acc[m] = mesesSeleccionados.includes(m) ? montoPorMes : '0';
      return acc;
    }, {}));
  };

  const costoTotalAnualCalculado = useMemo(() => {
    return MESES.reduce((acc, m) => acc + (parseFloat(montosMensuales[m]) || 0), 0);
  }, [montosMensuales]);

 const handleGuardar = () => {
    // ELIMINAMOS LA ALERTA OBLIGATORIA DE valorBuscador:
    // if (!valorBuscador) return alert('Por favor, seleccione un empleado o área responsable.');
    if (!filasItems[0].descripcion) return alert('Agregue al menos un material.');
    if (costoTotalAnualCalculado <= 0) return alert('El costo total proyectado debe ser mayor a 0.');

    let nombreEmpleado = `Área ${areaActiva}`;
    let dniEmpleado = '-';

    if (valorBuscador && valorBuscador.includes(' - ')) {
      const idSeleccionado = valorBuscador.split(' - ')[0];
      const empInfo = maestroEmpleados.find(e => (e.dni || e.id) === idSeleccionado);
      if (empInfo) {
        nombreEmpleado = empInfo.nombre;
        dniEmpleado = empInfo.dni || empInfo.id;
      } else {
        nombreEmpleado = valorBuscador.split(' - ')[1] || `Área ${areaActiva}`;
      }
    } else if (valorBuscador && valorBuscador.trim() !== '') {
      nombreEmpleado = valorBuscador.trim();
    }

    const idRegistroBase = registro ? registro.id_registro.split('-')[0] : `UTI-${Date.now()}`;
    const idLote = registro ? (registro.id_lote || idRegistroBase) : `LOTE-UTI-${Date.now()}`;

    const nuevosRegistros = [];

    MESES.forEach((mes, idx) => {
      const montoMes = parseFloat(montosMensuales[mes]) || 0;
      if (montoMes > 0) {
        const mesNum = String(idx + 1).padStart(2, '0');
        const idRegMes = `${idRegistroBase}-${mes}`;
        const fecha = `2026-${mesNum}-01`;

        filasItems.filter(f => f.descripcion).forEach((fila, fIdx) => {
          const costoFilaBase = (parseFloat(fila.precioUnit) || 0) * (parseFloat(fila.cantidad) || 0);
          const proporcionFila = totalBaseMateriales > 0 ? costoFilaBase / totalBaseMateriales : 0;
          const costoTotalFilaMes = montoMes * proporcionFila;
          
          const cuentaBase = '6235140';
          const cuentaFinal = `${prefijoArea}${cuentaBase}`;
          const infoCta = maestroCuentas.find(c => c.id === cuentaFinal);

          nuevosRegistros.push({
            id_registro: `${idRegMes}-${fIdx}`,
            id_lote: idLote,
            fecha_proyeccion: fecha,
            empleado_dni: dniEmpleado,
            empleado_nombre: `${nombreEmpleado} (${mes})`,
            area: areaActiva, // Asegura que se guarde amarrado al área actual
            detalle_columnas: {
              descripcion_material: fila.descripcion,
              cuenta: cuentaFinal,
              mes_uso: mes,
              fines_de_uso: finesDeUso,
              proceso,
              cantidad: parseFloat(fila.cantidad) || 0,
              precio_unit: parseFloat(fila.precioUnit) || 0,
              unid_med: fila.unidMed,
              distribucion: parseFloat(datosAuto.dist) || 100,
              costo_total: costoTotalFilaMes,
              montos_mensuales: montosMensuales,
            },
            totales: { costo_total: costoTotalFilaMes },
            desglose_contable: [{
              id: `cta-${fIdx}-${mes}`,
              cuenta: `${cuentaFinal}${infoCta ? ' - ' + infoCta.nombre : ' - Útiles y Materiales'} (${areaActiva} - ${fila.descripcion})`,
              monto: costoTotalFilaMes.toFixed(2)
            }],
          });
        });
      }
    });

    onGuardar(nuevosRegistros);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <fieldset disabled={isSoloLectura} style={{ border: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="offcanvas-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', padding: '16px' }}>

          <div className="form-section">
            <div className="form-section-title">1. Información General</div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label style={{ color: 'var(--primary-600, #2563eb)' }}>EMPLEADO / ÁREA RESPONSABLE</label>
              <input list="lista-emp-uti" value={valorBuscador} onChange={handleAutocomplete}
                placeholder="Escriba para buscar..." autoComplete="off"
                style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              <datalist id="lista-emp-uti">
                {maestroEmpleados.map((e, i) => <option key={i} value={`${e.dni || e.id} - ${e.nombre}`} />)}
              </datalist>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>PROCESO</label>
                <select value={proceso} onChange={e => setProceso(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }}>
                  <option value="">-- Seleccione --</option>
                  {PROCESOS_PRODUCTIVOS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>FINES DE USO</label>
                <input type="text" value={finesDeUso} onChange={e => setFinesDeUso(e.target.value)} placeholder="Ej. Oficina Administración"
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">2. Materiales (líneas independientes)</div>
            
            {filasItems.map((fila, index) => {
              const productosFiltrados = maestroProductos ? maestroProductos.filter(p => {
                const query = (fila.descripcion || '').toLowerCase();
                const nombre = (p.nombre || p.descripcion || p.item || '').toLowerCase();
                const codigo = (p.codigo || '').toLowerCase();
                return nombre.includes(query) || codigo.includes(query);
              }) : [];

              return (
                <div key={fila.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'flex-end', position: 'relative' }}>
                  
                  {/* DESCRIPCIÓN CON BUSCADOR FLOTANTE PERSONALIZADO */}
                  <div className="form-group" style={{ flex: 5, margin: 0, position: 'relative' }} ref={activoDropdownId === fila.id ? dropdownRef : null}>
                    {index === 0 && <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>DESCRIPCIÓN MATERIAL</label>}
                    <input 
                      type="text" 
                      value={fila.descripcion} 
                      onChange={e => {
                        actualizarFila(fila.id, 'descripcion', e.target.value);
                        setActivoDropdownId(fila.id);
                      }}
                      onFocus={() => setActivoDropdownId(fila.id)}
                      placeholder="Seleccione o escriba el material..." 
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', background: 'white' }} 
                    />

                    {/* MENÚ DESPLEGABLE FLOTANTE */}
                    {activoDropdownId === fila.id && productosFiltrados.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'white',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        zIndex: 999,
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        marginTop: '2px'
                      }}>
                        {productosFiltrados.map((p, pIdx) => {
                          const nombreProd = p.nombre || p.descripcion || p.item || '';
                          const costoRef = p.costo || p.pv || p.precio;
                          return (
                            <div 
                              key={pIdx}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSeleccionarProducto(fila.id, p);
                              }}
                              style={{
                                padding: '8px 12px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #f1f5f9',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                              onMouseLeave={e => e.currentTarget.style.background = 'white'}
                            >
                              <div>
                                <span style={{ fontWeight: 600, color: '#1e293b', display: 'block' }}>{nombreProd}</span>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>[{p.codigo}] - {p.categoria} ({p.unidad})</span>
                              </div>
                              {costoRef !== undefined && costoRef !== null && (
                                <span style={{ color: '#059669', fontSize: '11px', fontWeight: 'bold' }}>S/ {parseFloat(costoRef).toFixed(2)}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    {index === 0 && <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>CANT.</label>}
                    <input type="number" min="1" value={fila.cantidad} onChange={e => actualizarFila(fila.id, 'cantidad', e.target.value)}
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', textAlign: 'center' }} />
                  </div>
                  
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    {index === 0 && <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>PRECIO UNIT.</label>}
                    <input type="number" step="0.01" value={fila.precioUnit} onChange={e => actualizarFila(fila.id, 'precioUnit', e.target.value)}
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', textAlign: 'right' }} />
                  </div>

                  {filasItems.length > 1 && (
                    <button type="button" onClick={() => setFilasItems(filasItems.filter(f => f.id !== fila.id))}
                      style={{ background: 'transparent', border: 'none', color: 'var(--danger, #ef4444)', fontSize: '20px', cursor: 'pointer' }}>&times;</button>
                  )}
                </div>
              );
            })}

            <button type="button"
              onClick={() => setFilasItems([...filasItems, { id: Date.now(), descripcion: '', cantidad: 1, precioUnit: '', unidMed: 'Unidad' }])}
              className="btn-ghost" style={{ width: '100%', marginTop: '8px', borderStyle: 'dashed', background: 'white' }}>
              + Agregar Material
            </button>
          </div>

          {/* 3. GRILLA DE DISTRIBUCIÓN MENSUAL */}
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

          {/* 4. IMPACTO CONTABLE Y DESGLOSE */}
          <div className="form-section" style={{ marginTop: 'auto' }}>
            <div className="form-section-title">4. Impacto Contable y Desglose de Materiales</div>
            
            <div style={{ background: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', padding: '12px', marginBottom: '8px', fontSize: '12px' }}>
              <div style={{ fontWeight: 'bold', color: '#334155', marginBottom: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                Resumen de Materiales (Base 1 Ciclo)
              </div>
              {filasItems.map(f => {
                const desc = f.descripcion || 'Sin descripción';
                const cant = parseFloat(f.cantidad) || 0;
                const precio = parseFloat(f.precioUnit) || 0;
                const subtotal = cant * precio;
                if (subtotal <= 0) return null;

                return (
                  <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', padding: '3px 0' }}>
                    <span>
                      {desc} (S/ {precio.toFixed(2)} × {cant} {f.unidMed || 'und.'})
                    </span>
                    <span style={{ fontWeight: 600 }}>S/ {subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                );
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#1e293b', borderTop: '1px solid #e2e8f0', marginTop: '6px', paddingTop: '6px' }}>
                <span>Subtotal Materiales (1 Ciclo)</span>
                <span>S/ {totalBaseMateriales.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
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