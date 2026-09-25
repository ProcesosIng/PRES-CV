import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import SelectorVersiones from './components/SelectorVersiones';
import Dashboard from './components/DashBoard';
import Layout from './components/Layout';
import {
  inicializarDatos, estadoConexion, establecerUsuarioSesion,
  hayDatosLocalesParaImportar, importarDatosLocales, descartarImportacionLocal,
} from './data/store';

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

  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState(estadoConexion());
  const [recargas, setRecargas] = useState(0); // fuerza a releer la caché tras recargar del servidor
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    inicializarDatos().then(() => setCargando(false));
    const alCambiarEstado = (e) => setEstado(e.detail);
    const alRecargar = () => setRecargas(n => n + 1);
    window.addEventListener('presupuesto:estado', alCambiarEstado);
    window.addEventListener('presupuesto:recargado', alRecargar);
    return () => {
      window.removeEventListener('presupuesto:estado', alCambiarEstado);
      window.removeEventListener('presupuesto:recargado', alRecargar);
    };
  }, []);

  // TEMPORAL hasta el login con Microsoft: identifica quién hace cada cambio.
  useEffect(() => {
    establecerUsuarioSesion(usuarioActual ? (usuarioActual.email || usuarioActual.nombre) : '');
  }, [usuarioActual]);

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

  const aviso = <AvisoConexion estado={estado} onImportar={handleImportar} onDescartar={handleDescartar} importando={importando} puedeImportar={!!usuarioActual} />;

  if (cargando) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontFamily: 'sans-serif' }}>Cargando datos del presupuesto...</div>;
  }

  if (!usuarioActual) {
    return <>{aviso}<Login setUsuarioActual={setUsuarioActual} /></>;
  }

  // 2. Si YA HAY usuario pero NO hay versión seleccionada, muestra el Selector
  if (!versionActiva) {
    return (
      <>
        {aviso}
        <SelectorVersiones
          key={recargas}
          usuario={usuarioActual}
          onSeleccionarVersion={(idVersion) => setVersionActiva(idVersion)}
          onLogout={() => setUsuarioActual(null)}
        />
      </>
    );
  }

  return (
    <div className="shell flex min-h-screen">
      {aviso}
      <Layout
        usuario={usuarioActual}
        setUsuarioActual={setUsuarioActual}
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
