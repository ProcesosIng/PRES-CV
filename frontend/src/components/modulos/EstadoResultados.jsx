import React, { useState, useEffect, useMemo, useRef } from 'react';
import { API_URL } from '../../config/api';
import { exportarTablasHtml } from '../../config/excel';

// Atributos para Excel: el valor exacto de la celda (en pantalla se ve abreviado).
const xl = (v, formato = 'moneda') => (v === null || v === undefined || !Number.isFinite(v) ? {} : { 'data-valor': v, 'data-formato': formato });
import { LINEAS_EERR, MESES_EERR, calcularProyectado, calcularEjecutado, lineasPeriodo } from '../../config/eerr';

// Estado de Resultados: PROYECTADO (lo registrado en el sistema) vs EJECUTADO (asientos de Odoo).
const ESTILO_FILA = {
  venta: { background: '#c7d2fe', fontWeight: 800 },
  costo: { background: '#fecdd3', fontWeight: 700 },
  gasto: { background: '#fda4af', fontWeight: 800 },
  subgasto: { background: '#ffe4e6', fontWeight: 600, paddingLeft: '22px' },
  utilidad: { background: '#fde68a', fontWeight: 800 },
  pct: { background: '#fef3c7', fontWeight: 700, fontStyle: 'italic' },
  depre: { background: '#ddd6fe', fontWeight: 700 },
  otros: { background: '#dcfce7', fontWeight: 700 },
  difcamb: { background: '#bae6fd', fontWeight: 700 },
  impuesto: { background: '#e9d5ff', fontWeight: 700 },
};

const miles = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '';
  if (Math.abs(v) < 0.005) return '';
  const abs = Math.abs(v);
  const txt = abs >= 1000 ? `${(abs / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil` : abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return `${v < 0 ? '-' : ''}S/ ${txt}`;
};
const pct = (v) => (v === null || v === undefined || Number.isNaN(v) ? '' : `${(v * 100).toFixed(1)} %`);

