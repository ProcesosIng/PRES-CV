import React, { useState } from 'react';
import { baseDatosUsuarios } from '../config/data';

export default function Login({ setUsuarioActual }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const procesarLogin = (e) => {
    e.preventDefault();
    const userClean = usuario.trim();

    if (baseDatosUsuarios[userClean]) {
      setUsuarioActual(baseDatosUsuarios[userClean]);
      setError(false);
    } else {
      setError(true);
    }
  };

  return (
    <section id="vista-login" style={{ minHeight: '100vh', display: 'flex', width: '100%' }}>
      <div className="login-brand">
        <svg className="strata" viewBox="0 0 600 800" preserveAspectRatio="none">
          <path d="M0,120 C150,180 350,60 600,140" stroke="#3b82f6" strokeOpacity="0.4" strokeWidth="1.5" fill="none"/>
          <path d="M0,260 C180,320 380,200 600,270" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="1.5" fill="none"/>
          <path d="M0,420 C160,470 400,360 600,430" stroke="#3b82f6" strokeOpacity="0.3" strokeWidth="1.5" fill="none"/>
        </svg>
        <div className="brand-mark">
          <div className="mark"></div>
          <div className="brand-word">C&V <span>INTERNATIONAL</span></div>
        </div>
        <div className="login-copy">
          <div className="eyebrow">Plataforma de gestión presupuestal</div>
          <h1>Control total de cada área, suministro y presupuesto.</h1>
          <p>Un solo sistema para planificar, ejecutar y auditar el presupuesto de insumos y recursos operativos de C&V International.</p>
          <div className="login-stats">
            <div><b>03</b><span>Áreas activas</span></div>
            <div><b>S/ 670K</b><span>Presupuesto 2026</span></div>
            <div><b>100%</b><span>Trazabilidad</span></div>
          </div>
        </div>
        <div style={{ position: 'relative', zIndex: 2, fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#94a3b8', letterSpacing: '.08em' }}>
          © 2026 C&V INTERNATIONAL — USO INTERNO
        </div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <h2>Iniciar sesión</h2>
          <div className="sub">Ingrese sus credenciales corporativas para continuar</div>
          <form onSubmit={procesarLogin}>
            <div className="field">
              <label>Usuario</label>
              <input 
                type="text" 
                placeholder="ej. admin" 
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                required 
              />
            </div>
            <div className="field">
              <label>Contraseña</label>
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <div style={{ color: 'var(--danger)', fontSize: '12.5px', margin: '-6px 0 16px', fontWeight: 600 }}>
                Credenciales incorrectas. Verifique e intente nuevamente.
              </div>
            )}
            <button type="submit" className="btn-primary">Ingresar al sistema</button>
          </form>
          <div className="login-hint">usuario demo: admin</div>
        </div>
      </div>
    </section>
  );
}