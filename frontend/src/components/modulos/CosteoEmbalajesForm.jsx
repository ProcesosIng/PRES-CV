import React, { useState, useEffect, useMemo } from 'react';
import { MESES } from '../../config/data';
import { listarLineasForecastParaEmbalaje, guardarRegistrosLote, obtenerProductosOdoo, obtenerCuentasOdoo, obtenerConfigEmbalajeGuardada, LINEAS_PRODUCCION_EMBALAJE } from '../../data/store';

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS_DISPONIBLES = Array.from({ length: 5 }, (_, i) => (ANIO_ACTUAL - 1 + i).toString());

// El embalaje se COSTEA en Logística, pero su costo pertenece a cada centro de producción:
// va a la cuenta 6142000 (Envases y embalajes - Embalajes) con el prefijo del área de producción
// de la línea costeada (Crisoles 91, Fundente 92, Copelas 93). No se asigna manualmente.
const CUENTA_EMBALAJE_BASE = '6142000 - Envases y embalajes - Embalajes';
const PREFIJO_POR_AREA = { 'Producción Crisoles': '91', 'Producción Fundente': '92', 'Producción Copelas': '93' };
const cuentaEmbalajeDe = (areaProduccion) => `${PREFIJO_POR_AREA[areaProduccion] || ''}${CUENTA_EMBALAJE_BASE}`;
const MODULO_DESTINO_EMBALAJE = 'Envases y Embalajes';
const AREA_LOGISTICA = 'Logística';

