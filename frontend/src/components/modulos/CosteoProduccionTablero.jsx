import React, { useMemo, useRef, useState } from 'react';
import { listarForecastComercial, listarRegistros, listarTodosLosRegistros, guardarRegistrosLote } from '../../data/store';
import { MESES_COSTEO, BLOQUES, PARAMETROS_POR_DEFECTO, costosDelArea, calcularCosteo, pesoSugerido } from '../../config/costeoCrisoles';
import { imprimirElemento } from '../../config/impresion';
import { exportarTablasHtml } from '../../config/excel';

// =====================================================================
// COSTEO DE PRODUCCIÓN (Crisoles y Copelas) — pantalla completa (reemplaza la ventana emergente).
// Toma el plan del forecast de la unidad de negocio, los costos registrados en los módulos
// del área con su proceso (1er, 2do, compartido/CIF) y los parámetros de planta, y calcula
// el costo por tamaño y mes con el motor de config/costeoCrisoles.js.
// =====================================================================
// Configuración de cada costeo que usa este tablero (misma lógica: 1er proceso, 2do proceso y CIF compartido).
export const COSTEOS_TABLERO = {
  'Costeo de Crisoles': {
    unidad: 'Crisoles de Arcilla', clave: 'CRI', titulo: 'Costeo de Crisoles', producto: 'crisol', productos: 'crisoles', bueno: 'bueno', buenos: 'buenos',
    bloques: { p1: '1er proceso (prensado)', p2: '2do proceso (calcinado)', comp: 'CIF compartido' },
    capacidad: ['Crisoles por calcinación', 'Calcinaciones por mes', 'Hornos'], pesoSugerido,
  },
  'Costeo de Copelas': {
    unidad: 'Copelas', clave: 'COP', titulo: 'Costeo de Copelas', producto: 'copela', productos: 'copelas', bueno: 'buena', buenos: 'buenas',
    bloques: { p1: '1er proceso', p2: '2do proceso', comp: 'CIF compartido' },
    capacidad: ['Copelas por horneada', 'Horneadas por mes', 'Hornos'], pesoSugerido: () => 0,
  },
};
const ANIO_ACTUAL = new Date().getFullYear();
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const fmt = (v, d = 2) => (Math.abs(num(v)) < 1e-9 ? '—' : num(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtQ = (v) => (Math.abs(num(v)) < 0.5 ? '—' : Math.round(num(v)).toLocaleString('en-US'));
const slug = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// El año se elige arriba; al cambiarlo se vuelve a montar el tablero con lo guardado de ese año.
export default function CosteoProduccionTablero(props) {
  const [anio, setAnio] = useState(String(ANIO_ACTUAL));
  return <TableroAnio key={`${props.idVersion}-${anio}`} {...props} anio={anio} setAnio={setAnio} />;
}

function TableroAnio({ idVersion, area, usuario, anio, setAnio, modulo = 'Costeo de Crisoles' }) {
  const MODULO = modulo;
  const CFG = COSTEOS_TABLERO[modulo];
  const BLOQUES_UI = BLOQUES.map(b => ({ ...b, nombre: CFG.bloques[b.clave] }));
  const puedeEditar = usuario?.esAdmin || (usuario?.areasPermitidas || []).includes(area);
  const refReporte = useRef(null);
  const [recarga, setRecarga] = useState(0);

  // Costeo guardado (uno por producto) para restaurar parámetros y ajustes.
  const guardados = useMemo(
    () => listarRegistros({ idVersion, area, modulo: MODULO }).filter(r => r.detalle_columnas?.version_costeo === 2 && String(r.detalle_columnas?.anio_proyeccion) === anio),
    [idVersion, area, anio, recarga]
  );
  const base = guardados[0]?.detalle_columnas || {};

  // Demanda del forecast por producto (en crisoles).
  const demandaForecast = useMemo(() => {
    const mapa = {};
    listarForecastComercial(idVersion).forEach(f => {
      if (f.unidad_negocio !== CFG.unidad || String(f.anio_proyeccion) !== anio) return;
      // Las cantidades del forecast ya están en unidades (el precio es por crisol aunque la UM diga "Bx").
      if (!mapa[f.producto]) mapa[f.producto] = Array(12).fill(0);
      MESES_COSTEO.forEach((m, i) => { mapa[f.producto][i] += num(f.cantidades?.[m]); });
    });
    return mapa;
  }, [idVersion, anio]);

  const productosForecast = Object.keys(demandaForecast).sort();
  const [parametros, setParametros] = useState(() => ({ ...PARAMETROS_POR_DEFECTO, ...(base.parametros || {}) }));
  const [ajustes, setAjustes] = useState(() => base.ajustes_pt || {});          // { producto: { mesIdx: valor } }
  // Peso guardado o, si no hay, el sugerido del Excel según el tamaño (30/40/45/50 g).
  const [pesos, setPesos] = useState(() => Object.fromEntries(Object.keys(demandaForecast).map(p => [p, base.pesos?.[p] || CFG.pesoSugerido(p) || ''])));
  const [excluidos, setExcluidos] = useState(() => base.excluidos || []);
  const [productoGrafico, setProductoGrafico] = useState('');

  // Reparte la demanda anual del forecast en partes iguales por mes (producción estable, como el plan de planta).
  const nivelar = () => {
    if (!window.confirm('¿Reemplazar el plan de cada tamaño por su promedio mensual del forecast? Puedes seguir ajustando cada mes.')) return;
    const nuevos = {};
    productosForecast.forEach(p => {
      const anual = demandaForecast[p].reduce((a, v) => a + v, 0);
      nuevos[p] = Object.fromEntries(MESES_COSTEO.map((_, i) => [i, String(Math.round(anual / 12))]));
    });
    setAjustes(nuevos);
  };
  const quitarAjustes = () => setAjustes({});

  const productos = productosForecast.filter(p => !excluidos.includes(p)).map(p => ({
    producto: p,
    peso: num(pesos[p]),
    pt: MESES_COSTEO.map((_, i) => (ajustes[p]?.[i] !== undefined && ajustes[p][i] !== '' ? num(ajustes[p][i]) : demandaForecast[p][i])),
  }));

  const costos = useMemo(() => costosDelArea(listarTodosLosRegistros(), { idVersion, area, anio }), [idVersion, area, anio, recarga]);
  const resultado = useMemo(() => calcularCosteo({ productos, costos, parametros }), [JSON.stringify(productos), costos, parametros]); // eslint-disable-line react-hooks/exhaustive-deps
  const tc = num(parametros.tipoCambio) || 1;
  const costoTotal = resultado.productos.reduce((a, p) => a + p.totalAnual, 0);
  const ptTotal = resultado.productos.reduce((a, p) => a + p.ptAnual, 0);
  const totBloque = (c) => resultado.productos.reduce((a, p) => a + p[`${c}Anual`], 0);
  const prodGraf = resultado.productos.find(p => p.producto === productoGrafico) || resultado.productos[0];

  const guardar = () => {
    if (resultado.productos.length === 0) return alert(`No hay productos de ${CFG.unidad} en el forecast de este año.`);
    const idLote = `COSTEO-${CFG.clave}-${idVersion}-${anio}`;
    const comunes = { parametros, ajustes_pt: ajustes, pesos, excluidos, version_costeo: 2, anio_proyeccion: anio, calculado_en: new Date().toISOString() };
    const registros = resultado.productos.map(p => {
      const forecast = listarForecastComercial(idVersion).filter(f => f.producto === p.producto && String(f.anio_proyeccion) === anio);
      const precio = forecast.length ? forecast.reduce((a, f) => a + num(f.precio_venta), 0) / forecast.length : 0;
      return {
        id_registro: `COSTEO-${CFG.clave}-${idVersion}-${anio}-${slug(p.producto)}`,
        id_lote: idLote,
        id_version: idVersion, idVersion, area, modulo: MODULO, categoria: MODULO,
        fecha_proyeccion: `${anio}-01-01`,
        empleado_dni: '-', empleado_nombre: p.producto,
        detalle_columnas: {
          ...comunes,
          producto: p.producto,
          cantidades_produccion: MESES_COSTEO.reduce((a, m, i) => ({ ...a, [m]: Math.round(p.meses[i].pt) }), {}),
          cantidades_comercial: MESES_COSTEO.reduce((a, m, i) => ({ ...a, [m]: p.demanda[i] }), {}),
          cantidad_total_produccion: Math.round(p.ptAnual),
          cantidad_total_comercial: p.demanda.reduce((a, v) => a + v, 0),
          costo_unitario_mes: MESES_COSTEO.reduce((a, m, i) => ({ ...a, [m]: { p1: p.meses[i].uP1, p2: p.meses[i].uP2, comp: p.meses[i].uComp, total: p.meses[i].uTotal } }), {}),
          costo_total_anual: p.totalAnual,
          costo_unitario_promedio: p.unitarioPromedio,
          costo_p1_anual: p.p1Anual, costo_p2_anual: p.p2Anual, costo_comp_anual: p.compAnual,
          precio_venta_unit: precio,
        },
        totales: { cantidad_total: Math.round(p.ptAnual), costo_total: p.totalAnual },
      };
    });
    guardarRegistrosLote(registros);
    setRecarga(n => n + 1);
    alert(`Costeo ${anio} guardado para ${registros.length} productos.`);
  };

  const imprimir = () => imprimirElemento(refReporte.current, {
    titulo: `${CFG.titulo} ${anio}`,
    lineas: [`Versión ${String(idVersion).toUpperCase()}`, `Merma ${parametros.merma}% · Factor ${parametros.factorCorreccion}% · TC ${parametros.tipoCambio}`, `Impreso por ${usuario?.nombre || usuario?.email || '-'} el ${new Date().toLocaleString('es-PE')}`],
  });
  const excel = () => exportarTablasHtml({ contenedor: refReporte.current, nombreArchivo: `${CFG.titulo} ${idVersion} ${anio}`, titulo: `${CFG.titulo} ${anio}`, subtitulo: `Versión ${String(idVersion).toUpperCase()} · TC ${parametros.tipoCambio}` }).catch(e => alert(e.message));

  // ---------- estilos ----------
  const card = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 20px', marginBottom: '16px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' };
  const h3 = { margin: '0 0 12px', fontSize: '15px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' };
  const th = { padding: '7px 8px', fontSize: '10.5px', color: '#475569', textAlign: 'right', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', top: 0 };
  const td = { padding: '6px 8px', fontSize: '12px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const tdL = { ...td, textAlign: 'left', position: 'sticky', left: 0, background: 'white', zIndex: 1 };
  const inp = { width: '100%', padding: '7px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 600, boxSizing: 'border-box' };
  const kpi = (titulo, valor, sub, color) => (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderLeft: `4px solid ${color}`, borderRadius: '10px', padding: '12px 14px' }}>
      <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{titulo}</div>
      <div style={{ fontSize: '21px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{valor}</div>
      {sub && <div style={{ fontSize: '11px', color: '#64748b' }}>{sub}</div>}
    </div>
  );
  const PARAMS = [
    ['factorCorreccion', 'Factor de corrección crudos', '%'], ['merma', 'Merma en calcinación', '%'],
    ['capacidadCalcinacion', CFG.capacidad[0], 'und'], ['calcinacionesMes', CFG.capacidad[1], 'veces'],
    ['hornos', CFG.capacidad[2], 'und'], ['stockInicial', 'Stock inicial PT', 'und'], ['tipoCambio', 'Tipo de cambio', 'S/ por US$'],
  ];
  const maxUnit = Math.max(0.0001, ...(prodGraf?.meses || []).map(m => m.uTotal));

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Encabezado */}
      <div style={{ ...card, background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '.12em', opacity: .8, fontWeight: 700 }}>{area.toUpperCase()} · VERSIÓN {String(idVersion).toUpperCase()}</div>
          <div style={{ fontSize: '24px', fontWeight: 800 }}>{CFG.titulo} {anio}</div>
          <div style={{ fontSize: '12px', opacity: .85 }}>{guardados.length ? `Guardado · ${new Date(base.calculado_en || guardados[0].actualizado_en).toLocaleString('es-PE')}` : 'Aún no guardado para este año'}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={anio} onChange={e => setAnio(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: 'none', fontWeight: 700 }}>
            {[ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1, ANIO_ACTUAL + 2].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button type="button" onClick={imprimir} style={{ background: 'rgba(255,255,255,.15)', color: 'white', border: '1px solid rgba(255,255,255,.4)', padding: '8px 14px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>🖨️ Imprimir</button>
          <button type="button" onClick={excel} style={{ background: 'rgba(255,255,255,.15)', color: 'white', border: '1px solid rgba(255,255,255,.4)', padding: '8px 14px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>📥 Excel</button>
          {puedeEditar && <button type="button" onClick={guardar} style={{ background: '#22c55e', color: 'white', border: 'none', padding: '9px 18px', borderRadius: '6px', fontWeight: 800, cursor: 'pointer' }}>💾 Guardar costeo</button>}
        </div>
      </div>

      {/* Parámetros */}
      <div style={card}>
        <h3 style={h3}>⚙️ Parámetros de planta</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
          {PARAMS.map(([clave, etiqueta, unidad]) => (
            <label key={clave} style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
              {etiqueta}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                <input type="number" step="any" value={parametros[clave]} disabled={!puedeEditar} onChange={e => setParametros({ ...parametros, [clave]: e.target.value })} style={inp} />
                <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'none', whiteSpace: 'nowrap' }}>{unidad}</span>
              </div>
            </label>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '10px' }}>
          Capacidad de calcinación: <b>{fmtQ(resultado.capacidadMes)}</b> {CFG.productos}/mes · Calcinados = PT ÷ (1 − merma) · Crudos = calcinados × (1 + factor) · El costo unitario se calcula sobre el PT bueno (la merma queda incluida).
        </div>
      </div>

      {resultado.alertas.length > 0 && (
        <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a' }}>
          <div style={{ fontWeight: 800, color: '#92400e', marginBottom: '6px' }}>⚠ Revisar</div>
          {resultado.alertas.map((a, i) => <div key={i} style={{ fontSize: '12.5px', color: '#92400e' }}>• {a}</div>)}
        </div>
      )}

      <div ref={refReporte}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          {kpi(`${CFG.productos[0].toUpperCase()}${CFG.productos.slice(1)} a producir (PT)`, fmtQ(ptTotal), `${resultado.productos.length} tamaños`, '#0ea5e9')}
          {kpi('Costo total del año', `S/ ${fmt(costoTotal, 0)}`, `US$ ${fmt(costoTotal / tc, 0)}`, '#16a34a')}
          {kpi('Costo unitario promedio', `S/ ${fmt(ptTotal ? costoTotal / ptTotal : 0, 4)}`, `US$ ${fmt(ptTotal ? costoTotal / ptTotal / tc : 0, 4)}`, '#f59e0b')}
          {BLOQUES_UI.map(b => kpi(b.nombre, `S/ ${fmt(totBloque(b.clave), 0)}`, costoTotal ? `${(totBloque(b.clave) / costoTotal * 100).toFixed(1)}% del costo` : '', b.color))}
        </div>

        {/* Plan de producción */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ ...h3, margin: 0 }}>🏭 Plan de producción ({CFG.productos} {CFG.buenos} a entregar)</h3>
            {puedeEditar && (
              <div style={{ display: 'flex', gap: '6px' }} data-no-print>
                <button type="button" className="btn-ghost" onClick={nivelar} title="Promedio mensual del forecast por tamaño">⚖️ Nivelar producción</button>
                {Object.keys(ajustes).length > 0 && <button type="button" className="btn-ghost" onClick={quitarAjustes}>↺ Volver al forecast</button>}
              </div>
            )}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>Viene del forecast de Comercial ({CFG.unidad}); puedes ajustar cualquier mes. El peso (g) reparte la materia prima según el tamaño.</div>
          <div style={{ overflowX: 'auto' }}>
            <table data-hoja="Plan de producción" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'left', left: 0, zIndex: 2 }}>Tamaño</th><th style={th}>Peso (g)</th>
                {MESES_COSTEO.map(m => <th key={m} style={th}>{m}</th>)}<th style={th}>Total</th>
              </tr></thead>
              <tbody>
                {productosForecast.length === 0 && <tr><td colSpan={15} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: '18px' }}>No hay forecast de {CFG.unidad} para {anio}.</td></tr>}
                {productosForecast.map(p => {
                  const activo = !excluidos.includes(p);
                  const fila = productos.find(x => x.producto === p);
                  return (
                    <tr key={p} style={{ opacity: activo ? 1 : .45 }}>
                      <td style={{ ...tdL, fontWeight: 700, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p}>
                        <label style={{ cursor: puedeEditar ? 'pointer' : 'default' }}>
                          <input type="checkbox" checked={activo} disabled={!puedeEditar} data-no-print onChange={() => setExcluidos(activo ? [...excluidos, p] : excluidos.filter(x => x !== p))} style={{ marginRight: '6px' }} />{p}
                        </label>
                      </td>
                      <td style={td}><input type="number" value={pesos[p] ?? ''} placeholder="—" disabled={!puedeEditar || !activo} onChange={e => setPesos({ ...pesos, [p]: e.target.value })} style={{ ...inp, width: '64px', padding: '4px', fontSize: '12px', textAlign: 'right' }} /></td>
                      {MESES_COSTEO.map((m, i) => {
                        const ajustado = ajustes[p]?.[i] !== undefined && ajustes[p][i] !== '';
                        return (
                          <td key={m} style={{ ...td, padding: '3px' }} data-valor={fila ? fila.pt[i] : 0} data-formato="entero">
                            <input type="number" disabled={!puedeEditar || !activo} value={ajustado ? ajustes[p][i] : Math.round(demandaForecast[p][i]) || ''} placeholder="0"
                              onChange={e => setAjustes({ ...ajustes, [p]: { ...(ajustes[p] || {}), [i]: e.target.value } })}
                              title={ajustado ? `Ajustado (forecast: ${Math.round(demandaForecast[p][i])})` : 'Del forecast'}
                              style={{ width: '78px', padding: '4px', border: `1px solid ${ajustado ? '#f59e0b' : '#e2e8f0'}`, background: ajustado ? '#fffbeb' : 'white', borderRadius: '4px', textAlign: 'right', fontSize: '12px' }} />
                          </td>
                        );
                      })}
                      <td style={{ ...td, fontWeight: 800 }}>{fmtQ(fila ? fila.pt.reduce((a, v) => a + v, 0) : 0)}</td>
                    </tr>
                  );
                })}
                {[['PT a producir (descontando stock)', resultado.totales.pt], ['Calcinados (antes de merma)', resultado.totales.calcinados], ['Crudos a prensar', resultado.totales.crudos]].map(([et, arr]) => (
                  <tr key={et} style={{ background: '#f8fafc' }}>
                    <td style={{ ...tdL, background: '#f8fafc', fontWeight: 700, color: '#334155' }}>{et}</td><td style={td}></td>
                    {arr.map((v, i) => <td key={i} style={{ ...td, fontWeight: 700, color: et.startsWith('Calcinados') && resultado.capacidadMes > 0 && v > resultado.capacidadMes ? '#dc2626' : '#334155' }}>{fmtQ(v)}</td>)}
                    <td style={{ ...td, fontWeight: 800 }}>{fmtQ(arr.reduce((a, v) => a + v, 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Costos por bloque */}
        <div style={card}>
          <h3 style={h3}>💰 Costos del área por proceso (S/)</h3>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>Lo registrado en los módulos de {area} para {anio}, según el proceso de cada gasto (sin proceso: materia prima → 1er, envases/suministros → 2do, lo demás → compartido). Incluye embalaje de Logística y Calidad repartida.</div>
          <div style={{ overflowX: 'auto' }}>
            <table data-hoja="Costos por proceso" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr><th style={{ ...th, textAlign: 'left', left: 0, zIndex: 2 }}>Concepto</th>{MESES_COSTEO.map(m => <th key={m} style={th}>{m}</th>)}<th style={th}>Total</th></tr></thead>
              <tbody>
                {BLOQUES_UI.map(b => {
                  const filas = costos.filas.filter(f => f.bloque === b.clave);
                  const tot = costos.totales[b.clave];
                  return (
                    <React.Fragment key={b.clave}>
                      <tr style={{ background: `${b.color}14` }}>
                        <td style={{ ...tdL, background: `${b.color}14`, fontWeight: 800, color: b.color }}>{b.nombre}</td>
                        {tot.map((v, i) => <td key={i} style={{ ...td, fontWeight: 800 }} data-valor={v}>{fmt(v, 0)}</td>)}
                        <td style={{ ...td, fontWeight: 800 }} data-valor={tot.reduce((a, v) => a + v, 0)}>{fmt(tot.reduce((a, v) => a + v, 0), 0)}</td>
                      </tr>
                      {filas.length === 0 && <tr><td style={{ ...tdL, color: '#94a3b8', paddingLeft: '22px' }} colSpan={14}>Sin gastos registrados con este proceso.</td></tr>}
                      {filas.map(f => (
                        <tr key={f.etiqueta + f.bloque}>
                          <td style={{ ...tdL, paddingLeft: '22px', color: '#334155' }} data-nivel="1">{f.etiqueta}</td>
                          {f.meses.map((v, i) => <td key={i} style={td} data-valor={v}>{fmt(v, 0)}</td>)}
                          <td style={{ ...td, fontWeight: 700 }} data-valor={f.meses.reduce((a, v) => a + v, 0)}>{fmt(f.meses.reduce((a, v) => a + v, 0), 0)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Costo unitario por tamaño */}
        <div style={card}>
          <h3 style={h3}>📊 Costo unitario por producto y mes (S/ por {CFG.producto} {CFG.bueno})</h3>
          <div style={{ overflowX: 'auto' }}>
            <table data-hoja="Costo unitario" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr><th style={{ ...th, textAlign: 'left', left: 0, zIndex: 2 }}>Tamaño / bloque</th>{MESES_COSTEO.map(m => <th key={m} style={th}>{m}</th>)}<th style={th}>Promedio</th></tr></thead>
              <tbody>
                {resultado.productos.map(p => (
                  <React.Fragment key={p.producto}>
                    <tr style={{ background: '#f1f5f9' }}>
                      <td style={{ ...tdL, background: '#f1f5f9', fontWeight: 800 }}>{p.producto}</td>
                      {p.meses.map((m, i) => <td key={i} style={{ ...td, fontWeight: 800 }} data-valor={m.uTotal} data-formato="numero">{fmt(m.uTotal, 4)}</td>)}
                      <td style={{ ...td, fontWeight: 800, color: '#b45309' }} data-valor={p.unitarioPromedio} data-formato="numero">{fmt(p.unitarioPromedio, 4)}</td>
                    </tr>
                    {BLOQUES_UI.map(b => {
                      const clave = { p1: 'uP1', p2: 'uP2', comp: 'uComp' }[b.clave];
                      const anual = p[`${b.clave}Anual`];
                      return (
                        <tr key={b.clave}>
                          <td style={{ ...tdL, paddingLeft: '22px', color: b.color }} data-nivel="1">{b.nombre}</td>
                          {p.meses.map((m, i) => <td key={i} style={td} data-valor={m[clave]} data-formato="numero">{fmt(m[clave], 4)}</td>)}
                          <td style={{ ...td, fontWeight: 700 }} data-valor={p.ptAnual ? anual / p.ptAnual : 0} data-formato="numero">{fmt(p.ptAnual ? anual / p.ptAnual : 0, 4)}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td style={{ ...tdL, paddingLeft: '22px', color: '#64748b' }} data-nivel="1">Total en US$ (TC {tc})</td>
                      {p.meses.map((m, i) => <td key={i} style={{ ...td, color: '#64748b' }} data-valor={m.uTotal / tc} data-formato="numero">{fmt(m.uTotal / tc, 4)}</td>)}
                      <td style={{ ...td, color: '#64748b', fontWeight: 700 }} data-valor={p.unitarioPromedio / tc} data-formato="numero">{fmt(p.unitarioPromedio / tc, 4)}</td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Gráfico */}
        {prodGraf && (
          <div style={card} data-no-excel>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ ...h3, margin: 0 }}>📈 Composición del costo unitario por mes</h3>
              <select value={prodGraf.producto} onChange={e => setProductoGrafico(e.target.value)} data-no-print style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                {resultado.productos.map(p => <option key={p.producto} value={p.producto}>{p.producto}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '16px', fontSize: '11px', margin: '10px 0' }}>
              {BLOQUES_UI.map(b => <span key={b.clave}><span style={{ display: 'inline-block', width: '10px', height: '10px', background: b.color, borderRadius: '2px', marginRight: '4px' }} />{b.nombre}</span>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '8px', alignItems: 'end', height: '200px', borderBottom: '1px solid #cbd5e1', padding: '0 4px' }}>
              {prodGraf.meses.map((m, i) => (
                <div key={i} title={`${MESES_COSTEO[i]}: S/ ${fmt(m.uTotal, 4)}`} style={{ display: 'flex', flexDirection: 'column-reverse', height: `${(m.uTotal / maxUnit) * 100}%`, borderRadius: '4px 4px 0 0', overflow: 'hidden' }}>
                  {BLOQUES_UI.map(b => { const v = m[{ p1: 'uP1', p2: 'uP2', comp: 'uComp' }[b.clave]]; return <div key={b.clave} style={{ height: m.uTotal ? `${(v / m.uTotal) * 100}%` : 0, background: b.color }} />; })}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '8px', fontSize: '10.5px', color: '#64748b', textAlign: 'center', marginTop: '4px' }}>
              {prodGraf.meses.map((m, i) => <div key={i}>{MESES_COSTEO[i]}<br /><b style={{ color: '#0f172a' }}>{m.uTotal ? m.uTotal.toFixed(3) : '—'}</b></div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
