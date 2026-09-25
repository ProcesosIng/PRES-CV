import React from 'react';
import { MESES } from '../../config/data'; // <--- Asegúrate de importar MESES aquí

export default function ForecastComercialFila({ reg, onVer, onEditar, onBorrar, filtroMesInicio, filtroMesFin }) {
  const dc = reg.detalle_columnas || {};
  const precioVenta = parseFloat(dc.precio_venta || 0);
  const monedaSeleccionada = dc.moneda || 'S/';

  // Lógica para sumar las cantidades dentro del rango de meses seleccionado
  const calcularCantidadEnRango = () => {
    const cants = dc.cantidades || {};
    if (!filtroMesInicio && !filtroMesFin) {
      return parseFloat(dc.cantidad_total_anio) || 0;
    }
    const idxInicio = filtroMesInicio ? MESES.indexOf(filtroMesInicio) : 0;
    const idxFin = filtroMesFin ? MESES.indexOf(filtroMesFin) : MESES.length - 1;
    
    let sumaCant = 0;
    for (let i = idxInicio; i <= idxFin; i++) {
      sumaCant += parseFloat(cants[MESES[i]]) || 0;
    }
    return sumaCant;
  };

  const cantidadAMostrar = calcularCantidadEnRango();
  const ingresosProyectados = cantidadAMostrar * precioVenta;

  return (
    <tr key={reg.id_registro}>
      <td style={{ fontWeight: 500 }}>{dc.cliente || '-'}</td>
      <td>{dc.vendedor || '-'}</td>
      <td>
        <span style={{ fontSize: '12px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#334155' }}>
          {dc.unidad_negocio || '-'}
        </span>
      </td>
      <td>{dc.producto || '-'}</td>
      <td style={{ textAlign: 'center' }}>{dc.um || '-'}</td>
      
      {/* Columna de Moneda */}
      <td style={{ textAlign: 'center' }}>
        <span style={{ 
          background: monedaSeleccionada === 'US$' ? '#fef3c7' : '#e0f2fe', 
          color: monedaSeleccionada === 'US$' ? '#92400e' : '#0369a1', 
          padding: '2px 6px', 
          borderRadius: '4px', 
          fontSize: '11px', 
          fontWeight: 'bold' 
        }}>
          {monedaSeleccionada}
        </span>
      </td>

      <td style={{ textAlign: 'right' }} className="font-mono">
        {precioVenta.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>
      <td style={{ textAlign: 'right' }} className="font-mono">
        {(parseFloat(dc.costo_unitario) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>
      <td style={{ textAlign: 'right', fontWeight: 600, color: '#166534' }}>
        {cantidadAMostrar.toLocaleString('en-US')}
        {(filtroMesInicio || filtroMesFin) && (
          <span style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>
            ({filtroMesInicio || 'Ene'} - {filtroMesFin || 'Dic'})
          </span>
        )}
      </td>
      
      <td style={{ textAlign: 'right', fontWeight: 700, color: '#047857', fontFamily: 'monospace' }}>
        {ingresosProyectados.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td style={{ textAlign: 'center' }}>
        <button onClick={() => onVer(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginRight: '6px' }} title="Ver">👁️</button>
        <button onClick={() => onEditar(reg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', marginRight: '6px' }} title="Editar">✏️</button>
        <button onClick={() => onBorrar(reg.id_registro)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Eliminar">🗑️</button>
      </td>
    </tr>
  );
}