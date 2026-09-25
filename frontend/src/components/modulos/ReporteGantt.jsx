import React, { useState, useMemo } from 'react';

// Vista tipo GANTT mensual: filas agrupadas a la izquierda y los 12 meses del año a la derecha.
// Cada celda muestra la CANTIDAD (arriba) y el MONTO (abajo); el color de fondo indica
// cuánto pesa ese mes dentro de la fila. Al pasar el mouse sobre una celda se ve el detalle
// de origen (p. ej. de qué módulo o cliente viene la cantidad).
//
// grupos: [{ clave, titulo, subtitulo?, filas: [{ clave, titulo, subtitulo?, unidad?,
//            meses: Array(12) de { cantidad, monto, origen?: { [nombre]: cantidad } } }] }]

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

export const mesVacio = () => ({ cantidad: 0, monto: 0, origen: {} });
export const mesesVacios = () => Array.from({ length: 12 }, mesVacio);

const fmtCant = (n) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const fmtMonto = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sumar = (lista, campo) => lista.reduce((a, x) => a + (x[campo] || 0), 0);

export default function ReporteGantt({ grupos = [], simbolo = 'S/', etiquetaCantidad = 'Cant.', etiquetaMonto = 'Monto', colorBase = '37, 99, 235', vacio = 'No hay datos para los filtros seleccionados.' }) {
  const [colapsados, setColapsados] = useState({});

  const maximoCelda = useMemo(() => {
    let max = 0;
    grupos.forEach(g => g.filas.forEach(f => f.meses.forEach(m => { if (m.monto > max) max = m.monto; })));
    return max || 1;
  }, [grupos]);

  const totalesGrupo = (g) => MESES_CORTOS.map((_, i) => ({
    cantidad: sumar(g.filas.map(f => f.meses[i]), 'cantidad'),
    monto: sumar(g.filas.map(f => f.meses[i]), 'monto'),
  }));

  const totalGeneralMes = MESES_CORTOS.map((_, i) => sumar(grupos.flatMap(g => g.filas.map(f => f.meses[i])), 'monto'));
  const totalGeneral = totalGeneralMes.reduce((a, b) => a + b, 0);

  if (grupos.length === 0 || grupos.every(g => g.filas.length === 0)) {
    return <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}>{vacio}</div>;
  }

  const celdaBase = { padding: '6px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', minWidth: '84px', verticalAlign: 'top' };
  const colIzq = { position: 'sticky', left: 0, zIndex: 2, minWidth: '280px', maxWidth: '340px', textAlign: 'left', padding: '6px 10px', borderRight: '1px solid #e2e8f0' };

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'auto', maxHeight: '70vh' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: '11px' }}>
        <thead>
          <tr style={{ background: '#f1f5f9', color: '#475569', position: 'sticky', top: 0, zIndex: 3 }}>
            <th style={{ ...colIzq, background: '#f1f5f9', zIndex: 4 }}>Detalle</th>
            {MESES_CORTOS.map(m => <th key={m} style={{ ...celdaBase, background: '#f1f5f9', textAlign: 'center', fontWeight: 700 }}>{m}</th>)}
            <th style={{ ...celdaBase, background: '#e2e8f0', textAlign: 'center', fontWeight: 800, minWidth: '110px' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map(g => {
            const tot = totalesGrupo(g);
            const cerrado = colapsados[g.clave];
            return (
              <React.Fragment key={g.clave}>
                <tr style={{ background: '#eff6ff', cursor: 'pointer' }} onClick={() => setColapsados(p => ({ ...p, [g.clave]: !p[g.clave] }))}>
                  <td style={{ ...colIzq, background: '#eff6ff', fontWeight: 800, color: '#1e3a8a' }}>
                    {cerrado ? '▶' : '▼'} {g.titulo}
                    <span style={{ fontWeight: 500, color: '#64748b', marginLeft: '6px' }}>({g.filas.length})</span>
                    {g.subtitulo && <div style={{ fontWeight: 500, color: '#64748b', fontSize: '10px' }}>{g.subtitulo}</div>}
                  </td>
                  {tot.map((t, i) => (
                    <td key={i} style={{ ...celdaBase, fontWeight: 700, color: '#1e3a8a' }}>{t.monto ? `${simbolo} ${fmtMonto(t.monto)}` : ''}</td>
                  ))}
                  <td style={{ ...celdaBase, fontWeight: 800, color: '#1e3a8a', background: '#dbeafe' }}>{simbolo} {fmtMonto(sumar(tot, 'monto'))}</td>
                </tr>
                {!cerrado && g.filas.map(f => {
                  const totCant = sumar(f.meses, 'cantidad');
                  const totMonto = sumar(f.meses, 'monto');
                  return (
                    <tr key={f.clave}>
                      <td style={{ ...colIzq, background: 'white' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{f.titulo}</div>
                        {f.subtitulo && <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>{f.subtitulo}</div>}
                      </td>
                      {f.meses.map((m, i) => {
                        const activo = m.cantidad || m.monto;
                        const intensidad = activo ? 0.12 + 0.5 * Math.min(1, m.monto / maximoCelda) : 0;
                        const detalle = Object.entries(m.origen || {}).map(([k, v]) => `${k}: ${fmtCant(v)}`).join('\n');
                        return (
                          <td key={i} title={detalle || undefined} style={{ ...celdaBase, background: activo ? `rgba(${colorBase}, ${intensidad})` : 'white' }}>
                            {activo ? (
                              <>
                                <div style={{ fontWeight: 800, color: '#0f172a' }}>{fmtCant(m.cantidad)}</div>
                                <div style={{ color: '#166534', fontSize: '10px' }}>{simbolo} {fmtMonto(m.monto)}</div>
                              </>
                            ) : ''}
                          </td>
                        );
                      })}
                      <td style={{ ...celdaBase, background: '#f8fafc' }}>
                        <div style={{ fontWeight: 800 }}>{fmtCant(totCant)} {f.unidad || ''}</div>
                        <div style={{ color: '#166534', fontWeight: 700 }}>{simbolo} {fmtMonto(totMonto)}</div>
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
          <tr style={{ background: '#0f172a', color: 'white', position: 'sticky', bottom: 0 }}>
            <td style={{ ...colIzq, background: '#0f172a', fontWeight: 800 }}>TOTAL {etiquetaMonto.toUpperCase()}</td>
            {totalGeneralMes.map((t, i) => <td key={i} style={{ ...celdaBase, borderBottom: 'none', fontWeight: 700 }}>{t ? fmtMonto(t) : ''}</td>)}
            <td style={{ ...celdaBase, borderBottom: 'none', fontWeight: 800 }}>{simbolo} {fmtMonto(totalGeneral)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ padding: '6px 10px', fontSize: '10px', color: '#64748b', borderTop: '1px solid #e2e8f0' }}>
        Cada celda: <b>{etiquetaCantidad}</b> arriba y <b>{etiquetaMonto}</b> abajo. Pasa el mouse sobre una celda para ver de dónde viene. Clic en un grupo para plegarlo.
      </div>
    </div>
  );
}

// Totaliza un grupo de celdas (para el TOTAL FILTRADO del reporte).
export const totalMontoGrupos = (grupos) => grupos.reduce((a, g) => a + g.filas.reduce((b, f) => b + f.meses.reduce((c, m) => c + (m.monto || 0), 0), 0), 0);
