import React from 'react';

// Devuelve el primer valor numérico válido (0 cuenta como válido).
const num = (...valores) => {
  for (const v of valores) {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

export default function CosteoFundenteFila({ reg, onVer, onEditar, onBorrar }) {
  const dc = reg.detalle_columnas || {};

  // El costeo es anual: se muestra el año, no un mes.
  const anio = dc.anio_proyeccion || reg.fecha_proyeccion?.split('-')[0] || '-';
  const presentacion = dc.presentacion || dc.presentacion_fundente || '-';

  const cantidad = num(dc.cantidad_proyectada, dc.cantidad_total_produccion, reg.totales?.cantidad_total);
  const costoTotal = num(dc.costo_total, dc.costo_total_anual, reg.totales?.costo_total);
  const costoUnitario = num(
    dc.costo_unitario_total,
    dc.costo_unitario_promedio,
    cantidad > 0 ? costoTotal / cantidad : 0
  );
  const precioVenta = num(dc.precio_venta_unit);

  return (
    <tr key={reg.id_registro}>
      <td>{anio}</td>
      <td style={{ fontWeight: 500 }}>{dc.producto || '-'}</td>
      <td style={{ textAlign: 'center' }}>{presentacion}</td>
      <td style={{ textAlign: 'right' }}>{cantidad.toLocaleString('en-US')}</td>
      <td style={{ textAlign: 'right' }} className="font-mono">
        S/ {precioVenta.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>
      <td style={{ textAlign: 'right' }} className="font-mono">
        S/ {costoUnitario.toLocaleString('en-US', { minimumFractionDigits: 4 })}
      </td>
      <td style={{ textAlign: 'right', fontWeight: 600, color: '#166534' }} className="font-mono">
        S/ {costoTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>
      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
        <button onClick={() => onVer(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginRight: '8px' }} title="Ver">👁️</button>
        <button onClick={() => onEditar(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginRight: '8px' }} title="Editar">✏️</button>
        <button onClick={() => onBorrar(reg.id_registro)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Eliminar">🗑️</button>
      </td>
    </tr>
  );
}
