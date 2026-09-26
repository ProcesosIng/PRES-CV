import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import SelectorVersiones from './components/SelectorVersiones';
import Dashboard from './components/DashBoard';
import Layout from './components/Layout';
import {
  inicializarDatos, estadoConexion,
  hayDatosLocalesParaImportar, importarDatosLocales, descartarImportacionLocal,
} from './data/store';
import { restaurarSesion, cerrarSesion, iniciarLatido, detenerLatido, registrarVista } from './data/auth';

// Aviso fijo arriba: modo local (sin servidor), cambios pendientes de guardar
// o datos antiguos del navegador que aún no se subieron a la base de datos.
function AvisoConexion({ estado, onImportar, onDescartar, importando, puedeImportar }) {
  // Solo con sesión iniciada, para que la importación quede registrada a nombre de alguien.
  const mostrarImportar = puedeImportar && hayDatosLocalesParaImportar();
  if (estado.modo === 'servidor' && !estado.ultimoError && !mostrarImportar && estado.pendientes === 0) return null;

  const base = { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 3000, padding: '6px 16px', fontSize: '12px', display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'center' };
  if (estado.modo === 'local') {
    return <div style={{ ...base, background: '#fef3c7', color: '#92400e', borderBottom: '1px solid #fcd34d' }}>⚠ {estado.ultimoError || 'Sin conexión con el servidor: los cambios se guardan solo en este navegador.'}</div>;
  }
  if (mostrarImportar) {
    return (
      <div style={{ ...base, background: '#eff6ff', color: '#1e40af', borderBottom: '1px solid #bfdbfe' }}>
        Este navegador tiene datos guardados antes de usar la base de datos. ¿Subirlos?
        <button type="button" disabled={importando} onClick={onImportar} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer' }}>{importando ? 'Subiendo...' : 'Subir a la base de datos'}</button>
        <button type="button" disabled={importando} onClick={onDescartar} style={{ background: 'none', border: '1px solid #93c5fd', color: '#1e40af', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer' }}>No, ignorar</button>
      </div>
    );
  }
  if (estado.pendientes > 0) {
    return <div style={{ ...base, background: '#f1f5f9', color: '#475569' }}>Guardando cambios en el servidor... ({estado.pendientes})</div>;
  }
  return null;
}

export default function App() {
  const [usuarioActual, setUsuarioActual] = useState(null);
  const [versionActiva, setVersionActiva] = useState(null);

  const [vistaActual, setVistaActual] = useState('areas'); // 'areas', 'categorias', 'tabla', 'maestros'
  const [areaSeleccionada, setAreaSeleccionada] = useState('');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('');

  const [verificandoSesion, setVerificandoSesion] = useState(true);
  const [mensajeLogin, setMensajeLogin] = useState('');
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState(estadoConexion());
  const [recargas, setRecargas] = useState(0); // fuerza a releer la caché tras recargar del servidor
  const [importando, setImportando] = useState(false);

  // 1. ¿Vuelve de Microsoft o ya tenía sesión en esta pestaña?
  useEffect(() => {
    restaurarSesion()
      .then(u => { if (u) setUsuarioActual(u); })
      .catch(e => setMensajeLogin(e.message))
      .finally(() => setVerificandoSesion(false));
    // El backend cerró la sesión (vencida, inactividad o acceso revocado): volver al login.
    const alExpirar = (e) => {
      detenerLatido();
      setUsuarioActual(null);
      setVersionActiva(null);
      setMensajeLogin(e.detail?.mensaje || 'La sesión expiró.');
    };
    window.addEventListener('auth:expirada', alExpirar);
    return () => window.removeEventListener('auth:expirada', alExpirar);
  }, []);

  // 2. Con sesión: se cargan los datos que el usuario puede ver y se empieza a medir el uso.
  useEffect(() => {
    if (!usuarioActual) return;
    setCargando(true);
    inicializarDatos().then(() => setCargando(false));
    iniciarLatido();
  }, [usuarioActual]);

  // Pantalla abierta, para el análisis de uso.
  useEffect(() => {
    if (!usuarioActual) return;
    const pantalla = !versionActiva ? 'versiones' : vistaActual;
    registrarVista({ pantalla, area: areaSeleccionada || null, modulo: categoriaSeleccionada || null });
  }, [usuarioActual, versionActiva, vistaActual, areaSeleccionada, categoriaSeleccionada]);

  useEffect(() => {
    const alCambiarEstado = (e) => setEstado(e.detail);
    const alRecargar = () => setRecargas(n => n + 1);
    window.addEventListener('presupuesto:estado', alCambiarEstado);
    window.addEventListener('presupuesto:recargado', alRecargar);
    return () => {
      window.removeEventListener('presupuesto:estado', alCambiarEstado);
      window.removeEventListener('presupuesto:recargado', alRecargar);
    };
  }, []);

  const salir = async () => {
    await cerrarSesion();
    setUsuarioActual(null);
    setVersionActiva(null);
    setVistaActual('areas');
    setAreaSeleccionada('');
    setCategoriaSeleccionada('');
    setMensajeLogin('');
  };

  const handleImportar = async () => {
    setImportando(true);
    try {
      const r = await importarDatosLocales();
      alert(`Se subieron ${r.versiones} versiones y ${r.registros} registros a la base de datos${r.omitidos ? ` (${r.omitidos} ya existían o estaban incompletos y se omitieron)` : ''}.`);
    } catch (e) {
      alert(`No se pudieron subir los datos: ${e.message}`);
    } finally {
      setImportando(false);
    }
  };
  const handleDescartar = () => {
    if (window.confirm('Los datos antiguos de este navegador no se subirán. ¿Continuar?')) {
      descartarImportacionLocal();
      setRecargas(n => n + 1);
    }
  };

  const aviso = <AvisoConexion estado={estado} onImportar={handleImportar} onDescartar={handleDescartar} importando={importando} puedeImportar={!!usuarioActual?.esAdmin} />;

  const pantallaEspera = (texto) => <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontFamily: 'sans-serif' }}>{texto}</div>;

  if (verificandoSesion) return pantallaEspera('Verificando sesión...');

  if (!usuarioActual) {
    return <Login onIngresar={(u) => { setMensajeLogin(''); setUsuarioActual(u); }} mensaje={mensajeLogin} />;
  }

  if (cargando) return pantallaEspera('Cargando datos del presupuesto...');

  // 2. Si YA HAY usuario pero NO hay versión seleccionada, muestra el Selector
  if (!versionActiva) {
    return (
      <>
        {aviso}
        <SelectorVersiones
          key={recargas}
          usuario={usuarioActual}
          onSeleccionarVersion={(idVersion) => setVersionActiva(idVersion)}
          onLogout={salir}
        />
      </>
    );
  }

  return (
    <div className="shell flex min-h-screen">
      {aviso}
      <Layout
        usuario={usuarioActual}
        onCerrarSesion={salir}
        setVistaActual={setVistaActual}
        areaSeleccionada={areaSeleccionada}
        categoriaSeleccionada={categoriaSeleccionada}
        setAreaSeleccionada={setAreaSeleccionada}
        setCategoriaSeleccionada={setCategoriaSeleccionada}
      >
        <Dashboard
          key={recargas}
          usuario={usuarioActual}
          versionActiva={versionActiva}
          onCambiarVersion={() => setVersionActiva(null)}
          vistaActual={vistaActual}
          setVistaActual={setVistaActual}
          areaSeleccionada={areaSeleccionada}
          setAreaSeleccionada={setAreaSeleccionada}
          categoriaSeleccionada={categoriaSeleccionada}
          setCategoriaSeleccionada={setCategoriaSeleccionada}
        />
      </Layout>
    </div>
  );
}
