import React, { useMemo, useState } from 'react';
import { API_URL } from '../../config/api';
import { listarVersiones, inicializarDatos } from '../../data/store';
import { etiquetaProceso, procesosDeArea } from '../../config/areas';
import { generarDistribucionCalidad } from '../../config/distribucionCalidad';
import {
  detectarTipo, leerProcesosProduccion, leerProyectado, decisionesDeProceso,
  registrosDeProyectado, porcentajesCalidad, registrosDeForecast,
} from '../../config/importarExcel';
import { leerDetalleCrisoles, leerDetalleFundente, registrosDeDetalle, totalesDetalle, CUENTAS_REEMPLAZADAS, MESES_P } from '../../config/importarProduccion';

// =====================================================================
// IMPORTAR EXCEL (solo administradores)
// 1) Se eligen los archivos: proyectado de gastos, forecast de ventas y, opcional, los FP26 de
//    producción. De ellos se toman los procesos sugeridos (trabajador y cuenta) y el DETALLE de
//    materia prima y envases por insumo y producto, que reemplaza a los montos globales de esas
//    cuentas; además el costo unitario del Excel queda como referencia para comparar el costeo.
// 2) Vista previa: totales por área, procesos sugeridos (editables) y la distribución de Calidad.
// 3) Se carga en una versión nueva o existente. Volver a importar el mismo tipo reemplaza lo anterior.
// =====================================================================
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const fmt = (v, d = 0) => num(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const TAM_PARTE = 400;

const valorCelda = (v) => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return v.result instanceof Date ? v.result : v.result ?? null;
    if (v.richText) return v.richText.map(t => t.text).join('');
    if ('text' in v) return v.text;
    if (v.error) return null;
  }
  return v;
};

async function leerArchivo(archivo) {
  const ExcelJS = (await import('exceljs')).default;
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  const nombres = libro.worksheets.map(w => w.name);
  const esProduccion = nombres.some(n => ['CosCris', 'Remunr', 'Comp_FPROY'].includes(n));
  const aLeer = esProduccion ? libro.worksheets.filter(w => ['CosCris', 'Remunr', 'Costeo Fundente', 'Comp_FPROY', 'BOM', 'CostosUnit'].includes(w.name)) : [libro.worksheets[0]];
  const hojas = {};
  aLeer.forEach(ws => {
    // En producción se conservan las filas vacías: separan los bloques de las hojas de costeo.
    const filas = [];
    ws.eachRow({ includeEmpty: esProduccion }, (row, n) => {
      const valores = row.values.slice(1).map(valorCelda);
      if (esProduccion) filas[n - 1] = valores; else filas.push(valores);
    });
    for (let i = 0; i < filas.length; i++) if (!filas[i]) filas[i] = [];
    hojas[ws.name] = filas;
  });
  if (esProduccion) nombres.forEach(n => { if (!hojas[n]) hojas[n] = []; });
  return { nombre: archivo.name, tipo: detectarTipo(hojas), hojas };
}

