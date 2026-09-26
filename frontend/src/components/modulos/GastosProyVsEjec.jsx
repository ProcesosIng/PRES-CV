import React, { useState, useEffect, useMemo } from 'react';
import { API_URL } from '../../config/api';
import { obtenerCuentasOdoo } from '../../data/store';
import { abreviarNombreCuenta } from '../../config/cuentas';
import { movimientosProyectados, movimientosEjecutados, clasificacionDesdeMaestro } from '../../config/gastos';

// Reporte de GASTOS: Proyectado (sistema) vs Ejecutado (Odoo), como el tablero de Power BI.
//  - Tabla 1: Área → Grupo → Subgrupo → Cuenta, con %G (peso dentro del área).
//  - Tabla 2: Subgrupo → Cuenta de todas las áreas seleccionadas.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const miles = (v) => {
  if (!v || Math.abs(v) < 0.005) return '';
  const abs = Math.abs(v);
  const txt = abs >= 1000 ? `${(abs / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mil` : abs.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${v < 0 ? '-' : ''}S/ ${txt}`;
};
const pct = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '' : `${(v * 100).toFixed(2)} %`);

// Árbol agregado: niveles = lista de funciones que devuelven la etiqueta de cada nivel.
function construirArbol(movs, niveles) {
  const raiz = { clave: 'raiz', hijos: {}, meses: {} };
  movs.forEach(m => {
    let nodo = raiz;
    const acumular = (n) => {
      if (!n.meses[m.mes]) n.meses[m.mes] = { p: 0, e: 0 };
      n.meses[m.mes].p += m.proyectado;
      n.meses[m.mes].e += m.ejecutado;
    };
    acumular(raiz);
    niveles.forEach((fn, nivel) => {
      const etiqueta = fn(m);
      const clave = `${nodo.clave}|${etiqueta}`;
      if (!nodo.hijos[etiqueta]) nodo.hijos[etiqueta] = { clave, etiqueta, nivel, hijos: {}, meses: {} };
      nodo = nodo.hijos[etiqueta];
      acumular(nodo);
    });
  });
  return raiz;
}

// Atributos para la exportación a Excel (valor exacto, sin abreviar).
const num = (v, formato = 'moneda') => (v === null || v === undefined || !Number.isFinite(v) || Math.abs(v) < 0.005 && formato !== 'pct' ? {} : { 'data-valor': v, 'data-formato': formato });

const valoresDe = (nodo, meses) => meses.reduce((acc, i) => {
  const v = nodo.meses[i];
  if (v) { acc.p += v.p; acc.e += v.e; }
  return acc;
}, { p: 0, e: 0 });

// expandirTodo: al exportar a Excel se abren todos los niveles para que salgan completos.
// data-valor / data-formato llevan el número exacto a Excel (en pantalla se muestra abreviado en "mil").
function TablaArbol({ arbol, mesesVisibles, conPeso, titulo, abiertoPorDefecto = 1, expandirTodo = false }) {
  const [abiertos, setAbiertos] = useState({});
  const estaAbierto = (n) => expandirTodo || (abiertos[n.clave] ?? n.nivel < abiertoPorDefecto);
  const grupos = [...mesesVisibles.map(i => ({ etiqueta: MESES[i], meses: [i] })), { etiqueta: 'Total', meses: mesesVisibles }];
  const th = { padding: '5px 8px', fontSize: '10px', whiteSpace: 'nowrap' };
  const td = { padding: '4px 8px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '11px', borderBottom: '1px solid #e2e8f0' };

  const filas = [];
  const recorrer = (nodo, padreArea) => {
    Object.values(nodo.hijos).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta)).forEach(h => {
      // Sin proyectado ni ejecutado en los meses elegidos: la fila no aporta nada.
      const v = valoresDe(h, mesesVisibles);
      if (Math.abs(v.p) < 0.005 && Math.abs(v.e) < 0.005) return;
      const area = h.nivel === 0 ? h : padreArea;
      filas.push({ nodo: h, area });
      if (Object.keys(h.hijos).length && estaAbierto(h)) recorrer(h, area);
    });
  };
  recorrer(arbol, null);

  const totalRaiz = (g) => valoresDe(arbol, g.meses);

  const celdas = (nodo, area, g, negrita) => {
    const v = valoresDe(nodo, g.meses);
    const base = conPeso ? valoresDe(area || nodo, g.meses) : null;
    const variacion = v.e - v.p;
    const varPct = v.p ? variacion / v.p : null;
    const bueno = variacion >= 0;
    const sinDatos = Math.abs(variacion) < 0.005;
    const fw = negrita ? 800 : 500;
    return (
      <React.Fragment key={`${nodo.clave}-${g.etiqueta}`}>
        <td {...num(v.p)} style={{ ...td, background: '#f3e39b', fontWeight: fw }}>{miles(v.p)}</td>
        {conPeso && <td {...num(base.p ? v.p / base.p : null, 'pct')} style={{ ...td, background: '#fffbeb' }}>{base.p ? pct(v.p / base.p) : ''}</td>}
        <td {...num(v.e)} style={{ ...td, background: '#e5e7eb', fontWeight: fw }}>{miles(v.e)}</td>
        {conPeso && <td {...num(base.e ? v.e / base.e : null, 'pct')} style={{ ...td, background: '#f3f4f6' }}>{base.e ? pct(v.e / base.e) : ''}</td>}
        <td {...num(variacion)} style={{ ...td, fontWeight: 700, background: sinDatos ? 'white' : (bueno ? '#4ade80' : '#f87171') }}>{miles(variacion)}</td>
        <td {...num(varPct, 'pct')} style={{ ...td, background: sinDatos || varPct === null ? 'white' : (bueno ? '#86efac' : '#fca5a5') }}>{pct(varPct)}</td>
      </React.Fragment>
    );
  };

  const colsPorGrupo = conPeso ? 6 : 4;
  return (
    <div style={{ background: 'white', border: '2px solid #1e3a8a', borderRadius: '8px', overflow: 'auto', maxHeight: '46vh', marginBottom: '14px' }}>
      <table data-hoja={titulo === 'SUBGRUPO' ? 'Por subgrupo' : 'Por área'} data-titulo={`Gastos proyectado vs ejecutado - ${titulo === 'SUBGRUPO' ? 'por subgrupo' : 'por área'}`} style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
          <tr style={{ background: '#1e3a8a', color: 'white' }}>
            <th rowSpan={2} style={{ ...th, fontSize: '12px', position: 'sticky', left: 0, zIndex: 4, background: '#1e3a8a', minWidth: '300px', textAlign: 'left' }}>{titulo}</th>
            {grupos.map(g => <th key={g.etiqueta} colSpan={colsPorGrupo} style={{ ...th, fontSize: '11px', borderLeft: '1px solid #3b82f6', background: g.etiqueta === 'Total' ? '#0f172a' : '#1e3a8a' }}>{g.etiqueta}</th>)}
          </tr>
          <tr>
            {grupos.map(g => (
              <React.Fragment key={`h-${g.etiqueta}`}>
                <th style={{ ...th, background: '#f3e39b' }}>PROYECTADO</th>
                {conPeso && <th style={{ ...th, background: '#fffbeb' }}>%G. PROY</th>}
                <th style={{ ...th, background: '#d1d5db' }}>EJECUTADO</th>
                {conPeso && <th style={{ ...th, background: '#f3f4f6' }}>%G. EJEC</th>}
                <th style={{ ...th, background: '#1e3a8a', color: 'white' }}>VARIACIÓN</th>
                <th style={{ ...th, background: '#1e3a8a', color: 'white' }}>%VAR</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr><td colSpan={1 + grupos.length * colsPorGrupo} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No hay gastos para los filtros seleccionados.</td></tr>
          )}
          {filas.map(({ nodo, area }) => {
            const tieneHijos = Object.keys(nodo.hijos).length > 0;
            const negrita = nodo.nivel === 0;
            return (
              <tr key={nodo.clave} style={{ background: negrita ? '#eff6ff' : 'white' }}>
                <td
                  data-nivel={nodo.nivel}
                  onClick={() => tieneHijos && setAbiertos(p => ({ ...p, [nodo.clave]: !estaAbierto(nodo) }))}
                  style={{ position: 'sticky', left: 0, zIndex: 2, background: negrita ? '#eff6ff' : 'white', padding: '4px 8px', paddingLeft: `${8 + nodo.nivel * 16}px`, borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: negrita ? 800 : nodo.nivel === 1 ? 700 : 500, cursor: tieneHijos ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
                >
                  <span data-no-excel>{tieneHijos ? (estaAbierto(nodo) ? '⊟ ' : '⊞ ') : '   '}</span>{nodo.etiqueta}
                </td>
                {grupos.map(g => celdas(nodo, area, g, negrita))}
              </tr>
            );
          })}
          {filas.length > 0 && (
            <tr style={{ position: 'sticky', bottom: 0 }}>
              <td style={{ position: 'sticky', left: 0, zIndex: 2, background: 'white', padding: '5px 8px', fontWeight: 800, borderTop: '2px solid #1e3a8a' }}>Total</td>
              {grupos.map(g => {
                const v = totalRaiz(g);
                const variacion = v.e - v.p;
                const bueno = variacion >= 0;
                return (
                  <React.Fragment key={`t-${g.etiqueta}`}>
                    <td {...num(v.p)} style={{ ...td, background: '#f3e39b', fontWeight: 800, borderTop: '2px solid #1e3a8a' }}>{miles(v.p)}</td>
                    {conPeso && <td style={{ ...td, background: '#fffbeb', borderTop: '2px solid #1e3a8a', fontWeight: 700 }}>{v.p ? '100.0 %' : ''}</td>}
                    <td {...num(v.e)} style={{ ...td, background: '#e5e7eb', fontWeight: 800, borderTop: '2px solid #1e3a8a' }}>{miles(v.e)}</td>
                    {conPeso && <td style={{ ...td, background: '#f3f4f6', borderTop: '2px solid #1e3a8a', fontWeight: 700 }}>{v.e ? '100.0 %' : ''}</td>}
                    <td {...num(variacion)} style={{ ...td, fontWeight: 800, borderTop: '2px solid #1e3a8a', background: Math.abs(variacion) < 0.005 ? 'white' : (bueno ? '#4ade80' : '#f87171') }}>{miles(variacion)}</td>
                    <td {...num(v.p ? variacion / v.p : null, 'pct')} style={{ ...td, fontWeight: 700, borderTop: '2px solid #1e3a8a' }}>{v.p ? pct(variacion / v.p) : ''}</td>
                  </React.Fragment>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Vista estructurada: indicadores, áreas, tendencia mensual, detalle (área → grupo → subgrupo →
// cuenta) y principales desviaciones. Aquí los montos van en POSITIVO (gasto); la tabla mensual
// de abajo conserva el formato del Power BI (gastos en negativo).
// ---------------------------------------------------------------------------------------------
const COLOR_PROY = '#2a78d6';
const COLOR_EJEC = '#eb6834';
const OK = '#15803d';
const MAL = '#dc2626';
const soles = (v, d = 0) => `S/ ${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const solesMil = (v) => (Math.abs(v) >= 1e6 ? `S/ ${(Math.abs(v) / 1e6).toFixed(2)} M` : Math.abs(v) >= 1e3 ? `S/ ${(Math.abs(v) / 1e3).toFixed(1)} mil` : soles(v));
const pctTxt = (v, d = 1) => (v === null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);
// Gasto (positivo) proyectado y ejecutado de un nodo en los meses elegidos; ahorro = proy − ejec.
const gastoDe = (nodo, meses) => { const v = valoresDe(nodo, meses); const p = -v.p; const e = -v.e; return { p, e, ahorro: p - e, ejec: p > 0 ? e / p : null }; };

function Variacion({ ahorro, p, compacto }) {
  if (Math.abs(ahorro) < 0.5) return <span style={{ color: '#64748b' }}>—</span>;
  const bueno = ahorro >= 0;
  return (
    <span style={{ color: bueno ? OK : MAL, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {bueno ? '▼' : '▲'} {compacto ? solesMil(ahorro) : soles(ahorro)}{!compacto && p > 0 ? ` (${pctTxt(Math.abs(ahorro) / p)})` : ''}
      <span style={{ fontWeight: 500, color: '#64748b' }}> {bueno ? 'ahorro' : 'sobregasto'}</span>
    </span>
  );
}

// Barra de ejecución: ejecutado / proyectado, con marca en el 100%.
function BarraEjecucion({ ejec, ancho = 120 }) {
  if (ejec === null || !Number.isFinite(ejec)) return <span style={{ color: '#94a3b8' }}>—</span>;
  const tope = 1.5;
  const w = Math.min(ejec, tope) / tope * ancho;
  const color = ejec > 1.0001 ? MAL : COLOR_PROY;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
      <div style={{ position: 'relative', width: `${ancho}px`, height: '8px', background: '#eef2f7', borderRadius: '4px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${w}px`, background: color, borderRadius: '4px' }} />
        <div style={{ position: 'absolute', left: `${ancho / tope}px`, top: '-3px', bottom: '-3px', width: '2px', background: '#0f172a' }} title="100% del proyectado" />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 700, color: ejec > 1.0001 ? MAL : '#334155', minWidth: '46px', textAlign: 'right' }}>{pctTxt(ejec, 0)}</span>
    </div>
  );
}

function Tarjeta({ titulo, valor, sub, color, children, largo = false }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderTop: `4px solid ${color}`, borderRadius: '10px', padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{titulo}</div>
      <div style={{ fontSize: largo ? '16px' : '22px', fontWeight: 800, color: '#0f172a', marginTop: '2px', lineHeight: 1.25, ...(largo ? {} : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }) }}>{valor}</div>
      {sub && <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>{sub}</div>}
      {children}
    </div>
  );
}

