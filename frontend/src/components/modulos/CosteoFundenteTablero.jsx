import React, { useMemo, useRef, useState } from 'react';
import { listarForecastComercial, listarRegistros, listarTodosLosRegistros, guardarRegistrosLote, obtenerFormulasOdoo } from '../../data/store';
import { MESES_F, TIPOS_F, normalF, costosFundente, calcularFundente, leerBomFP26, leerCostosFP26, bomDesdeOdoo } from '../../config/costeoFundente';
import { imprimirElemento } from '../../config/impresion';
import { exportarTablasHtml } from '../../config/excel';
import { MODULO_REFERENCIA } from '../../config/importarProduccion';

// =====================================================================
// COSTEO DE FUNDENTE — pantalla completa, por pedido (como Comp_FPROY del Excel FP26 Fundente).
// Pedidos = líneas del forecast de Fundente por mes. MP desde la BOM (FP26 u Odoo) x costo del
// componente; envases, MOD y CIF registrados en el área se reparten por kilos (Sachet / Granel / todos).
// =====================================================================
const MODULO = 'Costeo de Fundente';
const ANIO_ACTUAL = new Date().getFullYear();
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const fmt = (v, d = 2) => (Math.abs(num(v)) < 1e-9 ? '—' : num(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const slug = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const valorCelda = (v) => (v && typeof v === 'object' && !(v instanceof Date) ? ('result' in v ? v.result : v.richText ? v.richText.map(t => t.text).join('') : v.text ?? null) : v);
async function leerFP26(archivo) {
  const ExcelJS = (await import('exceljs')).default;
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  const hojas = {};
  ['BOM', 'CostosUnit', 'Comp_FPROY'].forEach(n => {
    const ws = libro.getWorksheet(n);
    if (!ws) return;
    const filas = [];
    ws.eachRow({ includeEmpty: false }, r => filas.push(r.values.slice(1).map(valorCelda)));
    hojas[n] = filas;
  });
  // Productos que el Excel marca como sachet (columna SACHETS de Comp_FPROY).
  const sachet = {};
  const comp = hojas.Comp_FPROY || [];
  const iEnc = comp.findIndex(f => (f || []).map(normalF).includes('SACHETS'));
  if (iEnc >= 0) {
    const enc = comp[iEnc].map(normalF);
    const cProd = enc.indexOf('NOMBRE DEL PRODUCTO');
    const cSac = enc.indexOf('SACHETS');
    comp.slice(iEnc + 1).forEach(f => { if (f[cProd]) sachet[normalF(f[cProd])] = normalF(f[cSac]) === 'SI'; });
  }
  return { bom: leerBomFP26(hojas), costos: leerCostosFP26(hojas), sachet };
}

export default function CosteoFundenteTablero(props) {
  const [anio, setAnio] = useState(String(ANIO_ACTUAL));
  return <TableroFundente key={`${props.idVersion}-${anio}`} {...props} anio={anio} setAnio={setAnio} />;
}

function TableroFundente({ idVersion, area, usuario, anio, setAnio }) {
  const puedeEditar = usuario?.esAdmin || (usuario?.areasPermitidas || []).includes(area);
  const refReporte = useRef(null);
  const [recarga, setRecarga] = useState(0);
  const idConfig = `COSTEO-FUN-CFG-${idVersion}-${anio}`;
  const guardado = useMemo(() => listarRegistros({ idVersion, area, modulo: MODULO }).find(r => r.id_registro === idConfig)?.detalle_columnas || {}, [idVersion, area, anio, recarga]); // eslint-disable-line react-hooks/exhaustive-deps

  // Costeo del Excel FP26 importado en esta versión: pedidos con su costo unitario, BOM, costos y sachet.
  const referencia = useMemo(() => listarRegistros({ idVersion, area, modulo: MODULO_REFERENCIA })
    .find(r => String(r.detalle_columnas?.anio_proyeccion) === anio && Array.isArray(r.detalle_columnas?.pedidos))?.detalle_columnas || null, [idVersion, area, anio]);
  const [parametros, setParametros] = useState(() => ({ tipoCambio: 3.5, fuenteMP: 'bom', ...(guardado.parametros || {}) }));
  // Lo guardado en el costeo manda; si no hay, se usa lo que vino con la importación del FP26.
  const [bom, setBom] = useState(() => ({ ...(referencia?.bom || {}), ...(guardado.bom || {}) }));
  const [costosComp, setCostosComp] = useState(() => ({ ...(referencia?.costos_componentes || {}), ...(guardado.costos_componentes || {}) }));
  const [sachet, setSachet] = useState(() => ({ ...(referencia?.sachet || {}), ...(guardado.sachet || {}) }));
  const [cargando, setCargando] = useState('');
  const [verPedidos, setVerPedidos] = useState(false);
  const [filtro, setFiltro] = useState('');

  // Pedidos: cada línea del forecast de Fundente con cantidad en el mes.
  const forecast = useMemo(() => listarForecastComercial(idVersion).filter(f => f.unidad_negocio === 'Fundente' && String(f.anio_proyeccion) === anio), [idVersion, anio]);
  const esSachet = (producto, presentacion) => (sachet[normalF(producto)] !== undefined ? sachet[normalF(producto)] : presentacion === 'Sachet');
  const pedidos = useMemo(() => forecast.flatMap(f => MESES_F.map((m, i) => ({
    id: `${f.id_registro}-${i}`, cliente: f.cliente, producto: f.producto, mes: i, kg: num(f.cantidades?.[m]),
    sachet: esSachet(f.producto, f.presentacion_fundente),
  })).filter(p => p.kg > 0)), [forecast, sachet]); // eslint-disable-line react-hooks/exhaustive-deps

  const costosArea = useMemo(() => costosFundente(listarTodosLosRegistros(), { idVersion, area, anio }), [idVersion, area, anio, recarga]); // eslint-disable-line react-hooks/exhaustive-deps
  const res = useMemo(() => calcularFundente({ pedidos, costosArea, bom, costosComp, parametros }), [pedidos, costosArea, bom, costosComp, parametros]);
  const tc = res.tc;
  const kgTotal = res.productos.reduce((a, p) => a + p.kg, 0);
  const costoTotal = res.productos.reduce((a, p) => a + p.total, 0);
  const productosForecast = [...new Set(forecast.map(f => f.producto))].sort();
  const componentesUsados = [...new Set(productosForecast.flatMap(p => Object.keys(bom[normalF(p)] || {})))].sort();

  const cargarFP26 = async (archivo) => {
    if (!archivo) return;
    setCargando('Leyendo FP26 de Fundente...');
    try {
      const r = await leerFP26(archivo);
      setBom(prev => ({ ...prev, ...r.bom }));
      setCostosComp(prev => ({ ...prev, ...r.costos }));
      setSachet(prev => ({ ...r.sachet, ...prev }));
      alert(`FP26 leído: ${Object.keys(r.bom).length} fórmulas, ${Object.keys(r.costos).length} costos de componentes y ${Object.values(r.sachet).filter(Boolean).length} productos en sachet.`);
    } catch (e) {
      alert(`No se pudo leer el archivo: ${e.message}`);
    } finally {
      setCargando('');
    }
  };
  const cargarOdoo = async () => {
    setCargando('Leyendo fórmulas de Odoo...');
    const b = bomDesdeOdoo(await obtenerFormulasOdoo());
    // Solo completa los productos que aún no tienen BOM.
    setBom(prev => ({ ...b, ...prev }));
    setCargando('');
    alert(`${Object.keys(b).length} fórmulas encontradas en Odoo (se usan solo para productos sin BOM).`);
  };

  const guardar = () => {
    if (!res.productos.length) return alert('No hay pedidos de Fundente en el forecast de este año.');
    const idLote = `COSTEO-FUN-${idVersion}-${anio}`;
    const usadas = Object.fromEntries(productosForecast.map(p => [normalF(p), bom[normalF(p)]]).filter(([, v]) => v));
    const config = {
      id_registro: idConfig, id_lote: idLote, id_version: idVersion, idVersion, area, modulo: MODULO, categoria: MODULO,
      fecha_proyeccion: `${anio}-01-01`, empleado_dni: '-', empleado_nombre: 'Configuración del costeo',
      detalle_columnas: { es_configuracion: true, anio_proyeccion: anio, parametros, bom: usadas, costos_componentes: costosComp, sachet, calculado_en: new Date().toISOString() },
      totales: { costo_total: 0 },
    };
    const registros = res.productos.map(p => ({
      id_registro: `COSTEO-FUN-${idVersion}-${anio}-${slug(p.producto)}`, id_lote: idLote,
      id_version: idVersion, idVersion, area, modulo: MODULO, categoria: MODULO,
      fecha_proyeccion: `${anio}-01-01`, empleado_dni: '-', empleado_nombre: p.producto,
      detalle_columnas: {
        producto: p.producto, anio_proyeccion: anio, version_costeo: 2, unidad: 'kg', presentacion: p.sachet ? 'Sachet' : 'Granel',
        cantidades_produccion: MESES_F.reduce((a, m, i) => ({ ...a, [m]: p.meses[i].kg }), {}),
        cantidad_total_produccion: p.kg,
        costo_unitario_mes: MESES_F.reduce((a, m, i) => ({ ...a, [m]: { mp: p.meses[i].kg ? p.meses[i].mp / p.meses[i].kg : 0, env: p.meses[i].kg ? p.meses[i].env / p.meses[i].kg : 0, mod: p.meses[i].kg ? p.meses[i].mod / p.meses[i].kg : 0, cif: p.meses[i].kg ? p.meses[i].cif / p.meses[i].kg : 0, total: p.meses[i].unit } }), {}),
        costo_total_anual: p.total, costo_unitario_promedio: p.unit, costo_unitario_promedio_usd: p.unit / tc,
        costo_mp_anual: p.mp, costo_env_anual: p.env, costo_mod_anual: p.mod, costo_cif_anual: p.cif,
      },
      totales: { cantidad_total: p.kg, costo_total: p.total },
    }));
    guardarRegistrosLote([config, ...registros]);
    setRecarga(n => n + 1);
    alert(`Costeo de Fundente ${anio} guardado para ${registros.length} productos.`);
  };

  const imprimir = () => imprimirElemento(refReporte.current, { titulo: `Costeo de Fundente ${anio}`, lineas: [`Versión ${String(idVersion).toUpperCase()}`, `TC ${parametros.tipoCambio}`, `MP: ${parametros.fuenteMP === 'registrado' ? 'registrada en el módulo' : 'BOM'}`, `Impreso por ${usuario?.nombre || usuario?.email || '-'} el ${new Date().toLocaleString('es-PE')}`] });
  const excel = () => exportarTablasHtml({ contenedor: refReporte.current, nombreArchivo: `Costeo de Fundente ${idVersion} ${anio}`, titulo: `Costeo de Fundente ${anio}`, subtitulo: `Versión ${String(idVersion).toUpperCase()} · TC ${parametros.tipoCambio}` }).catch(e => alert(e.message));

  // ---------- estilos ----------
  const card = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 20px', marginBottom: '16px' };
  const h3 = { margin: '0 0 12px', fontSize: '15px', color: '#0f172a' };
  const th = { padding: '7px 8px', fontSize: '10.5px', color: '#475569', textAlign: 'right', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', top: 0 };
  const td = { padding: '6px 8px', fontSize: '12px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const tdL = { ...td, textAlign: 'left' };
  const inp = { padding: '7px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 600 };
  const btnClaro = { background: 'rgba(255,255,255,.15)', color: 'white', border: '1px solid rgba(255,255,255,.4)', padding: '8px 14px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' };
  const kpi = (t, v, s, c) => (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderLeft: `4px solid ${c}`, borderRadius: '10px', padding: '12px 14px' }}>
      <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{t}</div>
      <div style={{ fontSize: '21px', fontWeight: 800, color: '#0f172a' }}>{v}</div>
      {s && <div style={{ fontSize: '11px', color: '#64748b' }}>{s}</div>}
    </div>
  );
  // Comparación por producto con el Excel (US$ por kg, ponderado por kg).
  const comparacion = useMemo(() => {
    if (!referencia) return [];
    const ex = {};
    referencia.pedidos.forEach(p => {
      const k = normalF(p.producto);
      if (!ex[k]) ex[k] = { producto: p.producto, kg: 0, total: 0, mp: 0, env: 0 };
      ex[k].kg += num(p.kg); ex[k].total += num(p.totalUsd); ex[k].mp += num(p.mpUsd); ex[k].env += num(p.envUsd);
    });
    const sis = Object.fromEntries(res.productos.map(p => [normalF(p.producto), p]));
    const dif = (a, b) => (a > 0 && b > 0 ? (a - b) / b : null);
    return [...new Set([...Object.keys(ex), ...Object.keys(sis)])].map(k => {
      const e = ex[k]; const s = sis[k];
      const kgS = s?.kg || 0; const kgE = e?.kg || 0;
      const r = {
        producto: s?.producto || e?.producto, kgSis: kgS, kgEx: kgE,
        sis: kgS ? s.total / kgS / tc : 0, ex: kgE ? e.total / kgE : 0,
        mpSis: kgS ? s.mp / kgS / tc : 0, mpEx: kgE ? e.mp / kgE : 0,
        envSis: kgS ? s.env / kgS / tc : 0, envEx: kgE ? e.env / kgE : 0,
      };
      return { ...r, dif: dif(r.sis, r.ex), costoSis: s?.total || 0, costoEx: e?.total || 0 };
    }).sort((a, b) => b.kgSis - a.kgSis || b.kgEx - a.kgEx);
  }, [referencia, res, tc]);
  const compTotal = useMemo(() => {
    const kgS = comparacion.reduce((a, c) => a + c.kgSis, 0);
    const kgE = comparacion.reduce((a, c) => a + c.kgEx, 0);
    const s = kgS ? comparacion.reduce((a, c) => a + c.costoSis, 0) / kgS / tc : 0;
    const e = kgE ? comparacion.reduce((a, c) => a + c.costoEx, 0) / kgE : 0;
    return { sis: s, ex: e, dif: s > 0 && e > 0 ? (s - e) / e : null };
  }, [comparacion, tc]);
  const colorDif = (d) => (d === null || d === undefined ? '#94a3b8' : Math.abs(d) <= 0.03 ? '#15803d' : Math.abs(d) <= 0.1 ? '#b45309' : '#dc2626');
  const textoDif = (d) => (d === null || d === undefined ? '—' : `${d > 0 ? '+' : ''}${(d * 100).toFixed(1)}%`);

  const productosVista = res.productos.filter(p => !filtro || normalF(p.producto).includes(normalF(filtro)));

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ ...card, background: 'linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '.12em', opacity: .8, fontWeight: 700 }}>{area.toUpperCase()} · VERSIÓN {String(idVersion).toUpperCase()}</div>
          <div style={{ fontSize: '24px', fontWeight: 800 }}>Costeo de Fundente {anio}</div>
          <div style={{ fontSize: '12px', opacity: .85 }}>{guardado.calculado_en ? `Guardado · ${new Date(guardado.calculado_en).toLocaleString('es-PE')}` : 'Aún no guardado para este año'} · {pedidos.length} pedidos del forecast</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={anio} onChange={e => setAnio(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: 'none', fontWeight: 700 }}>
            {[ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1, ANIO_ACTUAL + 2].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button type="button" onClick={imprimir} style={btnClaro}>🖨️ Imprimir</button>
          <button type="button" onClick={excel} style={btnClaro}>📥 Excel</button>
          {puedeEditar && <button type="button" onClick={guardar} style={{ background: '#22c55e', color: 'white', border: 'none', padding: '9px 18px', borderRadius: '6px', fontWeight: 800, cursor: 'pointer' }}>💾 Guardar costeo</button>}
        </div>
      </div>

      <div style={card}>
        <h3 style={h3}>⚙️ Parámetros y lista de materiales</h3>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569' }}>TIPO DE CAMBIO<br /><input type="number" step="0.01" value={parametros.tipoCambio} disabled={!puedeEditar} onChange={e => setParametros({ ...parametros, tipoCambio: e.target.value })} style={{ ...inp, width: '90px' }} /></label>
          <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569' }}>MATERIA PRIMA SEGÚN<br />
            <select value={parametros.fuenteMP} disabled={!puedeEditar} onChange={e => setParametros({ ...parametros, fuenteMP: e.target.value })} style={inp}>
              <option value="bom">Lista de materiales (BOM) × costo</option>
              <option value="registrado">Lo registrado en Materias Primas (por kg)</option>
            </select>
          </label>
          {puedeEditar && (
            <>
              <label className="btn-ghost" style={{ cursor: 'pointer' }} data-no-print>📂 Cargar BOM y costos del FP26 Fundente<input type="file" accept=".xlsx,.xlsm" style={{ display: 'none' }} onChange={e => { cargarFP26(e.target.files[0]); e.target.value = ''; }} /></label>
              <button type="button" className="btn-ghost" onClick={cargarOdoo} data-no-print>🔗 Completar con fórmulas de Odoo</button>
            </>
          )}
          {cargando && <span style={{ fontSize: '12px', color: '#7c3aed' }}>⏳ {cargando}</span>}
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
          {referencia && <>BOM, costos de componentes y sachet tomados del FP26 importado en esta versión. </>}
          {productosForecast.filter(p => bom[normalF(p)]).length} de {productosForecast.length} productos con BOM · {componentesUsados.length} componentes. Envases, MOD y CIF registrados en {area} se reparten por kg del mes; los marcados "Sachet" solo a pedidos en sachet (p. ej. personal externo).
        </div>
      </div>

      {res.alertas.length > 0 && (
        <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a' }}>
          <div style={{ fontWeight: 800, color: '#92400e', marginBottom: '6px' }}>⚠ Revisar</div>
          {res.alertas.slice(0, 12).map((a, i) => <div key={i} style={{ fontSize: '12.5px', color: '#92400e' }}>• {a}</div>)}
          {res.alertas.length > 12 && <div style={{ fontSize: '12px', color: '#92400e' }}>… y {res.alertas.length - 12} más.</div>}
        </div>
      )}

      <div ref={refReporte}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          {kpi('Kg a producir', fmt(kgTotal, 0), `${res.productos.length} productos · ${fmt(res.kgSachet.reduce((a, v) => a + v, 0), 0)} kg en sachet`, '#0ea5e9')}
          {kpi('Costo total del año', `S/ ${fmt(costoTotal, 0)}`, `US$ ${fmt(costoTotal / tc, 0)}`, '#16a34a')}
          {kpi('Costo promedio por kg', `US$ ${fmt(kgTotal ? costoTotal / kgTotal / tc : 0, 3)}`, `S/ ${fmt(kgTotal ? costoTotal / kgTotal : 0, 3)}`, '#f59e0b')}
          {TIPOS_F.map(t => { const v = res.productos.reduce((a, p) => a + p[t.clave], 0); return kpi(t.nombre, `S/ ${fmt(v, 0)}`, costoTotal ? `${(v / costoTotal * 100).toFixed(1)}% del costo` : '', t.color); })}
        </div>
        <div style={{ ...card, fontSize: '12.5px', background: '#f8fafc' }} data-no-excel>
          <b>Materia prima, comparación:</b> según BOM S/ {fmt(res.mpBomTotal, 0)} · registrada en el módulo Materias Primas S/ {fmt(res.mpRegistrada, 0)}
          {res.mpRegistrada > 0 && res.mpBomTotal > 0 && <> · diferencia {fmt((res.mpBomTotal / res.mpRegistrada - 1) * 100, 1)}%</>}
        </div>

        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <h3 style={{ ...h3, margin: 0 }}>📦 Costo por producto (año)</h3>
            <input placeholder="Buscar producto..." value={filtro} onChange={e => setFiltro(e.target.value)} style={{ ...inp, fontWeight: 400 }} data-no-print />
          </div>
          <div style={{ overflow: 'auto', maxHeight: '520px' }}>
            <table data-hoja="Por producto" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'left' }}>Producto</th><th style={th}>Sachet</th><th style={th}>Kg</th>
                {TIPOS_F.map(t => <th key={t.clave} style={th}>{t.nombre} S/</th>)}<th style={th}>Total S/</th><th style={th}>S/ por kg</th><th style={th}>US$ por kg</th>
              </tr></thead>
              <tbody>
                {productosVista.map(p => (
                  <tr key={p.producto}>
                    <td style={{ ...tdL, fontWeight: 700 }}>{p.producto}{!bom[normalF(p.producto)] && <span style={{ color: '#dc2626', fontWeight: 500 }} title="Sin lista de materiales"> ⚠</span>}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <input type="checkbox" checked={p.sachet} disabled={!puedeEditar} onChange={() => setSachet({ ...sachet, [normalF(p.producto)]: !p.sachet })} data-no-excel />
                    </td>
                    <td style={td} data-valor={p.kg} data-formato="entero">{fmt(p.kg, 0)}</td>
                    {TIPOS_F.map(t => <td key={t.clave} style={td} data-valor={p[t.clave]}>{fmt(p[t.clave], 0)}</td>)}
                    <td style={{ ...td, fontWeight: 700 }} data-valor={p.total}>{fmt(p.total, 0)}</td>
                    <td style={td} data-valor={p.unit} data-formato="numero">{fmt(p.unit, 3)}</td>
                    <td style={{ ...td, fontWeight: 800, color: '#b45309' }} data-valor={p.unit / tc} data-formato="numero">{fmt(p.unit / tc, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {comparacion.length > 0 && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ ...h3, margin: 0 }}>🔍 Comparación con el costeo del Excel {anio} (US$ por kg)</h3>
              <div style={{ fontSize: '12.5px', fontWeight: 700 }}>
                Promedio: sistema US$ {fmt(compTotal.sis, 3)} · Excel US$ {fmt(compTotal.ex, 3)} · <span style={{ color: colorDif(compTotal.dif) }}>{textoDif(compTotal.dif)}</span>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', margin: '6px 0 8px' }}>
              Excel: COSTO TOTAL UNITARIO 2026 de Comp_FPROY (FP26 importado), promedio ponderado por kg de sus pedidos. Sistema: el cálculo de esta pantalla. Diferencia = (Sistema − Excel) ÷ Excel; verde hasta 3%, ámbar hasta 10%.
            </div>
            <div style={{ overflow: 'auto', maxHeight: '520px' }}>
              <table data-hoja="Comparación Excel" style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: 'left' }}>Producto</th><th style={th}>Kg sistema</th><th style={th}>Kg Excel</th>
                  <th style={th}>MP sistema</th><th style={th}>MP Excel</th><th style={th}>Envases sistema</th><th style={th}>Envases Excel</th>
                  <th style={th}>Total sistema</th><th style={th}>Total Excel</th><th style={th}>Diferencia</th>
                </tr></thead>
                <tbody>
                  {comparacion.filter(c => !filtro || normalF(c.producto).includes(normalF(filtro))).map(c => (
                    <tr key={c.producto}>
                      <td style={{ ...tdL, fontWeight: 700 }}>{c.producto}</td>
                      <td style={td} data-valor={c.kgSis} data-formato="entero">{fmt(c.kgSis, 0)}</td>
                      <td style={td} data-valor={c.kgEx} data-formato="entero">{fmt(c.kgEx, 0)}</td>
                      <td style={td} data-valor={c.mpSis} data-formato="numero">{fmt(c.mpSis, 3)}</td>
                      <td style={{ ...td, color: '#7c3aed' }} data-valor={c.mpEx} data-formato="numero">{fmt(c.mpEx, 3)}</td>
                      <td style={td} data-valor={c.envSis} data-formato="numero">{fmt(c.envSis, 3)}</td>
                      <td style={{ ...td, color: '#7c3aed' }} data-valor={c.envEx} data-formato="numero">{fmt(c.envEx, 3)}</td>
                      <td style={{ ...td, fontWeight: 800 }} data-valor={c.sis} data-formato="numero">{fmt(c.sis, 3)}</td>
                      <td style={{ ...td, fontWeight: 800, color: '#7c3aed' }} data-valor={c.ex} data-formato="numero">{fmt(c.ex, 3)}</td>
                      <td style={{ ...td, fontWeight: 800, color: colorDif(c.dif) }} data-valor={c.dif ?? ''} data-formato="pct">{textoDif(c.dif)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={card}>
          <h3 style={h3}>📅 Costo por kg por mes (US$)</h3>
          <div style={{ overflow: 'auto', maxHeight: '420px' }}>
            <table data-hoja="Costo por mes" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr><th style={{ ...th, textAlign: 'left' }}>Producto</th>{MESES_F.map(m => <th key={m} style={th}>{m}</th>)}<th style={th}>Promedio</th></tr></thead>
              <tbody>
                {productosVista.map(p => (
                  <tr key={p.producto}>
                    <td style={{ ...tdL, fontWeight: 600 }}>{p.producto}</td>
                    {p.meses.map((m, i) => <td key={i} style={td} data-valor={m.unit / tc} data-formato="numero">{fmt(m.unit / tc, 3)}</td>)}
                    <td style={{ ...td, fontWeight: 800 }} data-valor={p.unit / tc} data-formato="numero">{fmt(p.unit / tc, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={card}>
          <h3 style={h3}>💰 Costos registrados en {area} (S/)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table data-hoja="Costos registrados" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr><th style={{ ...th, textAlign: 'left' }}>Tipo · módulo · a quién se reparte</th>{MESES_F.map(m => <th key={m} style={th}>{m}</th>)}<th style={th}>Total</th></tr></thead>
              <tbody>
                {costosArea.length === 0 && <tr><td colSpan={14} style={{ ...tdL, color: '#94a3b8' }}>Sin gastos registrados para {anio}.</td></tr>}
                {costosArea.map(f => (
                  <tr key={`${f.tipo}${f.destino}${f.modulo}`} style={{ opacity: f.tipo === 'mp' && parametros.fuenteMP !== 'registrado' ? .5 : 1 }}>
                    <td style={tdL}>{TIPOS_F.find(t => t.clave === f.tipo)?.nombre} · {f.modulo} · <i>{f.destino === 'todos' ? 'todos los pedidos' : f.destino}</i>{f.tipo === 'mp' && parametros.fuenteMP !== 'registrado' ? ' (solo comparación)' : ''}</td>
                    {f.meses.map((v, i) => <td key={i} style={td} data-valor={v}>{fmt(v, 0)}</td>)}
                    <td style={{ ...td, fontWeight: 700 }} data-valor={f.meses.reduce((a, v) => a + v, 0)}>{fmt(f.meses.reduce((a, v) => a + v, 0), 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {componentesUsados.length > 0 && (
          <div style={card} data-no-print>
            <h3 style={h3}>🧪 Costo de componentes (US$ por kg o unidad)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
              {componentesUsados.map(c => (
                <label key={c} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', fontSize: '11.5px', border: '1px solid #f1f5f9', borderRadius: '6px', padding: '4px 8px' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c}>{c}</span>
                  <input type="number" step="any" value={costosComp[c] ?? ''} disabled={!puedeEditar} onChange={e => setCostosComp({ ...costosComp, [c]: e.target.value })} style={{ ...inp, width: '90px', padding: '4px', borderColor: costosComp[c] === undefined ? '#f87171' : '#cbd5e1' }} />
                </label>
              ))}
            </div>
          </div>
        )}

        <div style={card}>
          <button type="button" className="btn-ghost" onClick={() => setVerPedidos(!verPedidos)} data-no-print>{verPedidos ? '▾' : '▸'} Detalle por pedido ({res.detalle.length})</button>
          {verPedidos && (
            <div style={{ overflow: 'auto', maxHeight: '520px', marginTop: '10px' }}>
              <table data-hoja="Pedidos" style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr><th style={{ ...th, textAlign: 'left' }}>Cliente</th><th style={{ ...th, textAlign: 'left' }}>Producto</th><th style={th}>Mes</th><th style={th}>Kg</th><th style={th}>Sachet</th>{TIPOS_F.map(t => <th key={t.clave} style={th}>{t.nombre}</th>)}<th style={th}>Total S/</th><th style={th}>US$ por kg</th></tr></thead>
                <tbody>
                  {res.detalle.filter(d => !filtro || normalF(d.producto).includes(normalF(filtro))).map(d => (
                    <tr key={d.id}>
                      <td style={tdL}>{d.cliente}</td><td style={tdL}>{d.producto}</td><td style={td}>{MESES_F[d.mes]}</td>
                      <td style={td} data-valor={d.kg} data-formato="entero">{fmt(d.kg, 0)}</td><td style={{ ...td, textAlign: 'center' }}>{d.sachet ? 'Sí' : ''}</td>
                      {TIPOS_F.map(t => <td key={t.clave} style={td} data-valor={d[t.clave]}>{fmt(d[t.clave], 0)}</td>)}
                      <td style={{ ...td, fontWeight: 700 }} data-valor={d.total}>{fmt(d.total, 0)}</td>
                      <td style={{ ...td, fontWeight: 700 }} data-valor={d.unitUsd} data-formato="numero">{fmt(d.unitUsd, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
