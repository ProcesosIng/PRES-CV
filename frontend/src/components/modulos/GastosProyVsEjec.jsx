import React, { useState, useEffect, useMemo } from 'react';
import { API_URL } from '../../config/api';
import { obtenerCuentasOdoo } from '../../data/store';
import { abreviarNombreCuenta } from '../../config/cuentas';
import { movimientosProyectados, movimientosEjecutados } from '../../config/gastos';

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

const valoresDe = (nodo, meses) => meses.reduce((acc, i) => {
  const v = nodo.meses[i];
  if (v) { acc.p += v.p; acc.e += v.e; }
  return acc;
}, { p: 0, e: 0 });

function TablaArbol({ arbol, mesesVisibles, conPeso, titulo, abiertoPorDefecto = 1 }) {
  const [abiertos, setAbiertos] = useState({});
  const estaAbierto = (n) => (abiertos[n.clave] ?? n.nivel < abiertoPorDefecto);
  const grupos = [...mesesVisibles.map(i => ({ etiqueta: MESES[i], meses: [i] })), { etiqueta: 'Total', meses: mesesVisibles }];
  const th = { padding: '5px 8px', fontSize: '10px', whiteSpace: 'nowrap' };
  const td = { padding: '4px 8px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '11px', borderBottom: '1px solid #e2e8f0' };

  const filas = [];
  const recorrer = (nodo, padreArea) => {
    Object.values(nodo.hijos).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta)).forEach(h => {
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
        <td style={{ ...td, background: '#f3e39b', fontWeight: fw }}>{miles(v.p)}</td>
        {conPeso && <td style={{ ...td, background: '#fffbeb' }}>{base.p ? pct(v.p / base.p) : ''}</td>}
        <td style={{ ...td, background: '#e5e7eb', fontWeight: fw }}>{miles(v.e)}</td>
        {conPeso && <td style={{ ...td, background: '#f3f4f6' }}>{base.e ? pct(v.e / base.e) : ''}</td>}
        <td style={{ ...td, fontWeight: 700, background: sinDatos ? 'white' : (bueno ? '#4ade80' : '#f87171') }}>{miles(variacion)}</td>
        <td style={{ ...td, background: sinDatos || varPct === null ? 'white' : (bueno ? '#86efac' : '#fca5a5') }}>{pct(varPct)}</td>
      </React.Fragment>
    );
  };

  const colsPorGrupo = conPeso ? 6 : 4;
  return (
    <div style={{ background: 'white', border: '2px solid #1e3a8a', borderRadius: '8px', overflow: 'auto', maxHeight: '46vh', marginBottom: '14px' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
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
                  onClick={() => tieneHijos && setAbiertos(p => ({ ...p, [nodo.clave]: !estaAbierto(nodo) }))}
                  style={{ position: 'sticky', left: 0, zIndex: 2, background: negrita ? '#eff6ff' : 'white', padding: '4px 8px', paddingLeft: `${8 + nodo.nivel * 16}px`, borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: negrita ? 800 : nodo.nivel === 1 ? 700 : 500, cursor: tieneHijos ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
                >
                  {tieneHijos ? (estaAbierto(nodo) ? '⊟ ' : '⊞ ') : '   '}{nodo.etiqueta}
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
                    <td style={{ ...td, background: '#f3e39b', fontWeight: 800, borderTop: '2px solid #1e3a8a' }}>{miles(v.p)}</td>
                    {conPeso && <td style={{ ...td, background: '#fffbeb', borderTop: '2px solid #1e3a8a', fontWeight: 700 }}>{v.p ? '100.0 %' : ''}</td>}
                    <td style={{ ...td, background: '#e5e7eb', fontWeight: 800, borderTop: '2px solid #1e3a8a' }}>{miles(v.e)}</td>
                    {conPeso && <td style={{ ...td, background: '#f3f4f6', borderTop: '2px solid #1e3a8a', fontWeight: 700 }}>{v.e ? '100.0 %' : ''}</td>}
                    <td style={{ ...td, fontWeight: 800, borderTop: '2px solid #1e3a8a', background: Math.abs(variacion) < 0.005 ? 'white' : (bueno ? '#4ade80' : '#f87171') }}>{miles(variacion)}</td>
                    <td style={{ ...td, fontWeight: 700, borderTop: '2px solid #1e3a8a' }}>{v.p ? pct(variacion / v.p) : ''}</td>
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

export default function GastosProyVsEjec({ registrosTotales = [], versiones = [], idVersionFiltro = '' }) {
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
  useEffect(() => {
    obtenerCuentasOdoo().then(lista => {
      const mapa = {};
      (lista || []).forEach(c => {
        const cod = String(c.codigo || c.id || '');
        if (cod) mapa[cod.length > 7 ? cod.slice(-7) : cod] = c.nombre;
      });
      setNombresCuenta(mapa);
    }).catch(() => {});
  }, []);

  const movimientos = useMemo(() => [
    ...movimientosProyectados(registrosTotales, { idVersion, anio }),
    ...(estadoEjec === 'ok' ? movimientosEjecutados(ejecutadoOdoo) : []),
  ], [registrosTotales, idVersion, anio, ejecutadoOdoo, estadoEjec]);

  const areas = useMemo(() => [...new Set(movimientos.map(m => m.area))].sort(), [movimientos]);
  const [areasSel, setAreasSel] = useState(null); // null = todas
  const [mesesSel, setMesesSel] = useState(MESES.map((_, i) => i));
  const areasActivas = areasSel ? areas.filter(a => areasSel.includes(a)) : areas;

  // Una sola etiqueta por CÓDIGO: el nombre del maestro y, si no está, el primero que traiga un registro.
  // (Así la misma cuenta no se parte en dos filas si el proyectado y Odoo la nombran distinto.)
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

  const filtrados = movimientos.filter(m => areasActivas.includes(m.area) && mesesSel.includes(m.mes));
  const arbolAreas = useMemo(() => construirArbol(filtrados, [m => m.area, m => m.grupo, m => m.subgrupo, etiquetaCuenta]), [filtrados, nombrePorCodigo]);
  const arbolSubgrupos = useMemo(() => construirArbol(filtrados, [m => m.subgrupo, etiquetaCuenta]), [filtrados, nombrePorCodigo]);

  const toggle = (lista, valor) => (lista.includes(valor) ? lista.filter(v => v !== valor) : [...lista, valor]);
  const panel = { background: 'white', border: '2px solid #1e3a8a', borderRadius: '8px', marginBottom: '10px', overflow: 'hidden' };
  const cab = { background: '#1e3a8a', color: 'white', fontWeight: 800, textAlign: 'center', padding: '6px', fontSize: '12px' };
  const item = { display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '12px', alignItems: 'start' }}>
      <div>
        <div style={panel}>
          <div style={cab}>ÁREA</div>
          <div style={{ maxHeight: '160px', overflowY: 'auto', padding: '4px 0' }}>
            {areas.map(a => (
              <label key={a} style={item}>
                <input type="checkbox" checked={areasActivas.includes(a)} onChange={() => setAreasSel(toggle(areasActivas, a))} /> {a.toUpperCase()}
              </label>
            ))}
            {areas.length === 0 && <div style={{ ...item, color: '#94a3b8' }}>Sin datos</div>}
          </div>
        </div>
        <div style={panel}>
          <div style={cab}>AÑO</div>
          <div style={{ padding: '4px 0' }}>
            {(anios.length ? anios : [anio]).slice().reverse().map(a => (
              <label key={a} style={item}><input type="radio" name="anio-gastos" checked={a === anio} onChange={() => setAnioSel(a)} /> {a}</label>
            ))}
          </div>
        </div>
        <div style={panel}>
          <div style={cab}>MES</div>
          <div style={{ padding: '4px 0' }}>
            <label style={{ ...item, fontWeight: 700 }}>
              <input type="checkbox" checked={mesesSel.length === 12} onChange={() => setMesesSel(mesesSel.length === 12 ? [] : MESES.map((_, i) => i))} /> Todos
            </label>
            {MESES.map((m, i) => (
              <label key={m} style={item}><input type="checkbox" checked={mesesSel.includes(i)} onChange={() => setMesesSel(toggle(mesesSel, i).sort((x, y) => x - y))} /> {m}</label>
            ))}
          </div>
        </div>
        <div style={{ fontSize: '10px', fontWeight: 600, color: estadoEjec === 'ok' ? '#15803d' : estadoEjec === 'error' ? '#b91c1c' : '#64748b', padding: '0 4px' }}>
          {estadoEjec === 'ok' ? '● Ejecutado cargado desde Odoo' : estadoEjec === 'error' ? '● No se pudo leer el ejecutado de Odoo' : '● Cargando ejecutado...'}
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ background: '#1e3a8a', color: 'white', borderRadius: '8px', padding: '10px 16px', fontSize: '22px', fontWeight: 900, textAlign: 'center', marginBottom: '12px', letterSpacing: '0.02em' }}>
          GASTOS - C&amp;V INTERNATIONAL · {anio}{idVersion ? ` · ${idVersion.toUpperCase()}` : ''}
        </div>
        <TablaArbol arbol={arbolAreas} mesesVisibles={mesesSel} conPeso titulo="ÁREA GASTOS" abiertoPorDefecto={1} />
        <TablaArbol arbol={arbolSubgrupos} mesesVisibles={mesesSel} conPeso={false} titulo="SUBGRUPO" abiertoPorDefecto={0} />
        <div style={{ fontSize: '10px', color: '#64748b', lineHeight: 1.5 }}>
          Proyectado: gastos registrados en el sistema para la versión y año. Ejecutado: asientos publicados en Odoo (cuentas de destino 9x).
          Gastos en negativo · Variación = Ejecutado − Proyectado (verde = se gastó menos) · %Var = Variación / Proyectado · %G = peso dentro del área.
        </div>
      </div>
    </div>
  );
}
