import React, { useEffect, useState } from 'react';
import { obtenerConfigAuth, iniciarSesionMicrosoft, iniciarSesionDesarrollo } from '../data/auth';

// Ingreso con la cuenta corporativa de Microsoft. La contraseña y el 2FA los valida Microsoft;
// el sistema solo deja pasar a los correos habilitados por el administrador.
export default function Login({ onIngresar, mensaje }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(mensaje || '');
  const [email, setEmail] = useState('');
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    obtenerConfigAuth().then(setConfig).catch(() => setError('No se pudo conectar con el servidor. Verifique que el backend esté encendido.'));
  }, []);
  useEffect(() => { if (mensaje) setError(mensaje); }, [mensaje]);

  const conMicrosoft = async () => {
    setError('');
    setProcesando(true);
    try {
      await iniciarSesionMicrosoft(); // redirige a Microsoft
    } catch (e) {
      setError(e.message);
      setProcesando(false);
    }
  };

  const conCorreo = async (e) => {
    e.preventDefault();
    setError('');
    setProcesando(true);
    try {
      onIngresar(await iniciarSesionDesarrollo(email));
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  };

  const microsoftListo = config && config.clientId && config.tenantId;

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
          <div className="sub">Use su cuenta corporativa de Microsoft (la misma de Outlook y Teams)</div>

          <button type="button" className="btn-primary" onClick={conMicrosoft} disabled={!microsoftListo || procesando}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', opacity: microsoftListo ? 1 : 0.6 }}>
            <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            {procesando ? 'Conectando...' : 'Ingresar con Microsoft'}
          </button>
          {config && !microsoftListo && config.modo !== 'desarrollo' && (
            <div className="login-hint">El login con Microsoft aún no está configurado en el servidor (AZURE_TENANT_ID / AZURE_CLIENT_ID).</div>
          )}

          {config?.modo === 'desarrollo' && (
            <form onSubmit={conCorreo} style={{ marginTop: '22px', paddingTop: '18px', borderTop: '1px dashed #cbd5e1' }}>
              <div className="field">
                <label>Modo desarrollo · correo del usuario</label>
                <input type="email" placeholder="usuario@cvinternational.com.pe" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <button type="submit" className="btn-ghost" disabled={procesando} style={{ width: '100%' }}>Entrar sin Microsoft (solo pruebas)</button>
            </form>
          )}

          {error && (
            <div role="alert" style={{ color: 'var(--danger)', fontSize: '12.5px', marginTop: '16px', fontWeight: 600 }}>{error}</div>
          )}
        </div>
      </div>
    </section>
  );
}
