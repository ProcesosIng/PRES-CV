import React from 'react';

const MESES_TEXTO = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Set', '10': 'Oct', '11': 'Nov', '12': 'Dic'
};

export default function UtilesOficinaFila({ reg, onVer, onEditar, onBorrar }) {
  const dc = reg.detalle_columnas || {};

  // Extraer y formatear el mes desde fecha_proyeccion (ej. "2026-05-01" -> "May")
  let mesFormateado = dc.mes_uso;
  if (!mesFormateado && reg.fecha_proyeccion) {
    const partes = reg.fecha_proyeccion.split('-');
    if (partes.length >= 2) {
      mesFormateado = MESES_TEXTO[partes[1]] || partes[1];
    }
  }

  // Obtener la cuenta correcta contemplando ambas propiedades posibles
  const cuentaMostrar = dc.cuenta_afectada || dc.cuenta || '-';

  return (
    <tr key={reg.id_registro}>
      <td>{mesFormateado || '-'}</td>
      <td style={{ fontWeight: 500 }}>{reg.empleado_nombre}</td>
      <td>{dc.descripcion_material || 'N/A'}</td>
      <td className="mono-id">{cuentaMostrar}</td>
      <td style={{ textAlign: 'center' }}>{dc.cantidad || 1}</td>
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