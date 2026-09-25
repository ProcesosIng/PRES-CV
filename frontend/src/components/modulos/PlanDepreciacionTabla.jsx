import React from 'react';
import { MESES } from '../../config/data';

export default function PlanDepreciacionFila({ reg, onVer, onEditar, onBorrar }) {
  const dc = reg.detalle_columnas || {};

  // Extraer el mes y el año de la fecha de proyección (ej: "2026-10-01" -> "Oct 2026")
  const obtenerMesYAnioAplicacion = (fechaStr) => {
    if (!fechaStr) return 'N/A';
    const partes = fechaStr.split('-');
    if (partes.length >= 2) {
      const anio = partes[0];
      const mesIndex = parseInt(partes[1], 10) - 1;
      const nombreMes = MESES[mesIndex] || partes[1];
      return `${nombreMes} ${anio}`;
    }
    return fechaStr;
  };

  const periodoAplicacion = obtenerMesYAnioAplicacion(reg.fecha_proyeccion);

  return (
    <tr key={reg.id_registro}>
      <td className="font-mono" style={{ color: '#475569', fontWeight: 600 }}>
        {dc.numero_cuenta || dc.cuenta_afectada || 'N/A'}
      </td>
      <td style={{ fontWeight: 500 }}>{dc.descripcion_cuenta || dc.descripcion_activo || 'N/A'}</td>
      <td>{dc.area || 'N/A'}</td>
      <td style={{ textAlign: 'right' }}>
        S/ {parseFloat(dc.gasto_adq || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
      </td>
      
      {/* Columna actualizada: Muestra Mes y Año */}
      <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#2563eb' }}>
        {periodoAplicacion}
      </td>

      <td style={{ textAlign: 'center' }}>{dc.vida_util || '0'}</td>
      <td style={{ textAlign: 'center' }}>{dc.pct_depr_anual ? `${dc.pct_depr_anual}%` : '0%'}</td>
      <td style={{ textAlign: 'right', fontWeight: 600, color: '#166534' }} className="font-mono">
        S/ {parseFloat(dc.deprec_mensual || dc.costo_total || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
      </td>

      <td style={{ textAlign: 'center' }}>
        <button onClick={() => onVer(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginRight: '8px' }} title="Ver Detalle">👁️</button>
        <button onClick={() => onEditar(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginRight: '8px' }} title="Editar">✏️</button>
        <button onClick={() => onBorrar(reg.id_registro)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Eliminar">🗑️</button>
      </td>
    </tr>
  );
}