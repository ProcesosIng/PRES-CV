import React from 'react';

export default function PlanViajeFila({ reg, onVer, onEditar, onBorrar }) {
  const dc = reg.detalle_columnas || {};
  return (
    <tr key={reg.id_registro}>
      <td style={{ fontWeight: 500 }}>{dc.viaje || '-'}</td>
      <td>{reg.empleado_nombre}</td>
      <td style={{ textAlign: 'center' }}>{dc.mes_inicio || '-'}</td>
      <td style={{ textAlign: 'center' }}>{dc.duracion_dias || 0}</td>
      <td style={{ textAlign: 'center' }}>
        <span style={{
          fontSize: '11px', padding: '2px 8px', borderRadius: '99px', fontWeight: 600,
          background: dc.estado === 'Ejecutado' ? '#dcfce7' : '#fef9c3',
          color: dc.estado === 'Ejecutado' ? '#166534' : '#854d0e'
        }}>{dc.estado || 'Planeado'}</span>
      </td>
      <td style={{ textAlign: 'center' }}>{dc.cant_personas || 1}</td>
      <td style={{ textAlign: 'right' }} className="font-mono">
        S/ {(dc.monto_unit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>
      <td style={{ textAlign: 'right', fontWeight: 600, color: '#166534' }} className="font-mono">
        S/ {(dc.costo_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>
      <td style={{ textAlign: 'center' }}>
        <button onClick={() => onVer(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginRight: '8px' }} title="Ver">👁️</button>
        <button onClick={() => onEditar(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginRight: '8px' }} title="Editar">✏️</button>
        <button onClick={() => onBorrar(reg.id_registro)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Eliminar">🗑️</button>
      </td>
    </tr>
  );
}
