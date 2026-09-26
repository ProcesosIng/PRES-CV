import React, { useState, useEffect, useMemo, useRef } from 'react';
import { API_URL } from '../../config/api';
import { exportarTablasHtml } from '../../config/excel';
import { obtenerCuentasOdoo } from '../../data/store';
import {
  LINEAS_EERR, MESES_EERR, calcularProyectado, calcularEjecutado, lineasPeriodo,
  detalleProyectado, detalleEjecutado, SIGNO_LINEA, LINEAS_CON_CUENTAS,
} from '../../config/eerr';

// =====================================================================
// ESTADO DE RESULTADOS — tablero gerencial: PROYECTADO (sistema) vs EJECUTADO (Odoo).
//  1. Filtros: año, varios meses (chips + atajos) y tasas de participación e IR.
//  2. Indicadores: ventas, utilidades y márgenes, gastos operativos, cumplimiento.
//  3. Estructura del resultado (barras proyectado vs ejecutado) y tendencia mensual.
//  4. Detalle del periodo por línea del EERR, con subdetalle por cuenta.
//  5. Detalle mensual (formato Power BI) desplegable.
// Todas las cifras del periodo se calculan sumando los saldos de los meses elegidos y aplicando
// las mismas fórmulas del DAX (lineasPeriodo).
// =====================================================================
const COLOR_PROY = '#2a78d6';
const COLOR_EJEC = '#eb6834';
const OK = '#15803d';
const MAL = '#dc2626';

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

// Atributos para Excel: el valor exacto de la celda (en pantalla se ve abreviado).
const xl = (v, formato = 'moneda') => (v === null || v === undefined || !Number.isFinite(v) ? {} : { 'data-valor': v, 'data-formato': formato });
const miles = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '';
  if (Math.abs(v) < 0.005) return '';
  const abs = Math.abs(v);
  const txt = abs >= 1000 ? `${(abs / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil` : abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return `${v < 0 ? '-' : ''}S/ ${txt}`;
};
const corto = (v) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v); const s = v < 0 ? '-' : '';
  return a >= 1e6 ? `${s}S/ ${(a / 1e6).toFixed(2)} M` : a >= 1e3 ? `${s}S/ ${(a / 1e3).toFixed(1)} mil` : `${s}S/ ${a.toFixed(0)}`;
};
const pct = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(d)} %`);
const LINEA = Object.fromEntries(LINEAS_EERR.map(l => [l.clave, l]));
const MESES_TODOS = MESES_EERR.map((_, i) => i);

// Variación con su lectura (favorable / desfavorable) según el tipo de línea.
function lecturaVar(clave, p, e) {
  if (p === null || e === null || p === undefined || e === undefined) return null;
  const l = LINEA[clave];
  const esPct = l?.estilo === 'pct';
  const v = e - p;
  if (Math.abs(v) < (esPct ? 0.0005 : 0.5)) return { v, bueno: null, pctV: 0, esPct };
  const bueno = l?.favorable === 'menor' ? v <= 0 : v >= 0;
  return { v, bueno, pctV: !esPct && p ? v / Math.abs(p) : null, esPct };
}
function TextoVar({ clave, p, e, grande }) {
  const r = lecturaVar(clave, p, e);
  if (!r) return <span style={{ color: '#94a3b8' }}>—</span>;
  if (r.bueno === null) return <span style={{ color: '#64748b' }}>= igual</span>;
  const color = r.bueno ? OK : MAL;
  return (
    <span style={{ color, fontWeight: 700, fontSize: grande ? '12.5px' : undefined, whiteSpace: 'nowrap' }}>
      {r.v > 0 ? '▲' : '▼'} {r.esPct ? `${(r.v * 100).toFixed(1)} pp` : corto(Math.abs(r.v))}
      {r.pctV !== null && r.pctV !== undefined && Number.isFinite(r.pctV) ? ` (${r.pctV > 0 ? '+' : ''}${(r.pctV * 100).toFixed(1)}%)` : ''}
      <span style={{ color: '#64748b', fontWeight: 500 }}> {r.bueno ? 'favorable' : 'desfavorable'}</span>
    </span>
  );
}

// Cumplimiento: ejecutado ÷ proyectado con marca en el 100%.
function Cumplimiento({ p, e, ancho = 110, favorable = 'mayor' }) {
  if (!p || e === null || e === undefined || !Number.isFinite(e / p)) return <span style={{ color: '#94a3b8' }}>—</span>;
  const c = e / p;
  const tope = 1.5;
  const bueno = favorable === 'menor' ? c <= 1 : c >= 1;
  const w = Math.max(0, Math.min(c, tope)) / tope * ancho;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
      <div style={{ position: 'relative', width: `${ancho}px`, height: '8px', background: '#eef2f7', borderRadius: '4px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${w}px`, background: bueno ? COLOR_PROY : MAL, borderRadius: '4px' }} />
        <div style={{ position: 'absolute', left: `${ancho / tope}px`, top: '-3px', bottom: '-3px', width: '2px', background: '#0f172a' }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 700, minWidth: '44px', textAlign: 'right', color: bueno ? '#334155' : MAL }}>{(c * 100).toFixed(0)}%</span>
    </div>
  );
}

