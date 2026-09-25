import React from 'react';

export default function PlanMantenimientoFila({ reg, onVer, onEditar, onBorrar }) {
  const dc = reg.detalle_columnas || {};
  
  const costoMantenimiento = parseFloat(dc.costo_mantenimiento || 0);
  const costoTotalMes = parseFloat(dc.costo_total || reg.totales?.costo_total || 0);

  return (
    <tr key={reg.id_registro}>
      <td className="mono-id">{dc.cuenta || '-'}</td>
      <td style={{ fontWeight: 500 }}>{dc.descripcion_activo || '-'}</td>
      <td>{dc.area || '-'}</td>
      <td style={{ textAlign: 'center' }}>{dc.frecuencia || '-'}</td>
      <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#2563eb' }}>{dc.mes_ejecucion_gasto || '-'}</td>
      <td style={{ textAlign: 'right' }} className="font-mono">
        S/ {costoMantenimiento.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>
      <td style={{ textAlign: 'right', fontWeight: 600, color: '#166534' }} className="font-mono">
        S/ {costoTotalMes.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>
      <td style={{ textAlign: 'center' }}>
        <button onClick={() => onVer(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginRight: '8px' }} title="Ver">👁️</button>
        <button onClick={() => onEditar(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginRight: '8px' }} title="Editar">✏️</button>
        <button onClick={() => onBorrar(reg.id_registro)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Eliminar">🗑️</button>
      </td>
    </tr>
  );
}