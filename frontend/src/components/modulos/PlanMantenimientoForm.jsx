import React, { useState, useEffect, useMemo } from 'react';
import { MESES, PROCESOS_PRODUCTIVOS } from '../../config/data';
import { obtenerCuentasOdoo } from '../../data/store';
import { formatearCuentaContable } from '../../config/cuentas';

const FRECUENCIAS = ['Mensual', 'Trimestral', 'Semestral', 'Anual'];

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

export default function PlanMantenimientoForm({ registro, onGuardar, onCancelar, modo, idVersion, area }) {
  const isSoloLectura = modo === 'ver';

  const [cuenta, setCuenta] = useState('');
  const [descripcionActivo, setDescripcionActivo] = useState('');
  const [areaSel, setAreaSel] = useState(area || '');
  const [proceso, setProceso] = useState('');
  const [frecuencia, setFrecuencia] = useState('Mensual');
  const [uso, setUso] = useState('');
  const [anioPresupuesto, setAnioPresupuesto] = useState('2026');
  const [costoMantenimiento, setCostoMantenimiento] = useState('');
  const [tiempoProrrateo, setTiempoProrrateo] = useState('1');
  const [gastoAdq, setGastoAdq] = useState('');
  const [mesAdquisicion, setMesAdquisicion] = useState('Ene');
  const [detalleMantenimiento, setDetalleMantenimiento] = useState('');

  // Nuevos estados para la integración con Depreciación
  const [esActivoNuevo, setEsActivoNuevo] = useState(false);
  const [cuentaDepreciacion, setCuentaDepreciacion] = useState('');
  const [vidaUtilDepreciacion, setVidaUtilDepreciacion] = useState('');
  const [pctDepreciacion, setPctDepreciacion] = useState('');

  // Grilla mensual de montos de mantenimiento por mes
  const [montosMensuales, setMontosMensuales] = useState(
    MESES.reduce((acc, m) => ({ ...acc, [m]: '0' }), {})
  );

  // Maestro de cuentas jalado en vivo desde la base de datos (Odoo),
  // igual que en UniformesForm — ya no depende del arreglo estático
  // `maestroCuentas` de config/data.js.
  const [listaCuentas, setListaCuentas] = useState([]);
  const [cargandoCuentas, setCargandoCuentas] = useState(true);

  // Buscador propio para las cuentas (reemplaza el <datalist> nativo,
  // que el navegador dibuja con su propio estilo del SO y no se puede
  // personalizar). `busquedaCuenta`/`busquedaCuentaDep` es el texto que
  // el usuario está escribiendo en cada campo; `cuenta`/`cuentaDepreciacion`
  // solo se actualizan cuando hace clic en una sugerencia — así el
  // buscador nunca "confirma" algo que el usuario no eligió realmente.
  const [busquedaCuenta, setBusquedaCuenta] = useState('');
  const [busquedaCuentaDep, setBusquedaCuentaDep] = useState('');
  const [selectorCuentaAbierto, setSelectorCuentaAbierto] = useState(null); // null | 'mantenimiento' | 'depreciacion'

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

  // Cierra el desplegable de cuenta que esté abierto al hacer clic fuera
  // de su contenedor; si se cierra sin elegir nada, revierte el texto al
  // último valor confirmado (evita quedarse con una búsqueda a medias).
  useEffect(() => {
    const handleClickFuera = (event) => {
      if (!selectorCuentaAbierto) return;
      if (event.target.closest(`[data-cuenta-selector="${selectorCuentaAbierto}"]`)) return;

      if (selectorCuentaAbierto === 'mantenimiento') setBusquedaCuenta(cuenta);
      if (selectorCuentaAbierto === 'depreciacion') setBusquedaCuentaDep(cuentaDepreciacion);
      setSelectorCuentaAbierto(null);
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, [selectorCuentaAbierto, cuenta, cuentaDepreciacion]);

  // Formatea una cuenta del maestro al mismo string "código - nombre" que
  // ya usa el resto del formulario (aplicarPrefijoCuenta sigue intacta).
  const formatearCuenta = (c) => {
    const codigoOriginal = (c.codigo || c.id || '').toString();
    const idSinPrefijo = codigoOriginal.length === 9 ? codigoOriginal.substring(2) : codigoOriginal;
    return `${idSinPrefijo} - ${c.nombre}`;
  };

  // Filtra por código o nombre, priorizando los códigos que EMPIEZAN con
  // lo escrito (para que buscar "634" muestre primero 6341000, 6342100...
  // en vez de mezclarlos con cuentas que solo contienen "634" en el
  // nombre). Se limita a 30 resultados para que la lista siga siendo
  // manejable con un plan de cuentas grande.
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

  const seleccionarCuentaMantenimiento = (c) => {
    const valor = formatearCuenta(c);
    setCuenta(valor);
    setBusquedaCuenta(valor);
    setSelectorCuentaAbierto(null);
  };

  const seleccionarCuentaDepreciacion = (c) => {
    const valor = formatearCuenta(c);
    setCuentaDepreciacion(valor);
    setBusquedaCuentaDep(valor);
    setSelectorCuentaAbierto(null);
  };

  // Renderiza el buscador de cuenta (input + dropdown propio). Se usa
  // dos veces (mantenimiento y depreciación) — es una función que
  // devuelve JSX, no un componente aparte, así React no la remonta en
  // cada render y el input no pierde el foco mientras se escribe.
  const renderSelectorCuenta = ({ clave, busqueda, setBusqueda, onSeleccionar, label, placeholder }) => {
    const sugerencias = cuentasFiltradas(busqueda);
    const abierto = selectorCuentaAbierto === clave;

    return (
      <div className="form-group" style={{ margin: 0, position: 'relative' }} data-cuenta-selector={clave}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>{label}</label>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setSelectorCuentaAbierto(clave);
          }}
          onFocus={() => setSelectorCuentaAbierto(clave)}
          placeholder={placeholder}
          autoComplete="off"
          style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }}
        />

        {abierto && sugerencias.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
            border: '1px solid #cbd5e1', borderRadius: '0 0 8px 8px',
            boxShadow: '0 8px 16px -4px rgba(15,23,42,0.15)',
            maxHeight: '260px', overflowY: 'auto', zIndex: 60, marginTop: '2px'
          }}>
            {sugerencias.map((c, idx) => {
              const codigoOriginal = (c.codigo || c.id || '').toString();
              return (
                <div
                  key={`${clave}-${idx}-${codigoOriginal || 'sin-codigo'}`}
                  onClick={() => onSeleccionar(c)}
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

        {abierto && busqueda.trim().length >= 1 && sugerencias.length === 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
            border: '1px solid #cbd5e1', borderRadius: '0 0 8px 8px', padding: '10px 12px',
            fontSize: '12px', color: '#94a3b8', zIndex: 60, marginTop: '2px'
          }}>
            Sin resultados para "{busqueda}"
          </div>
        )}
      </div>
    );
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

  const formatearEtiqueta = (fechaStr) => {
    if (!fechaStr) return '';
    const [anio, mes] = fechaStr.split('-');
    const nombreMes = MESES[parseInt(mes, 10) - 1] || mes;
    return `${nombreMes} ${anio}`;
  };

  useEffect(() => {
    if (registro) {
      const dc = registro.detalle_columnas || {};
      setCuenta(dc.cuenta || '');
      setBusquedaCuenta(dc.cuenta || '');
      setDescripcionActivo(dc.descripcion_activo || '');
      setAreaSel(dc.area || area || '');
      setProceso(dc.proceso || '');
      setFrecuencia(dc.frecuencia || 'Mensual');
      setUso(dc.uso || '');
      setAnioPresupuesto(dc.anio_presupuesto?.toString() || '2026');
      setCostoMantenimiento(dc.costo_mantenimiento?.toString() || '');
      setTiempoProrrateo(dc.tiempo_prorrateo_gasto?.toString() || '1');
      setGastoAdq(dc.gasto_adq?.toString() || '');
      setMesAdquisicion(dc.mes_adquisicion || 'Ene');
      setDetalleMantenimiento(dc.detalle_mantenimiento || '');

      setEsActivoNuevo(!!dc.genero_depreciacion);
      setCuentaDepreciacion(dc.cuenta_depreciacion || '');
      setBusquedaCuentaDep(dc.cuenta_depreciacion || '');
      setVidaUtilDepreciacion(dc.vida_util?.toString() || '');
      setPctDepreciacion(dc.pct_depr_anual?.toString() || '');

      if (dc.montos_mensuales && typeof dc.montos_mensuales === 'object') {
        setMontosMensuales(dc.montos_mensuales);
      } else if (dc.costos_mensuales) {
        setMontosMensuales(dc.costos_mensuales);
      }
    } else {
      setAreaSel(area || '');
    }
  }, [registro, area]);

  // Funciones y Cálculos Mantenimiento
  const handleProrratearAutomatico = () => {
    const costo = parseFloat(costoMantenimiento) || 0;
    const tiempo = parseInt(tiempoProrrateo, 10) || 1;
    const montoMes = (costo / tiempo).toFixed(2);

    const nuevoMap = MESES.reduce((acc, m, idx) => {
      acc[m] = idx < tiempo ? montoMes : '0';
      return acc;
    }, {});
    setMontosMensuales(nuevoMap);
  };

  const costoTotalAnualCalculado = useMemo(() => {
    return MESES.reduce((acc, m) => acc + (parseFloat(montosMensuales[m]) || 0), 0);
  }, [montosMensuales]);

  // ==========================================
  // LÓGICA DE PROYECCIÓN DE VIDA ÚTIL COMPLETA
  // ==========================================
  const totalMesesVidaUtil = useMemo(() => {
    const vida = parseFloat(vidaUtilDepreciacion) || 0;
    if (vida > 0) return Math.ceil(vida);
    const pct = parseFloat(pctDepreciacion) || 0;
    if (pct > 0) return Math.ceil((100 / pct) * 12);
    return 0;
  }, [vidaUtilDepreciacion, pctDepreciacion]);

  const fechasDepreciacionGeneradas = useMemo(() => {
    if (!esActivoNuevo) return [];
    const startIndex = MESES.indexOf(mesAdquisicion);
    if (startIndex === -1 || totalMesesVidaUtil <= 0) return [];

    const baseYear = parseInt(anioPresupuesto, 10) || new Date().getFullYear();
    const dates = [];

    for (let i = 0; i < totalMesesVidaUtil; i++) {
      const currentMonthIndex = (startIndex + i) % 12;
      const yearsAdded = Math.floor((startIndex + i) / 12);
      const currentYear = baseYear + yearsAdded;
      const monthStr = String(currentMonthIndex + 1).padStart(2, '0');
      dates.push(`${currentYear}-${monthStr}-01`);
    }
    return dates;
  }, [esActivoNuevo, mesAdquisicion, anioPresupuesto, totalMesesVidaUtil]);

  const depreciacionMensualCalculada = useMemo(() => {
    if (!esActivoNuevo) return 0;
    const gasto = parseFloat(gastoAdq) || 0;
    if (totalMesesVidaUtil > 0) return gasto / totalMesesVidaUtil;
    return 0;
  }, [esActivoNuevo, gastoAdq, totalMesesVidaUtil]);

  const montosDepreciacionBaseYear = useMemo(() => {
    if (!esActivoNuevo) return {};
    const indiceMesAdq = MESES.indexOf(mesAdquisicion);
    return MESES.reduce((acc, m, idx) => {
      // Solo mostramos para la grilla visual el impacto en el año 1
      acc[m] = idx >= indiceMesAdq && idx < (indiceMesAdq + totalMesesVidaUtil) ? depreciacionMensualCalculada.toFixed(2) : '0.00';
      return acc;
    }, {});
  }, [esActivoNuevo, mesAdquisicion, depreciacionMensualCalculada, totalMesesVidaUtil]);

  const mesesActivosMnt = useMemo(() => Object.entries(montosMensuales).filter(([_, val]) => parseFloat(val) > 0), [montosMensuales]);

  const handleGuardar = () => {
    if (!cuenta) return alert('Por favor, ingrese la cuenta de mantenimiento.');
    if (!descripcionActivo) return alert('Por favor, describa el activo.');
    if (costoTotalAnualCalculado <= 0 && !esActivoNuevo) return alert('El costo total anual de mantenimiento debe ser mayor a 0.');

    if (esActivoNuevo && (!cuentaDepreciacion || !gastoAdq || (!pctDepreciacion && !vidaUtilDepreciacion))) {
      return alert('Para registrar un Activo Nuevo, debe ingresar la Cuenta de Depreciación, el Gasto de Adquisición y la Vida Útil o el % de Depreciación.');
    }

    const timestamp = Date.now();
    const idRegistroBaseMnt = registro ? registro.id_registro : `MNT-${timestamp}`;
    const idLote = registro ? (registro.id_lote || idRegistroBaseMnt) : `LOTE-MIXTO-${timestamp}`;

    const cuentaFinalMnt = formatearCuentaContable(aplicarPrefijoCuenta(cuenta), listaCuentas);
    const registrosAGuardar = [];

    // 1. Generar registros de MANTENIMIENTO
    MESES.forEach((mes, idx) => {
      const montoMes = parseFloat(montosMensuales[mes]) || 0;
      if (montoMes > 0) {
        const mesNum = String(idx + 1).padStart(2, '0');
        const idRegMes = `${idRegistroBaseMnt}-${mes}`;

        registrosAGuardar.push({
          id_registro: idRegMes,
          id_lote: idLote,
          modulo: 'Plan de Mantenimiento',
          categoria: 'Plan de Mantenimiento',
          area: areaSel,
          idVersion,
          fecha_proyeccion: `${anioPresupuesto}-${mesNum}-01`,
          empleado_dni: '-',
          empleado_nombre: `${descripcionActivo} (${mes})`,
          detalle_columnas: {
            cuenta: cuentaFinalMnt,
            area: areaSel,
            proceso,
            descripcion_activo: `${descripcionActivo} - ${mes}`,
            frecuencia,
            uso,
            anio_presupuesto: parseFloat(anioPresupuesto) || 2026,
            costo_mantenimiento: parseFloat(costoMantenimiento) || 0,
            tiempo_prorrateo_gasto: parseFloat(tiempoProrrateo) || 1,
            mes_ejecucion_gasto: mes,
            montos_mensuales: montosMensuales,
            gasto_adq: parseFloat(gastoAdq) || 0,
            mes_adquisicion: mesAdquisicion,
            detalle_mantenimiento: detalleMantenimiento,
            genero_depreciacion: esActivoNuevo,
            cuenta_depreciacion: cuentaDepreciacion,
            vida_util: parseFloat(vidaUtilDepreciacion) || 0,
            pct_depr_anual: parseFloat(pctDepreciacion) || 0,
            costo_total: montoMes,
          },
          totales: { costo_total: montoMes },
          desglose_contable: [{
            id: `cta-${mes}`,
            cuenta: cuentaFinalMnt,
            monto: montoMes.toFixed(2)
          }]
        });
      }
    });

    // 2. Si es Activo Nuevo, generar TODOS los registros de DEPRECIACIÓN (hasta el fin de vida útil)
    if (esActivoNuevo && fechasDepreciacionGeneradas.length > 0) {
      const idRegistroBaseDep = `DEP-${timestamp}`;
      const cuentaDepFinal = aplicarPrefijoCuenta(cuentaDepreciacion);

      fechasDepreciacionGeneradas.forEach((fecha, idx) => {
        const idRegDep = `${idRegistroBaseDep}-${idx}`;

        registrosAGuardar.push({
          id_registro: idRegDep,
          id_lote: idLote,
          modulo: 'Plan de Depreciación',
          categoria: 'Plan de Depreciación',
          area: areaSel,
          idVersion,
          fecha_proyeccion: fecha, // Inyectamos la fecha generada (2026, 2027, 2028...)
          empleado_dni: '-',
          empleado_nombre: descripcionActivo || 'Activo Nuevo',
          detalle_columnas: {
            tipo_activo: 'Activo Nuevo',
            numero_cuenta: cuentaDepFinal,
            cuenta_afectada: formatearCuentaContable(cuentaDepFinal, listaCuentas),
            area: areaSel,
            proceso,
            descripcion_cuenta: descripcionActivo,
            uso,
            detalle: detalleMantenimiento,
            gasto_adq: parseFloat(gastoAdq) || 0,
            mes_adq: mesAdquisicion,
            vida_util: totalMesesVidaUtil,
            pct_depr_anual: parseFloat(pctDepreciacion) || 0,
            deprec_mensual: depreciacionMensualCalculada,
            costo_total: depreciacionMensualCalculada,
          },
          totales: { costo_total: depreciacionMensualCalculada },
          desglose_contable: [{
            id: `cta-dep-${idx}`,
            cuenta: formatearCuentaContable(cuentaDepFinal, listaCuentas),
            monto: depreciacionMensualCalculada.toFixed(2)
          }],
        });
      });
    }

    onGuardar(registrosAGuardar);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <fieldset disabled={isSoloLectura} style={{ border: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="offcanvas-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', padding: '16px' }}>

          {cargandoCuentas && (
            <div style={{ padding: '6px 12px', background: '#eff6ff', color: '#1e40af', borderRadius: '6px', fontSize: '11px' }}>
              Sincronizando plan de cuentas desde Odoo...
            </div>
          )}

          <div className="form-section">
            <div className="form-section-title">1. Activo y Cuenta de Mantenimiento</div>

            <div style={{ marginBottom: '12px' }}>
              {renderSelectorCuenta({
                clave: 'mantenimiento',
                busqueda: busquedaCuenta,
                setBusqueda: setBusquedaCuenta,
                onSeleccionar: seleccionarCuentaMantenimiento,
                label: 'CUENTA MANTENIMIENTO',
                placeholder: 'Busca por código o nombre... Ej. 6343201',
              })}
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>DESCRIPCIÓN DE ACTIVO</label>
              <input type="text" value={descripcionActivo} onChange={e => setDescripcionActivo(e.target.value)}
                placeholder="Ej. Horno de calcinación N°1" style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>ÁREA</label>
                <input type="text" value={areaSel} onChange={e => setAreaSel(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>PROCESO</label>
                <select value={proceso} onChange={e => setProceso(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }}>
                  <option value="">-- Seleccione --</option>
                  {PROCESOS_PRODUCTIVOS.map((p, idxProc) => <option key={`proc-${idxProc}-${p}`} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>USO</label>
                <input type="text" value={uso} onChange={e => setUso(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">2. Programación de Costos de Mantenimiento</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>FRECUENCIA</label>
                <select value={frecuencia} onChange={e => setFrecuencia(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }}>
                  {FRECUENCIAS.map((f, idxFrec) => <option key={`frec-${idxFrec}-${f}`} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>AÑO DE PRESUPUESTO</label>
                <input type="number" value={anioPresupuesto} onChange={e => setAnioPresupuesto(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>COSTO MANTENIMIENTO (S/)</label>
                <input type="number" step="0.01" value={costoMantenimiento} onChange={e => setCostoMantenimiento(e.target.value)}
                  placeholder="0.00" style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>TIEMPO PRORRATEO (MESES)</label>
                <input type="number" value={tiempoProrrateo} onChange={e => setTiempoProrrateo(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
              <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>DETALLE DEL MANTENIMIENTO</label>
                <input type="text" value={detalleMantenimiento} onChange={e => setDetalleMantenimiento(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b' }}>Distribución Mensual (Mantenimiento):</label>
                {!isSoloLectura && (
                  <button type="button" onClick={handleProrratearAutomatico} style={{ background: '#f1f5f9', color: '#2563eb', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>
                    ⚡ Prorratear Automático por Meses
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
                {MESES.map((m, idxMes) => (
                  <div key={`mnt-${idxMes}-${m}`} style={{ background: '#f8fafc', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                    <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#64748b', display: 'block' }}>{m}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={montosMensuales[m] !== undefined ? montosMensuales[m] : '0'}
                      onChange={e => {
                        const val = e.target.value;
                        setMontosMensuales({ ...montosMensuales, [m]: val });
                      }}
                      style={{ width: '100%', padding: '4px', textAlign: 'center', fontSize: '11px', border: '1px solid #2563eb', borderRadius: '3px', marginTop: '2px', fontWeight: 'bold' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8b5cf6' }}>
              <input
                type="checkbox"
                checked={esActivoNuevo}
                onChange={(e) => setEsActivoNuevo(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label style={{ cursor: 'pointer', margin: 0 }}>3. Configurar como Activo Nuevo (Genera Plan de Depreciación)</label>
            </div>

            {esActivoNuevo && (
              <div style={{ padding: '12px', background: '#f5f3ff', borderRadius: '6px', border: '1px dashed #c4b5fd' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    {renderSelectorCuenta({
                      clave: 'depreciacion',
                      busqueda: busquedaCuentaDep,
                      setBusqueda: setBusquedaCuentaDep,
                      onSeleccionar: seleccionarCuentaDepreciacion,
                      label: 'CUENTA DEPRECIACIÓN',
                      placeholder: 'Busca por código o nombre... Ej. 6814100',
                    })}
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>GASTO ADQUISICIÓN (S/)</label>
                    <input type="number" step="0.01" value={gastoAdq} onChange={e => setGastoAdq(e.target.value)}
                      placeholder="0.00" style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>MES DE ADQUISICIÓN</label>
                    <select value={mesAdquisicion} onChange={e => setMesAdquisicion(e.target.value)}
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }}>
                      {MESES.map((m, idxMesAdq) => <option key={`mesadq-${idxMesAdq}-${m}`} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>VIDA ÚTIL (MESES)</label>
                    <input type="number" value={vidaUtilDepreciacion} onChange={e => setVidaUtilDepreciacion(e.target.value)}
                      placeholder="Ej. 120" style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>% DEPRECIACIÓN ANUAL</label>
                    <input type="number" step="0.01" value={pctDepreciacion} onChange={e => setPctDepreciacion(e.target.value)}
                      placeholder="Ej. 10" style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }} />
                  </div>
                </div>

                {/* Mostrar impacto en el AÑO BASE como referencia visual */}
                <div style={{ marginTop: '12px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', marginBottom: '8px', display: 'block' }}>Proyección en el Año Base ({anioPresupuesto}):</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
                    {MESES.map((m, idxDep) => (
                      <div key={`dep-${idxDep}-${m}`} style={{ background: '#fff', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                        <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#64748b', display: 'block' }}>{m}</span>
                        <div style={{ fontSize: '11px', color: '#8b5cf6', fontWeight: 'bold', marginTop: '4px' }}>
                          {montosDepreciacionBaseYear[m]}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>

          <div className="form-section" style={{ marginTop: 'auto' }}>
            <div className="form-section-title">4. Impacto Contable Total</div>
            <div className="calc-total" style={{ marginTop: '8px', padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#166534', fontSize: '16px' }}>
                <div style={{ flex: 1 }}>
                  <span>Costo Total Anual Mantenimiento</span>
                  <div style={{ fontSize: '11px', color: '#15803d', fontWeight: 'normal', marginTop: '4px' }}>
                    Se crearán {mesesActivosMnt.length} registro(s) de mantenimiento:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {mesesActivosMnt.map(([mes, monto], idxRes) => (
                      <span key={`res-mnt-${idxRes}-${mes}`} style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: '1px solid #bbf7d0' }}>
                        {mes}: S/ {parseFloat(monto).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    ))}
                  </div>
                </div>
                <span style={{ marginLeft: '16px' }}>S/ {costoTotalAnualCalculado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>

              {esActivoNuevo && fechasDepreciacionGeneradas.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#6d28d9', fontSize: '16px', borderTop: '1px solid #bbf7d0', paddingTop: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <span>Costo Total Depreciación (Vida Útil Completa)</span>
                    <div style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 'normal', marginTop: '4px' }}>
                      Se generarán de forma automática <strong>{fechasDepreciacionGeneradas.length} meses</strong> de depreciación:
                    </div>

                    {/* Etiquetas Resumen Inteligentes (para no saturar la pantalla con 120 cuadros) */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                      <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: '1px solid #ddd6fe' }}>
                        📅 Inicio: {formatearEtiqueta(fechasDepreciacionGeneradas[0])}
                      </span>
                      <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: '1px solid #ddd6fe' }}>
                        🏁 Fin: {formatearEtiqueta(fechasDepreciacionGeneradas[fechasDepreciacionGeneradas.length - 1])}
                      </span>
                      <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: '1px solid #ddd6fe' }}>
                        💰 {fechasDepreciacionGeneradas.length} cuotas de S/ {depreciacionMensualCalculada.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  <span style={{ marginLeft: '16px' }}>S/ {(depreciacionMensualCalculada * fechasDepreciacionGeneradas.length).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              )}

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