// Tendencia mensual: barras agrupadas proyectado vs ejecutado (un solo eje, en soles).
// Solo los meses del filtro: un mes quitado (p. ej. el abierto con asientos por corregir) no se
// dibuja ni cuenta para la escala.
function Tendencia({ arbol, mesesSel, mesAbierto }) {
  const [hover, setHover] = useState(null);
  const meses = [...mesesSel].sort((a, b) => a - b);
  const datos = meses.map(i => ({ ...gastoDe(arbol, [i]), mes: i }));
  const max = Math.max(1, ...datos.flatMap(d => [d.p, d.e]));
  const cols = `repeat(${Math.max(meses.length, 1)}, 1fr)`;
  const alto = 170;
  return (
    <div>
      <div style={{ display: 'flex', gap: '16px', fontSize: '11.5px', color: '#334155', marginBottom: '8px', flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: COLOR_PROY, borderRadius: '2px', marginRight: '5px' }} />Proyectado</span>
        <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: COLOR_EJEC, borderRadius: '2px', marginRight: '5px' }} />Ejecutado</span>
        {mesAbierto !== null && meses.includes(mesAbierto) && <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: `repeating-linear-gradient(45deg, ${COLOR_EJEC} 0 2px, #fde2d4 2px 4px)`, borderRadius: '2px', marginRight: '5px' }} />Mes en curso (abierto)</span>}
      </div>
      <div style={{ position: 'relative' }}>
        {meses.length === 0 && <div style={{ color: '#94a3b8', fontSize: '12px', padding: '20px 0' }}>Elige al menos un mes en el filtro.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '6px', alignItems: 'end', height: `${alto}px`, borderBottom: '1px solid #cbd5e1', padding: '0 2px' }}>
          {datos.map((d, k) => {
            const abierto = d.mes === mesAbierto;
            return (
              <div key={d.mes} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)}
                style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '2px', height: '100%', cursor: 'default', background: hover === k ? '#f1f5f9' : 'transparent', borderRadius: '4px 4px 0 0' }}>
                <div style={{ width: '38%', maxWidth: '48px', height: `${(d.p / max) * 100}%`, background: COLOR_PROY, borderRadius: '4px 4px 0 0' }} />
                <div style={{ width: '38%', maxWidth: '48px', height: `${(d.e / max) * 100}%`, background: abierto ? `repeating-linear-gradient(45deg, ${COLOR_EJEC} 0 3px, #fde2d4 3px 6px)` : COLOR_EJEC, borderRadius: '4px 4px 0 0' }} />
              </div>
            );
          })}
        </div>
        {hover !== null && datos[hover] && (
          <div style={{ position: 'absolute', top: 0, left: `${Math.min(hover / Math.max(datos.length, 1), 0.75) * 100}%`, background: '#0f172a', color: 'white', borderRadius: '8px', padding: '8px 10px', fontSize: '11.5px', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.2)', zIndex: 5, minWidth: '190px' }}>
            <div style={{ fontWeight: 800, marginBottom: '4px', textTransform: 'capitalize' }}>{MESES[datos[hover].mes]}{datos[hover].mes === mesAbierto ? ' · en curso (abierto)' : ''}</div>
            <div>Proyectado: <b>{soles(datos[hover].p)}</b></div>
            <div>Ejecutado: <b>{soles(datos[hover].e)}</b></div>
            <div>Ejecución: <b>{pctTxt(datos[hover].ejec)}</b> · {datos[hover].ahorro >= 0 ? 'ahorro' : 'sobregasto'} {soles(datos[hover].ahorro)}</div>
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '6px', fontSize: '10.5px', color: '#475569', textAlign: 'center', marginTop: '4px' }}>
        {meses.map(i => <div key={i} style={{ fontWeight: i === mesAbierto ? 800 : 500 }}>{MESES[i].slice(0, 3)}{i === mesAbierto ? ' ●' : ''}</div>)}
      </div>
    </div>
  );
}