function Tarjeta({ titulo, clave, p, e, margenP, margenE, color, extra }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderTop: `4px solid ${color}`, borderRadius: '10px', padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{titulo}</div>
      <div style={{ fontSize: '22px', fontWeight: 800, color: e !== null && e < 0 ? MAL : '#0f172a', marginTop: '2px', whiteSpace: 'nowrap' }}>{corto(e)}</div>
      <div style={{ fontSize: '11.5px', color: '#475569' }}>Proyectado {corto(p)}</div>
      <div style={{ fontSize: '11.5px', marginTop: '3px' }}><TextoVar clave={clave} p={p} e={e} /></div>
      {margenE !== undefined && (
        <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '3px' }}>
          Margen <b style={{ color: '#0f172a' }}>{pct(margenE)}</b> vs {pct(margenP)} proy.
        </div>
      )}
      {extra}
    </div>
  );
}

// Barras agrupadas con eje en cero (admite negativos: pérdidas). Un solo eje, en soles.
function BarrasMensuales({ titulo, meses, proy, ejec, mesAbierto }) {
  const [hover, setHover] = useState(null);
  const valores = meses.flatMap(i => [proy[i], ejec[i] ?? 0]);
  const maxP = Math.max(0, ...valores);
  const minN = Math.min(0, ...valores);
  const rango = maxP - minN || 1;
  const alto = 150;
  const y0 = (maxP / rango) * alto;
  const barra = (v, color, abierto) => {
    const h = Math.abs(v) / rango * alto;
    return <div style={{ position: 'absolute', left: 0, right: 0, top: v >= 0 ? y0 - h : y0, height: `${h}px`, background: abierto ? `repeating-linear-gradient(45deg, ${color} 0 3px, #fde2d4 3px 6px)` : color, borderRadius: v >= 0 ? '4px 4px 0 0' : '0 0 4px 4px' }} />;
  };
  const cols = `repeat(${Math.max(meses.length, 1)}, 1fr)`;
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', marginBottom: '6px' }}>{titulo}</div>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '6px', height: `${alto}px`, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: y0, height: '1px', background: '#94a3b8' }} />
          {meses.map((i, k) => (
            <div key={i} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} style={{ position: 'relative', display: 'flex', justifyContent: 'center', gap: '2px', background: hover === k ? '#f1f5f9' : 'transparent', borderRadius: '4px' }}>
              <div style={{ position: 'relative', width: '38%', maxWidth: '40px' }}>{barra(proy[i], COLOR_PROY)}</div>
              <div style={{ position: 'relative', width: '38%', maxWidth: '40px' }}>{ejec[i] !== null && barra(ejec[i], COLOR_EJEC, i === mesAbierto)}</div>
            </div>
          ))}
        </div>
        {hover !== null && meses[hover] !== undefined && (
          <div style={{ position: 'absolute', top: 0, left: `${Math.min(hover / Math.max(meses.length, 1), 0.7) * 100}%`, background: '#0f172a', color: 'white', borderRadius: '8px', padding: '7px 9px', fontSize: '11.5px', pointerEvents: 'none', zIndex: 5, minWidth: '170px' }}>
            <div style={{ fontWeight: 800 }}>{MESES_EERR[meses[hover]]}{meses[hover] === mesAbierto ? ' · en curso (abierto)' : ''}</div>
            <div>Proyectado: <b>{corto(proy[meses[hover]])}</b></div>
            <div>Ejecutado: <b>{corto(ejec[meses[hover]])}</b></div>
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '6px', fontSize: '10.5px', color: '#475569', textAlign: 'center', marginTop: '4px' }}>
        {meses.map(i => <div key={i} style={{ fontWeight: i === mesAbierto ? 800 : 500 }}>{MESES_EERR[i]}{i === mesAbierto ? ' ●' : ''}</div>)}
      </div>
    </div>
  );
}

