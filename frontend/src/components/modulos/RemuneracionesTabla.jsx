import React from 'react';

export default function RemuneracionesFila({ reg, onVer, onEditar, onBorrar }) {
  return (
    <tr key={reg.id_registro}>
      
      {/* Información principal */}
      <td>{reg.fecha_proyeccion.split('-').reverse().join('/')}</td>
      <td className="mono-id">{reg.empleado_dni}</td>
      <td style={{ fontWeight: 500 }}>{reg.empleado_nombre}</td>

      {/* Columnas exclusivas de Remuneraciones */}
      <td style={{ textAlign: 'right' }} className="font-mono">
        S/ {reg.detalle_columnas?.sueldo_base?.toLocaleString('en-US', {minimumFractionDigits: 2}) || '0.00'}
      </td>
      <td style={{ textAlign: 'right', color: '#db2777' }} className="font-mono">
        S/ {reg.detalle_columnas?.asig_familiar?.toLocaleString('en-US', {minimumFractionDigits: 2}) || '0.00'}
      </td>
      <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#0284c7' }}>
        {reg.detalle_columnas?.distribucion || 100}%
      </td>
      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#1d4ed8' }} className="font-mono">
        S/ {reg.detalle_columnas?.sueldo_calculo?.toLocaleString('en-US', {minimumFractionDigits: 2}) || '0.00'}
      </td>
      <td style={{ textAlign: 'right', fontWeight: 600, color: '#166534' }} className="font-mono">
        S/ {reg.detalle_columnas?.costo_total?.toLocaleString('en-US', {minimumFractionDigits: 2}) || '0.00'}
      </td>

      {/* Botones de Acción (Unificados) */}
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