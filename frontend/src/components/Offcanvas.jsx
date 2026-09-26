import React from 'react';
import RemuneracionesForm from './modulos/RemuneracionesForm';
import UniformesForm from './modulos/UniformesForm';
import PlanViajeForm from './modulos/PlanViajeForm';
import PlanDepreciacionForm from './modulos/PlanDepreciacionForm';
import PlanMantenimientoForm from './modulos/PlanMantenimientoForm';
import UtilesOficinaForm from './modulos/UtilesOficinaForm';
import ForecastComercialForm from './modulos/ForecastComercialForm';
import CosteoCrisolesForm from './modulos/CosteoCrisolesForm';
import CosteoFundenteForm from './modulos/CosteoFundenteForm';
import CosteoCopelasForm from './modulos/CosteoCopelasForm';
import CosteoEmbalajesForm from './modulos/CosteoEmbalajesForm';
import BaseRegistroForm from './common/BaseRegistroForm';
import { MODULOS_CONFIG } from '../config/modulosConfig';
import { guardarRegistro } from '../data/store';

// Antes: recibía `registrosActuales` + `setRegistros` y hacía el merge de
// listas a mano (filtrar el registro editado y volver a insertar). Ahora
// que cada registro tiene un id_registro estable, el "editar" es solo un
// upsert. Este componente además estampa la jerarquía (versión / área /
// módulo) sobre lo que devuelve cada formulario específico, así los
// formularios (RemuneracionesForm, UniformesForm, BaseRegistroForm) no
// necesitan saber nada de versiones ni de áreas.
const MODULOS_QUE_GUARDAN_SOLOS = ['Costeo de Crisoles', 'Costeo de Fundente', 'Costeo de Copelas', 'Costeo de Embalajes'];

