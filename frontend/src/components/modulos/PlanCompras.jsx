import React, { useMemo, useState } from 'react';
import { CATEGORIAS_COMPRA, colorDeCategoria, itemsDeCompra, MESES_PC } from '../../config/planCompras';

// =====================================================================
// PLAN DE COMPRAS — tablero: indicadores, categorías, tendencia mensual, detalle
// (categoría → ítem → área) y principales ítems. Las categorías y qué entra en cada una
// se definen en config/planCompras.js (ahí se agrega una nueva).
// Es la base del flujo de caja de egresos: cada ítem tiene su mes de compra y su proveedor
// (cuando se asigne).
// =====================================================================
const MESES_TODOS = MESES_PC.map((_, i) => i);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const soles = (v, d = 0) => `S/ ${num(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const corto = (v) => { const a = Math.abs(num(v)); return a >= 1e6 ? `S/ ${(a / 1e6).toFixed(2)} M` : a >= 1e3 ? `S/ ${(a / 1e3).toFixed(1)} mil` : `S/ ${a.toFixed(0)}`; };
const cant = (v) => (num(v) ? num(v).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—');
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');
const NOMBRE = Object.fromEntries(CATEGORIAS_COMPRA.map(c => [c.id, c.nombre]));

export default function PlanCompras({ registrosTotales = [], versiones = [], idVersionFiltro = '', expandirTodo = false }) {
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
  const anio = anios.includes(anioSel) ? anioSel : (anios.includes(String(new Date().getFullYear())) ? String(new Date().getFullYear()) : anios[anios.length - 1] || String(new Date().getFullYear()));
  const hoy = new Date();
  const mesActual = String(hoy.getFullYear()) === String(anio) ? hoy.getMonth() : null;

  const [mesesSel, setMesesSel] = useState(MESES_TODOS);
  const [categoriasSel, setCategoriasSel] = useState(null); // null = todas
  const [areasSel, setAreasSel] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [anticipacion, setAnticipacion] = useState('0');
  const [vista, setVista] = useState('categoria');
  const [abiertos, setAbiertos] = useState({});
  const [hover, setHover] = useState(null);

  const todos = useMemo(() => itemsDeCompra(registrosTotales, { idVersion, anio, anticipacion }), [registrosTotales, idVersion, anio, anticipacion]);
  const areas = useMemo(() => [...new Set(todos.map(i => i.area))].sort(), [todos]);
  const categoriasConDatos = CATEGORIAS_COMPRA.filter(c => todos.some(i => i.categoria === c.id));
  const meses = [...mesesSel].sort((a, b) => a - b);
  const q = busqueda.trim().toLowerCase();
  const base = todos.filter(i => (!areasSel || areasSel.includes(i.area)) && (!q || `${i.producto} ${i.origen} ${i.area}`.toLowerCase().includes(q)));
  const enCategorias = base.filter(i => !categoriasSel || categoriasSel.includes(i.categoria));
  const filtrados = enCategorias.filter(i => mesesSel.includes(i.mes));

  const total = filtrados.reduce((a, i) => a + i.monto, 0);
  const suma = (fn) => filtrados.filter(fn).reduce((a, i) => a + i.monto, 0);
  const produccion = suma(i => ['mp', 'env', 'sum'].includes(i.categoria));
  const mercaderia = suma(i => i.categoria === 'merc');
  const operativos = suma(i => ['epp', 'utiles', 'aseo'].includes(i.categoria));
  const porMes = MESES_TODOS.map(m => filtrados.filter(i => i.mes === m).reduce((a, i) => a + i.monto, 0));
  const mesPico = meses.reduce((best, m) => (porMes[m] > (best === null ? -1 : porMes[best]) ? m : best), null);
  const itemsUnicos = new Set(filtrados.map(i => `${i.categoria}|${i.producto}`)).size;
  const porCategoria = CATEGORIAS_COMPRA.map(c => {
    const lista = base.filter(i => i.categoria === c.id && mesesSel.includes(i.mes));
    return { ...c, monto: lista.reduce((a, i) => a + i.monto, 0), items: new Set(lista.map(i => i.producto)).size };
  }).filter(c => c.monto > 0 || categoriasConDatos.some(x => x.id === c.id));
  const totalBase = porCategoria.reduce((a, c) => a + c.monto, 0);

  // ---------- detalle ----------
  const niveles = vista === 'categoria' ? [i => NOMBRE[i.categoria] || i.categoria, i => i.producto, i => i.area]
    : vista === 'area' ? [i => i.area, i => NOMBRE[i.categoria] || i.categoria, i => i.producto]
      : [i => i.producto, i => i.area];
  const arbol = useMemo(() => {
    const raiz = { hijos: {} };
    filtrados.forEach(it => {
      let nodo = raiz;
      niveles.forEach((fn, n) => {
        const et = fn(it);
        const clave = `${nodo.clave || ''}|${et}`;
        if (!nodo.hijos[et]) nodo.hijos[et] = { clave, etiqueta: et, nivel: n, hijos: {}, meses: Array(12).fill(0), cantidad: 0, unidades: new Set(), proveedores: new Set(), categoria: it.categoria };
        nodo = nodo.hijos[et];
        nodo.meses[it.mes] += it.monto;
        nodo.cantidad += it.cantidad;
        if (it.unidad) nodo.unidades.add(it.unidad);
        if (it.proveedor) nodo.proveedores.add(it.proveedor);
      });
    });
    return raiz;
  }, [filtrados, vista]); // eslint-disable-line react-hooks/exhaustive-deps
  const filas = [];
  const recorrer = (nodo) => Object.values(nodo.hijos)
    .map(h => ({ h, t: meses.reduce((a, m) => a + h.meses[m], 0) }))
    .sort((a, b) => b.t - a.t)
    .forEach(({ h, t }) => {
      filas.push({ h, t });
      if (Object.keys(h.hijos).length && (expandirTodo || abiertos[h.clave])) recorrer(h);
    });
  recorrer(arbol);
  const abrirHasta = (n) => {
    const nuevos = {};
    const marcar = (nodo) => Object.values(nodo.hijos).forEach(h => { if (h.nivel < n) { nuevos[h.clave] = true; marcar(h); } });
    marcar(arbol);
    setAbiertos(nuevos);
  };
  const topItems = Object.values(filtrados.reduce((acc, i) => {
    const k = `${i.categoria}|${i.producto}`;
    if (!acc[k]) acc[k] = { categoria: i.categoria, producto: i.producto, monto: 0, cantidad: 0, unidad: i.unidad, areas: new Set() };
    acc[k].monto += i.monto; acc[k].cantidad += i.cantidad; acc[k].areas.add(i.area);
    return acc;
  }, {})).sort((a, b) => b.monto - a.monto).slice(0, 10);

  // ---------- helpers de UI ----------
  const toggle = (lista, v, todosV) => { const base2 = lista || todosV; const n = base2.includes(v) ? base2.filter(x => x !== v) : [...base2, v]; return n.length === 0 || n.length === todosV.length ? null : n; };
  const igual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const pendientes = mesActual === null ? MESES_TODOS : MESES_TODOS.filter(i => i >= mesActual);
  const seguidos = meses.every((m, k) => k === 0 || m === meses[k - 1] + 1);
  const periodo = meses.length === 12 ? 'todo el año' : meses.length === 0 ? 'sin meses' : meses.length === 1 ? MESES_PC[meses[0]]
    : seguidos ? `${MESES_PC[meses[0]]} a ${MESES_PC[meses[meses.length - 1]]} (${meses.length} meses)` : `${meses.map(i => MESES_PC[i]).join(', ')} (${meses.length} meses)`;

  const card = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 18px', marginBottom: '14px' };
  const h3 = { margin: '0 0 10px', fontSize: '15px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' };
  const chip = (activo) => ({ padding: '5px 11px', borderRadius: '999px', border: `1px solid ${activo ? '#166534' : '#cbd5e1'}`, background: activo ? '#166534' : 'white', color: activo ? 'white' : '#334155', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' });
  const th = { padding: '8px 8px', fontSize: '10.5px', color: '#475569', textAlign: 'right', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 };
  const td = { padding: '6px 8px', fontSize: '12px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const tarjeta = (titulo, valor, sub, color) => (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderTop: `4px solid ${color}`, borderRadius: '10px', padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{titulo}</div>
      <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '2px', whiteSpace: 'nowrap' }}>{valor}</div>
      {sub && <div style={{ fontSize: '11.5px', color: '#475569' }}>{sub}</div>}
    </div>
  );
  const punto = (id) => <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: colorDeCategoria(id), marginRight: '6px', flexShrink: 0 }} />;
  const maxMes = Math.max(1, ...meses.map(m => porMes[m]));
  const colsMes = `repeat(${Math.max(meses.length, 1)}, 1fr)`;

  return (
    <div style={{ minWidth: 0 }}>
      {/* Encabezado */}
      <div style={{ ...card, background: 'linear-gradient(135deg, #14532d 0%, #16a34a 100%)', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '.12em', opacity: .85, fontWeight: 700 }}>PLAN DE COMPRAS{idVersion ? ` · ${idVersion.toUpperCase()}` : ''}</div>
            <div style={{ fontSize: '24px', fontWeight: 900 }}>C&amp;V International {anio}</div>
            <div style={{ fontSize: '12px', opacity: .9 }}>Periodo: {periodo} · {categoriasSel ? `${categoriasSel.length} de ${CATEGORIAS_COMPRA.length} categorías` : 'todas las categorías'}{areasSel ? ` · ${areasSel.length} áreas` : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(anios.length ? anios : [anio]).map(a => (
              <button key={a} type="button" onClick={() => setAnioSel(a)} style={{ ...chip(a === anio), borderColor: 'rgba(255,255,255,.5)', background: a === anio ? 'white' : 'transparent', color: a === anio ? '#14532d' : 'white' }}>{a}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ ...card, padding: '12px 16px' }} data-no-print>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
          <b style={{ fontSize: '11px', color: '#64748b', width: '78px' }}>MESES</b>
          <button type="button" style={chip(meses.length === 12)} onClick={() => setMesesSel(MESES_TODOS)}>Todo el año</button>
          {mesActual !== null && <button type="button" style={chip(igual(meses, pendientes))} onClick={() => setMesesSel(pendientes)}>Desde el mes en curso</button>}
          <span style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 4px' }} />
          {MESES_PC.map((m, i) => (
            <button key={m} type="button" style={chip(mesesSel.includes(i))} onClick={() => setMesesSel(mesesSel.includes(i) ? mesesSel.filter(x => x !== i) : [...mesesSel, i])}>{m}{i === mesActual ? ' ●' : ''}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
          <b style={{ fontSize: '11px', color: '#64748b', width: '78px' }}>CATEGORÍAS</b>
          <button type="button" style={chip(!categoriasSel)} onClick={() => setCategoriasSel(null)}>Todas</button>
          {CATEGORIAS_COMPRA.map(c => {
            const activa = !!categoriasSel && categoriasSel.includes(c.id);
            return (
              <button key={c.id} type="button" style={{ ...chip(activa), display: 'inline-flex', alignItems: 'center', opacity: categoriasConDatos.some(x => x.id === c.id) ? 1 : 0.5 }}
                onClick={() => setCategoriasSel(toggle(categoriasSel, c.id, CATEGORIAS_COMPRA.map(x => x.id)))}
                title={categoriasConDatos.some(x => x.id === c.id) ? '' : 'Sin registros en esta versión y año'}>
                {punto(c.id)}{c.nombre}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
          <b style={{ fontSize: '11px', color: '#64748b', width: '78px' }}>ÁREAS</b>
          <button type="button" style={chip(!areasSel)} onClick={() => setAreasSel(null)}>Todas</button>
          {areas.map(a => <button key={a} type="button" style={chip(!!areasSel && areasSel.includes(a))} onClick={() => setAreasSel(toggle(areasSel, a, areas))}>{a}</button>)}
        </div>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <b style={{ fontSize: '11px', color: '#64748b', width: '78px' }}>BUSCAR</b>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Ítem, área u origen…" style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', width: '240px' }} />
          <label style={{ fontSize: '12px', color: '#334155' }} title="La mercadería se compra N meses antes del mes de venta del forecast">
            Mercadería: comprar <input type="number" min="0" max="6" value={anticipacion} onChange={e => setAnticipacion(e.target.value)} style={{ width: '50px', padding: '5px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }} /> mes(es) antes de la venta
          </label>
        </div>
      </div>

      {/* Indicadores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '14px' }}>
        {tarjeta('Total de compras', corto(total), soles(total), '#166534')}
        {tarjeta('Insumos de producción', corto(produccion), `Materia prima, envases y suministros · ${pct(total ? produccion / total : NaN)}`, colorDeCategoria('mp'))}
        {tarjeta('Mercadería', corto(mercaderia), `Productos que no fabricamos · ${pct(total ? mercaderia / total : NaN)}`, colorDeCategoria('merc'))}
        {tarjeta('Operativos', corto(operativos), `EPPs, útiles de oficina y aseo · ${pct(total ? operativos / total : NaN)}`, colorDeCategoria('epp'))}
        {tarjeta('Mes de mayor compra', mesPico === null ? '—' : MESES_PC[mesPico], mesPico === null ? '' : soles(porMes[mesPico]), '#0f172a')}
        {tarjeta('Ítems distintos', itemsUnicos.toLocaleString('en-US'), `${filtrados.length.toLocaleString('en-US')} líneas de compra`, '#64748b')}
      </div>

      {/* Por categoría */}
      <div style={card}>
        <h3 style={h3}>🗂️ Por categoría <span style={{ fontSize: '11.5px', fontWeight: 500, color: '#64748b' }}>· clic para ver solo esa categoría</span></h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '10px' }}>
          {porCategoria.map(c => {
            const sola = categoriasSel && categoriasSel.length === 1 && categoriasSel[0] === c.id;
            const activa = !categoriasSel || categoriasSel.includes(c.id);
            return (
              <button key={c.id} type="button" onClick={() => setCategoriasSel(sola ? null : [c.id])}
                style={{ textAlign: 'left', background: sola ? '#f0fdf4' : 'white', border: `1px solid ${sola ? '#16a34a' : '#e2e8f0'}`, borderLeft: `4px solid ${colorDeCategoria(c.id)}`, borderRadius: '10px', padding: '10px 12px', cursor: 'pointer', opacity: activa ? 1 : 0.45 }}>
                <div style={{ fontWeight: 800, fontSize: '12.5px', color: '#0f172a', marginBottom: '4px' }}>{c.nombre}</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{corto(c.monto)}</div>
                <div style={{ height: '6px', background: '#eef2f7', borderRadius: '3px', margin: '6px 0' }}>
                  <div style={{ width: `${totalBase ? (c.monto / totalBase) * 100 : 0}%`, height: '100%', background: colorDeCategoria(c.id), borderRadius: '3px' }} />
                </div>
                <div style={{ fontSize: '11px', color: '#475569' }}>{pct(totalBase ? c.monto / totalBase : NaN)} del total · {c.items} ítems</div>
              </button>
            );
          })}
          {porCategoria.length === 0 && <div style={{ color: '#94a3b8', fontSize: '13px' }}>No hay compras para esta versión y año.</div>}
        </div>
      </div>

      {/* Tendencia */}
      <div style={card} data-no-excel>
        <h3 style={h3}>📈 Compras por mes y categoría</h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11.5px', color: '#334155', marginBottom: '8px' }}>
          {CATEGORIAS_COMPRA.filter(c => filtrados.some(i => i.categoria === c.id)).map(c => <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center' }}>{punto(c.id)}{c.nombre}</span>)}
        </div>
        {meses.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '12px' }}>Elige al menos un mes.</div> : (
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'grid', gridTemplateColumns: colsMes, gap: '8px', alignItems: 'end', height: '180px', borderBottom: '1px solid #cbd5e1' }}>
              {meses.map((m, k) => (
                <div key={m} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} style={{ height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: hover === k ? '#f1f5f9' : 'transparent', borderRadius: '4px' }}>
                  <div style={{ width: '60%', maxWidth: '56px', height: `${(porMes[m] / maxMes) * 100}%`, display: 'flex', flexDirection: 'column-reverse', gap: '2px' }}>
                    {CATEGORIAS_COMPRA.map(c => {
                      const v = filtrados.filter(i => i.mes === m && i.categoria === c.id).reduce((a, i) => a + i.monto, 0);
                      return v > 0 ? <div key={c.id} style={{ height: `${(v / porMes[m]) * 100}%`, background: colorDeCategoria(c.id), borderRadius: '2px' }} /> : null;
                    })}
                  </div>
                </div>
              ))}
            </div>
            {hover !== null && meses[hover] !== undefined && (
              <div style={{ position: 'absolute', top: 0, left: `${Math.min(hover / meses.length, 0.7) * 100}%`, background: '#0f172a', color: 'white', borderRadius: '8px', padding: '8px 10px', fontSize: '11.5px', pointerEvents: 'none', zIndex: 5, minWidth: '220px' }}>
                <div style={{ fontWeight: 800, marginBottom: '4px' }}>{MESES_PC[meses[hover]]} · {soles(porMes[meses[hover]])}</div>
                {CATEGORIAS_COMPRA.map(c => {
                  const v = filtrados.filter(i => i.mes === meses[hover] && i.categoria === c.id).reduce((a, i) => a + i.monto, 0);
                  return v > 0 ? <div key={c.id} style={{ display: 'flex', alignItems: 'center' }}>{punto(c.id)}{c.nombre}: <b style={{ marginLeft: '4px' }}>{soles(v)}</b></div> : null;
                })}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: colsMes, gap: '8px', fontSize: '10.5px', color: '#475569', textAlign: 'center', marginTop: '4px' }}>
              {meses.map(m => <div key={m}>{MESES_PC[m]}<br /><b style={{ color: '#0f172a' }}>{corto(porMes[m])}</b></div>)}
            </div>
          </div>
        )}
      </div>

      {/* Detalle y subdetalle */}
      <div style={card}>
        <h3 style={h3}>🧾 Detalle de compras <span style={{ fontSize: '11.5px', fontWeight: 500, color: '#64748b' }}>· {periodo} · clic en ▸ para abrir</span></h3>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }} data-no-print>
          <span style={{ fontSize: '11.5px', color: '#64748b' }}>Ver:</span>
          {[['categoria', 'Categoría → ítem → área'], ['area', 'Área → categoría → ítem'], ['item', 'Ítem → área']].map(([id, et]) => (
            <button key={id} type="button" style={chip(vista === id)} onClick={() => { setVista(id); setAbiertos({}); }}>{et}</button>
          ))}
          <span style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 4px' }} />
          <span style={{ fontSize: '11.5px', color: '#64748b' }}>Abrir hasta:</span>
          {[1, 2, 3].slice(0, niveles.length).map(n => <button key={n} type="button" className="btn-ghost" style={{ padding: '4px 10px', fontSize: '11.5px' }} onClick={() => abrirHasta(n)}>Nivel {n}</button>)}
          <button type="button" className="btn-ghost" style={{ padding: '4px 10px', fontSize: '11.5px' }} onClick={() => setAbiertos({})}>Cerrar</button>
        </div>
        <div style={{ overflow: 'auto', maxHeight: '620px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <table data-hoja="Plan de compras" data-titulo={`Plan de compras ${anio} - ${periodo}`} style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left', minWidth: '300px', left: 0, zIndex: 2 }}>Detalle</th>
              {meses.map(m => <th key={m} style={th}>{MESES_PC[m]}</th>)}
              <th style={th}>Cantidad</th><th style={th}>Total S/</th><th style={th}>Peso</th><th style={{ ...th, textAlign: 'left' }}>Proveedor</th>
            </tr></thead>
            <tbody>
              {filas.length === 0 && <tr><td colSpan={meses.length + 5} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: '20px' }}>No hay compras para los filtros elegidos.</td></tr>}
              {filas.map(({ h, t }) => {
                const tieneHijos = Object.keys(h.hijos).length > 0;
                const abierto = expandirTodo || !!abiertos[h.clave];
                const unidades = [...h.unidades];
                const esHoja = !tieneHijos;
                return (
                  <tr key={h.clave} style={{ background: h.nivel === 0 ? '#f0fdf4' : h.nivel === 1 ? '#fafafa' : 'white' }}>
                    <td data-nivel={h.nivel} onClick={() => tieneHijos && setAbiertos(a => ({ ...a, [h.clave]: !abierto }))}
                      style={{ ...td, textAlign: 'left', paddingLeft: `${8 + h.nivel * 18}px`, cursor: tieneHijos ? 'pointer' : 'default', fontWeight: h.nivel === 0 ? 800 : h.nivel === 1 ? 600 : 400, color: '#0f172a', maxWidth: '420px', overflow: 'hidden', textOverflow: 'ellipsis', position: 'sticky', left: 0, background: 'inherit' }} title={h.etiqueta}>
                      <span data-no-excel style={{ display: 'inline-block', width: '14px', color: '#64748b' }}>{tieneHijos ? (abierto ? '▾' : '▸') : ''}</span>
                      {vista !== 'area' && h.nivel === 0 && vista === 'categoria' && <span data-no-excel>{punto(h.categoria)}</span>}{h.etiqueta}
                    </td>
                    {meses.map(m => <td key={m} style={{ ...td, color: h.meses[m] ? '#0f172a' : '#cbd5e1' }} data-valor={h.meses[m]} data-formato="moneda">{h.meses[m] ? corto(h.meses[m]) : '·'}</td>)}
                    <td style={td} data-valor={h.cantidad || ''} data-formato="numero">{unidades.length === 1 ? `${cant(h.cantidad)} ${unidades[0]}` : cant(h.cantidad)}</td>
                    <td style={{ ...td, fontWeight: 800 }} data-valor={t} data-formato="moneda">{soles(t)}</td>
                    <td style={{ ...td, color: '#64748b' }} data-valor={total ? t / total : ''} data-formato="pct">{pct(total ? t / total : NaN)}</td>
                    <td style={{ ...td, textAlign: 'left', color: h.proveedores.size ? '#0f172a' : '#94a3b8' }}>{esHoja || h.proveedores.size ? ([...h.proveedores].join(', ') || 'Por asignar') : ''}</td>
                  </tr>
                );
              })}
              {filas.length > 0 && (
                <tr style={{ background: '#e2e8f0' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 800, position: 'sticky', left: 0, background: '#e2e8f0' }}>TOTAL</td>
                  {meses.map(m => <td key={m} style={{ ...td, fontWeight: 800 }} data-valor={porMes[m]} data-formato="moneda">{corto(porMes[m])}</td>)}
                  <td style={td} />
                  <td style={{ ...td, fontWeight: 800 }} data-valor={total} data-formato="moneda">{soles(total)}</td>
                  <td style={td}>100%</td><td style={td} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Principales ítems */}
      <div style={card}>
        <h3 style={h3}>🏷️ Principales ítems del periodo</h3>
        <table data-hoja="Principales ítems" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr>{['#', 'Ítem', 'Categoría', 'Áreas', 'Cantidad', 'Total S/', 'Peso'].map((c, i) => <th key={c} style={{ ...th, position: 'static', textAlign: i < 4 ? 'left' : 'right' }}>{c}</th>)}</tr></thead>
          <tbody>
            {topItems.map((it, k) => (
              <tr key={it.categoria + it.producto}>
                <td style={{ ...td, textAlign: 'left', color: '#64748b' }}>{k + 1}</td>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600, maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={it.producto}>{it.producto}</td>
                <td style={{ ...td, textAlign: 'left' }}><span style={{ display: 'inline-flex', alignItems: 'center' }}>{punto(it.categoria)}{NOMBRE[it.categoria]}</span></td>
                <td style={{ ...td, textAlign: 'left', color: '#64748b' }}>{[...it.areas].join(', ')}</td>
                <td style={td} data-valor={it.cantidad || ''} data-formato="numero">{it.cantidad ? `${cant(it.cantidad)} ${it.unidad || ''}` : '—'}</td>
                <td style={{ ...td, fontWeight: 800 }} data-valor={it.monto} data-formato="moneda">{soles(it.monto)}</td>
                <td style={{ ...td, color: '#64748b' }}>{pct(total ? it.monto / total : NaN)}</td>
              </tr>
            ))}
            {topItems.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>Sin ítems.</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: '10.5px', color: '#64748b', lineHeight: 1.5 }}>
        Entra lo registrado en la versión por categoría (módulo o cuenta): materia prima e insumos, envases y embalajes, y suministros (incluye el detalle que generan los costeos y el importado de los FP26), EPPs, útiles de oficina y de aseo;
        y la <b>mercadería</b> del forecast de Comercial (productos que no fabricamos: costo unitario del vendedor × cantidad esperada, en el mes de venta menos la anticipación elegida).
        Las categorías se configuran en <code>frontend/src/config/planCompras.js</code>. El proveedor se mostrará cuando se asigne a cada ítem (base del flujo de caja).
      </div>
    </div>
  );
}
