import React, { useState } from 'react';
import Login from './components/Login';
import SelectorVersiones from './components/SelectorVersiones';
import Dashboard from './components/DashBoard';
import Layout from './components/Layout';

export default function App() {
  const [usuarioActual, setUsuarioActual] = useState(null);
  const [versionActiva, setVersionActiva] = useState(null);

  const [vistaActual, setVistaActual] = useState('areas'); // 'areas', 'categorias', 'tabla', 'maestros'
  const [areaSeleccionada, setAreaSeleccionada] = useState('');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('');

  if (!usuarioActual) {
    return <Login setUsuarioActual={setUsuarioActual} />;
  }

  // 2. Si YA HAY usuario pero NO hay versión seleccionada, muestra el Selector
  if (!versionActiva) {
    return (
      <SelectorVersiones 
        usuario={usuarioActual} 
        onSeleccionarVersion={(idVersion) => setVersionActiva(idVersion)} 
        onLogout={() => setUsuarioActual(null)}
      />
    );
  }

  return (
    <div className="shell flex min-h-screen">
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