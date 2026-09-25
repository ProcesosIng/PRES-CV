import React, { useState, useEffect, useMemo } from 'react';
import { MESES } from '../../config/data';
import { listarLineasForecastParaEmbalaje, guardarRegistrosLote, obtenerProductosOdoo, obtenerCuentasOdoo, obtenerConfigEmbalajeGuardada, LINEAS_PRODUCCION_EMBALAJE } from '../../data/store';

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS_DISPONIBLES = Array.from({ length: 5 }, (_, i) => (ANIO_ACTUAL - 1 + i).toString());

// Cuenta de embalaje con prefijo 98 (Logística): conserva los últimos 7 dígitos del código base.
const formatearCuentaConPrefijo98 = (codigoBase, descripcion) => {
  const base = String(codigoBase || '6142000').replace(/\D/g, '').slice(-7);
  return `98${base} - ${descripcion || 'Envases y Embalajes - Embalajes'}`;
};

const obtenerFactorPorUnidad = (unidadMedida) => {
  if (!unidadMedida) return 1;
  const u = unidadMedida.toLowerCase().trim();
  if (u === 'saco 25kg' || u === 'bolsa 25kg') return 25;
  const m = u.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
};

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

  const volumenPorLinea = (linea) => {
    const factor = obtenerFactorPorUnidad(linea.um);
    return MESES.reduce((acc, m) => acc + (parseFloat(linea.cantidades?.[m]) || 0), 0) * factor;
  };

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
    const idLoteBase = `LOTE-EMB-${idVersion}-${lineaSel}-${anioSel}`;

    const registrosAGuardar = calculoPorLinea.map((linea, idx) => {
      const idRegistro = `EMB-${linea.id_registro}`; // 1 registro de embalaje por línea de forecast
      const desglose = linea.detalleInsumos
        .filter(d => d.costo > 0)
        .map((d, i) => ({
          id: `emb-${i}`,
          cuenta: formatearCuentaConPrefijo98(d.cuenta, `${d.insumo} (${linea.unidad_negocio})`),
          monto: d.costo.toFixed(2)
        }));

      return {
        id_registro: idRegistro,
        id_lote: idLoteBase,
        modulo: 'Costeo de Embalajes',
        categoria: 'Costeo de Embalajes',
        area,
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
      };
    });

    guardarRegistrosLote(registrosAGuardar);
    if (typeof onGuardar === 'function') onGuardar(registrosAGuardar);
    if (typeof onCancelar === 'function') onCancelar();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '82vh', width: '100%', maxWidth: '950px', margin: '0 auto', overflow: 'hidden' }}>
      <fieldset disabled={isSoloLectura} style={{ border: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', padding: '16px' }}>

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
                <div style={{ position: 'relative' }}>
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
            <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9' }}>
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
                      <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700, color: '#166534' }}>S/ {l.costoTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: '#f0fdf4', padding: '14px', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#166534', fontSize: '16px' }}>
            <span>COSTO TOTAL DE EMBALAJE{lineaSel ? ` — ${lineaSel}` : ''} ({anioSel}):</span>
            <span>S/ {totalGeneral.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>

        </div>
      </fieldset>

      <div style={{ borderTop: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', gap: '12px', justifyContent: 'flex-end', background: 'white' }}>
        <button type="button" onClick={onCancelar} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer' }}>{isSoloLectura ? 'Cerrar' : 'Cancelar'}</button>
        {!isSoloLectura && <button type="button" onClick={handleGuardar} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>Guardar Costeo de Embalajes</button>}
      </div>
    </div>
  );
}