export default function EstadoResultados({ registrosTotales = [], versiones = [], idVersionFiltro = '' }) {
  const idVersion = idVersionFiltro || versiones[versiones.length - 1]?.id_version || '';

  const anios = useMemo(() => {
    const set = new Set();
    registrosTotales.filter(r => !idVersion || r.id_version === idVersion).forEach(r => {
      const a = r.detalle_columnas?.anio_proyeccion || String(r.fecha_proyeccion || '').slice(0, 4);
      if (/^\d{4}$/.test(String(a))) set.add(String(a));
    });
    return [...set].sort();
  }, [registrosTotales, idVersion]);

  const [anioSel, setAnioSel] = useState('');
  const anio = anios.includes(anioSel) ? anioSel : (anios[anios.length - 1] || String(new Date().getFullYear()));
  const [mesSel, setMesSel] = useState('todos');
  const [tasaPart, setTasaPart] = useState('10');
  const [tasaIR, setTasaIR] = useState('29.5');

  const [ejecutadoOdoo, setEjecutadoOdoo] = useState([]);
  const [estadoEjec, setEstadoEjec] = useState('cargando');

  useEffect(() => {
    let activo = true;
    setEstadoEjec('cargando');
    fetch(`${API_URL}/api/eerr/ejecutado?anio=${anio}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Error ${r.status}`))))
      .then(filas => { if (activo) { setEjecutadoOdoo(filas); setEstadoEjec('ok'); } })
      .catch(() => { if (activo) { setEjecutadoOdoo([]); setEstadoEjec('error'); } });
    return () => { activo = false; };
  }, [anio]);

  const tasas = { participacion: parseFloat(tasaPart) || 0, ir: parseFloat(tasaIR) || 0 };
  // Saldos mensuales (debe - haber) del proyectado y del ejecutado
  const baseProy = useMemo(() => calcularProyectado(registrosTotales, { idVersion, anio }), [registrosTotales, idVersion, anio]);
  const baseEjec = useMemo(() => calcularEjecutado(ejecutadoOdoo), [ejecutadoOdoo]);

  const columnas = mesSel === 'todos' ? MESES_EERR.map((m, i) => ({ etiqueta: m, i })) : [{ etiqueta: MESES_EERR[+mesSel], i: +mesSel }];
  const TODOS_MESES = MESES_EERR.map((_, i) => i);
  // Cada columna aplica las fórmulas sobre los saldos de su periodo (un mes o el año), como el DAX.
  const lineasDe = (base, i) => lineasPeriodo(base, i === 'total' ? TODOS_MESES : [i], tasas);
  const cacheLineas = useMemo(() => {
    const c = { proy: {}, ejec: {} };
    [...TODOS_MESES, 'total'].forEach(i => { c.proy[i] = lineasDe(baseProy, i); c.ejec[i] = lineasDe(baseEjec, i); });
    return c;
  }, [baseProy, baseEjec, tasaPart, tasaIR]);
  const valor = (tipo, clave, i) => cacheLineas[tipo][i][clave];

  const celdasGrupo = (linea, i) => {
    const esPct = linea.estilo === 'pct';
    const p = valor('proy', linea.clave, i);
    const e = estadoEjec === 'ok' ? valor('ejec', linea.clave, i) : null;
    const variacion = e === null || p === null ? null : e - p;
    const varPct = !esPct && variacion !== null && p ? variacion / Math.abs(p) : null;
    // Ingresos/utilidades: mejor si sube. Costos/gastos: mejor si baja.
    const bueno = variacion === null ? null : (linea.favorable === 'menor' ? variacion <= 0 : variacion >= 0);
    const fmt = esPct ? pct : miles;
    const td = { padding: '4px 8px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0', fontSize: '11px' };
    return (
      <React.Fragment key={`${linea.id}-${i}`}>
        <td {...xl(p, esPct ? 'pct' : 'moneda')} style={{ ...td, background: '#f3e39b' }}>{fmt(p)}</td>
        <td {...xl(e, esPct ? 'pct' : 'moneda')} style={{ ...td, background: '#e5e7eb' }}>{e === null ? '' : fmt(e)}</td>
        <td {...xl(esPct ? null : variacion)} style={{ ...td, background: bueno === null || Math.abs(variacion) < 0.005 ? 'white' : (bueno ? '#4ade80' : '#f87171'), fontWeight: 700 }}>
          {variacion === null ? '' : (esPct ? `${(variacion * 100).toFixed(1)} pp` : miles(variacion))}
        </td>
        <td {...xl(varPct, 'pct')} style={{ ...td, background: bueno === null || varPct === null ? 'white' : (bueno ? '#86efac' : '#fca5a5') }}>{varPct === null ? '' : `${(varPct * 100).toFixed(2)} %`}</td>
      </React.Fragment>
    );
  };

  // Exporta la tabla tal como se ve (valores exactos vía data-valor) a .xlsx.
  const refTabla = useRef(null);
  const exportar = () => exportarTablasHtml({
    contenedor: refTabla.current,
    nombreArchivo: `EERR ${idVersion} ${anio}`,
    titulo: `Estado de Resultados ${anio} - Proyectado vs Ejecutado`,
    subtitulo: `Versión ${String(idVersion).toUpperCase()} · Participación ${tasaPart}% · IR ${tasaIR}%`,
  }).catch(e => alert(e.message));

  const control = { padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' };
  const label = { fontSize: '10px', fontWeight: 600, color: '#64748b', display: 'block' };

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', background: 'white', padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '12px' }}>
        <div><span style={label}>VERSIÓN</span><div style={{ ...control, background: '#f8fafc' }}>{idVersion ? `${idVersion.toUpperCase()} - ${versiones.find(v => v.id_version === idVersion)?.nombre || ''}` : 'Sin versiones'}</div></div>
        <div>
          <span style={label}>AÑO</span>
          <select value={anio} onChange={e => setAnioSel(e.target.value)} style={control}>
            {(anios.length ? anios : [anio]).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <span style={label}>MES</span>
          <select value={mesSel} onChange={e => setMesSel(e.target.value)} style={control}>
            <option value="todos">Todos los meses</option>
            {MESES_EERR.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        </div>
        <div><span style={label}>% PARTICIPACIÓN TRAB.</span><input type="number" step="0.1" value={tasaPart} onChange={e => setTasaPart(e.target.value)} style={{ ...control, width: '90px' }} /></div>
        <div><span style={label}>% IMPUESTO A LA RENTA</span><input type="number" step="0.1" value={tasaIR} onChange={e => setTasaIR(e.target.value)} style={{ ...control, width: '90px' }} /></div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: estadoEjec === 'ok' ? '#15803d' : estadoEjec === 'error' ? '#b91c1c' : '#64748b' }}>
            {estadoEjec === 'ok' ? '● Ejecutado cargado desde Odoo' : estadoEjec === 'error' ? '● No se pudo leer el ejecutado de Odoo' : '● Cargando ejecutado...'}
          </span>
          <button type="button" onClick={exportar} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}>📥 Excel</button>
        </div>
      </div>

      <div ref={refTabla} style={{ overflow: 'auto', maxHeight: '72vh', border: '2px solid #1e3a8a', borderRadius: '8px', background: 'white' }}>
        <table data-hoja="EERR" style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: '11px', minWidth: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
            <tr style={{ background: '#1e3a8a', color: 'white' }}>
              <th rowSpan={2} style={{ position: 'sticky', left: 0, zIndex: 4, background: '#1e3a8a', padding: '6px 10px', minWidth: '220px', textAlign: 'left' }}>ESTADO DE RESULTADOS {anio}</th>
              {columnas.map(c => <th key={c.etiqueta} colSpan={4} style={{ padding: '6px', borderLeft: '1px solid #3b82f6' }}>{c.etiqueta}</th>)}
              <th colSpan={4} style={{ padding: '6px', borderLeft: '2px solid white', background: '#0f172a' }}>TOTAL {anio}</th>
            </tr>
            <tr style={{ fontSize: '10px' }}>
              {[...columnas, { etiqueta: 'total' }].map(c => (
                <React.Fragment key={`h-${c.etiqueta}`}>
                  <th style={{ background: '#f3e39b', padding: '4px 8px' }}>PROYECTADO</th>
                  <th style={{ background: '#d1d5db', padding: '4px 8px' }}>EJECUTADO</th>
                  <th style={{ background: '#1e3a8a', color: 'white', padding: '4px 8px' }}>VARIACIÓN</th>
                  <th style={{ background: '#1e3a8a', color: 'white', padding: '4px 8px' }}>%VAR</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {LINEAS_EERR.map(l => (
              <tr key={l.id}>
                <td style={{ position: 'sticky', left: 0, zIndex: 2, padding: '5px 10px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', ...ESTILO_FILA[l.estilo] }}>
                  {l.id}. {l.nombre}
                </td>
                {columnas.map(c => celdasGrupo(l, c.i))}
                {celdasGrupo(l, 'total')}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '6px', lineHeight: 1.5 }}>
        Mismas fórmulas que el Power BI (saldo = debe − haber): Ventas ABS(70) · Dscto 74 · Costo 69 · Gastos 9x62–9x65 (98 Log., 99 Alm., 95 Com., 94 Adm.) · Depre 9x68 · Otros Ing ABS(75, 775, 7611) · IngFinan ABS(7792) · GastFinan 976711/97673/976793 · DifCamb −(776, 97676) · Participación e IR = tasa × utilidad.
        {' '}<b>Proyectado:</b> ventas (cuentas 70x) y costo de ventas (69x) del Forecast: precio y costo unitario del vendedor × cantidad esperada + gastos registrados en el sistema. <b>Ejecutado:</b> asientos publicados en Odoo.
        {' '}Variación = Ejecutado − Proyectado; verde = favorable (más ingreso/utilidad o menos costo/gasto).
      </div>
    </div>
  );
}
