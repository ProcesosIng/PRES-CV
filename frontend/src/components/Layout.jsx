import React, { useState } from 'react';

export default function Layout({ 
  usuario, 
  onCerrarSesion, 
  setVistaActual, 
  areaSeleccionada, 
  categoriaSeleccionada,
  setAreaSeleccionada, 
  setCategoriaSeleccionada,
  children 
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  const cerrarSesion = () => {
    navegar('areas');
    onCerrarSesion();
  };

  const navegar = (vista) => {
    setVistaActual(vista);
    setAreaSeleccionada('');
    setCategoriaSeleccionada('');
    setMenuAbierto(false); // Cierra el menú al hacer clic en un enlace (modo móvil)
  };

  const renderBreadcrumbs = () => {
    if (categoriaSeleccionada) {
      return <>Áreas de Presupuesto &nbsp;/&nbsp; {areaSeleccionada} &nbsp;/&nbsp; <b>{categoriaSeleccionada}</b></>;
    }
    if (areaSeleccionada) {
      return <>Áreas de Presupuesto &nbsp;/&nbsp; <b>{areaSeleccionada}</b></>;
    }
    return <b>Áreas de Presupuesto</b>;
  };

  return (
    <>
      {/* Fondo semitransparente cuando el menú móvil está abierto */}
      {menuAbierto && (
        <div 
          className="offcanvas-backdrop active" 
          style={{ zIndex: 25 }} 
          onClick={() => setMenuAbierto(false)}
        ></div>
      )}

      <aside className={`sidebar ${menuAbierto ? 'open' : ''}`}>
        <div className="sidebar-head">
          <div className="brand-mark">
            <div className="mark" style={{ width: '24px', height: '24px', borderWidth: '2px' }}></div>
            <div className="brand-word" style={{ fontSize: '16px' }}>C&V <span>INTERNATIONAL</span></div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-item" onClick={() => navegar('areas')}>
            <span className="nav-icon">🏢</span> Áreas de Presupuesto
          </div>
          {/* Maestros y administración: solo administradores (el backend también lo exige). */}
          {usuario.esAdmin && (
            <>
            <div className="nav-label">Datos maestros</div>
            <div className="nav-item" onClick={() => navegar('maestros_empleados')}>
              <span className="nav-icon">👥</span> Empleados
            </div>
          
            <div className="nav-item" onClick={() => navegar('maestros_cuentas')}>
              <span className="nav-icon">🧮</span> Cuentas Contables
            </div>
          
            <div className="nav-item" onClick={() => navegar('maestros_productos')}>
              <span className="nav-icon">📦</span> Productos
            </div>
          
            <div className="nav-item" onClick={() => navegar('maestros_clientes')}>
              <span className="nav-icon">🤝</span> Clientes
            </div>
          
            <div className="nav-item" onClick={() => navegar('maestros_usuarios')}>
              <span className="nav-icon">🔐</span> Usuarios Odoo
            </div>

            <div className="nav-item" onClick={() => navegar('maestros_formulas')}>
              <span className="nav-icon">🧪</span> Fórmulas
            </div>

            <div className="nav-label">Administración</div>
            <div className="nav-item" onClick={() => navegar('admin_usuarios')}>
              <span className="nav-icon">🛡️</span> Usuarios y permisos
            </div>
            <div className="nav-item" onClick={() => navegar('admin_actividad')}>
              <span className="nav-icon">📊</span> Análisis de uso
            </div>
            </>
          )}
        </nav>
        <div className="sidebar-foot">SISTEMA CORPORATIVO · v2026.1</div>
      </aside>

      <main className="content">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Botón Hamburguesa solo visible en pantallas pequeñas */}
            <button 
              className="btn-menu-mobile hidden-desktop" 
              onClick={() => setMenuAbierto(true)}
              style={{ background: 'transparent', border: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--text-main)', padding: 0 }}
            >
              ☰
            </button>
            <div className="breadcrumb">{renderBreadcrumbs()}</div>
          </div>
          <div className="user-chip">
            <div className="avatar" title={`${usuario.email} · ${usuario.rolTexto}`}>{usuario.iniciales}</div>
            <span className="hidden-desktop" style={{ fontSize: '13px', color: 'var(--text-main)', fontWeight: 500 }}>
              {usuario.nombre}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', whiteSpace: 'nowrap' }}>
              {usuario.esAdmin ? 'Administrador' : (usuario.areasPermitidas || []).join(', ')}
            </span>
            <button onClick={cerrarSesion} className="btn-ghost">Cerrar sesión</button>
          </div>
        </div>
        
        {children}
        
      </main>
    </>
  );
}