// Detalle y subdetalle: Área → Grupo → Subgrupo → Cuenta, totales del periodo elegido.
function TablaDetalle({ arbol, meses, expandirTodo }) {
  const [abiertos, setAbiertos] = useState({});
  const estaAbierto = (n) => expandirTodo || !!abiertos[n.clave];
  const filas = [];
  const recorrer = (nodo, area) => {
    Object.values(nodo.hijos)
      .map(h => ({ h, g: gastoDe(h, meses) }))
      .filter(x => Math.abs(x.g.p) >= 0.5 || Math.abs(x.g.e) >= 0.5)
      .sort((a, b) => Math.max(b.g.p, b.g.e) - Math.max(a.g.p, a.g.e))
      .forEach(({ h, g }) => {
        const ar = h.nivel === 0 ? g : area;
        filas.push({ h, g, area: ar });
        if (Object.keys(h.hijos).length && estaAbierto(h)) recorrer(h, ar);
      });
  };
  recorrer(arbol, null);
  const total = gastoDe(arbol, meses);
  const NIVEL = ['Área', 'Grupo', 'Subgrupo', 'Cuenta'];
  const fondo = ['#eff6ff', '#f8fafc', 'white', 'white'];
  const th = { padding: '8px 10px', fontSize: '10.5px', color: '#475569', textAlign: 'right', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 };
  const td = { padding: '7px 10px', fontSize: '12px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const expandirNivel = (nivelMax) => {
    const nuevos = {};
    const marcar = (n) => Object.values(n.hijos).forEach(h => { if (h.nivel < nivelMax) { nuevos[h.clave] = true; marcar(h); } });
    marcar(arbol);
    setAbiertos(nuevos);
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }} data-no-print>
        <span style={{ fontSize: '11.5px', color: '#64748b', alignSelf: 'center' }}>Abrir hasta:</span>
        {['Área', 'Grupo', 'Subgrupo', 'Cuenta'].map((n, i) => <button key={n} type="button" className="btn-ghost" onClick={() => expandirNivel(i)} style={{ padding: '4px 10px', fontSize: '11.5px' }}>{n}</button>)}
      </div>
      <div style={{ overflow: 'auto', maxHeight: '560px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <table data-hoja="Detalle por área" data-titulo="Gastos - detalle por área, grupo, subgrupo y cuenta (gasto en positivo)" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left', minWidth: '320px' }}>Área / grupo / subgrupo / cuenta</th>
            <th style={th}>Proyectado</th><th style={th}>Peso</th><th style={th}>Ejecutado</th><th style={th}>Variación</th><th style={th}>Ejecución</th>
          </tr></thead>
          <tbody>
            {filas.map(({ h, g, area }) => {
              const tieneHijos = Object.keys(h.hijos).length > 0;
              const peso = h.nivel === 0 ? (total.p > 0 ? g.p / total.p : null) : (area?.p > 0 ? g.p / area.p : null);
              return (
                <tr key={h.clave} style={{ background: fondo[h.nivel] || 'white' }}>
                  <td data-nivel={h.nivel} onClick={() => tieneHijos && setAbiertos(p => ({ ...p, [h.clave]: !estaAbierto(h) }))}
                    style={{ ...td, textAlign: 'left', paddingLeft: `${10 + h.nivel * 18}px`, cursor: tieneHijos ? 'pointer' : 'default', fontWeight: h.nivel === 0 ? 800 : h.nivel === 1 ? 700 : 500, color: '#0f172a', maxWidth: '460px', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    title={`${NIVEL[h.nivel] || ''}: ${h.etiqueta}`}>
                    <span data-no-excel style={{ display: 'inline-block', width: '16px', color: '#64748b' }}>{tieneHijos ? (estaAbierto(h) ? '▾' : '▸') : ''}</span>{h.etiqueta}
                  </td>
                  <td style={td} data-valor={g.p} data-formato="moneda">{soles(g.p)}</td>
                  <td style={{ ...td, color: '#64748b' }} data-valor={peso ?? ''} data-formato="pct">{pctTxt(peso)}</td>
                  <td style={td} data-valor={g.e} data-formato="moneda">{soles(g.e)}</td>
                  <td style={td} data-valor={g.ahorro} data-formato="moneda"><Variacion ahorro={g.ahorro} p={g.p} /></td>
                  <td style={td} data-valor={g.ejec ?? ''} data-formato="pct"><BarraEjecucion ejec={g.ejec} ancho={90} /></td>
                </tr>
              );
            })}
            <tr style={{ background: '#e2e8f0' }}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>TOTAL</td>
              <td style={{ ...td, fontWeight: 800 }} data-valor={total.p} data-formato="moneda">{soles(total.p)}</td>
              <td style={td}>100%</td>
              <td style={{ ...td, fontWeight: 800 }} data-valor={total.e} data-formato="moneda">{soles(total.e)}</td>
              <td style={td} data-valor={total.ahorro} data-formato="moneda"><Variacion ahorro={total.ahorro} p={total.p} /></td>
              <td style={td} data-valor={total.ejec ?? ''} data-formato="pct"><BarraEjecucion ejec={total.ejec} ancho={90} /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function GastosProyVsEjec({ registrosTotales = [], versiones = [], idVersionFiltro = '', expandirTodo = false }) {
  const idVersion = idVersionFiltro || versiones[versiones.length - 1]?.id_version || '';

  const anios = useMemo(() => {
    const set = new Set();
    registrosTotales.filter(r => !idVersion || r.id_version === idVersion).forEach(r => {
      const a = String(r.fecha_proyeccion || '').slice(0, 4);
      if (/^\d{4}$/.test(a)) set.add(a);
    });
    return [...set].sort();
  }, [registrosTotales, idVersion]);
  const [anioSel, setAnioSel] = useState('');
  const anio = anios.includes(anioSel) ? anioSel : (anios[anios.length - 1] || String(new Date().getFullYear()));
  // Mes en curso: se muestra, pero se marca "abierto" (asientos por saldar) y se puede quitar con el filtro.
  const hoy = new Date();
  const mesAbierto = String(hoy.getFullYear()) === String(anio) ? hoy.getMonth() : null;

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

  // Nombres de cuenta desde el maestro (para las cuentas que solo vienen con código desde Odoo)
  const [nombresCuenta, setNombresCuenta] = useState({});
  const [clasificacionMaestro, setClasificacionMaestro] = useState({});
  useEffect(() => {
    obtenerCuentasOdoo().then(lista => {
      setClasificacionMaestro(clasificacionDesdeMaestro(lista || []));
      const mapa = {};
      (lista || []).forEach(c => {
        const cod = String(c.codigo || c.id || '');
        if (cod) mapa[cod.length > 7 ? cod.slice(-7) : cod] = c.nombre;
      });
      setNombresCuenta(mapa);
    }).catch(() => {});
  }, []);

  const movimientos = useMemo(() => [
    ...movimientosProyectados(registrosTotales, { idVersion, anio }, clasificacionMaestro),
    ...(estadoEjec === 'ok' ? movimientosEjecutados(ejecutadoOdoo, clasificacionMaestro) : []),
  ], [registrosTotales, idVersion, anio, ejecutadoOdoo, estadoEjec, clasificacionMaestro]);

  const areas = useMemo(() => [...new Set(movimientos.map(m => m.area))].sort(), [movimientos]);
  const [areasSel, setAreasSel] = useState(null); // null = todas
  const [mesesSel, setMesesSel] = useState(MESES.map((_, i) => i));
  const [verMensual, setVerMensual] = useState(false);
  const areasActivas = areasSel ? areas.filter(a => areasSel.includes(a)) : areas;

  // Una sola etiqueta por CÓDIGO: el nombre del maestro y, si no está, el primero que traiga un registro.
  const nombrePorCodigo = useMemo(() => {
    const mapa = {};
    movimientos.forEach(m => {
      if (!mapa[m.codigo]) mapa[m.codigo] = nombresCuenta[m.base] || m.nombre || '';
    });
    return mapa;
  }, [movimientos, nombresCuenta]);

  const etiquetaCuenta = (m) => {
    const nombre = nombrePorCodigo[m.codigo] || '';
    return nombre ? `${m.codigo} - ${abreviarNombreCuenta(nombre)}` : m.codigo;
  };

  const deAreas = movimientos.filter(m => areasActivas.includes(m.area));
  const filtrados = deAreas.filter(m => mesesSel.includes(m.mes));
  const arbolAreas = useMemo(() => construirArbol(filtrados, [m => m.area, m => m.grupo, m => m.subgrupo, m => m.id, etiquetaCuenta]), [filtrados, nombrePorCodigo]); // eslint-disable-line react-hooks/exhaustive-deps
  const arbolSubgrupos = useMemo(() => construirArbol(filtrados, [m => m.subgrupo, m => m.id, etiquetaCuenta]), [filtrados, nombrePorCodigo]); // eslint-disable-line react-hooks/exhaustive-deps
  // Resumen: todos los meses (la tendencia los muestra todos y atenúa los que están fuera del filtro).
  const arbolResumen = useMemo(() => construirArbol(deAreas, [m => m.area, m => m.grupo, m => m.subgrupo, etiquetaCuenta]), [deAreas, nombrePorCodigo]); // eslint-disable-line react-hooks/exhaustive-deps
  const arbolTodasAreas = useMemo(() => construirArbol(movimientos, [m => m.area]), [movimientos]);

  // ---------- indicadores ----------
  const total = gastoDe(arbolResumen, mesesSel);
  const porArea = Object.values(arbolTodasAreas.hijos).map(n => ({ area: n.etiqueta, ...gastoDe(n, mesesSel) }))
    .filter(a => a.p > 0.5 || a.e > 0.5).sort((a, b) => b.p - a.p);
  const porAreaActivas = porArea.filter(a => areasActivas.includes(a.area));
  const peorArea = [...porAreaActivas].sort((a, b) => a.ahorro - b.ahorro)[0];
  const mejorArea = [...porAreaActivas].sort((a, b) => b.ahorro - a.ahorro)[0];
  const mesesConEjec = mesesSel.filter(i => gastoDe(arbolResumen, [i]).e > 0.5).length;
  // Principales desviaciones por cuenta en el periodo.
  const desviaciones = useMemo(() => {
    const porCuenta = {};
    filtrados.forEach(m => {
      const k = `${m.area}|${m.codigo}`;
      if (!porCuenta[k]) porCuenta[k] = { area: m.area, cuenta: etiquetaCuenta(m), subgrupo: m.subgrupo, p: 0, e: 0 };
      porCuenta[k].p += -m.proyectado;
      porCuenta[k].e += -m.ejecutado;
    });
    return Object.values(porCuenta).map(c => ({ ...c, ahorro: c.p - c.e }));
  }, [filtrados, nombrePorCodigo]); // eslint-disable-line react-hooks/exhaustive-deps
  const topSobregasto = desviaciones.filter(d => d.ahorro < -0.5).sort((a, b) => a.ahorro - b.ahorro).slice(0, 8);
  const topAhorro = desviaciones.filter(d => d.ahorro > 0.5).sort((a, b) => b.ahorro - a.ahorro).slice(0, 8);

  const toggle = (lista, valor) => (lista.includes(valor) ? lista.filter(v => v !== valor) : [...lista, valor]);
  const cerrados = mesAbierto === null ? MESES.map((_, i) => i) : MESES.map((_, i) => i).filter(i => i < mesAbierto);
  const hastaHoy = mesAbierto === null ? MESES.map((_, i) => i) : MESES.map((_, i) => i).filter(i => i <= mesAbierto);
  const igual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const seguidos = mesesSel.every((m, k) => k === 0 || m === mesesSel[k - 1] + 1);
  const periodo = mesesSel.length === 12 ? 'todo el año' : mesesSel.length === 0 ? 'sin meses' : mesesSel.length === 1 ? MESES[mesesSel[0]]
    : seguidos ? `${MESES[mesesSel[0]]} a ${MESES[mesesSel[mesesSel.length - 1]]} (${mesesSel.length} meses)` : `${mesesSel.map(i => MESES[i].slice(0, 3)).join(', ')} (${mesesSel.length} meses)`;

  const card = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 18px', marginBottom: '14px' };
  const h3 = { margin: '0 0 10px', fontSize: '15px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' };
  const chip = (activo) => ({ padding: '5px 11px', borderRadius: '999px', border: `1px solid ${activo ? '#1e3a8a' : '#cbd5e1'}`, background: activo ? '#1e3a8a' : 'white', color: activo ? 'white' : '#334155', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' });
  const tdL = { padding: '6px 8px', fontSize: '12px', borderBottom: '1px solid #f1f5f9' };

  return (
    <div style={{ minWidth: 0 }}>
      {/* Encabezado y filtros */}
      <div style={{ ...card, background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '.12em', opacity: .8, fontWeight: 700 }}>GASTOS · PROYECTADO VS EJECUTADO{idVersion ? ` · ${idVersion.toUpperCase()}` : ''}</div>
            <div style={{ fontSize: '24px', fontWeight: 900 }}>C&amp;V International {anio}</div>
            <div style={{ fontSize: '12px', opacity: .9 }}>Periodo: {periodo} · {areasSel ? `${areasActivas.length} de ${areas.length} áreas` : 'todas las áreas'}</div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {(anios.length ? anios : [anio]).map(a => (
              <button key={a} type="button" onClick={() => setAnioSel(a)} style={{ ...chip(a === anio), borderColor: 'rgba(255,255,255,.5)', background: a === anio ? 'white' : 'transparent', color: a === anio ? '#1e3a8a' : 'white' }}>{a}</button>
            ))}
            <span style={{ fontSize: '11px', fontWeight: 600, marginLeft: '6px', color: estadoEjec === 'ok' ? '#bbf7d0' : estadoEjec === 'error' ? '#fecaca' : '#e2e8f0' }}>
              {estadoEjec === 'ok' ? '● Ejecutado de Odoo' : estadoEjec === 'error' ? '● Sin conexión a Odoo' : '● Cargando ejecutado...'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ ...card, padding: '12px 16px' }} data-no-print>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
          <b style={{ fontSize: '11px', color: '#64748b', width: '60px' }}>MESES</b>
          <button type="button" style={chip(mesesSel.length === 12)} onClick={() => setMesesSel(MESES.map((_, i) => i))}>Todo el año</button>
          {mesAbierto !== null && mesAbierto > 0 && <button type="button" style={chip(igual(mesesSel, cerrados))} onClick={() => setMesesSel(cerrados)}>Meses cerrados</button>}
          {mesAbierto !== null && <button type="button" style={chip(igual(mesesSel, hastaHoy))} onClick={() => setMesesSel(hastaHoy)}>Hasta el mes en curso</button>}
          <span style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 4px' }} />
          {MESES.map((m, i) => (
            <button key={m} type="button" style={{ ...chip(mesesSel.includes(i)), ...(i === mesAbierto ? { borderStyle: 'dashed' } : {}) }}
              title={i === mesAbierto ? 'Mes en curso: aún abierto, puede tener asientos por saldar' : ''}
              onClick={() => setMesesSel(toggle(mesesSel, i).sort((x, y) => x - y))}>
              {m.slice(0, 3)}{i === mesAbierto ? ' · abierto' : ''}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <b style={{ fontSize: '11px', color: '#64748b', width: '60px' }}>ÁREAS</b>
          <button type="button" style={chip(!areasSel)} onClick={() => setAreasSel(null)}>Todas</button>
          {areas.map(a => (
            <button key={a} type="button" style={chip(!!areasSel && areasSel.includes(a))} onClick={() => { const base = areasSel || []; const nueva = toggle(base, a); setAreasSel(nueva.length ? nueva : null); }}>{a}</button>
          ))}
        </div>
      </div>

      {/* Indicadores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '14px' }}>
        <Tarjeta titulo="Gasto proyectado" valor={solesMil(total.p)} sub={soles(total.p)} color={COLOR_PROY} />
        <Tarjeta titulo="Gasto ejecutado" valor={solesMil(total.e)} sub={`${soles(total.e)} · ${mesesConEjec} ${mesesConEjec === 1 ? 'mes' : 'meses'} con ejecución`} color={COLOR_EJEC} />
        <Tarjeta titulo={total.ahorro >= 0 ? 'Ahorro' : 'Sobregasto'} valor={<span style={{ color: total.ahorro >= 0 ? OK : MAL }}>{total.ahorro >= 0 ? '▼' : '▲'} {solesMil(total.ahorro)}</span>}
          sub={total.p > 0 ? `${pctTxt(Math.abs(total.ahorro) / total.p)} ${total.ahorro >= 0 ? 'por debajo' : 'por encima'} de lo proyectado` : ''} color={total.ahorro >= 0 ? OK : MAL} />
        <Tarjeta titulo="Ejecución del presupuesto" valor={pctTxt(total.ejec)} color="#0f172a">
          <div style={{ marginTop: '6px' }}><BarraEjecucion ejec={total.ejec} ancho={150} /></div>
        </Tarjeta>
        {peorArea && peorArea.ahorro < 0 && <Tarjeta largo titulo="Mayor sobregasto" valor={peorArea.area} sub={<Variacion ahorro={peorArea.ahorro} p={peorArea.p} compacto />} color={MAL} />}
        {mejorArea && mejorArea.ahorro > 0 && <Tarjeta largo titulo="Mayor ahorro" valor={mejorArea.area} sub={<Variacion ahorro={mejorArea.ahorro} p={mejorArea.p} compacto />} color={OK} />}
      </div>

      {/* Por área */}
      <div style={card}>
        <h3 style={h3}>🏢 Por área <span style={{ fontSize: '11.5px', fontWeight: 500, color: '#64748b' }}>· clic en una tarjeta para ver solo esa área</span></h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '10px' }}>
          {porArea.map(a => {
            const activa = areasActivas.includes(a.area);
            const sola = areasSel && areasSel.length === 1 && areasSel[0] === a.area;
            return (
              <button key={a.area} type="button" onClick={() => setAreasSel(sola ? null : [a.area])}
                style={{ textAlign: 'left', background: sola ? '#eff6ff' : 'white', border: `1px solid ${sola ? '#2563eb' : '#e2e8f0'}`, borderLeft: `4px solid ${a.ahorro >= 0 ? OK : MAL}`, borderRadius: '10px', padding: '10px 12px', cursor: 'pointer', opacity: activa ? 1 : 0.45 }}>
                <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}>{a.area}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#475569' }}><span>Proyectado</span><b style={{ color: '#0f172a' }}>{solesMil(a.p)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#475569', marginBottom: '6px' }}><span>Ejecutado</span><b style={{ color: '#0f172a' }}>{solesMil(a.e)}</b></div>
                <BarraEjecucion ejec={a.ejec} ancho={130} />
                <div style={{ fontSize: '11.5px', marginTop: '4px' }}><Variacion ahorro={a.ahorro} p={a.p} compacto /></div>
              </button>
            );
          })}
          {porArea.length === 0 && <div style={{ color: '#94a3b8', fontSize: '13px' }}>No hay gastos para los filtros seleccionados.</div>}
        </div>
      </div>

      {/* Tendencia */}
      <div style={card} data-no-excel>
        <h3 style={h3}>📈 Tendencia mensual (gasto, S/)</h3>
        <Tendencia arbol={arbolResumen} mesesSel={mesesSel} mesAbierto={mesAbierto} />
      </div>

      {/* Detalle y subdetalle */}
      <div style={card}>
        <h3 style={h3}>🧾 Detalle por área, grupo, subgrupo y cuenta <span style={{ fontSize: '11.5px', fontWeight: 500, color: '#64748b' }}>· {periodo} · clic en una fila para abrir su detalle</span></h3>
        <TablaDetalle arbol={construirArbol(filtrados, [m => m.area, m => m.grupo, m => m.subgrupo, etiquetaCuenta])} meses={mesesSel} expandirTodo={expandirTodo} />
      </div>

      {/* Principales desviaciones */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '14px' }}>
        {[['▲ Cuentas con mayor sobregasto', topSobregasto, MAL], ['▼ Cuentas con mayor ahorro', topAhorro, OK]].map(([titulo, lista, color]) => (
          <div key={titulo} style={card}>
            <h3 style={{ ...h3, color }}>{titulo}</h3>
            <table data-hoja={titulo.includes('sobregasto') ? 'Mayor sobregasto' : 'Mayor ahorro'} style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>{['Cuenta', 'Área', 'Proyectado', 'Ejecutado', 'Variación'].map((c, i) => <th key={c} style={{ ...tdL, fontSize: '10.5px', color: '#475569', background: '#f8fafc', textAlign: i < 2 ? 'left' : 'right' }}>{c}</th>)}</tr></thead>
              <tbody>
                {lista.length === 0 && <tr><td colSpan={5} style={{ ...tdL, color: '#94a3b8' }}>Ninguna en el periodo.</td></tr>}
                {lista.map(d => (
                  <tr key={d.area + d.cuenta}>
                    <td style={{ ...tdL, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${d.cuenta} · ${d.subgrupo}`}>{d.cuenta}</td>
                    <td style={{ ...tdL, color: '#64748b', whiteSpace: 'nowrap' }}>{d.area}</td>
                    <td style={{ ...tdL, textAlign: 'right' }} data-valor={d.p} data-formato="moneda">{soles(d.p)}</td>
                    <td style={{ ...tdL, textAlign: 'right' }} data-valor={d.e} data-formato="moneda">{soles(d.e)}</td>
                    <td style={{ ...tdL, textAlign: 'right', color, fontWeight: 700, whiteSpace: 'nowrap' }} data-valor={d.ahorro} data-formato="moneda">{soles(d.ahorro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Detalle mensual en formato Power BI */}
      <div style={card}>
        <button type="button" className="btn-ghost" onClick={() => setVerMensual(!verMensual)} data-no-print>{verMensual || expandirTodo ? '▾' : '▸'} Detalle mensual (formato Power BI, gastos en negativo)</button>
        {(verMensual || expandirTodo) && (
          <div style={{ marginTop: '10px' }}>
            <TablaArbol arbol={arbolAreas} mesesVisibles={mesesSel} conPeso titulo="ÁREA GASTOS" abiertoPorDefecto={1} expandirTodo={expandirTodo} />
            <TablaArbol arbol={arbolSubgrupos} mesesVisibles={mesesSel} conPeso={false} titulo="SUBGRUPO" abiertoPorDefecto={0} expandirTodo={expandirTodo} />
          </div>
        )}
      </div>

      <div style={{ fontSize: '10.5px', color: '#64748b', lineHeight: 1.5 }}>
        Proyectado: gastos registrados en el sistema para la versión y año. Ejecutado: asientos publicados en Odoo (cuentas de destino 9x); el mes en curso aparece marcado como «abierto» porque puede tener asientos por saldar — quítalo con «Meses cerrados».
        Arriba los montos van como gasto (positivo): ▼ ahorro = se gastó menos de lo proyectado, ▲ sobregasto = se gastó más. Ejecución = ejecutado ÷ proyectado.
      </div>
    </div>
  );
}