export default function ImportarExcel() {
  const versiones = listarVersiones();
  const [archivos, setArchivos] = useState([]);
  const [leyendo, setLeyendo] = useState(false);
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [destino, setDestino] = useState('nueva');
  const [nombreVersion, setNombreVersion] = useState('');
  const [versionExistente, setVersionExistente] = useState(versiones[versiones.length - 1]?.id_version || '');
  const [tipoCambio, setTipoCambio] = useState('3.5');
  const [elegidos, setElegidos] = useState({});
  const [areaVista, setAreaVista] = useState('');
  const [progreso, setProgreso] = useState(null);
  const [error, setError] = useState('');

  const agregar = async (lista) => {
    setError('');
    setLeyendo(true);
    try {
      const leidos = [];
      for (const f of lista) leidos.push(await leerArchivo(f));
      setArchivos(prev => [...prev.filter(a => !leidos.some(l => l.nombre === a.nombre)), ...leidos]);
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e.message}`);
    } finally {
      setLeyendo(false);
    }
  };

  // ---------- análisis ----------
  const analisis = useMemo(() => {
    const procesos = { empleados: {}, cuentas: {} };
    archivos.filter(a => a.tipo === 'produccion').forEach(a => {
      const p = leerProcesosProduccion(a.hojas);
      Object.assign(procesos.empleados, p.empleados);
      Object.assign(procesos.cuentas, p.cuentas);
    });
    let movimientos = [];
    const avisos = { sinArea: 0, otroAnio: 0, sinMonto: 0 };
    archivos.filter(a => a.tipo === 'proyectado').forEach(a => {
      const r = leerProyectado(Object.values(a.hojas)[0], anio);
      movimientos = movimientos.concat(r.movimientos);
      Object.keys(avisos).forEach(k => { avisos[k] += r.avisos[k]; });
    });
    // Detalle de materia prima y envases de los FP26 (Crisoles: CosCris; Fundente: Costeo Fundente + Comp_FPROY).
    const detalles = [];
    archivos.filter(a => a.tipo === 'produccion').forEach(a => {
      const d = a.hojas.CosCris?.length ? leerDetalleCrisoles(a.hojas) : leerDetalleFundente(a.hojas);
      if (d && (d.mp.length || d.envases.length) && !detalles.some(x => x.area === d.area)) detalles.push(d);
    });
    // Comparación con lo que el proyectado general trae en esas cuentas (el detalle lo reemplaza).
    const comparacionDetalle = detalles.map(d => {
      const t = totalesDetalle(d);
      const general = { mp: Array(12).fill(0), env: Array(12).fill(0) };
      movimientos.forEach(m => {
        if (m.area !== d.area) return;
        if (m.base.startsWith('6121')) general.mp[m.mes] += m.monto;
        else if (m.base.startsWith('614')) general.env[m.mes] += m.monto;
      });
      const difs = [];
      MESES_P.forEach((mes, i) => {
        [['mp', 'materia prima'], ['env', 'envases']].forEach(([k, et]) => {
          if (Math.abs(t[k][i] - general[k][i]) >= 1) difs.push(`${mes} ${et}: detalle ${fmt(t[k][i])} vs proyectado ${fmt(general[k][i])}`);
        });
      });
      const suma = (arr) => arr.reduce((a, v) => a + v, 0);
      return { area: d.area, mp: suma(t.mp), env: suma(t.env), mpGeneral: suma(general.mp), envGeneral: suma(general.env), difs, detalle: d };
    });
    // Los montos globales de esas cuentas se reemplazan por el detalle (solo si hay proyectado).
    if (movimientos.length && detalles.length) {
      const areasDetalle = detalles.map(d => d.area);
      movimientos = movimientos.filter(m => !(areasDetalle.includes(m.area) && CUENTAS_REEMPLAZADAS.some(c => m.base.startsWith(c))));
    }
    const decisiones = decisionesDeProceso(movimientos, procesos);
    const pctCalidad = porcentajesCalidad(movimientos);
    const forecastArchivo = archivos.find(a => a.tipo === 'forecast');
    const forecast = forecastArchivo ? registrosDeForecast(Object.values(forecastArchivo.hojas)[0], { idVersion: 'x', anio, tipoCambio }) : { registros: [], sinCuenta: [] };
    const porArea = {};
    movimientos.forEach(m => { porArea[m.area] = (porArea[m.area] || 0) + m.monto; });
    if (movimientos.length) comparacionDetalle.forEach(c => { porArea[c.area] = (porArea[c.area] || 0) + c.mp + c.env; });
    return { procesos, movimientos, avisos, decisiones, pctCalidad, forecast, porArea, comparacionDetalle };
  }, [archivos, anio, tipoCambio]);

  const areasDecision = [...new Set(analisis.decisiones.map(d => d.area))];
  const areaActiva = areaVista || areasDecision[0] || '';
  const hayAlgo = analisis.movimientos.length > 0 || analisis.forecast.registros.length > 0;

  // ---------- carga ----------
  const enviar = async (idVersion, idLote, registros, etiqueta, archivo) => {
    const partes = Math.max(1, Math.ceil(registros.length / TAM_PARTE));
    for (let i = 0; i < partes; i++) {
      setProgreso({ etiqueta, parte: i + 1, partes });
      const resp = await fetch(`${API_URL}/api/presupuesto/importar-excel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_version: idVersion, id_lote: idLote, parte: i, total_partes: partes, archivo, registros: registros.slice(i * TAM_PARTE, (i + 1) * TAM_PARTE) }),
      });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(d.error || `Error ${resp.status} en ${etiqueta}`);
    }
  };

  const importar = async () => {
    setError('');
    try {
      let idVersion = versionExistente;
      if (destino === 'nueva') {
        if (!nombreVersion.trim()) throw new Error('Escribe el nombre de la nueva versión.');
        const usados = versiones.map(v => parseInt(String(v.id_version).replace(/^v/i, ''), 10)).filter(n => !Number.isNaN(n));
        idVersion = `v${usados.length ? Math.max(...usados) + 1 : 1}`;
        setProgreso({ etiqueta: 'Creando versión', parte: 1, partes: 1 });
        const r = await fetch(`${API_URL}/api/versiones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: { id_version: idVersion, nombre: nombreVersion.trim() } }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo crear la versión');
      }
      if (!idVersion) throw new Error('Elige la versión de destino.');
      const nombreArchivos = archivos.map(a => a.nombre).join(', ');

      if (analisis.movimientos.length) {
        const gastos = registrosDeProyectado(analisis.movimientos, { idVersion, anio, elegidos, decisiones: analisis.decisiones });
        await enviar(idVersion, `IMPORT-GASTOS-${anio}`, gastos, 'Gastos', nombreArchivos);
        // Detalle de producción: se envía siempre por área (vacío si no vino su FP26, así no queda
        // un detalle anterior sumado a los montos globales del nuevo proyectado).
        for (const [area, clave] of [['Producción Crisoles', 'CRI'], ['Producción Fundente', 'FUN']]) {
          const c = analisis.comparacionDetalle.find(x => x.area === area);
          const regs = c ? registrosDeDetalle(c.detalle, { idVersion, anio }) : [];
          await enviar(idVersion, `IMPORT-DETALLE-${clave}-${anio}`, regs, `Detalle ${area}`, nombreArchivos);
        }
        const gastosCalidad = gastos.filter(r => r.area === 'Calidad');
        if (gastosCalidad.length && Object.keys(analisis.pctCalidad).length) {
          const lote = generarDistribucionCalidad({ idVersion, gastosCalidad, porcentajes: analisis.pctCalidad, activar: true, fechaBase: `${anio}-01-01` });
          await enviar(idVersion, `DIST-CAL-${idVersion}`, lote, 'Distribución de Calidad', nombreArchivos);
        }
      }
      if (analisis.forecast.registros.length) {
        const { registros } = registrosDeForecast(Object.values(archivos.find(a => a.tipo === 'forecast').hojas)[0], { idVersion, anio, tipoCambio });
        await enviar(idVersion, `IMPORT-FORECAST-${anio}`, registros, 'Forecast', nombreArchivos);
      }
      setProgreso({ etiqueta: 'Actualizando datos', parte: 1, partes: 1 });
      await inicializarDatos();
      window.dispatchEvent(new CustomEvent('presupuesto:recargado'));
      setProgreso(null);
      alert(`Importación terminada en la versión ${idVersion.toUpperCase()}.`);
    } catch (e) {
      setProgreso(null);
      setError(e.message);
    }
  };

  // ---------- estilos ----------
  const card = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '18px', marginBottom: '16px' };
  const th = { padding: '7px 10px', fontSize: '11px', color: '#475569', textAlign: 'left', borderBottom: '2px solid #e2e8f0', background: '#f8fafc' };
  const td = { padding: '6px 10px', fontSize: '12.5px', borderBottom: '1px solid #f1f5f9' };
  const inp = { padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' };
  const TIPOS = { proyectado: ['📊 Proyectado de gastos', '#2563eb'], forecast: ['📈 Forecast de ventas', '#16a34a'], produccion: ['🏭 Producción (procesos, detalle de MP y envases)', '#ea580c'] };

  return (
    <section style={{ flex: 1, padding: '24px', maxWidth: '1300px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Administración</div>
      <h2 style={{ margin: '4px 0 4px', fontSize: '22px', color: '#0f172a' }}>📥 Importar Excel</h2>
      <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '16px' }}>
        Carga el proyectado de gastos y el forecast de ventas a una versión. Si agregas los archivos de producción (FP26), se usan sus procesos (hojas Remunr y CosCris) y se sube el detalle de materia prima y envases por insumo y producto (CosCris en Crisoles; Costeo Fundente y Comp_FPROY en Fundente), junto con el costo unitario del Excel para compararlo con el costeo del sistema.
      </div>

      {error && <div role="alert" style={{ ...card, background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>{error}</div>}

      <div style={card}>
        <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>1. Archivos</h3>
        <input type="file" multiple accept=".xlsx,.xlsm" disabled={leyendo || !!progreso} onChange={e => { agregar([...e.target.files]); e.target.value = ''; }} />
        {leyendo && <span style={{ marginLeft: '10px', color: '#64748b', fontSize: '13px' }}>Leyendo archivo...</span>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
          {archivos.map(a => (
            <div key={a.nombre} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
              <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, color: 'white', background: TIPOS[a.tipo]?.[1] || '#94a3b8' }}>{TIPOS[a.tipo]?.[0] || '❓ No reconocido'}</span>
              <span>{a.nombre}</span>
              <button type="button" className="btn-ghost" onClick={() => setArchivos(archivos.filter(x => x !== a))}>Quitar</button>
            </div>
          ))}
        </div>
      </div>

      {archivos.length > 0 && (
        <div style={card}>
          <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>2. Destino</h3>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>AÑO<br /><input type="number" value={anio} onChange={e => setAnio(e.target.value)} style={{ ...inp, width: '90px' }} /></label>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>TIPO DE CAMBIO (forecast)<br /><input type="number" step="0.01" value={tipoCambio} onChange={e => setTipoCambio(e.target.value)} style={{ ...inp, width: '90px' }} /></label>
            <label style={{ fontSize: '13px' }}><input type="radio" checked={destino === 'nueva'} onChange={() => setDestino('nueva')} /> Nueva versión</label>
            {destino === 'nueva' && <input placeholder={`Ej. Presupuesto ${anio} (Excel)`} value={nombreVersion} onChange={e => setNombreVersion(e.target.value)} style={{ ...inp, width: '260px' }} />}
            <label style={{ fontSize: '13px' }}><input type="radio" checked={destino === 'existente'} onChange={() => setDestino('existente')} /> Versión existente</label>
            {destino === 'existente' && (
              <select value={versionExistente} onChange={e => setVersionExistente(e.target.value)} style={inp}>
                {versiones.map(v => <option key={v.id_version} value={v.id_version}>{v.id_version.toUpperCase()} - {v.nombre}</option>)}
              </select>
            )}
          </div>
          {destino === 'existente' && <div style={{ fontSize: '11.5px', color: '#b45309', marginTop: '8px' }}>Si ya importaste en esa versión para {anio}, lo anterior del mismo tipo (gastos / forecast) se reemplaza.</div>}
        </div>
      )}

      {hayAlgo && (
        <div style={card}>
          <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>3. Vista previa</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            {analisis.movimientos.length > 0 && (
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Área (gastos {anio})</th><th style={{ ...th, textAlign: 'right' }}>Monto S/</th></tr></thead>
                  <tbody>
                    {Object.entries(analisis.porArea).sort((a, b) => b[1] - a[1]).map(([a, v]) => (
                      <tr key={a}><td style={td}>{a}{a === 'Calidad' && <span style={{ color: '#64748b', fontSize: '11px' }}> (cuenta 6 base, se reparte)</span>}</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(v)}</td></tr>
                    ))}
                    <tr><td style={{ ...td, fontWeight: 800 }}>TOTAL</td><td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{fmt(Object.values(analisis.porArea).reduce((a, v) => a + v, 0))}</td></tr>
                  </tbody>
                </table>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                  {analisis.avisos.sinMonto > 0 && `${fmt(analisis.avisos.sinMonto)} filas en cero se omiten. `}
                  {analisis.avisos.otroAnio > 0 && `${fmt(analisis.avisos.otroAnio)} filas de otro año se omiten. `}
                  {analisis.avisos.sinArea > 0 && <b style={{ color: '#b91c1c' }}>{fmt(analisis.avisos.sinArea)} filas sin área reconocida se omiten.</b>}
                </div>
                {Object.keys(analisis.pctCalidad).length > 0 && (
                  <div style={{ marginTop: '10px', fontSize: '12.5px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '8px 10px' }}>
                    <b>Distribución de Calidad</b> (según cómo la repartía el Excel): {Object.entries(analisis.pctCalidad).map(([d, p]) => `${d.replace('Producción ', '')} ${p}%`).join(' · ')}. Se aplica automáticamente.
                  </div>
                )}
              </div>
            )}
            {analisis.comparacionDetalle.length > 0 && (
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Detalle de producción (FP26)</th><th style={{ ...th, textAlign: 'right' }}>Materia prima S/</th><th style={{ ...th, textAlign: 'right' }}>Envases S/</th></tr></thead>
                  <tbody>
                    {analisis.comparacionDetalle.map(c => (
                      <React.Fragment key={c.area}>
                        <tr><td style={{ ...td, fontWeight: 700 }}>{c.area} · detalle</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(c.mp)}</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(c.env)}</td></tr>
                        <tr><td style={{ ...td, color: '#64748b' }}>en el proyectado general</td><td style={{ ...td, textAlign: 'right', color: '#64748b' }}>{fmt(c.mpGeneral)}</td><td style={{ ...td, textAlign: 'right', color: '#64748b' }}>{fmt(c.envGeneral)}</td></tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                  {analisis.movimientos.length
                    ? 'El detalle por insumo y producto reemplaza a esos montos globales (cuentas 6121 y 614x) y el costo unitario del Excel queda como referencia en el costeo.'
                    : <b style={{ color: '#b91c1c' }}>Agrega también el archivo de proyectado: el detalle reemplaza a sus montos globales y no se importa solo.</b>}
                </div>
                {analisis.comparacionDetalle.some(c => c.difs.length) && (
                  <div style={{ fontSize: '11px', color: '#b45309', marginTop: '6px' }}>
                    Diferencias con el proyectado: {analisis.comparacionDetalle.flatMap(c => c.difs.map(d => `${c.area.replace('Producción ', '')} ${d}`)).join(' · ')}
                  </div>
                )}
              </div>
            )}
            {analisis.forecast.registros.length > 0 && (
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Forecast {anio} · unidad de negocio</th><th style={{ ...th, textAlign: 'right' }}>Líneas</th><th style={{ ...th, textAlign: 'right' }}>Venta US$</th></tr></thead>
                  <tbody>
                    {Object.entries(analisis.forecast.registros.reduce((acc, r) => { const u = r.detalle_columnas.unidad_negocio; acc[u] = acc[u] || { n: 0, v: 0 }; acc[u].n++; acc[u].v += r.totales.ingreso_total; return acc; }, {}))
                      .sort((a, b) => b[1].v - a[1].v).map(([u, x]) => (
                        <tr key={u}><td style={td}>{u}</td><td style={{ ...td, textAlign: 'right' }}>{x.n}</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(x.v)}</td></tr>
                      ))}
                  </tbody>
                </table>
                {analisis.forecast.sinCuenta.length > 0 && <div style={{ fontSize: '11.5px', color: '#b91c1c', marginTop: '6px' }}>Sin cuenta contable: {analisis.forecast.sinCuenta.join(', ')}</div>}
              </div>
            )}
          </div>

          {analisis.decisiones.length > 0 && (
            <div style={{ marginTop: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <b style={{ fontSize: '14px' }}>Procesos de producción (sugeridos, puedes cambiarlos)</b>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {areasDecision.map(a => <button key={a} type="button" onClick={() => setAreaVista(a)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: a === areaActiva ? '#2563eb' : 'white', color: a === areaActiva ? 'white' : '#334155', fontSize: '12px', cursor: 'pointer' }}>{a}</button>)}
                </div>
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', margin: '4px 0 8px' }}>
                {Object.keys(analisis.procesos.empleados).length ? `${Object.keys(analisis.procesos.empleados).length} trabajadores y ${Object.keys(analisis.procesos.cuentas).length} cuentas con proceso tomado de los archivos de producción. ` : 'Sin archivo de producción: se sugiere materia prima → 1er proceso, envases/suministros → 2do, lo demás → compartido. '}
              </div>
              <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={{ ...th, position: 'sticky', top: 0 }}>Trabajador / cuenta</th><th style={{ ...th, position: 'sticky', top: 0 }}>Módulo</th><th style={{ ...th, position: 'sticky', top: 0, textAlign: 'right' }}>Monto S/</th><th style={{ ...th, position: 'sticky', top: 0 }}>Proceso</th></tr></thead>
                  <tbody>
                    {analisis.decisiones.filter(d => d.area === areaActiva).map(d => (
                      <tr key={d.clave}>
                        <td style={td}>{d.tipo === 'trabajador' ? '👤 ' : ''}{d.etiqueta}</td>
                        <td style={{ ...td, color: '#64748b', fontSize: '11.5px' }}>{d.modulo}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmt(d.monto)}</td>
                        <td style={td}>
                          <select value={elegidos[d.clave] || d.sugerido} onChange={e => setElegidos({ ...elegidos, [d.clave]: e.target.value })} style={{ ...inp, padding: '4px 6px', fontSize: '12px', borderColor: elegidos[d.clave] ? '#f59e0b' : '#cbd5e1' }}>
                            {procesosDeArea(d.area).map(p => <option key={p} value={p}>{etiquetaProceso(p)}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
            {progreso && <span style={{ fontSize: '13px', color: '#1d4ed8', fontWeight: 600 }}>⏳ {progreso.etiqueta}: parte {progreso.parte} de {progreso.partes}...</span>}
            <button type="button" onClick={importar} disabled={!!progreso} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 800, cursor: progreso ? 'wait' : 'pointer' }}>📥 Importar</button>
          </div>
        </div>
      )}
    </section>
  );
}
