import React from 'react';

export default function CosteoEmbalajesFila({ reg, onVer, onEditar, onBorrar }) {
  const dc = reg.detalle_columnas || {};
  const num = (v) => Number(v) || 0;

  return (
    <tr key={reg.id_registro} style={{ borderBottom: '1px solid #f1f5f9', background: 'white' }}>
      <td style={{ padding: '12px' }}>{dc.anio_proyeccion || '-'}</td>
      <td style={{ padding: '12px', fontWeight: 600 }}>{dc.producto || '-'}</td>
      <td style={{ padding: '12px', fontSize: '12px', color: '#64748b' }}>{dc.unidad_negocio || '-'}</td>
      <td style={{ padding: '12px', fontSize: '12px' }} title={dc.cliente}>{(dc.cliente || '-').slice(0, 24)}</td>
      <td style={{ padding: '12px', textAlign: 'center' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: dc.zona === 'Exterior' ? '#fef3c7' : '#dbeafe', color: dc.zona === 'Exterior' ? '#92400e' : '#1e40af' }}>
          {dc.zona || 'Local'}
        </span>
      </td>
      <td style={{ padding: '12px', textAlign: 'right' }}>{num(dc.paletas).toLocaleString('en-US')}</td>
      <td style={{ padding: '12px', textAlign: 'right' }}>S/ {num(dc.costo_unitario_embalaje).toFixed(4)}</td>
      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#166534' }}>
        S/ {num(reg.totales?.costo_total || dc.costo_total_anual).toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>
      <td style={{ padding: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
        <button type="button" onClick={() => onVer(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginRight: '8px' }} title="Ver">👁️</button>
        <button type="button" onClick={() => onEditar(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginRight: '8px' }} title="Editar">✏️</button>
        <button type="button" onClick={() => onBorrar(reg.id_registro)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#ef4444' }} title="Eliminar">🗑️</button>
      </td>
    </tr>
  );
}