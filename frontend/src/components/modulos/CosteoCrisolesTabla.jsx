import React from 'react';

export default function CosteoCrisolesFila({ reg, onVer, onEditar, onBorrar }) {
  const dc = reg.detalle_columnas || {};
  
  // 1. Extracción de variables exactas guardadas en el Form
  const cantComercial = dc.cantidad_total_comercial || 0;
  const cantProduccion = dc.cantidad_total_produccion || 0;
  const precioUnit = dc.precio_venta_unit || 0;
  const costoUnit = dc.costo_unitario_promedio || 0;
  
  // 2. Cálculo rápido del Margen Bruto para análisis
  const margenBruto = precioUnit > 0 
    ? (((precioUnit - costoUnit) / precioUnit) * 100).toFixed(1) 
    : 0;

  return (
    <tr key={reg.id_registro} style={{ borderBottom: '1px solid #f1f5f9', background: 'white' }}>
      
      {/* AÑO */}
      <td style={{ padding: '12px', color: '#64748b', fontWeight: 700, fontSize: '13px' }}>
        {dc.anio_proyeccion || 'Anual'}
      </td>
      
      {/* PRODUCTO */}
      <td style={{ padding: '12px', fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>
        {dc.producto || '-'}
      </td>
      
      {/* VOLUMEN: Producción vs Comercial */}
      <td style={{ padding: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
          {cantProduccion.toLocaleString('en-US')} und
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
          Comercial: {cantComercial.toLocaleString('en-US')}
        </div>
        {dc.margen_produccion > 0 && (
          <div style={{ fontSize: '10px', color: '#059669', fontWeight: 600 }}>
            +{dc.margen_produccion}% holgura
          </div>
        )}
      </td>
      
      {/* PRECIO DE VENTA */}
      <td style={{ padding: '12px', textAlign: 'right' }} className="font-mono">
        <span style={{ fontSize: '13px', color: '#334155' }}>
          S/ {precioUnit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </span>
      </td>
      
      {/* COSTO UNITARIO Y MARGEN */}
      <td style={{ padding: '12px', textAlign: 'right' }}>
        <div className="font-mono" style={{ fontSize: '13px', fontWeight: 700, color: '#b45309' }}>
          S/ {costoUnit.toLocaleString('en-US', { minimumFractionDigits: 4 })}
        </div>
        <div style={{ fontSize: '11px', color: margenBruto >= 20 ? '#15803d' : '#ef4444', fontWeight: 600, marginTop: '2px' }}>
          Margen: {margenBruto}%
        </div>
      </td>
      
      {/* COSTO TOTAL DE PRODUCCIÓN */}
      <td style={{ padding: '12px', textAlign: 'right' }}>
        <div className="font-mono" style={{ fontWeight: 700, color: '#166534', fontSize: '14px', background: '#f0fdf4', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>
          S/ {(dc.costo_total_anual || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
      </td>
      
      {/* ACCIONES */}
      <td style={{ padding: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
        <button type="button" onClick={() => onVer(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', marginRight: '6px' }} title="Ver">👁️</button>
        <button type="button" onClick={() => onEditar(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', marginRight: '6px' }} title="Editar">✏️</button>
        <button type="button" onClick={() => onBorrar(reg.id_registro)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px' }} title="Eliminar">🗑️</button>
      </td>
    </tr>
  );
}