// Las cantidades del forecast ya están en la unidad de venta (unidades o kg): no se multiplican
// por el número que aparezca en la UM (p. ej. "Caja x 15Kg" o "Bx"), porque el precio es por unidad/kg.
const fmt2 = (v) => (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQ = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

function _crearInsumoVacio() {
  return {
    id: String(Date.now() + Math.random()),
    insumo: '', cuenta: '', costoUnitario: '0',
    ratioLocal: '0', ratioExterior: '0'
  };
}

export default function CosteoEmbalajesForm({ registro, onGuardar, onCancelar, modo, idVersion, area }) {
  const isSoloLectura = modo === 'ver';

  const [anioSel, setAnioSel] = useState(ANIO_ACTUAL.toString());
  // Línea de producción que se está costeando: cada una tiene su propia config y sus propios registros
  const [lineaSel, setLineaSel] = useState('');
  const [capacidadPaletaLocal, setCapacidadPaletaLocal] = useState('500');
  const [capacidadPaletaExterior, setCapacidadPaletaExterior] = useState('500');
  const [insumosEmbalaje, setInsumosEmbalaje] = useState([_crearInsumoVacio()]);
  const [productosBD, setProductosBD] = useState([]);
  const [cuentasBD, setCuentasBD] = useState([]);
  const [filaAbierta, setFilaAbierta] = useState(null);

  // Cierra la lista de insumos al hacer clic fuera de ella
  useEffect(() => {
    if (!filaAbierta) return;
    const handleClickFuera = (event) => {
      if (!event.target.closest(`[data-dropdown-emb="${filaAbierta}"]`)) {
        setFilaAbierta(null);
      }
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, [filaAbierta]);

  useEffect(() => {
    let activo = true;
    Promise.all([obtenerProductosOdoo(), obtenerCuentasOdoo()]).then(([prod, cta]) => {
      if (activo) { setProductosBD(prod || []); setCuentasBD(cta || []); }
    });
    return () => { activo = false; };
  }, []);

  // Líneas del forecast (producto + cliente + zona) SOLO de la línea de producción seleccionada
  const lineasForecast = useMemo(() => {
    if (!lineaSel) return [];
    const todas = listarLineasForecastParaEmbalaje({ idVersion, lineasNegocio: [lineaSel] });
    return todas.filter(f => {
      const anioReg = String(f.anio_proyeccion || ANIO_ACTUAL);
      return anioReg === String(anioSel);
    });
  }, [idVersion, anioSel, lineaSel]);

  const aplicarConfig = (config) => {
    setCapacidadPaletaLocal(config?.capacidadPaletaLocal ?? '500');
    setCapacidadPaletaExterior(config?.capacidadPaletaExterior ?? '500');
    setInsumosEmbalaje(Array.isArray(config?.insumos) && config.insumos.length > 0 ? config.insumos : [_crearInsumoVacio()]);
  };

  // Carga inicial: si venimos a editar un registro puntual, precargamos su línea, año y config
  useEffect(() => {
    if (registro) {
      const dc = registro.detalle_columnas || {};
      if (dc.anio_proyeccion) setAnioSel(dc.anio_proyeccion.toString());
      if (dc.unidad_negocio) setLineaSel(dc.unidad_negocio);
      if (dc.config_global) aplicarConfig(dc.config_global);
    }
  }, [registro]);

  // Al cambiar de línea o de año, se recupera lo que ya se guardó para esa línea (o valores por defecto)
  const cambiarLineaOAnio = (nuevaLinea, nuevoAnio) => {
    setLineaSel(nuevaLinea);
    setAnioSel(nuevoAnio);
    if (nuevaLinea) aplicarConfig(obtenerConfigEmbalajeGuardada({ idVersion, anio: nuevoAnio, unidadNegocio: nuevaLinea }));
  };

  const volumenPorLinea = (linea) => MESES.reduce((acc, m) => acc + (parseFloat(linea.cantidades?.[m]) || 0), 0);

  // Cálculo por línea de forecast: paletas, consumo de cada insumo y costo total/unitario
  const calculoPorLinea = useMemo(() => {
    const capLocal = parseFloat(capacidadPaletaLocal) || 1;
    const capExterior = parseFloat(capacidadPaletaExterior) || 1;

    return lineasForecast.map(linea => {
      const esExterior = linea.zona === 'Exterior';
      const capacidad = esExterior ? capExterior : capLocal;
      const volumen = volumenPorLinea(linea);
      const paletas = capacidad > 0 ? Math.ceil(volumen / capacidad) : 0;

      const detalleInsumos = insumosEmbalaje
        .filter(i => i.insumo)
        .map(i => {
          const ratio = parseFloat(esExterior ? i.ratioExterior : i.ratioLocal) || 0;
          const consumo = paletas * ratio;
          const costo = consumo * (parseFloat(i.costoUnitario) || 0);
          return { insumo: i.insumo, cuenta: i.cuenta, consumo, costo, costoUnitario: i.costoUnitario };
        });

      const costoTotal = detalleInsumos.reduce((s, d) => s + d.costo, 0);
      const costoUnitario = volumen > 0 ? costoTotal / volumen : 0;

      return { ...linea, volumen, paletas, detalleInsumos, costoTotal, costoUnitario };
    });
  }, [lineasForecast, insumosEmbalaje, capacidadPaletaLocal, capacidadPaletaExterior]);

  const totalGeneral = calculoPorLinea.reduce((s, l) => s + l.costoTotal, 0);

  // Detalle de materiales de embalaje. Crisoles y Copelas: por producto. Fundente: por mes.
  const nombresInsumos = insumosEmbalaje.filter(i => i.insumo).map(i => i.insumo);
  const [vistaDetalle, setVistaDetalle] = useState(null);
  const vistaActiva = vistaDetalle || (lineaSel === 'Fundente' ? 'mes' : 'producto');
  const detallePorProducto = useMemo(() => {
    const mapa = {};
    calculoPorLinea.forEach(l => {
      if (!mapa[l.producto]) mapa[l.producto] = { producto: l.producto, volumen: 0, paletas: 0, insumos: {}, costo: 0 };
      const f = mapa[l.producto];
      f.volumen += l.volumen; f.paletas += l.paletas; f.costo += l.costoTotal;
      l.detalleInsumos.forEach(d => {
        if (!f.insumos[d.insumo]) f.insumos[d.insumo] = { cantidad: 0, costo: 0 };
        f.insumos[d.insumo].cantidad += d.consumo; f.insumos[d.insumo].costo += d.costo;
      });
    });
    return Object.values(mapa).sort((a, b) => b.volumen - a.volumen);
  }, [calculoPorLinea]);
  const detallePorMes = useMemo(() => {
    // Cada línea reparte su consumo según el volumen de cada mes (igual que los registros que se guardan).
    const filas = {};
    nombresInsumos.forEach(n => { filas[n] = { cantidad: Array(12).fill(0), costo: Array(12).fill(0) }; });
    const volumen = Array(12).fill(0);
    calculoPorLinea.forEach(l => {
      MESES.forEach((m, i) => {
        const vol = parseFloat(l.cantidades?.[m]) || 0;
        volumen[i] += vol;
        if (!(vol > 0) || !(l.volumen > 0)) return;
        l.detalleInsumos.forEach(d => {
          if (!filas[d.insumo]) return;
          filas[d.insumo].cantidad[i] += d.consumo * vol / l.volumen;
          filas[d.insumo].costo[i] += d.costo * vol / l.volumen;
        });
      });
    });
    return { filas, volumen };
  }, [calculoPorLinea, insumosEmbalaje]); // eslint-disable-line react-hooks/exhaustive-deps

  const actInsumo = (id, campo, valor) =>
    setInsumosEmbalaje(insumosEmbalaje.map(i => i.id === id ? { ...i, [campo]: valor } : i));

  const seleccionarInsumoBD = (id, prodBd) => {
    const costo = parseFloat(prodBd.costo) > 0 ? parseFloat(prodBd.costo) : (parseFloat(prodBd.precio_venta) || 0);
    setInsumosEmbalaje(insumosEmbalaje.map(i => i.id === id ? { ...i, insumo: prodBd.nombre || prodBd.descripcion, costoUnitario: costo.toFixed(4) } : i));
    setFilaAbierta(null);
  };

  const filtrarProductosBD = (texto) => {
    const q = (texto || '').trim().toLowerCase();
    if (!q) return productosBD.slice(0, 20);
    return productosBD.filter(p => String(p.nombre || '').toLowerCase().includes(q)).slice(0, 20);
  };

  const handleGuardar = () => {
    if (!lineaSel) return alert('Selecciona la línea de producción a costear.');
    if (calculoPorLinea.length === 0) return alert(`No hay líneas de forecast de ${lineaSel} para ${anioSel}.`);

    const configGlobal = { capacidadPaletaLocal, capacidadPaletaExterior, insumos: insumosEmbalaje };
    // Lote fijo por línea + año: al volver a guardar se reemplaza solo el costeo de esa línea
    const areaDestino = LINEAS_PRODUCCION_EMBALAJE.find(l => l.unidadNegocio === lineaSel)?.area || '';
    if (!PREFIJO_POR_AREA[areaDestino]) return alert(`No se encontró el centro de producción de la línea ${lineaSel}.`);
    const cuentaEmbalaje = cuentaEmbalajeDe(areaDestino);
    const idLoteBase = `LOTE-EMB-${idVersion}-${lineaSel}-${anioSel}`;

    const registrosAGuardar = [];

    calculoPorLinea.forEach((linea) => {
      const idRegistro = `EMB-${linea.id_registro}`; // 1 registro de embalaje por línea de forecast
      const desglose = linea.detalleInsumos
        .filter(d => d.costo > 0)
        .map((d, i) => ({
          id: `emb-${i}`,
          cuenta: `${cuentaEmbalaje} - ${d.insumo} (${linea.unidad_negocio})`,
          monto: d.costo.toFixed(2)
        }));

      // Registros derivados mes a mes en el módulo "Envases y Embalajes" del CENTRO DE PRODUCCIÓN
      // de la línea (p. ej. Producción Crisoles, cuenta 916142000).
      // El costo de cada insumo se reparte según el volumen de cada mes del forecast.
      MESES.forEach((mes, iM) => {
        const volMes = parseFloat(linea.cantidades?.[mes]) || 0;
        if (!(volMes > 0) || !(linea.volumen > 0)) return;
        const proporcion = volMes / linea.volumen;
        linea.detalleInsumos.forEach((d, iIns) => {
          const costoMes = d.costo * proporcion;
          if (!(costoMes > 0)) return;
          registrosAGuardar.push({
            id_registro: `DERIV-EMB-${linea.id_registro}-${iIns}-${mes}`,
            id_lote: idLoteBase,
            modulo: MODULO_DESTINO_EMBALAJE,
            categoria: MODULO_DESTINO_EMBALAJE,
            area: areaDestino,
            idVersion,
            fecha_proyeccion: `${anioSel}-${String(iM + 1).padStart(2, '0')}-01`,
            empleado_dni: '-',
            empleado_nombre: `COSTEO EMBALAJE - ${d.insumo.toUpperCase()}`,
            detalle_columnas: {
              cuenta_afectada: cuentaEmbalaje,
              producto: `${d.insumo.toUpperCase()} (${linea.producto})`,
              detalle: `${d.insumo.toUpperCase()} - Para: ${linea.producto} / ${linea.cliente} (${linea.zona})`,
              unidad_medida: 'unidad',
              costo_unitario: d.costoUnitario,
              cantidad: d.consumo * proporcion,
              costo_total: costoMes,
              es_derivado: true,
              extras: { producto: `${d.insumo.toUpperCase()} (${linea.producto})` }
            },
            totales: { costo_total: costoMes }
          });
        });
      });

      registrosAGuardar.push({
        id_registro: idRegistro,
        id_lote: idLoteBase,
        modulo: 'Costeo de Embalajes',
        categoria: 'Costeo de Embalajes',
        area: AREA_LOGISTICA,
        idVersion,
        fecha_proyeccion: `${anioSel}-01-01`,
        empleado_dni: '-',
        empleado_nombre: linea.producto,
        detalle_columnas: {
          producto: linea.producto,
          unidad_negocio: linea.unidad_negocio,
          cliente: linea.cliente,
          zona: linea.zona,
          anio_proyeccion: anioSel,
          volumen_anual: linea.volumen,
          paletas: linea.paletas,
          costo_unitario_embalaje: linea.costoUnitario,
          costo_total_anual: linea.costoTotal,
          id_registro_forecast: linea.id_registro,
          area_produccion_destino: areaDestino,
          config_global: configGlobal,
        },
        totales: { costo_total: linea.costoTotal },
        desglose_contable: desglose,
      });
    });

    guardarRegistrosLote(registrosAGuardar);
    if (typeof onGuardar === 'function') onGuardar(registrosAGuardar);
    if (typeof onCancelar === 'function') onCancelar();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '82vh', width: '100%', maxWidth: '950px', margin: '0 auto', overflow: 'hidden' }}>
      <fieldset disabled={isSoloLectura} style={{ border: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {/* grid (no flex): las secciones no se encogen; la tabla 3 se muestra completa y la ventana hace scroll */}
        <div style={{ flex: 1, display: 'grid', gridAutoRows: 'max-content', gap: '20px', overflowY: 'auto', padding: '16px' }}>

          {/* 1. AÑO Y CAPACIDAD POR PALETA */}
          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '10px' }}>1. Línea de Producción, Año y Capacidad por Paleta</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#7c3aed' }}>LÍNEA A COSTEAR</label>
                <select value={lineaSel} onChange={e => cambiarLineaOAnio(e.target.value, anioSel)} disabled={!!registro} style={{ width: '100%', padding: '6px', border: '1px solid #7c3aed', borderRadius: '4px', background: '#f5f3ff', fontWeight: 600 }}>
                  <option value="">— Seleccionar —</option>
                  {LINEAS_PRODUCCION_EMBALAJE.map(l => <option key={l.unidadNegocio} value={l.unidadNegocio}>{l.unidadNegocio}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb' }}>AÑO</label>
                <select value={anioSel} onChange={e => cambiarLineaOAnio(lineaSel, e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                  {ANIOS_DISPONIBLES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#1d4ed8' }}>CAPACIDAD POR PALETA — LOCAL</label>
                <input type="number" value={capacidadPaletaLocal} onChange={e => setCapacidadPaletaLocal(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #2563eb', borderRadius: '4px', background: '#eff6ff' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#c2410c' }}>CAPACIDAD POR PALETA — EXTERIOR</label>
                <input type="number" value={capacidadPaletaExterior} onChange={e => setCapacidadPaletaExterior(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #f97316', borderRadius: '4px', background: '#fff7ed' }} />
              </div>
            </div>
          </div>

          {/* 2. INSUMOS DE EMBALAJE (paletas, zuncho, grapas, film) */}
          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ fontWeight: 700, color: '#1e293b' }}>2. Insumos de Embalaje (ratio por paleta)</div>
              <button type="button" onClick={() => setInsumosEmbalaje([...insumosEmbalaje, _crearInsumoVacio()])} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>+ Agregar Insumo</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 90px 90px 90px auto', gap: '6px', fontSize: '10px', color: '#64748b', fontWeight: 'bold', marginBottom: '4px' }}>
              <span>Insumo</span><span>Ratio Local</span><span>Ratio Exterior</span><span>Costo U.</span><span></span>
            </div>
            {insumosEmbalaje.map(item => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '2fr 90px 90px 90px auto', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                <div data-dropdown-emb={item.id} style={{ position: 'relative' }}>
                  <input type="text" value={item.insumo} placeholder="Buscar insumo (paleta, zuncho, film...)"
                    onChange={e => { actInsumo(item.id, 'insumo', e.target.value); setFilaAbierta(item.id); }}
                    onFocus={() => setFilaAbierta(item.id)}
                    style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
                  {filaAbierta === item.id && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: '0 0 6px 6px', maxHeight: '200px', overflowY: 'auto', zIndex: 50 }}>
                      {filtrarProductosBD(item.insumo).map((p, i) => (
                        <div key={i} onClick={() => seleccionarInsumoBD(item.id, p)} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '11px', borderBottom: '1px solid #f1f5f9' }}>
                          {p.nombre || p.descripcion}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <input type="number" step="0.0001" value={item.ratioLocal} onChange={e => actInsumo(item.id, 'ratioLocal', e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
                <input type="number" step="0.0001" value={item.ratioExterior} onChange={e => actInsumo(item.id, 'ratioExterior', e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
                <input type="number" step="0.01" value={item.costoUnitario} onChange={e => actInsumo(item.id, 'costoUnitario', e.target.value)} style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} />
                <button type="button" onClick={() => setInsumosEmbalaje(insumosEmbalaje.filter(i => i.id !== item.id))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>🗑️</button>
              </div>
            ))}
          </div>

          {/* 3. RESULTADO POR LÍNEA DE FORECAST */}
          <div style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ background: '#f8fafc', padding: '10px 14px', fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #cbd5e1' }}>
              3. Costeo por Línea (Producto + Cliente + Zona){lineaSel ? ` — ${lineaSel}` : ''} — {calculoPorLinea.length} registros
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f1f5f9' }}>
                  <tr>
                    <th style={{ padding: '6px', textAlign: 'left' }}>Producto</th>
                    <th style={{ padding: '6px', textAlign: 'left' }}>Línea</th>
                    <th style={{ padding: '6px', textAlign: 'left' }}>Cliente</th>
                    <th style={{ padding: '6px', textAlign: 'center' }}>Zona</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Vol.</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Paletas</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Costo U.</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Costo Total</th>
                  </tr>
                </thead>
                <tbody>
                  {calculoPorLinea.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>{lineaSel ? `No hay líneas de forecast de ${lineaSel} para este año.` : 'Selecciona arriba la línea de producción a costear.'}</td></tr>
                  ) : calculoPorLinea.map(l => (
                    <tr key={l.id_registro} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '5px 6px', fontWeight: 600 }}>{l.producto}</td>
                      <td style={{ padding: '5px 6px', color: '#64748b' }}>{l.unidad_negocio}</td>
                      <td style={{ padding: '5px 6px' }}>{l.cliente}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '3px', background: l.zona === 'Exterior' ? '#fef3c7' : '#dbeafe', color: l.zona === 'Exterior' ? '#92400e' : '#1e40af' }}>{l.zona}</span>
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'right' }}>{l.volumen.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right' }}>{l.paletas}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right' }}>S/ {l.costoUnitario.toFixed(4)}</td>
                      <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700, color: '#166534' }}>S/ {fmt2(l.costoTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: '#f0fdf4', padding: '14px', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#166534', fontSize: '16px' }}>
            <span>COSTO TOTAL DE EMBALAJE{lineaSel ? ` — ${lineaSel}` : ''} ({anioSel}):</span>
            <span>S/ {fmt2(totalGeneral)}</span>
          </div>

          {/* 4. DETALLE DE MATERIALES DE EMBALAJE */}
          {calculoPorLinea.length > 0 && nombresInsumos.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ background: '#f8fafc', padding: '10px 14px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontWeight: 700, color: '#1e293b' }}>4. Materiales de embalaje — cantidades y costo {vistaActiva === 'mes' ? 'por mes' : 'por producto'}</span>
                <span data-no-print style={{ display: 'flex', gap: '4px' }}>
                  {[['producto', 'Por producto'], ['mes', 'Por mes']].map(([v, t]) => (
                    <button key={v} type="button" onClick={() => setVistaDetalle(v)} style={{ padding: '3px 10px', fontSize: '11px', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: 'pointer', background: vistaActiva === v ? '#2563eb' : 'white', color: vistaActiva === v ? 'white' : '#334155' }}>{t}</button>
                  ))}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                {vistaActiva === 'producto' ? (
                  <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f1f5f9' }}>
                      <tr>
                        <th rowSpan={2} style={{ padding: '6px', textAlign: 'left' }}>Producto</th>
                        <th rowSpan={2} style={{ padding: '6px', textAlign: 'right' }}>Vol.</th>
                        <th rowSpan={2} style={{ padding: '6px', textAlign: 'right' }}>Paletas</th>
                        {nombresInsumos.map(n => <th key={n} colSpan={2} style={{ padding: '6px', textAlign: 'center', borderLeft: '1px solid #cbd5e1' }}>{n}</th>)}
                        <th rowSpan={2} style={{ padding: '6px', textAlign: 'right', borderLeft: '1px solid #cbd5e1' }}>Costo total</th>
                      </tr>
                      <tr>{nombresInsumos.map(n => <React.Fragment key={n}><th style={{ padding: '4px 6px', textAlign: 'right', fontSize: '10px', borderLeft: '1px solid #cbd5e1' }}>Cant.</th><th style={{ padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>S/</th></React.Fragment>)}</tr>
                    </thead>
                    <tbody>
                      {detallePorProducto.map(f => (
                        <tr key={f.producto} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '5px 6px', fontWeight: 600 }}>{f.producto}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right' }}>{fmtQ(f.volumen)}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right' }}>{fmtQ(f.paletas)}</td>
                          {nombresInsumos.map(n => (
                            <React.Fragment key={n}>
                              <td style={{ padding: '5px 6px', textAlign: 'right', borderLeft: '1px solid #f1f5f9' }}>{fmtQ(f.insumos[n]?.cantidad)}</td>
                              <td style={{ padding: '5px 6px', textAlign: 'right' }}>{fmt2(f.insumos[n]?.costo)}</td>
                            </React.Fragment>
                          ))}
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700, color: '#166534', borderLeft: '1px solid #f1f5f9' }}>{fmt2(f.costo)}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc', fontWeight: 800 }}>
                        <td style={{ padding: '6px' }}>TOTAL</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{fmtQ(detallePorProducto.reduce((a, f) => a + f.volumen, 0))}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{fmtQ(detallePorProducto.reduce((a, f) => a + f.paletas, 0))}</td>
                        {nombresInsumos.map(n => (
                          <React.Fragment key={n}>
                            <td style={{ padding: '6px', textAlign: 'right' }}>{fmtQ(detallePorProducto.reduce((a, f) => a + (f.insumos[n]?.cantidad || 0), 0))}</td>
                            <td style={{ padding: '6px', textAlign: 'right' }}>{fmt2(detallePorProducto.reduce((a, f) => a + (f.insumos[n]?.costo || 0), 0))}</td>
                          </React.Fragment>
                        ))}
                        <td style={{ padding: '6px', textAlign: 'right', color: '#166534' }}>{fmt2(totalGeneral)}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f1f5f9' }}>
                      <tr>
                        <th style={{ padding: '6px', textAlign: 'left' }}>Material</th>
                        {MESES.map(m => <th key={m} style={{ padding: '6px', textAlign: 'right' }}>{m}</th>)}
                        <th style={{ padding: '6px', textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ background: '#f8fafc', color: '#475569' }}>
                        <td style={{ padding: '5px 6px', fontWeight: 600 }}>Volumen del mes</td>
                        {detallePorMes.volumen.map((v, i) => <td key={i} style={{ padding: '5px 6px', textAlign: 'right' }}>{fmtQ(v)}</td>)}
                        <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>{fmtQ(detallePorMes.volumen.reduce((a, v) => a + v, 0))}</td>
                      </tr>
                      {nombresInsumos.map(n => (
                        <React.Fragment key={n}>
                          <tr style={{ borderTop: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '5px 6px', fontWeight: 700 }}>{n} <span style={{ color: '#94a3b8', fontWeight: 400 }}>(cant.)</span></td>
                            {detallePorMes.filas[n].cantidad.map((v, i) => <td key={i} style={{ padding: '5px 6px', textAlign: 'right' }}>{fmtQ(v)}</td>)}
                            <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>{fmtQ(detallePorMes.filas[n].cantidad.reduce((a, v) => a + v, 0))}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '3px 6px 6px 18px', color: '#64748b' }}>costo S/</td>
                            {detallePorMes.filas[n].costo.map((v, i) => <td key={i} style={{ padding: '3px 6px 6px', textAlign: 'right', color: '#64748b' }}>{fmt2(v)}</td>)}
                            <td style={{ padding: '3px 6px 6px', textAlign: 'right', color: '#166534', fontWeight: 700 }}>{fmt2(detallePorMes.filas[n].costo.reduce((a, v) => a + v, 0))}</td>
                          </tr>
                        </React.Fragment>
                      ))}
                      <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc', fontWeight: 800 }}>
                        <td style={{ padding: '6px' }}>TOTAL S/</td>
                        {MESES.map((m, i) => <td key={m} style={{ padding: '6px', textAlign: 'right' }}>{fmt2(nombresInsumos.reduce((a, n) => a + detallePorMes.filas[n].costo[i], 0))}</td>)}
                        <td style={{ padding: '6px', textAlign: 'right', color: '#166534' }}>{fmt2(totalGeneral)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

        </div>
      </fieldset>

      <div style={{ borderTop: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', gap: '12px', justifyContent: 'flex-end', background: 'white' }}>
        <button type="button" onClick={onCancelar} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer' }}>{isSoloLectura ? 'Cerrar' : 'Cancelar'}</button>
        {!isSoloLectura && <button type="button" onClick={handleGuardar} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>Guardar Costeo de Embalajes</button>}
      </div>
    </div>
  );
}