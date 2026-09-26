import React, { useMemo, useState } from 'react';
import { listarRegistros, guardarRegistrosLote } from '../../data/store';
import { prefijoDeArea } from '../../config/areas';
import { MODULO_DISTRIBUCION_CALIDAD, DESTINOS_CALIDAD as DESTINOS, generarDistribucionCalidad, lineasDeRegistro as lineasDe } from '../../config/distribucionCalidad';

// =====================================================================
// DISTRIBUCIÓN DE CALIDAD
// Calidad registra sus gastos en todos los módulos con la cuenta 6 base (sin prefijo).
// Aquí se definen los porcentajes para cada destino y, al APLICAR, se generan en cada
// módulo del destino los mismos gastos con su prefijo (91/92/93/95) y el % que le toca:
//  - Crisoles, Fundente y Copelas: proceso "CIF" (compartido), así el costeo los toma solo.
//  - Comercial: gasto normal del mismo módulo.
// Cambiar porcentajes o registros de Calidad requiere volver a aplicar (se regenera todo).
// =====================================================================
export { MODULO_DISTRIBUCION_CALIDAD };
const ES_PRODUCCION = (a) => a.startsWith('Producción');

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const fmt = (v) => num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function DistribucionCalidad({ idVersion, usuario }) {
  const [recarga, setRecarga] = useState(0);
  const config = useMemo(
    () => listarRegistros({ idVersion, area: 'Calidad', modulo: MODULO_DISTRIBUCION_CALIDAD })[0] || null,
    [idVersion, recarga]
  );
  const cfg = config?.detalle_columnas || {};
  const [porcentajes, setPorcentajes] = useState(() => DESTINOS.reduce((a, d) => ({ ...a, [d]: String(cfg.porcentajes?.[d] ?? '') }), {}));

  const gastosCalidad = useMemo(
    () => listarRegistros({ idVersion, area: 'Calidad' })
      .filter(r => r.modulo !== MODULO_DISTRIBUCION_CALIDAD && !String(r.id_registro).startsWith('DERIV-')),
    [idVersion, recarga]
  );

  const suma = DESTINOS.reduce((a, d) => a + num(porcentajes[d]), 0);
  const sumaOk = Math.abs(suma - 100) < 0.001;
  const activo = !!cfg.activo;
  const aplicadoEn = cfg.aplicado_en ? new Date(cfg.aplicado_en) : null;
  const cambiosPendientes = activo && gastosCalidad.some(r => r.actualizado_en && aplicadoEn && new Date(r.actualizado_en) > aplicadoEn);
  const porcentajesCambiados = DESTINOS.some(d => num(porcentajes[d]) !== num(cfg.porcentajes?.[d]));

  // Totales por módulo de Calidad y lo que recibiría cada destino
  const porModulo = useMemo(() => {
    const m = {};
    gastosCalidad.forEach(r => {
      const total = lineasDe(r).reduce((a, l) => a + l.monto, 0);
      m[r.modulo] = (m[r.modulo] || 0) + total;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [gastosCalidad]);
  const totalCalidad = porModulo.reduce((a, [, v]) => a + v, 0);

  // Genera (o quita) los gastos de Calidad en cada destino. Todo en un solo lote que se reemplaza completo.
  const guardar = (activar) => {
    if (activar && !sumaOk) return alert(`Los porcentajes deben sumar 100% (hoy suman ${suma.toFixed(2)}%).`);
    const lote = generarDistribucionCalidad({ idVersion, gastosCalidad, porcentajes, activar, usuario, fechaBase: config?.fecha_proyeccion });
    guardarRegistrosLote(lote);
    setRecarga(n => n + 1);
    alert(activar
      ? `Distribución aplicada: ${lote.length - 1} registros generados en los módulos de ${DESTINOS.filter(d => num(porcentajes[d]) > 0).join(', ')}.`
      : 'Distribución desactivada: los gastos de Calidad ya no se reparten.');
  };

  const card = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '18px', marginBottom: '16px' };
  const th = { padding: '8px 10px', fontSize: '11px', color: '#475569', textAlign: 'right', borderBottom: '2px solid #cbd5e1', whiteSpace: 'nowrap' };
  const td = { padding: '7px 10px', fontSize: '12.5px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' };

  return (
    <div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>Porcentajes de distribución</h3>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Calidad registra en la cuenta 6 base. Al aplicar, cada destino recibe su % en el mismo módulo, con su prefijo; producción lo toma como <b>CIF compartido</b>.
            </div>
          </div>
          <span style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, background: activo ? '#dcfce7' : '#f1f5f9', color: activo ? '#166534' : '#475569' }}>
            {activo ? `● Activa · aplicada ${aplicadoEn ? aplicadoEn.toLocaleString('es-PE') : ''}` : '○ Sin aplicar'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
          {DESTINOS.map(d => (
            <label key={d} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: '#334155' }}>
              {d} <span style={{ color: '#94a3b8', fontWeight: 500 }}>({prefijoDeArea(d)})</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                <input type="number" min="0" max="100" step="0.01" value={porcentajes[d]} placeholder="0"
                  onChange={e => setPorcentajes({ ...porcentajes, [d]: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '15px', fontWeight: 700 }} />
                <span style={{ fontSize: '15px' }}>%</span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, marginTop: '4px' }}>S/ {fmt(totalCalidad * num(porcentajes[d]) / 100)} · {ES_PRODUCCION(d) ? 'CIF compartido' : 'gasto del módulo'}</div>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '14px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: sumaOk ? '#15803d' : '#b91c1c' }}>
            Suma: {suma.toFixed(2)}% {sumaOk ? '✔' : '(debe ser 100%)'}
            {(cambiosPendientes || (activo && porcentajesCambiados)) && <span style={{ marginLeft: '12px', color: '#b45309' }}>⚠ Hay cambios sin aplicar</span>}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {activo && <button type="button" className="btn-ghost" onClick={() => guardar(false)}>Desactivar distribución</button>}
            <button type="button" onClick={() => guardar(true)} disabled={!sumaOk || gastosCalidad.length === 0}
              style={{ background: sumaOk ? '#16a34a' : '#94a3b8', color: 'white', border: 'none', padding: '9px 18px', borderRadius: '6px', fontWeight: 700, cursor: sumaOk ? 'pointer' : 'not-allowed' }}>
              {activo ? '↻ Volver a aplicar' : '▶ Aplicar distribución'}
            </button>
          </div>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ margin: '0 0 10px', fontSize: '15px', color: '#0f172a' }}>Gastos de Calidad registrados ({gastosCalidad.length} registros)</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Módulo</th>
                <th style={th}>Total Calidad (S/)</th>
                {DESTINOS.map(d => <th key={d} style={th}>{d.replace('Producción ', '')} ({num(porcentajes[d]).toFixed(1)}%)</th>)}
              </tr>
            </thead>
            <tbody>
              {porModulo.length === 0 && <tr><td colSpan={2 + DESTINOS.length} style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>Calidad aún no registra gastos en esta versión.</td></tr>}
              {porModulo.map(([mod, total]) => (
                <tr key={mod}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{mod}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(total)}</td>
                  {DESTINOS.map(d => <td key={d} style={td}>{fmt(total * num(porcentajes[d]) / 100)}</td>)}
                </tr>
              ))}
              {porModulo.length > 0 && (
                <tr style={{ background: '#f8fafc' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>TOTAL</td>
                  <td style={{ ...td, fontWeight: 800 }}>{fmt(totalCalidad)}</td>
                  {DESTINOS.map(d => <td key={d} style={{ ...td, fontWeight: 800 }}>{fmt(totalCalidad * num(porcentajes[d]) / 100)}</td>)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