export default function Offcanvas(props) {
  const { isOpen, onClose, categoria, idVersion, area, registroParaVer, modo, onGuardado } = props;

  const modulosComoVentana = ['Remuneraciones', 'Forecast de Ventas', 'Costeo de Crisoles', 'Costeo de Fundente', 'Costeo de Copelas', 'Costeo de Embalajes', 'Plan de Mantenimiento', 'Plan de Viaje', 'Utiles de Oficina', 'Plan de Depreciación'  ];
  const esVentana = modulosComoVentana.includes(categoria);

  if (!isOpen) return null;

  const handleGuardar = (datosNuevos) => {
    const listaOriginal = Array.isArray(datosNuevos) ? datosNuevos : [datosNuevos];

    // 1. Preparamos la lista respetando los módulos de los registros derivados
    const listaPreparada = listaOriginal.map(reg => ({
      ...reg,
      // Si el registro ya trae un módulo (ej. "Materias Primas"), lo conservamos.
      // Si no trae nada (ej. el maestro), le asignamos la categoría actual del Offcanvas.
      modulo: reg.modulo || categoria,
      categoria: reg.categoria || categoria,
      area: reg.area || area,
      idVersion: reg.idVersion || idVersion,
      id_version: reg.id_version || idVersion
    }));

    // 2. Guardamos. 
    // IMPORTANTE: Quitamos "modulo: categoria" del segundo parámetro para que 
    // tu store.js no lo vuelva a sobreescribir a la fuerza.
    // Los costeos ya guardan su lote completo (registro + derivados) por su cuenta;
    // volver a guardarlos aquí duplicaría la escritura en el servidor y en el historial.
    if (!MODULOS_QUE_GUARDAN_SOLOS.includes(categoria)) {
      guardarRegistro(listaPreparada, { idVersion, area });
    }

    if (typeof onGuardado === 'function') onGuardado();
    onClose();
  };

  const renderFormulario = () => {
    switch (categoria) {
      case 'Remuneraciones':
        return (
          <RemuneracionesForm
            registro={registroParaVer}
            onGuardar={handleGuardar}
            onCancelar={onClose}
            modo={modo}
            area={area}
          />
        );

      case 'Uniforme - EPPs':
        return (
          <UniformesForm
            registro={registroParaVer}
            onGuardar={handleGuardar}
            onCancelar={onClose}
            modo={modo}
            area={area}
          />
        );

      case 'Plan de Viaje':
        return (
          <PlanViajeForm
            registro={registroParaVer}
            onGuardar={handleGuardar}
            onCancelar={onClose}
            modo={modo}
            area={area}
          />
        );

      case 'Plan de Depreciación':
        return (
          <PlanDepreciacionForm
            registro={registroParaVer}
            onGuardar={handleGuardar}
            onCancelar={onClose}
            modo={modo}
            area={area}
          />
        );

      case 'Plan de Mantenimiento':
        return (
          <PlanMantenimientoForm
            registro={registroParaVer}
            onGuardar={handleGuardar}
            onCancelar={onClose}
            modo={modo}
            area={area}
          />
        );

      case 'Utiles de Oficina':
        return (
          <UtilesOficinaForm
            registro={registroParaVer}
            onGuardar={handleGuardar}
            onCancelar={onClose}
            modo={modo}
            area={area}
          />
        );

      case 'Forecast de Ventas':
        return (
          <ForecastComercialForm
            registro={registroParaVer}
            onGuardar={handleGuardar}
            onCancelar={onClose}
            modo={modo}
            area={area}
          />
        );

      // Costeo de Crisoles/Fundente necesitan idVersion + area para poder
      // "jalar" (obtenerTotalesPorProceso) los registros de los módulos
      // regulares de esa misma área, y para propagar su desglose hacia
      // Materias Primas / MA y Suministros / Envases y Embalajes.
      case 'Costeo de Crisoles':
        return (
          <CosteoCrisolesForm
            registro={registroParaVer}
            onGuardar={handleGuardar}
            onCancelar={onClose}
            modo={modo}
            idVersion={idVersion}
            area={area}
          />
        );

      case 'Costeo de Fundente':
        return (
          <CosteoFundenteForm
            registro={registroParaVer}
            onGuardar={handleGuardar}
            onCancelar={onClose}
            modo={modo}
            idVersion={idVersion}
            area={area}
          />
        );

      case 'Costeo de Copelas':
        return (
          <CosteoCopelasForm
            registro={registroParaVer}
            onGuardar={handleGuardar}
            onCancelar={onClose}
            modo={modo}
            idVersion={idVersion}
            area={area}
          />
        );

      // Logística costea el embalaje; sus registros van a la 6142000 de cada centro de producción (91/92/93).
      case 'Costeo de Embalajes':
        return (
          <CosteoEmbalajesForm
            registro={registroParaVer}
            onGuardar={handleGuardar}
            onCancelar={onClose}
            modo={modo}
            idVersion={idVersion}
            area={area}
          />
        );

      default: {
        // atiende automáticamente al resto de módulos

        // Sin `modulo`/`categoria` el formulario guardaba todo como "General" y el
        // registro no aparecía en su propio módulo (Atención al Personal, Examen Ocupacional...).
        const configGenerica = {
          modulo: categoria,
          categoria,
          prefijo: categoria ? categoria.substring(0, 3).toUpperCase() : 'MOD',
          tituloSeccion2: `2. Cuentas de ${categoria}`,
          labelDetalle: 'DETALLE / CONCEPTO',
          mensajeValidacionCuenta: `Agregue al menos una cuenta para ${categoria}.`,
        };

        return (
          <BaseRegistroForm
            registro={registroParaVer}
            onGuardar={handleGuardar}
            onCancelar={onClose}
            modo={modo}
            config={MODULOS_CONFIG[categoria] || configGenerica}
            area={area}
          />
        );
      }
    }
  };

  return (
    <>
      <div
        className="offcanvas-backdrop active"
        onClick={onClose}
        style={{ zIndex: 9998, position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)' }}
      ></div>

      <div
        className="offcanvas-panel active"
        style={
          esVentana
            ? {
                // 🪟 VENTANA CENTRADA MÁS ALTA
                zIndex: 9999, background: 'white', position: 'fixed',
                top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: '100%', maxWidth: '920px', 
                height: '92vh',       // 👈 Forzamos a ocupar el 92% de la altura de la pantalla
                minHeight: '90vh',    // 👈 Aseguramos que nunca sea menor a esto
                maxHeight: '96vh',
                borderRadius: '12px', overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                display: 'flex', flexDirection: 'column',
                boxSizing: 'border-box',
                paddingLeft: '10px', paddingRight: '10px',
                animation: 'fadeInScale 0.25s ease-out forwards'        
              }
            : {
                // 🚪 ESTILO 2: PANEL LATERAL (El original)
                zIndex: 9999, background: 'white', position: 'fixed',
                top: 0, right: 0, width: '500px', height: '100vh',
                boxShadow: '-10px 0 25px rgba(0,0,0,0.15)',
                display: 'flex', flexDirection: 'column',
                boxSizing: 'border-box',
                animation: 'slideInRight 0.3s forwards'
              }
        }
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {modo === 'editar' ? 'Editar registro' : modo === 'ver' ? 'Ver registro' : 'Nuevo registro'}
            </div>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>{categoria}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: '28px', color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}
          >
            &times;
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {renderFormulario()}
        </div>
      </div>
    </>
  );
}