export default function EstadoResultados({ registrosTotales = [], versiones = [], idVersionFiltro = '', expandirTodo = false }) {
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
  const hoy = new Date();
  const mesAbierto = String(hoy.getFullYear()) === String(anio) ? hoy.getMonth() : null;
  const [mesesSel, setMesesSel] = useState(MESES_TODOS);
  const [tasaPart, setTasaPart] = useState('10');
  const [tasaIR, setTasaIR] = useState('29.5');
  const [abiertos, setAbiertos] = useState({});
  const [verMensual, setVerMensual] = useState(false);

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

  // Nombres de cuenta del maestro (Odoo solo trae el código).
  const [nombresCuenta, setNombresCuenta] = useState({});
  useEffect(() => {
    obtenerCuentasOdoo().then(lista => {
      const mapa = {};
      (lista || []).forEach(c => {
        const cod = String(c.codigo || c.id || '').replace(/\D/g, '');
        if (!cod) return;
        mapa[cod] = c.nombre;
        if (cod.length > 7) mapa[`b${cod.slice(-7)}`] = c.nombre;
      });
      setNombresCuenta(mapa);
    }).catch(() => {});
  }, []);
  const nombreDe = (cod, nombre) => nombre || nombresCuenta[cod] || (cod.length > 7 ? nombresCuenta[`b${cod.slice(-7)}`] : '') || '';

  const tasas = { participacion: parseFloat(tasaPart) || 0, ir: parseFloat(tasaIR) || 0 };
  const hayEjec = estadoEjec === 'ok';
  const baseProy = useMemo(() => calcularProyectado(registrosTotales, { idVersion, anio }), [registrosTotales, idVersion, anio]);
  const baseEjec = useMemo(() => calcularEjecutado(ejecutadoOdoo), [ejecutadoOdoo]);
  const detProy = useMemo(() => detalleProyectado(registrosTotales, { idVersion, anio }), [registrosTotales, idVersion, anio]);
  const detEjec = useMemo(() => detalleEjecutado(ejecutadoOdoo), [ejecutadoOdoo]);

  const meses = [...mesesSel].sort((a, b) => a - b);
  const clavePeriodo = meses.join(',');
  const periodoP = useMemo(() => lineasPeriodo(baseProy, meses, tasas), [baseProy, clavePeriodo, tasaPart, tasaIR]); // eslint-disable-line react-hooks/exhaustive-deps
  const periodoE = useMemo(() => lineasPeriodo(baseEjec, meses, tasas), [baseEjec, clavePeriodo, tasaPart, tasaIR]); // eslint-disable-line react-hooks/exhaustive-deps
  const porMes = useMemo(() => MESES_TODOS.map(i => ({ p: lineasPeriodo(baseProy, [i], tasas), e: lineasPeriodo(baseEjec, [i], tasas) })), [baseProy, baseEjec, tasaPart, tasaIR]); // eslint-disable-line react-hooks/exhaustive-deps
  const P = (c) => periodoP[c];
  const E = (c) => (hayEjec ? periodoE[c] : null);

  // Subdetalle por cuenta de una línea base en el periodo.
  const cuentasDe = (clave) => {
    const signo = SIGNO_LINEA[clave] || 1;
    const cods = new Set([...Object.keys(detProy[clave] || {}), ...(hayEjec ? Object.keys(detEjec[clave] || {}) : [])]);
    return [...cods].map(cod => {
      const sp = detProy[clave]?.[cod]; const se = detEjec[clave]?.[cod];
      const p = sp ? signo * meses.reduce((a, i) => a + sp.meses[i], 0) : 0;
      const e = hayEjec && se ? signo * meses.reduce((a, i) => a + se.meses[i], 0) : (hayEjec ? 0 : null);
      return { cod, nombre: nombreDe(cod, sp?.nombre || se?.nombre), p, e };
    }).filter(c => Math.abs(c.p) >= 0.5 || Math.abs(c.e || 0) >= 0.5)
      .sort((a, b) => Math.max(Math.abs(b.p), Math.abs(b.e || 0)) - Math.max(Math.abs(a.p), Math.abs(a.e || 0)));
  };

  const toggle = (lista, v) => (lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v]);
  const cerrados = mesAbierto === null ? MESES_TODOS : MESES_TODOS.filter(i => i < mesAbierto);
  const hastaHoy = mesAbierto === null ? MESES_TODOS : MESES_TODOS.filter(i => i <= mesAbierto);
  const igual = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === b[i]);
  const seguidos = meses.every((m, k) => k === 0 || m === meses[k - 1] + 1);
  const periodo = meses.length === 12 ? 'todo el año' : meses.length === 0 ? 'sin meses' : meses.length === 1 ? MESES_EERR[meses[0]]
    : seguidos ? `${MESES_EERR[meses[0]]} a ${MESES_EERR[meses[meses.length - 1]]} (${meses.length} meses)` : `${meses.map(i => MESES_EERR[i]).join(', ')} (${meses.length} meses)`;

  // ---------- exportación ----------
  const refReporte = useRef(null);
  const exportar = () => {
    setVerMensual(true);
    setTimeout(() => exportarTablasHtml({
      contenedor: refReporte.current,
      nombreArchivo: `EERR ${idVersion} ${anio}`,
      titulo: `Estado de Resultados ${anio} - Proyectado vs Ejecutado`,
      subtitulo: `Versión ${String(idVersion).toUpperCase()} · Periodo: ${periodo} · Participación ${tasaPart}% · IR ${tasaIR}%`,
    }).catch(e => alert(e.message)), 300);
  };

  // ---------- estilos ----------
  const card = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 18px', marginBottom: '14px' };
  const h3 = { margin: '0 0 10px', fontSize: '15px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' };
  const chip = (activo) => ({ padding: '5px 11px', borderRadius: '999px', border: `1px solid ${activo ? '#1e3a8a' : '#cbd5e1'}`, background: activo ? '#1e3a8a' : 'white', color: activo ? 'white' : '#334155', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' });
  const th = { padding: '8px 10px', fontSize: '10.5px', color: '#475569', textAlign: 'right', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 };
  const td = { padding: '6px 10px', fontSize: '12px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const control = { padding: '6px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', width: '80px' };

  const gastosOper = (L) => (L ? L.gVentas + L.gAdm + L.depre : null);
  const resFin = (L) => (L ? L.otrosIng + L.ingFin - L.gastFin + L.difCamb : null);
  const ESTRUCTURA = [
    ['Ventas', 'ventas', COLOR_PROY], ['Costo de ventas', 'costo'], ['Utilidad bruta', 'utilBruta'],
    ['Gastos de ventas', 'gVentas'], ['Gastos administrativos', 'gAdm'], ['Depreciación', 'depre'],
    ['Utilidad operativa', 'utilOper'], ['Resultado financiero y otros', null], ['Utilidad neta', 'utilNeta'],
  ];
  const valorEstructura = (clave, L) => (L ? (clave ? L[clave] : resFin(L)) : null);
  const maxEstr = Math.max(1, ...ESTRUCTURA.flatMap(([, c]) => [Math.abs(valorEstructura(c, periodoP) || 0), Math.abs(hayEjec ? valorEstructura(c, periodoE) || 0 : 0)]));

  const celdasPeriodo = (clave, p, e, esPct) => {
    const r = lecturaVar(clave, p, e);
    return (
      <>
        <td style={td} {...xl(p, esPct ? 'pct' : 'moneda')}>{esPct ? pct(p) : miles(p)}</td>
        <td style={td} {...xl(e, esPct ? 'pct' : 'moneda')}>{e === null ? '' : (esPct ? pct(e) : miles(e))}</td>
        <td style={{ ...td, fontWeight: 700, color: !r || r.bueno === null ? '#64748b' : r.bueno ? OK : MAL }} {...xl(r && !esPct ? r.v : null)}>
          {!r || r.bueno === null ? '' : `${r.v > 0 ? '▲' : '▼'} ${esPct ? `${(r.v * 100).toFixed(1)} pp` : miles(Math.abs(r.v))}`}
        </td>
        <td style={{ ...td, color: !r || r.bueno === null ? '#64748b' : r.bueno ? OK : MAL }} {...xl(r?.pctV ?? null, 'pct')}>{r && r.pctV !== null && r.pctV !== undefined && r.bueno !== null ? `${(r.pctV * 100).toFixed(1)}%` : ''}</td>
        <td style={td}>{esPct ? '' : <Cumplimiento p={p} e={e} ancho={90} favorable={LINEA[clave]?.favorable} />}</td>
      </>
    );
  };

  return (
    <div style={{ minWidth: 0 }}>
      {/* Encabezado */}
      <div style={{ ...card, background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '.12em', opacity: .8, fontWeight: 700 }}>ESTADO DE RESULTADOS · PROYECTADO VS EJECUTADO{idVersion ? ` · ${idVersion.toUpperCase()}` : ''}</div>
            <div style={{ fontSize: '24px', fontWeight: 900 }}>C&amp;V International {anio}</div>
            <div style={{ fontSize: '12px', opacity: .9 }}>Periodo: {periodo} · {versiones.find(v => v.id_version === idVersion)?.nombre || ''}</div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {(anios.length ? anios : [anio]).map(a => (
              <button key={a} type="button" onClick={() => setAnioSel(a)} style={{ ...chip(a === anio), borderColor: 'rgba(255,255,255,.5)', background: a === anio ? 'white' : 'transparent', color: a === anio ? '#1e3a8a' : 'white' }}>{a}</button>
            ))}
            <span style={{ fontSize: '11px', fontWeight: 600, color: hayEjec ? '#bbf7d0' : estadoEjec === 'error' ? '#fecaca' : '#e2e8f0' }}>
              {hayEjec ? '● Ejecutado de Odoo' : estadoEjec === 'error' ? '● Sin conexión a Odoo' : '● Cargando ejecutado...'}
            </span>
            <button type="button" onClick={exportar} style={{ background: '#22c55e', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>📥 Excel</button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ ...card, padding: '12px 16px' }} data-no-print>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <b style={{ fontSize: '11px', color: '#64748b', width: '60px' }}>MESES</b>
          <button type="button" style={chip(meses.length === 12)} onClick={() => setMesesSel(MESES_TODOS)}>Todo el año</button>
          {mesAbierto !== null && mesAbierto > 0 && <button type="button" style={chip(igual(meses, cerrados))} onClick={() => setMesesSel(cerrados)}>Meses cerrados</button>}
          {mesAbierto !== null && <button type="button" style={chip(igual(meses, hastaHoy))} onClick={() => setMesesSel(hastaHoy)}>Hasta el mes en curso</button>}
          <span style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 4px' }} />
          {MESES_EERR.map((m, i) => (
            <button key={m} type="button" style={{ ...chip(meses.includes(i)), ...(i === mesAbierto ? { borderStyle: 'dashed' } : {}) }}
              title={i === mesAbierto ? 'Mes en curso: aún abierto, puede tener asientos por saldar' : ''}
              onClick={() => setMesesSel(toggle(mesesSel, i))}>{m}{i === mesAbierto ? ' · abierto' : ''}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', marginTop: '8px' }}>
          <b style={{ fontSize: '11px', color: '#64748b', width: '60px' }}>TASAS</b>
          <label style={{ fontSize: '12px', color: '#334155' }}>Participación trabajadores <input type="number" step="0.1" value={tasaPart} onChange={e => setTasaPart(e.target.value)} style={control} /> %</label>
          <label style={{ fontSize: '12px', color: '#334155' }}>Impuesto a la renta <input type="number" step="0.1" value={tasaIR} onChange={e => setTasaIR(e.target.value)} style={control} /> %</label>
        </div>
      </div>

      <div ref={refReporte}>
        {/* Indicadores */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
          <Tarjeta titulo="Ventas" clave="ventas" p={P('ventas')} e={E('ventas')} color={COLOR_PROY}
            extra={<div style={{ marginTop: '6px' }}><div style={{ fontSize: '10.5px', color: '#64748b', marginBottom: '2px' }}>Cumplimiento</div><Cumplimiento p={P('ventas')} e={E('ventas')} ancho={120} /></div>} />
          <Tarjeta titulo="Utilidad bruta" clave="utilBruta" p={P('utilBruta')} e={E('utilBruta')} margenP={P('pctBruto')} margenE={E('pctBruto')} color="#0ea5e9" />
          <Tarjeta titulo="Gastos operativos" clave="gVentas" p={gastosOper(periodoP)} e={hayEjec ? gastosOper(periodoE) : null} color={COLOR_EJEC}
            extra={<div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>Ventas + administración + depreciación</div>} />
          <Tarjeta titulo="Utilidad operativa" clave="utilOper" p={P('utilOper')} e={E('utilOper')} margenP={P('pctOper')} margenE={E('pctOper')} color="#7c3aed" />
          <Tarjeta titulo="Utilidad neta" clave="utilNeta" p={P('utilNeta')} e={E('utilNeta')} margenP={P('pctNeto')} margenE={E('pctNeto')} color={OK} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '14px' }}>
          {/* Estructura del resultado */}
          <div style={card} data-no-excel>
            <h3 style={h3}>🧱 Estructura del resultado <span style={{ fontSize: '11.5px', fontWeight: 500, color: '#64748b' }}>· {periodo}</span></h3>
            <div style={{ display: 'flex', gap: '14px', fontSize: '11.5px', color: '#334155', marginBottom: '8px' }}>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: COLOR_PROY, borderRadius: '2px', marginRight: '5px' }} />Proyectado</span>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: COLOR_EJEC, borderRadius: '2px', marginRight: '5px' }} />Ejecutado</span>
            </div>
            {ESTRUCTURA.map(([et, clave]) => {
              const vp = valorEstructura(clave, periodoP);
              const ve = hayEjec ? valorEstructura(clave, periodoE) : null;
              const esUtil = /^Utilidad/.test(et);
              return (
                <div key={et} style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: '8px', alignItems: 'center', padding: '4px 0', borderTop: esUtil ? '1px dashed #e2e8f0' : 'none' }}>
                  <div style={{ fontSize: '12px', fontWeight: esUtil ? 800 : 500, color: '#0f172a' }}>{et}</div>
                  <div>
                    {[[vp, COLOR_PROY], [ve, COLOR_EJEC]].map(([v, color], k) => (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '14px', marginBottom: '2px' }}>
                        <div style={{ width: `${(Math.abs(v || 0) / maxEstr) * 75}%`, minWidth: v ? '2px' : 0, height: '10px', background: v !== null && v < 0 ? `repeating-linear-gradient(45deg, ${color} 0 3px, white 3px 6px)` : color, borderRadius: '0 4px 4px 0' }} />
                        <span style={{ fontSize: '11px', color: v !== null && v < 0 ? MAL : '#334155', fontWeight: 600, whiteSpace: 'nowrap' }}>{v === null ? '—' : corto(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '6px' }}>Barra rayada = valor negativo (pérdida o resultado en contra).</div>
          </div>

          {/* Tendencia */}
          <div style={card} data-no-excel>
            <h3 style={h3}>📈 Tendencia mensual</h3>
            <div style={{ display: 'flex', gap: '14px', fontSize: '11.5px', color: '#334155', marginBottom: '8px', flexWrap: 'wrap' }}>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: COLOR_PROY, borderRadius: '2px', marginRight: '5px' }} />Proyectado</span>
              <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: COLOR_EJEC, borderRadius: '2px', marginRight: '5px' }} />Ejecutado</span>
              {mesAbierto !== null && meses.includes(mesAbierto) && <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: `repeating-linear-gradient(45deg, ${COLOR_EJEC} 0 2px, #fde2d4 2px 4px)`, borderRadius: '2px', marginRight: '5px' }} />Mes en curso (abierto)</span>}
            </div>
            {meses.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '12px' }}>Elige al menos un mes.</div> : (
              <div style={{ display: 'grid', gap: '16px' }}>
                <BarrasMensuales titulo="Ventas" meses={meses} proy={porMes.map(m => m.p.ventas)} ejec={porMes.map(m => (hayEjec ? m.e.ventas : null))} mesAbierto={mesAbierto} />
                <BarrasMensuales titulo="Utilidad operativa" meses={meses} proy={porMes.map(m => m.p.utilOper)} ejec={porMes.map(m => (hayEjec ? m.e.utilOper : null))} mesAbierto={mesAbierto} />
              </div>
            )}
          </div>
        </div>

        {/* Detalle del periodo con subdetalle por cuenta */}
        <div style={card}>
          <h3 style={h3}>🧾 Detalle del periodo <span style={{ fontSize: '11.5px', fontWeight: 500, color: '#64748b' }}>· {periodo} · clic en ▸ para ver las cuentas de cada línea</span></h3>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }} data-no-print>
            <button type="button" className="btn-ghost" style={{ padding: '4px 10px', fontSize: '11.5px' }} onClick={() => setAbiertos(Object.fromEntries(LINEAS_CON_CUENTAS.map(c => [c, true])))}>Abrir todas las cuentas</button>
            <button type="button" className="btn-ghost" style={{ padding: '4px 10px', fontSize: '11.5px' }} onClick={() => setAbiertos({})}>Cerrar</button>
          </div>
          <div style={{ overflow: 'auto', maxHeight: '620px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table data-hoja="EERR del periodo" data-titulo={`Estado de Resultados - ${periodo}`} style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'left', minWidth: '280px' }}>Línea / cuenta</th>
                <th style={th}>Proyectado</th><th style={th}>Ejecutado</th><th style={th}>Variación</th><th style={th}>%Var</th><th style={th}>Cumplimiento</th>
              </tr></thead>
              <tbody>
                {LINEAS_EERR.map(l => {
                  const esPct = l.estilo === 'pct';
                  const conCuentas = LINEAS_CON_CUENTAS.includes(l.clave);
                  const abierto = expandirTodo || !!abiertos[l.clave];
                  return (
                    <React.Fragment key={l.id}>
                      <tr>
                        <td data-nivel={0} onClick={() => conCuentas && setAbiertos(a => ({ ...a, [l.clave]: !abierto }))}
                          style={{ ...td, textAlign: 'left', cursor: conCuentas ? 'pointer' : 'default', ...ESTILO_FILA[l.estilo] }}>
                          <span data-no-excel style={{ display: 'inline-block', width: '14px', color: '#475569' }}>{conCuentas ? (abierto ? '▾' : '▸') : ''}</span>{l.id}. {l.nombre}
                        </td>
                        {celdasPeriodo(l.clave, P(l.clave), E(l.clave), esPct)}
                      </tr>
                      {conCuentas && abierto && cuentasDe(l.clave).map(c => (
                        <tr key={`${l.clave}-${c.cod}`} style={{ background: '#fafafa' }}>
                          <td data-nivel={1} style={{ ...td, textAlign: 'left', paddingLeft: '38px', color: '#334155', maxWidth: '380px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${c.cod} ${c.nombre}`}>
                            {c.cod}{c.nombre ? ` - ${c.nombre}` : ''}
                          </td>
                          {celdasPeriodo(l.clave, c.p, c.e, false)}
                        </tr>
                      ))}
                      {conCuentas && abierto && cuentasDe(l.clave).length === 0 && (
                        <tr><td colSpan={6} style={{ ...td, textAlign: 'left', paddingLeft: '38px', color: '#94a3b8' }}>Sin movimientos en el periodo.</td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detalle mensual (formato Power BI) */}
        <div style={card}>
          <button type="button" className="btn-ghost" onClick={() => setVerMensual(!verMensual)} data-no-print>{verMensual || expandirTodo ? '▾' : '▸'} Detalle mensual (formato Power BI)</button>
          {(verMensual || expandirTodo) && (
            <div style={{ overflow: 'auto', maxHeight: '72vh', border: '2px solid #1e3a8a', borderRadius: '8px', marginTop: '10px' }}>
              <table data-hoja="EERR mensual" style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: '11px', minWidth: '100%' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
                  <tr style={{ background: '#1e3a8a', color: 'white' }}>
                    <th rowSpan={2} style={{ position: 'sticky', left: 0, zIndex: 4, background: '#1e3a8a', padding: '6px 10px', minWidth: '220px', textAlign: 'left' }}>ESTADO DE RESULTADOS {anio}</th>
                    {meses.map(i => <th key={i} colSpan={4} style={{ padding: '6px', borderLeft: '1px solid #3b82f6' }}>{MESES_EERR[i]}{i === mesAbierto ? ' · abierto' : ''}</th>)}
                    <th colSpan={4} style={{ padding: '6px', borderLeft: '2px solid white', background: '#0f172a' }}>TOTAL DEL PERIODO</th>
                  </tr>
                  <tr style={{ fontSize: '10px' }}>
                    {[...meses, 'total'].map(i => (
                      <React.Fragment key={`h-${i}`}>
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
                      <td style={{ position: 'sticky', left: 0, zIndex: 2, padding: '5px 10px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', ...ESTILO_FILA[l.estilo] }}>{l.id}. {l.nombre}</td>
                      {[...meses, 'total'].map(i => {
                        const esPct = l.estilo === 'pct';
                        const p = i === 'total' ? P(l.clave) : porMes[i].p[l.clave];
                        const e = !hayEjec ? null : i === 'total' ? E(l.clave) : porMes[i].e[l.clave];
                        const r = lecturaVar(l.clave, p, e);
                        const tdm = { padding: '4px 8px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0', fontSize: '11px' };
                        const fondo = !r || r.bueno === null ? 'white' : r.bueno ? '#4ade80' : '#f87171';
                        return (
                          <React.Fragment key={`${l.id}-${i}`}>
                            <td {...xl(p, esPct ? 'pct' : 'moneda')} style={{ ...tdm, background: '#f3e39b' }}>{esPct ? (p === null ? '' : pct(p)) : miles(p)}</td>
                            <td {...xl(e, esPct ? 'pct' : 'moneda')} style={{ ...tdm, background: '#e5e7eb' }}>{e === null ? '' : esPct ? pct(e) : miles(e)}</td>
                            <td {...xl(r && !esPct ? r.v : null)} style={{ ...tdm, background: fondo, fontWeight: 700 }}>{!r ? '' : esPct ? `${(r.v * 100).toFixed(1)} pp` : miles(r.v)}</td>
                            <td {...xl(r?.pctV ?? null, 'pct')} style={{ ...tdm, background: !r || r.bueno === null || r.pctV === null ? 'white' : r.bueno ? '#86efac' : '#fca5a5' }}>{r && r.pctV !== null && r.pctV !== undefined ? `${(r.pctV * 100).toFixed(2)} %` : ''}</td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: '10px', color: '#64748b', lineHeight: 1.5 }}>
        Mismas fórmulas que el Power BI (saldo = debe − haber): Ventas ABS(70) · Dscto 74 · Costo 69 · Gastos 9x62–9x65 (98 Log., 99 Alm., 95 Com., 94 Adm.) · Depre 9x68 · Otros Ing ABS(75, 775, 7611) · IngFinan ABS(7792) · GastFinan 976711/97673/976793 · DifCamb −(776, 97676) · Participación e IR = tasa × utilidad. Los totales del periodo suman los saldos de los meses elegidos y luego aplican las fórmulas.
        {' '}<b>Proyectado:</b> ventas y costo de ventas del Forecast (precio y costo unitario del vendedor × cantidad esperada, cuentas 70x/69x) + gastos registrados en el sistema. <b>Ejecutado:</b> asientos publicados en Odoo; el mes en curso aparece como «abierto» (puede tener asientos por saldar), quítalo con «Meses cerrados».
        {' '}Variación = Ejecutado − Proyectado; verde / favorable = más ingreso o utilidad, o menos costo o gasto.
      </div>
    </div>
  );
}
