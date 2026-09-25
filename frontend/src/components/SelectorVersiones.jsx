import React, { useState } from 'react';
import { listarVersiones, crearVersion, actualizarVersion, eliminarVersion, listarTodosLosRegistros } from '../data/store';
import ReporteGeneral from './modulos/ReporteGeneral';

export default function SelectorVersiones({ usuario, onSeleccionarVersion, onLogout }) {
  const [listaVersiones, setListaVersiones] = useState(() => listarVersiones());

  const [isOffcanvasOpen, setIsOffcanvasOpen] = useState(false);
  const [formData, setFormData] = useState({ id: '', nombre: '', estado: 'Borrador', clonarDesde: '' });
  const [modoEdicion, setModoEdicion] = useState(false);
  
  // Nuevo estado para controlar la vista del reporte global
  const [mostrarReporte, setMostrarReporte] = useState(false);

  const abrirPanelNuevaVersion = () => {
    setFormData({ id: '', nombre: '', estado: 'Borrador', clonarDesde: '' });
    setModoEdicion(false);
    setIsOffcanvasOpen(true);
  };

  const abrirPanelEdicion = (version) => {
    setFormData({
      id: version.id_version,
      nombre: version.nombre,
      estado: version.estado,
      clonarDesde: '',
    });
    setModoEdicion(true);
    setIsOffcanvasOpen(true);
  };

  const handleEliminar = (idVersion, nombreVersion) => {
    const confirmacion = window.confirm(
      `⚠️ ATENCIÓN: ¿Estás seguro de que deseas eliminar la versión "${nombreVersion}"?\n\nSe borrarán permanentemente todos los costeos, proyecciones comerciales y registros asociados a este escenario.\n\nEsta acción NO se puede deshacer.`
    );

    if (confirmacion) {
      try {
        eliminarVersion(idVersion);
        setListaVersiones(prevVersiones => prevVersiones.filter(v => v.id_version !== idVersion));
        alert(`✅ La versión "${nombreVersion}" se eliminó correctamente.`);
      } catch (error) {
        console.error("Error al intentar eliminar la versión:", error);
        alert("❌ Hubo un error al eliminar la versión. Revisa la consola para más detalles.");
      }
    }
  };

  const guardarVersion = (e) => {
    e.preventDefault();
    if (!formData.nombre) {
      return alert('El nombre de la versión es obligatorio.');
    }

    if (modoEdicion) {
      actualizarVersion(formData.id, { nombre: formData.nombre.trim(), estado: formData.estado });
    } else {
      crearVersion({
        nombre: formData.nombre,
        estado: formData.estado,
        clonarDesde: formData.clonarDesde,
      });
    }

    setListaVersiones(listarVersiones());
    setIsOffcanvasOpen(false);
  };

  // ========================================================
  // RENDERIZADO CONDICIONAL: VISTA DE REPORTE GENERAL
  // ========================================================
  if (mostrarReporte) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f8fafc' }}>
        <div style={{ background: '#0f172a', color: 'white', padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button 
            onClick={() => setMostrarReporte(false)} 
            style={{ background: 'transparent', border: '1px solid #475569', color: '#e2e8f0', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            ← Volver a Escenarios
          </button>
          <div style={{ fontWeight: 800, fontSize: '15px', letterSpacing: '0.05em' }}>
            C&V <span style={{ color: '#3b82f6' }}>INTERNATIONAL</span>
          </div>
        </div>
        
        {/* CORREGIDO: Se usa listarTodosLosRegistros() en lugar de listarRegistros() */}
        <ReporteGeneral registrosTotales={listarTodosLosRegistros()} />
      </div>
    );
  }

  // ========================================================
  // RENDERIZADO PRINCIPAL: SELECTOR DE VERSIONES
  // ========================================================
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', position: 'relative' }}>

      <div style={{ background: '#0f172a', color: 'white', padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: '15px', letterSpacing: '0.05em' }}>
          C&V <span style={{ color: '#3b82f6' }}>INTERNATIONAL</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '13px', color: '#94a3b8' }}>
            Bienvenido, <b style={{ color: 'white' }}>{usuario.nombre || 'Usuario'}</b>
          </div>
          <button
            onClick={onLogout}
            style={{
              background: 'transparent', border: '1px solid #475569', color: '#e2e8f0',
              padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
            }}
            onMouseOver={(e) => e.target.style.background = '#334155'}
            onMouseOut={(e) => e.target.style.background = 'transparent'}
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '900px', width: '100%', margin: '40px auto', padding: '0 20px', flex: 1 }}>
        <div style={{ marginBottom: '30px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Gestión de Escenarios</span>
          <h1 style={{ fontSize: '26px', color: '#0f172a', margin: '6px 0' }}>Seleccione una Versión de Presupuesto</h1>
          <p style={{ color: '#64748b', fontSize: '14px' }}>Elija la versión con la que desea operar o cree un escenario alternativo.</p>
        </div>

        <div style={{ display: 'grid', gap: '14px', marginBottom: '30px' }}>
          {listaVersiones.map(ver => (
            <div key={ver.id_version} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '20px 24px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, color: '#334155', fontFamily: 'monospace' }}>{ver.id_version.toUpperCase()}</span>
                  <h3 style={{ margin: 0, fontSize: '17px', color: '#1e293b' }}>{ver.nombre}</h3>
                </div>
                <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                  Creado: {ver.fecha_creacion} &nbsp;·&nbsp; Estado: <b style={{ color: '#0f172a' }}>{ver.estado}</b>
                  {ver.clonada_de && <> &nbsp;·&nbsp; Clonada de: <b>{ver.clonada_de.toUpperCase()}</b></>}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>

                <button 
                  onClick={() => handleEliminar(ver.id_version, ver.nombre)}
                  style={{ background: 'white', color: '#ef4444', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}
                  title="Eliminar esta versión"
                >
                  🗑️ Eliminar
                </button>
                <button
                  onClick={() => abrirPanelEdicion(ver)}
                  style={{ background: 'white', color: '#64748b', border: '1px solid #cbd5e1', padding: '10px 14px', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                >
                  ✏️ Editar
                </button>
                <button
                  onClick={() => onSeleccionarVersion(ver.id_version)}
                  style={{ background: '#0284c7', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: 600, fontSize: '13.5px', cursor: 'pointer' }}
                >
                  Abrir versión →
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px', background: 'white', padding: '24px', borderRadius: '8px', border: '1px dashed #cbd5e1', textAlign: 'center' }}>
            <h4 style={{ margin: '0 0 6px 0', color: '#334155', fontSize: '15px' }}>¿Necesita evaluar un ajuste?</h4>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 16px 0' }}>Inicialice una nueva versión para planificar modificaciones.</p>
            <button
              onClick={abrirPanelNuevaVersion}
              style={{ background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1', padding: '9px 18px', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
            >
              📋 + Crear Nueva Versión
            </button>
          </div>

          {/* Tarjeta del Dashboard Gerencial Actualizada */}
          <div style={{ flex: '1 1 300px', background: 'white', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <h4 style={{ margin: '0 0 6px 0', color: '#0f172a', fontSize: '15px' }}>📊 Dashboard Gerencial</h4>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 16px 0' }}>Revise el consolidado general de todos los escenarios.</p>
            <button 
              onClick={() => setMostrarReporte(true)} 
              style={{ background: '#10b981', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 600, fontSize: '13.5px', cursor: 'pointer' }}
            >
              Ver Reportes Consolidados →
            </button>
          </div>
        </div>
      </div>

      {isOffcanvasOpen && (
        <>
          <div
            onClick={() => setIsOffcanvasOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 900 }}
          ></div>

          <div style={{
            position: 'fixed', right: 0, top: 0, height: '100vh', width: '400px', background: 'white',
            zIndex: 1000, boxShadow: '-4px 0 15px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column',
            animation: 'slideInRight 0.3s forwards'
          }}>
            <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>
                {modoEdicion ? 'Editar Versión' : 'Registrar Nueva Versión'}
              </h3>
              <button onClick={() => setIsOffcanvasOpen(false)} style={{ background: 'transparent', border: 'none', fontSize: '24px', color: '#64748b', cursor: 'pointer' }}>&times;</button>
            </div>

            <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
              <form id="form-version" onSubmit={guardarVersion} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {!modoEdicion && (
                  <div style={{ padding: '16px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', marginTop: '10px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                      📋 Clonar configuración y datos
                    </label>
                    <select
                      value={formData.clonarDesde}
                      onChange={(e) => setFormData({ ...formData, clonarDesde: e.target.value })}
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white' }}
                    >
                      <option value="">-- Iniciar versión en blanco --</option>
                      {listaVersiones.map(v => (
                        <option key={v.id_version} value={v.id_version}>
                          Clonar de: {v.id_version.toUpperCase()} - {v.nombre}
                        </option>
                      ))}
                    </select>
                    <small style={{ color: '#64748b', fontSize: '11.5px', display: 'block', marginTop: '8px', lineHeight: '1.4' }}>
                      Si selecciona una versión existente, se copiarán todos los registros de todas las áreas y módulos hacia este nuevo escenario.
                    </small>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Nombre de la Versión</label>
                  <input
                    type="text"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    placeholder="Ej. Presupuesto Q3 Reducido"
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    required
                  />
                  {modoEdicion && (
                    <small style={{ color: '#94a3b8', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                      Código de versión: {formData.id.toUpperCase()} (no se puede modificar)
                    </small>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Estado</label>
                  <select
                    value={formData.estado}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white' }}
                  >
                    <option value="Borrador">Borrador (Simulación)</option>
                    <option value="En Revisión">En Revisión</option>
                    <option value="Aprobado">Aprobado</option>
                  </select>
                </div>
              </form>
            </div>

            <div style={{ padding: '20px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsOffcanvasOpen(false)}
                style={{ background: 'white', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, color: '#475569' }}
              >
                Cancelar
              </button>
              <button
                form="form-version"
                type="submit"
                style={{ background: '#0284c7', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, color: 'white' }}
              >
                {modoEdicion ? 'Actualizar Versión' : 'Guardar Versión'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}