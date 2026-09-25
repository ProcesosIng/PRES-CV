import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom'; // 👈 1. Importamos createPortal
import { maestroEmpleados, PROCESOS_PRODUCTIVOS, MESES } from '../../config/data';
import { API_URL } from '../../config/api';

export default function RemuneracionesForm({ registro, onGuardar, onCancelar, modo, area }) {

  const isSoloLectura = modo === 'ver';
  // ==========================================
  // 1. ESTADOS
  // ==========================================
  const ANIO_ACTUAL = new Date().getFullYear();
  const ANIOS_DISPONIBLES = [ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1, ANIO_ACTUAL + 2].map(String);
  const [anioActivo, setAnioActivo] = useState(ANIO_ACTUAL.toString()); 
  const [fechasSeleccionadas, setFechasSeleccionadas] = useState([]);

  const [valorBuscador, setValorBuscador] = useState('');
  
  // NUEVOS ESTADOS PARA EL BUSCADOR INTELIGENTE DE EMPLEADOS (MÍNIMO 3 CARACTERES)
  const [listaEmpleadosOdoo, setListaEmpleadosOdoo] = useState([]);
  const [empleadosSugeridos, setEmpleadosSugeridos] = useState([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);

  const [proceso, setProceso] = useState('');
  const [seguro, setSeguro] = useState('');

  const [datosAuto, setDatosAuto] = useState({ 
    dni: '', sueldo: '0', dist: '100', sueldo_calc: '0', cargo: '' 
  });

  const [valoresRegistro, setValoresRegistro] = useState({
    asig_fam: '0', movilidad: '0', he_25: '0', he_35: '0', feriados: '0', comision: '0', tarjeta_alim: 'No', h_noc: '0', otrasRemun: '0'
  });

  const prefijosPorArea = {
      'Administración': '94',
      'Comercial': '95',
      'Logística': '98',
      'Almacen': '99',
      'Producción Crisoles': '91',
      'Producción Fundente': '92',
      'Producción Copelas': '93'
    };

  const prefijo = prefijosPorArea[area] || '';

  const [filasCuentas, setFilasCuentas] = useState([]);

  // 👈 2. ESTADO PARA CONTROLAR LA IMPRESIÓN
  const [isPrinting, setIsPrinting] = useState(false);

  // ==========================================
  // 2. CARGA INICIAL (MODO EDICIÓN)
  // ==========================================

  useEffect(() => {
    async function cargarEmpleadosOdoo() {
      try {
        const respuesta = await fetch(`${API_URL}/api/maestros/empleados`);
        if (respuesta.ok) {
          const data = await respuesta.json();
          setListaEmpleadosOdoo(data || []);
        }
      } catch (error) {
        console.error("Error al cargar empleados desde Odoo:", error);
      }
    }
    cargarEmpleadosOdoo();
  }, []);

  useEffect(() => {
    if (registro) {
      setFechasSeleccionadas([registro.fecha_proyeccion]);
      
      if (registro.fecha_proyeccion) {
        const anioReg = registro.fecha_proyeccion.split('-')[0];
        setAnioActivo(anioReg); 
      }

      setValorBuscador(`${registro.empleado_dni || ''} - ${registro.empleado_nombre || ''}`);
      setProceso(registro.detalle_columnas?.proceso || '');
      setSeguro(registro.detalle_columnas?.seguro || '');
      
      const emp = maestroEmpleados.find(e => (e.dni || e.id) === registro.empleado_dni);
      
      setDatosAuto({
        dni: registro.empleado_dni || '',
        sueldo: registro.detalle_columnas?.sueldo_base?.toString() || '0',
        dist: registro.detalle_columnas?.distribucion?.toString() || '100',
        sueldo_calc: registro.detalle_columnas?.sueldo_calculo?.toString() || '0',
        // Inclusión del puesto real del maestro de empleados
        cargo: emp ? (emp.puesto || emp.cargo || 'Sin asignar') : (registro.detalle_columnas?.cargo || 'Cargo Registrado')
      });
      
      setValoresRegistro(registro.variables_registro || {});
      setFilasCuentas(registro.desglose_contable || []);
    }
  }, [registro?.id_registro]); 

  // ==========================================
  // 3. FUNCIONES DE INTERFAZ Y BÚSQUEDA INTELIGENTE
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


  // MANEJADOR DE BÚSQUEDA DINÁMICO OPTIMIZADO
  const handleBusquedaEmpleadoChange = (e) => {
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
      // Extraemos el cargo evaluando todas las alternativas posibles del backend
      const cargoDetectado = emp.cargo || emp.puesto || emp.job_title || (Array.isArray(emp.job_id) ? emp.job_id[1] : emp.job_id) || 'Sin asignar';

      setDatosAuto({
        dni: emp.dni || emp.id || emp.id_empleado,
        sueldo: emp.sueldo || emp.contract_wage || '0',
        dist: emp.distribucion?.toString().replace('%', '') || '100',
        cargo: cargoDetectado, 
        sueldo_calc: '0',
        proceso: emp.proceso || ''
      });
      setValoresRegistro(prev => ({ ...prev, asig_fam: emp.asigFam || '0' }));
      setProceso(emp.proceso || '');
      setSeguro(emp.seguro || '');
    } else {
      setDatosAuto({ dni: '', sueldo: '0', dist: '100', sueldo_calc: '0', cargo: '' });
      setProceso('');
      setSeguro('');
    }
  };

  const seleccionarEmpleado = (emp) => {
    const dniEmp = emp.dni || emp.id || emp.id_empleado || '';
    const nombreEmp = emp.nombre || '';
    const etiqueta = `${dniEmp} - ${nombreEmp}`;
    
    setValorBuscador(etiqueta);
    setMostrarSugerencias(false);

    // Extraemos el cargo evaluando todas las alternativas posibles del backend
    const cargoDetectado = emp.cargo || emp.puesto || emp.job_title || (Array.isArray(emp.job_id) ? emp.job_id[1] : emp.job_id) || 'Sin asignar';

    setDatosAuto({
      dni: dniEmp,
      sueldo: emp.sueldo || emp.contract_wage || '0',
      dist: emp.distribucion?.toString().replace('%', '') || '100',
      cargo: cargoDetectado, 
      sueldo_calc: '0',
      proceso: emp.proceso || ''
    });
    setValoresRegistro(prev => ({ ...prev, asig_fam: emp.asigFam || '0' }));
    setProceso(emp.proceso || '');
    setSeguro(emp.seguro || '');
  };

  // ==========================================
  // 4. MOTOR MATEMÁTICO INTELIGENTE
  // ==========================================
  useEffect(() => {
    if (!datosAuto.sueldo || parseFloat(datosAuto.sueldo) === 0) {
      setDatosAuto(prev => ({ ...prev, sueldo_calc: '0' }));
      setFilasCuentas([]);
      return;
    }

    if (registro) {
      const sueldoOrig = registro.detalle_columnas?.sueldo_base?.toString() || '0';
      const distOrig = registro.detalle_columnas?.distribucion?.toString() || '100';
      
      const vAct = valoresRegistro || {};
      const vOrig = registro.variables_registro || {};
      
      const varsIguales = 
        (vAct.asig_fam || '0').toString() === (vOrig.asig_fam || '0').toString() &&
        (vAct.movilidad || '0').toString() === (vOrig.movilidad || '0').toString() &&
        (vAct.he_25 || '0').toString() === (vOrig.he_25 || '0').toString() &&
        (vAct.he_35 || '0').toString() === (vOrig.he_35 || '0').toString() &&
        (vAct.h_noc || '0').toString() === (vOrig.h_noc || '0').toString() &&
        (vAct.feriados || '0').toString() === (vOrig.feriados || '0').toString() &&
        (vAct.comision || '0').toString() === (vOrig.comision || '0').toString() &&
        (vAct.otrasRemun || '0').toString() === (vOrig.otrasRemun || '0').toString() &&
        (vAct.tarjeta_alim || 'No') === (vOrig.tarjeta_alim || 'No');
      
      if (datosAuto.sueldo === sueldoOrig && datosAuto.dist === distOrig && varsIguales) {
        setDatosAuto(prev => ({ ...prev, sueldo_calc: registro.detalle_columnas?.sueldo_calculo?.toString() || '0' }));
        setFilasCuentas(registro.desglose_contable || []);
        return;
      }
    }

    const sueldoTotal = parseFloat(datosAuto.sueldo) || 0;
    const porcentaje = parseFloat(datosAuto.dist) || 0;
    const sueldoProporcional = (sueldoTotal * porcentaje / 100).toFixed(2);
    
    if (datosAuto.sueldo_calc !== sueldoProporcional) {
      setDatosAuto(prev => ({ ...prev, sueldo_calc: sueldoProporcional }));
    }

    if (sueldoProporcional > 0) {
      const baseCalc = parseFloat(sueldoProporcional) || 0;
      const asig = parseFloat(valoresRegistro.asig_fam) || 0;
      const movilidad = parseFloat(valoresRegistro.movilidad) || 0;
      const he25 = parseFloat(valoresRegistro.he_25) || 0;
      const he35 = parseFloat(valoresRegistro.he_35) || 0;
      const hnoc = parseFloat(valoresRegistro.h_noc) || 0;
      const feriados = parseFloat(valoresRegistro.feriados) || 0;
      const comision = parseFloat(valoresRegistro.comision) || 0;
      const otrasremun = parseFloat(valoresRegistro.otrasRemun) || 0;

      const MONTO_FIJO_TARJETA = 200.00;
      const tarjetaAlim = valoresRegistro.tarjeta_alim === 'Sí' ? MONTO_FIJO_TARJETA : 0;
      const vHora = (baseCalc / 30) / 8; 
      const mHE25 = he25 * vHora * 1.25; 
      const mHE35 = he35 * vHora * 1.35; 
      const mHnoc = hnoc * vHora * 0.35; 
      const mFeriado = feriados * (baseCalc / 30) * 2; 
      const mComision = comision;
      const mOtrasremun = otrasremun;
      const mGratif = (baseCalc + mComision + mHE25 + mHE35 + asig + mFeriado)/6;
      const mVacaciones = (baseCalc + mComision + mHE25 + mHE35 + asig + mFeriado)/12;      
      const mBonifi = seguro === 'EsSalud' ? (mGratif * 0.09) : (seguro === 'EPS' ? (mGratif * 0.0675) : 0);
      const mprestsalud = seguro === 'EsSalud' ? ((baseCalc + mComision + mHE25 + mHE35 + asig + mFeriado) * 0.09) : (seguro === 'EPS' ? ((baseCalc + mComision + mHE25 + mHE35 + asig + mFeriado) * 0.0675) : 0);
      const mSCTR = baseCalc*0.0166;
      const mSVida = baseCalc*0.0037;
      const mEPS = seguro === 'EPS' ? ((baseCalc + mComision + mHE25 + mHE35 + asig + mFeriado) * 0.0225) : 0;
      const mCTS = (baseCalc + mComision + asig + mHE25 + mHE35 + mOtrasremun + (mGratif / 6)) / 6;

      const cuentas = [
        { id: 'c1', cuenta: `${prefijo}6211000 - Sueldos y Salarios Base`, monto: baseCalc.toFixed(2) },        
        { id: 'c2', cuenta: `${prefijo}6214000 - Gratificacion`, monto: mGratif.toFixed(2) },
        { id: 'c3', cuenta: `${prefijo}6215000 - Vacaciones`, monto: mVacaciones.toFixed(2) },
        { id: 'c4', cuenta: `${prefijo}6218000 - Bonificación Extraordinaria`, monto: mBonifi.toFixed(2) },  
        { id: 'c5', cuenta: `${prefijo}6273000 - SCTR, Accid Trabajo y Enf`, monto: mSCTR.toFixed(2) },   
        { id: 'c6', cuenta: `${prefijo}6274000 - Seguro de Vida`, monto: mSVida.toFixed(2) },
        { id: 'c7', cuenta: `${prefijo}6291000 - CTS`, monto: mCTS.toFixed(2) },
      ];
      if (tarjetaAlim > 0) cuentas.push({ id: 'c8', cuenta: `${prefijo}6254000 - Tarjetas Alimentarias`, monto: tarjetaAlim.toFixed(2) });
      if (movilidad > 0) cuentas.push({ id: 'c9', cuenta: `${prefijo}6597000 - Movilidad`, monto: movilidad.toFixed(2) });
      if (asig > 0) cuentas.push({ id: 'c10', cuenta: `${prefijo}6216000 - Asignación Familiar`, monto: asig.toFixed(2)});
      if (mHE25 > 0) cuentas.push({ id: 'c11', cuenta: `${prefijo}6217000 - Horas Extras`, monto: (mHE25+mHE35+mHnoc).toFixed(2) });
      if (mFeriado > 0) cuentas.push({ id: 'c12', cuenta: `${prefijo}6219000 - Domingos y Feriados Laborados`, monto: mFeriado.toFixed(2) });
      if (comision > 0) cuentas.push({ id: 'c13', cuenta: `${prefijo}6212000 - Comision`, monto: mComision.toFixed(2) });
      if (mEPS > 0) cuentas.push({ id: 'c14', cuenta: `${prefijo}6275000 - EPS (2.25%)`, monto: mEPS.toFixed(2) });
      if (mOtrasremun > 0) cuentas.push({ id: 'c15', cuenta: `${prefijo}6220000 - Otras Remuneraciones`, monto: mOtrasremun.toFixed(2) });
      cuentas.push({ id: 'c16', cuenta: `${prefijo}6271000 - Regimen Prestaciones de Salud`, monto: mprestsalud.toFixed(2) });

      setFilasCuentas(prevFilas => {
        return cuentas.map(nuevaFila => {
          const filaExistente = prevFilas.find(f => f.id === nuevaFila.id);
          if (filaExistente && filaExistente.editadoManualmente) {
            return filaExistente; 
          }
          return nuevaFila;
        });
      });
    }
  }, [datosAuto.sueldo, datosAuto.dist, valoresRegistro, registro, prefijo, seguro]);

  // ==========================================
  // 5. GUARDADO MÚLTIPLE Y MANEJADOR IMPRESIÓN
  // ==========================================
  
  // 👈 3. NUEVO MANEJADOR PARA IMPRESIÓN
  const handleImprimirReporte = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 200); 
  };

  const handleGuardar = () => {
    const fechasFinales = [...fechasSeleccionadas];

    if (fechasFinales.length === 0) return alert('Por favor, ingrese al menos una fecha.');
    if (!valorBuscador) return alert('Por favor, seleccione un empleado.');
    if (filasCuentas.length === 0) return alert('No hay conceptos contables calculados para guardar.');

    const nombre = valorBuscador.split(' - ')[1] || valorBuscador;
    const idLoteActual = registro ? (registro.id_lote || `LOTE-${Date.now()}`) : `LOTE-${Date.now()}`;
    const idBaseRegistro = registro ? registro.id_registro.split('-')[0] : `REM-${Date.now()}`;

    const nuevosRegistros = [];

    fechasFinales.forEach((fecha, fIdx) => {
      filasCuentas.forEach((filaCta, cIdx) => {
        const montoFila = parseFloat(filaCta.monto) || 0;
        if (montoFila <= 0) return; 

        const nombreCuentaUpper = filaCta.cuenta.toUpperCase();
        const esAporte = 
          nombreCuentaUpper.includes('SALUD') || 
          nombreCuentaUpper.includes('EPS') || 
          nombreCuentaUpper.includes('SCTR') || 
          nombreCuentaUpper.includes('SEGURO DE VIDA') || 
          nombreCuentaUpper.includes('CTS');

        const ingresosFila = !esAporte ? montoFila : 0;
        const aportesFila = esAporte ? montoFila : 0;

        const idRegistroLinea = `${idBaseRegistro}-${fIdx}-${cIdx}`;

        nuevosRegistros.push({
          id_registro: idRegistroLinea,
          id_lote: idLoteActual,
          modulo: 'Remuneraciones',
          categoria: 'Remuneraciones',
          area: area || datosAuto.area || 'Administración',
          idVersion: registro ? registro.idVersion : undefined, 
          fecha_proyeccion: fecha,
          empleado_dni: datosAuto.dni || '-',
          empleado_nombre: nombre,
          detalle_columnas: {
            cuenta_afectada: filaCta.cuenta,
            sueldo_base: parseFloat(datosAuto.sueldo) || 0,
            asig_familiar: parseFloat(valoresRegistro.asig_fam) || 0,
            proceso: proceso,
            seguro: seguro,
            distribucion: parseFloat(datosAuto.dist) || 0,
            sueldo_calculo: parseFloat(datosAuto.sueldo_calc) || 0,
            costo_total: montoFila,
            cargo: datosAuto.cargo, // Guardamos también el cargo en las columnas
            es_desglose_individual: true
          },
          totales: { 
            ingresos: ingresosFila, 
            aportes: aportesFila, 
            costo_total: montoFila 
          },
          desglose_contable: [filaCta], 
          variables_registro: valoresRegistro 
        });
      });
    });

    if (nuevosRegistros.length === 0) {
      return alert('Debe haber al menos un concepto con monto mayor a 0 para guardar.');
    }

    onGuardar(nuevosRegistros);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      <fieldset disabled={isSoloLectura} style={{ border: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="offcanvas-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
        {/* 0. FECHAS */}
        <div className="form-section">
          <div className="form-section-title">0. Fechas de Aplicación</div>

          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            {ANIOS_DISPONIBLES.map(anio => (
              <button
                key={anio}
                type="button"
                onClick={() => setAnioActivo(anio)}
                style={{
                  padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                  border: anio === anioActivo ? '1px solid var(--primary-600, #2563eb)' : '1px solid var(--line, #cbd5e1)',
                  background: anio === anioActivo ? 'var(--primary-600, #2563eb)' : 'white',
                  color: anio === anioActivo ? 'white' : '#475569',
                }}
              >
                {anio}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px', marginBottom: '10px' }}>
            {MESES.map((mes, i) => {
              const activo = estaSeleccionado(anioActivo, i);
              return (
                <button
                  key={mes}
                  type="button"
                  onClick={() => toggleMes(anioActivo, i)}
                  style={{
                    padding: '8px 4px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                    border: activo ? '1px solid #166534' : '1px solid var(--line, #cbd5e1)',
                    background: activo ? '#f0fdf4' : 'white',
                    color: activo ? '#166534' : '#475569',
                  }}
                >
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

        {/* 1. DATOS GENERALES */}
        <div className="form-section">
          <div className="form-section-title">1. Información General</div>
          
          {/* BUSCADOR DE EMPLEADOS OPTIMIZADO (A PARTIR DE 3 CARACTERES) */}
          <div className="form-group" style={{ marginBottom: '16px', position: 'relative' }}>
            <label style={{ color: 'var(--primary-600, #2563eb)' }}>BUSCAR EMPLEADO (MÍNIMO 3 CARACTERES)</label>
            <input 
              type="text"
              value={valorBuscador}
              onChange={handleBusquedaEmpleadoChange}
              onFocus={() => { if (valorBuscador.trim().length >= 3) setMostrarSugerencias(true); }}
              placeholder="Escriba DNI o Nombre..." 
              autoComplete="off" 
              style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px' }}
            />

            {/* LISTA DESPLEGABLE FLOTANTE DE SUGERENCIAS */}
            {mostrarSugerencias && empleadosSugeridos.length > 0 && (
              <ul style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 99,
                background: 'white', border: '1px solid #cbd5e1', borderRadius: '0 0 6px 6px',
                maxHeight: '180px', overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
              }}>
                {empleadosSugeridos.map((emp, i) => (
                  <li
                    key={emp.dni || emp.id || i}
                    onClick={() => seleccionarEmpleado(emp)}
                    style={{
                      padding: '10px 12px', fontSize: '12px', borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer', display: 'flex', justifyContent: 'space-between'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <span style={{ fontWeight: 'bold' }}>{emp.dni || emp.id}</span>
                    <span style={{ color: '#334155' }}>{emp.nombre}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label>SUELDO BASE TOTAL (S/)</label>
              <input 
                type="number" 
                value={datosAuto.sueldo} 
                onChange={e => setDatosAuto(prev => ({ ...prev, sueldo: e.target.value }))} 
                style={{ width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '4px', background: 'white' }} 
              />
            </div>
            <div className="form-group">
              <label>SUELDO PARA CÁLCULO (S/)</label>
              <input type="number" value={datosAuto.sueldo_calc} readOnly style={{ width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '4px', background: '#f8fafc' }} />
            </div>
            <div className="form-group">
              <label>DISTRIBUCIÓN (%)</label>
              <input 
                type="number" 
                value={datosAuto.dist} 
                onChange={e => setDatosAuto(prev => ({ ...prev, dist: e.target.value }))} 
                style={{ width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '4px' }} 
              />
            </div>
            <div className="form-group">
              <label>CARGO ASIGNADO</label>
              <input type="text" value={datosAuto.cargo} readOnly style={{ width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '4px', background: '#f8fafc' }} />            
            </div>
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Proceso</label>
                <select 
                  value={proceso} 
                  onChange={e => setProceso(e.target.value)} 
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', background: 'white' }}
                >
                  <option value="">-- Seleccione --</option>
                  {PROCESOS_PRODUCTIVOS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Tipo de Seguro</label>
                <select 
                  value={seguro} 
                  onChange={e => setSeguro(e.target.value)} 
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--line, #cbd5e1)', borderRadius: '4px', background: 'white' }}
                >
                  <option value="">Seleccione seguro...</option>
                  <option value="EsSalud">EsSalud</option>
                  <option value="EPS">EPS</option>
                </select>
              </div>
              
          </div>
        </div>

        {/* 2. VARIABLES DE REGISTRO */}
        <div className="form-section">
          <div className="form-section-title">2. Variables de Registro</div>
          <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group"><label>ASIGNACIÓN FAMILIAR (S/)</label><input type="number" value={valoresRegistro.asig_fam} onChange={e => setValoresRegistro({...valoresRegistro, asig_fam: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--line)' }} /></div>
            <div className="form-group"><label>MOVILIDAD (S/)</label><input type="number" value={valoresRegistro.movilidad} onChange={e => setValoresRegistro({...valoresRegistro, movilidad: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--line)' }} /></div>

            <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
 
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <label>HE 25% (CANT.)</label>
                <input type="number" value={valoresRegistro.he_25} onChange={e => setValoresRegistro({...valoresRegistro, he_25: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--line)' }} />
              </div>
              
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <label>HE 35% (CANT.)</label>
                <input type="number" value={valoresRegistro.he_35} onChange={e => setValoresRegistro({...valoresRegistro, he_35: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--line)' }} />
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <label>HORAS NOCTURNAS</label>
                <input type="number" value={valoresRegistro.h_noc} onChange={e => setValoresRegistro({...valoresRegistro, h_noc: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--line)' }} />
              </div>

            </div>

            <div className="form-group"><label>DOM/FERIADOS LABORADOS</label><input type="number" value={valoresRegistro.feriados} onChange={e => setValoresRegistro({...valoresRegistro, feriados: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--line)' }} /></div>

            <div className="form-group"><label>COMISION</label><input type="number" value={valoresRegistro.comision} onChange={e => setValoresRegistro({...valoresRegistro, comision: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--line)' }} /></div>
            <div className="form-group">
              <label>TARJETA ALIMENTARIA</label>
              <select 
                value={valoresRegistro.tarjeta_alim} 
                onChange={e => setValoresRegistro({...valoresRegistro, tarjeta_alim: e.target.value})} 
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--line)', background: 'white' }} 
              >
                <option value="No">No</option>
                <option value="Sí">Sí</option>
              </select>
            </div>
            <div className="form-group"><label>OTRAS REMUNERACIONES</label><input type="number" value={valoresRegistro.otrasRemun} onChange={e => setValoresRegistro({...valoresRegistro, otrasRemun: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--line)' }} /></div>
          </div>
        </div>

        {/* 3. IMPACTO CONTABLE */}
        <div className="form-section" style={{ marginTop: 'auto' }}>

          <div className="form-section-title">3. Impacto Contable (Calculado Automáticamente)</div>
          
          <div style={{ background: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', padding: '12px' }}>

            {filasCuentas.map((f) => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '13px', color: '#475569' }}>
                
                <span>{f.cuenta}</span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <span style={{ fontWeight: 600 }}>S/</span>
                  <input 
                    type="number" 
                    step="0.01"
                    value={f.monto} 
                    onChange={(e) => {
                      const nuevoMonto = e.target.value;
                      setFilasCuentas(filasCuentas.map(cuenta => 
                        cuenta.id === f.id ? { ...cuenta, monto: nuevoMonto, editadoManualmente: true } : cuenta
                      ));
                    }}
                    style={{ 
                      width: '80px', 
                      textAlign: 'right', 
                      fontWeight: 600, 
                      fontSize: '13px',
                      color: '#475569',
                      border: '1px solid transparent', 
                      borderRadius: '4px',
                      padding: '2px 4px',
                      outline: 'none',
                      background: 'transparent',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => { e.target.style.border = '1px solid var(--primary-600, #2563eb)'; e.target.style.background = 'white'; }}
                    onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; }}
                  />
                </div>

              </div>
            ))}

          </div>

          <div className="calc-total" style={{ marginTop: '16px', padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#166534', fontSize: '16px' }}>
              <span>Total Proyectado (Por Fecha)</span>
              <span>S/ {filasCuentas.reduce((s, f) => s + (parseFloat(f.monto)||0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>

          </div>
        </div>

      </div>
    </fieldset>

      {/* 🖨️ 4. BLOQUE EXCLUSIVO PARA IMPRESIÓN (USANDO PORTAL) */}
      {isPrinting && createPortal(
        <div className="reporte-impresion-solo">
          <div className="reporte-header">
            <div className="reporte-titulo">REPORTE INDIVIDUAL DE REMUNERACIONES</div>
            <div style={{ fontSize: '10px', marginTop: '4px', textAlign: 'center' }}>
              Área Seleccionada: <strong>{area || 'No definida'}</strong> | Fechas a proyectar: <strong>{fechasSeleccionadas.length} mes(es)</strong>
            </div>
          </div>

          {/* SECCIÓN 1: DATOS DEL EMPLEADO */}
          <div className="reporte-seccion">
            <div className="reporte-seccion-titulo">1. Datos del Empleado</div>
            <table>
              <tbody>
                <tr>
                  <th style={{ width: '20%' }}>Empleado:</th>
                  <td style={{ width: '30%', fontWeight: 'bold' }}>{valorBuscador || 'No Seleccionado'}</td>
                  <th style={{ width: '20%' }}>Cargo:</th>
                  <td style={{ width: '30%' }}>{datosAuto.cargo || '-'}</td>
                </tr>
                <tr>
                  <th>Sueldo Base Total:</th>
                  <td>S/ {parseFloat(datosAuto.sueldo || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                  <th>Distribución (%):</th>
                  <td>{datosAuto.dist}% (S/ {parseFloat(datosAuto.sueldo_calc || 0).toLocaleString('en-US', {minimumFractionDigits: 2})})</td>
                </tr>
                <tr>
                  <th>Proceso:</th>
                  <td>{proceso || 'No asignado'}</td>
                  <th>Seguro de Salud:</th>
                  <td>{seguro || 'No asignado'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* SECCIÓN 2: VARIABLES DE REGISTRO */}
          <div className="reporte-seccion">
            <div className="reporte-seccion-titulo">2. Variables Adicionales (Meses Proyectados)</div>
            <table>
              <thead>
                <tr>
                  <th>Asignación Fam.</th>
                  <th>Movilidad</th>
                  <th>Horas Extras (25% / 35%)</th>
                  <th>Horas Nocturnas</th>
                  <th>Dom/Feriados</th>
                  <th>Comisiones</th>
                  <th>Tarj. Alim.</th>
                  <th>Otras Rem.</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>S/ {parseFloat(valoresRegistro.asig_fam || 0).toFixed(2)}</td>
                  <td>S/ {parseFloat(valoresRegistro.movilidad || 0).toFixed(2)}</td>
                  <td>{valoresRegistro.he_25} / {valoresRegistro.he_35} (hrs)</td>
                  <td>{valoresRegistro.h_noc} (hrs)</td>
                  <td>{valoresRegistro.feriados} (días)</td>
                  <td>S/ {parseFloat(valoresRegistro.comision || 0).toFixed(2)}</td>
                  <td>{valoresRegistro.tarjeta_alim}</td>
                  <td>S/ {parseFloat(valoresRegistro.otrasRemun || 0).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* SECCIÓN 3: DESGLOSE CONTABLE */}
          <div className="reporte-seccion">
            <div className="reporte-seccion-titulo">3. Impacto Contable y Desglose de Costos</div>
            <table>
              <thead>
                <tr>
                  <th>Código y Nombre de la Cuenta Contable</th>
                  <th style={{ width: '120px' }}>Monto (Soles)</th>
                </tr>
              </thead>
              <tbody>
                {filasCuentas.map((f, idx) => (
                  <tr key={idx}>
                    <td style={{ textAlign: 'left', fontSize: '10px' }}>{f.cuenta}</td>
                    <td style={{ fontWeight: 'bold' }}>S/ {parseFloat(f.monto || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px', fontSize: '12px', border: '1px solid #cbd5e1', borderTop: 'none', background: '#f8fafc' }}>
              <span><strong>Costo Total Proyectado Mensual por Empleado:</strong></span>
              <span><strong>S/ {filasCuentas.reduce((s, f) => s + (parseFloat(f.monto)||0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></span>
            </div>
          </div>
          
        </div>,
        document.body
      )}

      {/* 5. FOOTER DE BOTONES CON EL DE IMPRESIÓN */}
      <div className="offcanvas-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', gap: '12px', justifyContent: 'flex-end', background: 'white' }}>
        
        {/* 🖨️ NUEVO BOTÓN DE IMPRESIÓN */}
        <button 
          type="button" 
          onClick={handleImprimirReporte} 
          style={{ background: '#475569', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          🖨️ Imprimir / Exportar PDF
        </button>

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