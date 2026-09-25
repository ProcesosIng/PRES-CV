import React from 'react';

export default function TablaGenerica({ registros, onVer, onEditar, onBorrar, mostrarProducto }) {
  // El Dashboard ya maneja el estado "vacío", así que aquí solo iteramos.
  if (!registros || registros.length === 0) return null;

  return (
    <>
      {registros.map((reg) => (
        <tr key={reg.id_registro} style={{ borderBottom: '1px solid #f1f5f9', background: 'white' }}>
          
          <td style={{ padding: '12px', fontSize: '13px', color: '#475569', fontWeight: 500 }}>
            {reg.fecha_proyeccion}
          </td>
          
          <td style={{ padding: '12px' }}>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>{reg.empleado_nombre}</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>Dist: {reg.detalle_columnas?.distribucion || '100'}%</div>
          </td>
          
          {mostrarProducto && (
            <td style={{ padding: '12px', fontSize: '13px', color: '#0f172a' }}>
              {reg.detalle_columnas?.extras?.producto || reg.detalle_columnas?.producto || '-'}
            </td>
          )}
          
          <td style={{ padding: '12px' }}>
            <span style={{ fontSize: '12px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#334155', fontFamily: 'monospace' }}>
              {reg.detalle_columnas?.cuenta_afectada || '-'}
            </span>
          </td>
          
          <td style={{ padding: '12px', fontSize: '13px', color: '#334155' }}>
            {reg.detalle_columnas?.detalle || 'Sin detalles'}
          </td>
          
          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
            S/ {(reg.totales?.costo_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </td>
          
          <td style={{ padding: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
            <button type="button" onClick={() => onVer(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', marginRight: '8px' }} title="Ver">👁️</button>
            <button type="button" onClick={() => onEditar(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', marginRight: '8px' }} title="Editar">✏️</button>
            <button type="button" onClick={() => onBorrar(reg.id_registro)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', color: '#ef4444' }} title="Eliminar">🗑️</button>
          </td>
        </tr>
      ))}
    </>
  );
}