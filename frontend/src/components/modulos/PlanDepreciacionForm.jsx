import React, { useState, useEffect, useMemo } from 'react';
import { MESES, PROCESOS_PRODUCTIVOS } from '../../config/data';
import { obtenerCuentasOdoo } from '../../data/store';

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS_DISPONIBLES = [ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1, ANIO_ACTUAL + 2, ANIO_ACTUAL + 3].map(String);

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

export default function PlanDepreciacionForm({ registro, onGuardar, onCancelar, modo, idVersion, area }) {
  const isSoloLectura = modo === 'ver';

  // Variables Generales del Activo
  const [tipoActivo, setTipoActivo] = useState('Activo Nuevo'); // Actúa como el toggle principal
  const [anioActivo, setAnioActivo] = useState(ANIO_ACTUAL.toString());
  const [numeroCuenta, setNumeroCuenta] = useState('');
  const [areaSel, setAreaSel] = useState(area || '');
  const [descripcionCuenta, setDescripcionCuenta] = useState('');
  const [uso, setUso] = useState('');
  const [detalle, setDetalle] = useState('');
  const [proceso, setProceso] = useState('');

  // Variables para Activo Nuevo (Cálculo Automático)
  const [gastoAdq, setGastoAdq] = useState('');
  const [mesAdq, setMesAdq] = useState('Ene');
  const [vidaUtil, setVidaUtil] = useState('');
  const [pctDeprAnual, setPctDeprAnual] = useState('');
  const [pctDeprPoliticaCv, setPctDeprPoliticaCv] = useState('');

  // Variables para Depreciación Pendiente (Ingreso Manual)
  const [montosMensuales, setMontosMensuales] = useState(
    MESES.reduce((acc, m) => ({ ...acc, [m]: '0' }), {})
  );

  // Maestro de cuentas sincronizado en vivo desde Odoo y buscador propio
  const [listaCuentas, setListaCuentas] = useState([]);
  const [cargandoCuentas, setCargandoCuentas] = useState(true);
  const [busquedaCuenta, setBusquedaCuenta] = useState('');
  const [selectorCuentaAbierto, setSelectorCuentaAbierto] = useState(false);

  const areaNormalizada = (areaSel || area || '').toLowerCase().trim();
  const prefijoArea = prefijosPorArea[areaNormalizada] || '';

  // CARGA EN VIVO DESDE ODOO
  useEffect(() => {
    let activo = true;
    async function cargarCuentasOdoo() {
      setCargandoCuentas(true);
      try {
        const ctaRes = await obtenerCuentasOdoo();
        if (activo && Array.isArray(ctaRes) && ctaRes.length > 0) setListaCuentas(ctaRes);
      } catch (error) {
        console.error('Error al conectar con Odoo (cuentas):', error);
      } finally {
        if (activo) setCargandoCuentas(false);
      }
    }
    cargarCuentasOdoo();
    return () => { activo = false; };
  }, []);

  // Cierra el selector si se hace clic fuera
  useEffect(() => {
    const handleClickFuera = (event) => {
      if (!selectorCuentaAbierto) return;
      if (event.target.closest('[data-cuenta-selector="depreciacion-principal"]')) return;
      setBusquedaCuenta(numeroCuenta);
      setSelectorCuentaAbierto(false);
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, [selectorCuentaAbierto, numeroCuenta]);

  const formatearCuenta = (c) => {
    const codigoOriginal = (c.codigo || c.id || '').toString();
    const idSinPrefijo = codigoOriginal.length === 9 ? codigoOriginal.substring(2) : codigoOriginal;
    return `${idSinPrefijo} - ${c.nombre}`;
  };

  const cuentasFiltradas = (texto) => {
    const query = (texto || '').trim().toLowerCase();
    if (query.length === 0) return listaCuentas.slice(0, 30);

    const coincidencias = listaCuentas.filter(c => {
      const nombreStr = String(c.nombre || '').toLowerCase();
      const codigoStr = String(c.codigo || c.id || '').toLowerCase();
      return codigoStr.includes(query) || nombreStr.includes(query);
    });

    coincidencias.sort((a, b) => {
      const aCodigo = String(a.codigo || a.id || '').toLowerCase();
      const bCodigo = String(b.codigo || b.id || '').toLowerCase();
      const aEmpieza = aCodigo.startsWith(query) ? 0 : 1;
      const bEmpieza = bCodigo.startsWith(query) ? 0 : 1;
      return aEmpieza - bEmpieza;
    });

    return coincidencias.slice(0, 30);
  };

  const seleccionarCuenta = (c) => {
    const valor = formatearCuenta(c);
    setNumeroCuenta(valor);
    setBusquedaCuenta(valor);
    setSelectorCuentaAbierto(false);
  };

  const aplicarPrefijoCuenta = (cuentaInput) => {
    if (!cuentaInput) return '';
    const partes = cuentaInput.split(' - ');
    let codigoLimpio = partes[0].trim();
    
    if (!prefijoArea) return codigoLimpio;
    if (codigoLimpio.length >= 9 && codigoLimpio.startsWith(prefijoArea)) return codigoLimpio;

    const numeroBase = codigoLimpio.length > 7 ? codigoLimpio.substring(codigoLimpio.length - 7) : codigoLimpio;
    return `${prefijoArea}${numeroBase}`;
  };

  useEffect(() => {
    if (registro) {
      const dc = registro.detalle_columnas || {};
      setAnioActivo(registro.fecha_proyeccion ? registro.fecha_proyeccion.substring(0, 4) : ANIO_ACTUAL.toString());
      setTipoActivo(dc.tipo_activo || 'Depreciación Pendiente');
      const cuentaCargada = dc.numero_cuenta || dc.cuenta_afectada || '';
      setNumeroCuenta(cuentaCargada);
      setBusquedaCuenta(cuentaCargada);
      setAreaSel(dc.area || area || '');
      setDescripcionCuenta(dc.descripcion_cuenta || '');
      setUso(dc.uso || '');
      setDetalle(dc.detalle || '');
      setGastoAdq(dc.gasto_adq?.toString() || '');
      setMesAdq(dc.mes_adq || 'Ene');
      setVidaUtil(dc.vida_util?.toString() || '');
      setPctDeprAnual(dc.pct_depr_anual?.toString() || '');
      setPctDeprPoliticaCv(dc.pct_depr_politica_cv?.toString() || '');
      setProceso(dc.proceso || '');
      
      if (registro.fecha_proyeccion) {
        const mesIndex = parseInt(registro.fecha_proyeccion.split('-')[1], 10) - 1;
        const nombreMes = MESES[mesIndex];
        setMontosMensuales(prev => ({
          ...prev,
          [nombreMes]: dc.deprec_mensual || dc.costo_total || '0'
        }));
      }
    } else {
      setAreaSel(area || '');
    }
  }, [registro, area]);

  // ==========================================
  // CÁLCULOS: ACTIVO NUEVO (AUTOMÁTICO)
  // ==========================================
  const totalMesesVidaUtil = useMemo(() => {
    const vida = parseFloat(vidaUtil) || 0;
    if (vida > 0) return Math.ceil(vida);
    const pct = parseFloat(pctDeprAnual) || 0;
    if (pct > 0) return Math.ceil((100 / pct) * 12);
    return 0;
  }, [vidaUtil, pctDeprAnual]);

  const depreciacionMensualAuto = useMemo(() => {
    const gasto = parseFloat(gastoAdq) || 0;
    if (totalMesesVidaUtil > 0) return gasto / totalMesesVidaUtil;
    return 0;
  }, [gastoAdq, totalMesesVidaUtil]);

  const fechasDepreciacionGeneradas = useMemo(() => {
    if (tipoActivo !== 'Activo Nuevo') return [];
    const startIndex = MESES.indexOf(mesAdq);
    if (startIndex === -1 || totalMesesVidaUtil <= 0) return [];

    const baseYear = parseInt(anioActivo, 10) || ANIO_ACTUAL;
    const dates = [];

    for (let i = 0; i < totalMesesVidaUtil; i++) {
      const currentMonthIndex = (startIndex + i) % 12;
      const yearsAdded = Math.floor((startIndex + i) / 12);
      const currentYear = baseYear + yearsAdded;
      const monthStr = String(currentMonthIndex + 1).padStart(2, '0');
      dates.push(`${currentYear}-${monthStr}-01`);
    }
    return dates;
  }, [tipoActivo, mesAdq, anioActivo, totalMesesVidaUtil]);

  const formatearEtiqueta = (fechaStr) => {
    if (!fechaStr) return '';
    const [anio, mes] = fechaStr.split('-');
    const nombreMes = MESES[parseInt(mes, 10) - 1] || mes;
    return `${nombreMes} ${anio}`;
  };

  // ==========================================
  // CÁLCULOS: DEPRECIACIÓN PENDIENTE (MANUAL)
  // ==========================================
  const totalManualAnual = useMemo(() => {
    return MESES.reduce((acc, m) => acc + (parseFloat(montosMensuales[m]) || 0), 0);
  }, [montosMensuales]);

  const replicarMesEnero = () => {
    const valorEnero = montosMensuales['Ene'];
    const nuevoMap = MESES.reduce((acc, m) => {
      acc[m] = valorEnero;
      return acc;
    }, {});
    setMontosMensuales(nuevoMap);
  };

  const handleGuardar = () => {
    if (!numeroCuenta) return alert('Por favor, ingrese el número de cuenta.');
    if (!descripcionCuenta) return alert('Por favor, ingrese la descripción del activo.');

    const idRegistroBase = registro ? registro.id_registro.split('-').slice(0, 2).join('-') : `DEP-${Date.now()}`;
    const idLote = registro ? (registro.id_lote || idRegistroBase) : `LOTE-DEP-${Date.now()}`;
    const cuentaFinal = aplicarPrefijoCuenta(numeroCuenta);

    const registrosAGuardar = [];

    if (tipoActivo === 'Activo Nuevo') {
      if (fechasDepreciacionGeneradas.length === 0) return alert('Verifique el mes de inicio y la vida útil.');
      if (!gastoAdq) return alert('Ingrese el gasto de adquisición para el cálculo.');

      fechasDepreciacionGeneradas.forEach((fecha, idx) => {
        const idRegMes = registro && fechasDepreciacionGeneradas.length === 1 ? registro.id_registro : `${idRegistroBase}-${idx}`;
        registrosAGuardar.push({
          id_registro: idRegMes,
          id_lote: idLote,
          modulo: 'Plan de Depreciación',
          categoria: 'Plan de Depreciación',
          area: areaSel,
          idVersion,
          fecha_proyeccion: fecha,
          empleado_dni: '-',
          empleado_nombre: descripcionCuenta || 'Activo Nuevo',
          detalle_columnas: {
            tipo_activo: tipoActivo,
            numero_cuenta: cuentaFinal,
            cuenta_afectada: cuentaFinal,
            area: areaSel, 
            proceso,
            descripcion_cuenta: descripcionCuenta,
            uso, detalle,
            gasto_adq: parseFloat(gastoAdq) || 0,
            mes_adq: mesAdq,
            vida_util: totalMesesVidaUtil,
            pct_depr_anual: parseFloat(pctDeprAnual) || 0,
            pct_depr_politica_cv: parseFloat(pctDeprPoliticaCv) || 0,
            deprec_mensual: depreciacionMensualAuto,
            costo_total: depreciacionMensualAuto,
          },
          totales: { costo_total: depreciacionMensualAuto },
          desglose_contable: [{
            id: `cta-${idx}`,
            cuenta: cuentaFinal,
            monto: depreciacionMensualAuto.toFixed(2)
          }],
        });
      });
    } else {
      if (totalManualAnual <= 0) return alert('El total de la depreciación anual debe ser mayor a 0.');
      
      MESES.forEach((mes, idx) => {
        const montoMes = parseFloat(montosMensuales[mes]) || 0;
        if (montoMes > 0) {
          const mesNum = String(idx + 1).padStart(2, '0');
          const fecha = `${anioActivo}-${mesNum}-01`;
          const idRegMes = `${idRegistroBase}-${idx}`;

          registrosAGuardar.push({
            id_registro: idRegMes,
            id_lote: idLote,
            modulo: 'Plan de Depreciación',
            categoria: 'Plan de Depreciación',
            area: areaSel,
            idVersion,
            fecha_proyeccion: fecha,
            empleado_dni: '-',
            empleado_nombre: descripcionCuenta || 'Depreciación Pendiente',
            detalle_columnas: {
              tipo_activo: tipoActivo,
              numero_cuenta: cuentaFinal,
              cuenta_afectada: cuentaFinal,
              area: areaSel, 
              proceso,
              descripcion_cuenta: descripcionCuenta,
              uso, detalle,
              gasto_adq: 0,
              vida_util: 0,
              deprec_mensual: montoMes,
              costo_total: montoMes,
              montos_mensuales: montosMensuales
            },
            totales: { costo_total: montoMes },
            desglose_contable: [{
              id: `cta-${idx}`,
              cuenta: cuentaFinal,
              monto: montoMes.toFixed(2)
            }],
          });
        }
      });
    }

    onGuardar(registrosAGuardar);
  };

  const sugerenciasCuentas = cuentasFiltradas(busquedaCuenta);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <fieldset disabled={isSoloLectura} style={{ border: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="offcanvas-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', padding: '16px' }}>

          {cargandoCuentas && (
            <div style={{ padding: '6px 12px', background: '#eff6ff', color: '#1e40af', borderRadius: '6px', fontSize: '11px' }}>
              Sincronizando plan de cuentas desde Odoo...
            </div>
          )}

          {/* 0. ESTADO DEL ACTIVO (TOGGLE PRINCIPAL) */}
          <div className="form-section">
            <div className="form-section-title">0. Modalidad de Registro</div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <select value={tipoActivo} onChange={e => setTipoActivo(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid var(--primary-600, #2563eb)', borderRadius: '6px', background: 'white', fontWeight: 700, color: 'var(--primary-700, #1d4ed8)', cursor: 'pointer', fontSize: '14px' }}>
                <option value="Activo Nuevo">✨ Activo Nuevo (Cálculo Automático por Vida Útil)</option>
                <option value="Depreciación Pendiente">⏳ Depreciación Pendiente (Ingreso Manual de Cuotas)</option>
              </select>
            </div>
          </div>

          {/* 1. INFORMACIÓN DEL ACTIVO */}
          <div className="form-section">
            <div className="form-section-title">1. Información de la Cuenta Contable</div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px', marginBottom: '12px' }}>
              <div className="form-group" style={{ margin: 0, position: 'relative' }} data-cuenta-selector="depreciacion-principal">
                <label style={{ color: 'var(--primary-600, #2563eb)', fontSize: '11px', fontWeight: 600 }}>Nº CUENTA CONTABLE</label>
                <input
                  type="text"
                  value={busquedaCuenta}
                  onChange={e => {
                    setBusquedaCuenta(e.target.value);
                    setSelectorCuentaAbierto(true);
                  }}
                  onFocus={() => setSelectorCuentaAbierto(true)}
                  placeholder="Busca por código o nombre... Ej. 6814100"
                  autoComplete="off"
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }}
                />

                {selectorCuentaAbierto && sugerenciasCuentas.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
                    border: '1px solid #cbd5e1', borderRadius: '0 0 8px 8px',
                    boxShadow: '0 8px 16px -4px rgba(15,23,42,0.15)',
                    maxHeight: '260px', overflowY: 'auto', zIndex: 60, marginTop: '2px'
                  }}>
                    {sugerenciasCuentas.map((c, idx) => {
                      const codigoOriginal = (c.codigo || c.id || '').toString();
                      return (
                        <div
                          key={`cta-dep-${idx}-${codigoOriginal || 'sin-codigo'}`}
                          onClick={() => seleccionarCuenta(c)}
                          style={{
                            padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                            fontSize: '12px', color: '#1e293b', display: 'flex', gap: '10px', alignItems: 'baseline'
                          }}
                          onMouseEnter={(ev) => ev.currentTarget.style.background = '#f8fafc'}
                          onMouseLeave={(ev) => ev.currentTarget.style.background = 'white'}
                        >
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#2563eb', fontWeight: 700, flexShrink: 0 }}>
                            {codigoOriginal}
                          </span>
                          <span style={{ color: '#334155' }}>{c.nombre}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectorCuentaAbierto && busquedaCuenta.trim().length >= 1 && sugerenciasCuentas.length === 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
                    border: '1px solid #cbd5e1', borderRadius: '0 0 8px 8px', padding: '10px 12px',
                    fontSize: '12px', color: '#94a3b8', zIndex: 60, marginTop: '2px'
                  }}>
                    Sin resultados para "{busquedaCuenta}"
                  </div>
                )}
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600 }}>DESCRIPCIÓN DE CUENTA / ACTIVO</label>
                <input type="text" value={descripcionCuenta} onChange={e => setDescripcionCuenta(e.target.value)}
                  placeholder="Ej. Horno de calcinación N°2" style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>ÁREA</label>
                <input type="text" value={areaSel} onChange={e => setAreaSel(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>PROCESO</label>
                <select value={proceso} onChange={e => setProceso(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }}>
                  <option value="">-- Seleccione --</option>
                  {PROCESOS_PRODUCTIVOS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>USO / DETALLE</label>
                <input type="text" value={uso} onChange={e => setUso(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
            </div>
          </div>

          {/* 2. PROYECCIÓN DE DEPRECIACIÓN */}
          <div className="form-section">
            <div className="form-section-title">2. Proyección de Depreciación</div>
            
            <div className="form-group" style={{ marginBottom: '16px', maxWidth: '200px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>AÑO DE INICIO / PRESUPUESTO</label>
              <select value={anioActivo} onChange={e => setAnioActivo(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', fontWeight: 'bold' }}>
                {ANIOS_DISPONIBLES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {tipoActivo === 'Activo Nuevo' ? (
              // VISTA ACTIVO NUEVO (AUTOMÁTICO)
              <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#166534' }}>MES INICIO (ADQUISICIÓN)</label>
                    <select value={mesAdq} onChange={e => setMesAdq(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #86efac', borderRadius: '4px' }}>
                      {MESES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#166534' }}>GASTO / VALOR ACTIVO (S/)</label>
                    <input type="number" step="0.01" value={gastoAdq} onChange={e => setGastoAdq(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #86efac', borderRadius: '4px' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#166534' }}>VIDA ÚTIL (MESES)</label>
                    <input type="number" value={vidaUtil} onChange={e => setVidaUtil(e.target.value)} placeholder="Ej. 120" style={{ width: '100%', padding: '8px', border: '1px solid #86efac', borderRadius: '4px' }} />
                  </div>
                </div>

                {fechasDepreciacionGeneradas.length > 0 && (
                  <div style={{ marginTop: '16px', padding: '12px', background: 'white', borderRadius: '6px', border: '1px dashed #4ade80' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#166534' }}>Resumen de Proyección Automática:</h4>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#334155' }}>
                      <li>Se generarán <strong>{fechasDepreciacionGeneradas.length}</strong> cuotas mensuales consecutivas.</li>
                      <li>Iniciando en <strong>{formatearEtiqueta(fechasDepreciacionGeneradas[0])}</strong> hasta <strong>{formatearEtiqueta(fechasDepreciacionGeneradas[fechasDepreciacionGeneradas.length - 1])}</strong>.</li>
                      <li>Monto contable a depreciar por mes: <strong>S/ {depreciacionMensualAuto.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></li>
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              // VISTA DEPRECIACIÓN PENDIENTE (MANUAL)
              <div style={{ background: '#fff7ed', padding: '16px', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#9a3412' }}>Distribución Manual Mensual (S/):</label>
                  {!isSoloLectura && (
                    <button type="button" onClick={replicarMesEnero} style={{ background: 'white', color: '#ea580c', border: '1px solid #fdba74', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>
                      ⚡ Replicar Enero a todos
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
                  {MESES.map(m => (
                    <div key={`mnt-${m}`} style={{ background: '#fff', padding: '6px', borderRadius: '4px', border: '1px solid #fed7aa', textAlign: 'center' }}>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#9a3412', display: 'block' }}>{m}</span>
                      <input 
                        type="number" step="0.01"
                        value={montosMensuales[m] !== undefined ? montosMensuales[m] : '0'}
                        onChange={e => setMontosMensuales({ ...montosMensuales, [m]: e.target.value })}
                        style={{ width: '100%', padding: '4px', textAlign: 'center', fontSize: '12px', border: '1px solid #fdba74', borderRadius: '3px', marginTop: '4px', fontWeight: 'bold' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="form-section" style={{ marginTop: 'auto' }}>
            <div className="form-section-title">3. Impacto Contable Total</div>
            <div className="calc-total" style={{ marginTop: '8px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#334155', fontSize: '16px' }}>
                <div>
                  <span>Total Proyectado en este proceso</span>
                </div>
                <span>
                  S/ {tipoActivo === 'Activo Nuevo' ? 
                    (depreciacionMensualAuto * fechasDepreciacionGeneradas.length).toLocaleString('en-US', { minimumFractionDigits: 2 }) : 
                    totalManualAnual.toLocaleString('en-US', { minimumFractionDigits: 2 })
                  }
                </span>
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