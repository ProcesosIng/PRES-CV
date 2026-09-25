import React from 'react';

export default function UniformesFila({ reg, onVer, onEditar, onBorrar }) {
  return (
    <tr key={reg.id_registro}>
      <td>{reg.fecha_proyeccion.split('-').reverse().join('/')}</td>
      <td style={{ fontWeight: 500 }}>{reg.empleado_nombre}</td>
      
      {/* NUEVA COLUMNA DE CUENTA */}
      <td className="font-mono" style={{ color: '#475569', fontWeight: 600 }}>
        {reg.detalle_columnas?.cuenta_afectada || 'N/A'}
      </td>
      
      <td>{reg.detalle_columnas?.epp_nombre || 'N/A'}</td>
      <td style={{ textAlign: 'center' }}>{reg.detalle_columnas?.cantidad || 1}</td>
      <td style={{ textAlign: 'right', fontWeight: 600, color: '#166534' }} className="font-mono">
        S/ {reg.detalle_columnas?.costo_total?.toLocaleString('en-US', {minimumFractionDigits: 2}) || '0.00'}
      </td>

      {/* Botones de Acción */}
      <td style={{ textAlign: 'center' }}>
        <button 
          onClick={() => onVer(reg)} 
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginRight: '8px' }} 
          title="Ver Detalle"
        >
          👁️
        </button>
        <button 
          onClick={() => onEditar(reg)} 
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginRight: '8px' }} 
          title="Editar"
        >
          ✏️
        </button>
        <button 
          onClick={() => onBorrar(reg.id_registro)} 
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} 
          title="Eliminar"
        >
          🗑️
        </button>
      </td>
    </tr>
  );
}