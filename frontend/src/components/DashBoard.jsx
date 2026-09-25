import React, { useState, useEffect, useCallback } from 'react';
import { datosAreas, configModulos, baseDatosUsuarios, MESES, UNIDADES_NEGOCIO, PROCESOS_PRODUCTIVOS} from '../config/data';
import { modulosVisiblesParaArea } from '../config/modulosPorArea';
import { listarRegistros, eliminarRegistro as eliminarRegistroDB, calcularTotalPresupuestado, sincronizarConOdooDB, eliminarDeMaestro, obtenerFormulasOdoo, obtenerProductosOdoo, obtenerCuentasOdoo, obtenerClientesOdoo, obtenerEmpleadosOdoo, obtenerUsuariosOdoo, actualizarMaestroDB, } from '../data/store';
import RemuneracionesFila from './modulos/RemuneracionesTabla';
import UniformesFila from './modulos/UniformesTabla';
import PlanViajeFila from './modulos/PlanViajeTabla';
import PlanDepreciacionFila from './modulos/PlanDepreciacionTabla';
import PlanMantenimientoFila from './modulos/PlanMantenimientoTabla';
import UtilesOficinaFila from './modulos/UtilesOficinaTabla';
import ForecastComercialFila from './modulos/ForecastComercialTabla';
import CosteoCrisolesFila from './modulos/CosteoCrisolesTabla';
import CosteoFundenteFila from './modulos/CosteoFundenteTabla';
import CosteoCopelasFila from './modulos/CosteoCopelasTabla';
import TablaGenerica from './common/TablaGenerica';
import Offcanvas from './Offcanvas';
import CosteoEmbalajesFila from './modulos/CosteoEmbalajesTabla';

const FILAS_ESPECIFICAS = {
  'Remuneraciones': RemuneracionesFila,
  'Uniforme - EPPs': UniformesFila,
  'Plan de Viaje': PlanViajeFila,
  'Plan de Depreciación': PlanDepreciacionFila,
  'Plan de Mantenimiento': PlanMantenimientoFila,
  'Utiles de Oficina': UtilesOficinaFila,
  'Forecast de Ventas': ForecastComercialFila,
  'Costeo de Crisoles': CosteoCrisolesFila,
  'Costeo de Fundente': CosteoFundenteFila,
  'Costeo de Copelas': CosteoCopelasFila,
  'Costeo de Embalajes': CosteoEmbalajesFila,
};

export default function Dashboard({
  usuario,
  vistaActual,
  setVistaActual,
  areaSeleccionada,
  setAreaSeleccionada,
  categoriaSeleccionada,
  setCategoriaSeleccionada,
  versionActiva,
  onCambiarVersion,
}) {
  const [isOffcanvasOpen, setIsOffcanvasOpen] = useState(false);
  const [registroSeleccionado, setRegistroSeleccionado] = useState(null);
  const [modoAccion, setModoAccion] = useState('nuevo');
  const [registros, setRegistros] = useState([]);

  const [filtroEmpleado, setFiltroEmpleado] = useState('');
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');

  const [filtroMesInicio, setFiltroMesInicio] = useState('');
  const [filtroMesFin, setFiltroMesFin] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroProducto, setFiltroProducto] = useState('');
  const [filtroUnidadNegocio, setFiltroUnidadNegocio] = useState('');
  const [filtroMoneda, setFiltroMoneda] = useState('');

  const [listaEmpleados, setListaEmpleados] = useState([]);
  const [listaCuentas, setListaCuentas] = useState([]);
  const [listaClientes, setListaClientes] = useState([]);
  const [listaUsuarios, setListaUsuarios] = useState({});
  const [listaProductos, setListaProductos] = useState([]);

  const [tamanoPagina, setTamanoPagina] = useState(15);
  const [paginaActual, setPaginaActual] = useState(1);  

  const [busquedaCuenta, setBusquedaCuenta] = useState('');
  const [categoriaCuentaSel, setCategoriaCuentaSel] = useState('TODAS');    // 👈 NUEVO ESTADO CATEGORÍA
  const [subcategoriaCuentaSel, setSubcategoriaCuentaSel] = useState('TODAS'); // 👈 NUEVO ESTADO SUBCATEGORÍA
  const tamanoPaginaCuentas = 15;
  const [paginaCuentas, setPaginaCuentas] = useState(1);

  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [categoriaProdSeleccionada, setCategoriaProdSeleccionada] = useState('TODAS');
  const [paginaProductos, setPaginaProductos] = useState(1);
  const tamanoPaginaProductos = 15;

  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [zonaClienteSel, setZonaClienteSel] = useState('TODAS');
  const [paginaClientes, setPaginaClientes] = useState(1);
  const tamanoPaginaClientes = 15;

  const [itemMaestroSeleccionado, setItemMaestroSeleccionado] = useState(null);
  const [modoAccionMaestro, setModoAccionMaestro] = useState('nuevo');
  const [isModalMaestroAbierto, setIsModalMaestroAbierto] = useState(false);

  const [listaFormulas, setListaFormulas] = useState({});
  const [cargandoOdoo, setCargandoOdoo] = useState(false);

  // Paginación para Usuarios
  const [paginaUsuarios, setPaginaUsuarios] = useState(1);
  const tamanoPaginaUsuarios = 15;

  // Paginación para Fórmulas
  const [paginaFormulas, setPaginaFormulas] = useState(1);
  const tamanoPaginaFormulas = 15;

    
  const recargarRegistros = useCallback(() => {
    if (!versionActiva || !areaSeleccionada || !categoriaSeleccionada) {
      setRegistros([]);
      return;
    }
    setRegistros(
      listarRegistros({
        idVersion: versionActiva,
        area: areaSeleccionada,
        modulo: categoriaSeleccionada,
      })
    );
  }, [versionActiva, areaSeleccionada, categoriaSeleccionada]);

  useEffect(() => {
    setPaginaActual(1);
  }, [categoriaSeleccionada, filtroEmpleado, filtroFechaInicio, filtroFechaFin, filtroMesInicio, filtroMesFin, filtroCliente, filtroProducto, filtroUnidadNegocio, filtroMoneda]);  

  useEffect(() => {
    recargarRegistros();
  }, [recargarRegistros]);

  useEffect(() => {
    if (vistaActual === 'maestros_empleados') {
      const cargarEmpleadosOdoo = async () => {
        setCargandoOdoo(true);
        const empleadosOdoo = await obtenerEmpleadosOdoo();
        setListaEmpleados(empleadosOdoo);
        setCargandoOdoo(false);
      };
      cargarEmpleadosOdoo();
    };

    // 📊 Maestro de Cuentas desde Odoo (Asíncrono)
    if (vistaActual === 'maestros_cuentas') {
      const cargarCuentasOdoo = async () => {
        setCargandoOdoo(true);
        const cuentasOdoo = await obtenerCuentasOdoo();
        setListaCuentas(cuentasOdoo);
        setCargandoOdoo(false);
      };
      cargarCuentasOdoo();
    }

    // 🏢 Maestro de Clientes desde Odoo (Asíncrono)
    if (vistaActual === 'maestros_clientes') {
      const cargarClientesOdoo = async () => {
        setCargandoOdoo(true);
        const clientesOdoo = await obtenerClientesOdoo();
        setListaClientes(clientesOdoo);
        setCargandoOdoo(false);
      };
      cargarClientesOdoo();
    }

    // 👤 Maestro de Usuarios desde Odoo (Asíncrono)
    if (vistaActual === 'maestros_usuarios') {
      const cargarUsuariosOdoo = async () => {
        setCargandoOdoo(true);
        const usuariosOdoo = await obtenerUsuariosOdoo();
        // Guardamos como un objeto mapeado o arreglo según lo maneje tu tabla
        setListaUsuarios(usuariosOdoo);
        setCargandoOdoo(false);
      };
      cargarUsuariosOdoo();
    }

    // Maestro de Productos desde Odoo (Asíncrono)
    if (vistaActual === 'maestros_productos') {
      const cargarProductosOdoo = async () => {
        setCargandoOdoo(true); // Puedes reutilizar este estado de carga
        const productosOdoo = await obtenerProductosOdoo();
        setListaProductos(productosOdoo);
        setCargandoOdoo(false);
      };
      cargarProductosOdoo();
    }

    // Maestro de Formulas desde Odoo (Asíncrono)
    if (vistaActual === 'maestros_formulas') {
      const cargarDatosOdoo = async () => {
        setCargandoOdoo(true);
        const datosAgrupados = await obtenerFormulasOdoo();
        setListaFormulas(datosAgrupados);
        setCargandoOdoo(false);
      };
      cargarDatosOdoo();
    }
  }, [vistaActual]);

  const abrirCategoria = (cat) => {
    setCategoriaSeleccionada(cat);
    setVistaActual('tabla');
  };

  const abrirArea = (area) => {
    setAreaSeleccionada(area);
    setCategoriaSeleccionada('');
    setVistaActual('categorias');
  };

  const eliminarRegistro = (id) => {
    if (window.confirm('¿Estás seguro de eliminar este registro?')) {
      eliminarRegistroDB(id);
      recargarRegistros();
    }
  };

  const registrosFiltrados = registros.filter(reg => {
    if (categoriaSeleccionada !== 'Forecast de Ventas') {
      let cumpleEmpleado = true;
      let cumpleInicio = true;
      let cumpleFin = true;

      if (filtroEmpleado) {
        const busqueda = filtroEmpleado.toLowerCase();
        cumpleEmpleado =
          reg.empleado_nombre?.toLowerCase().includes(busqueda) ||
          reg.empleado_dni?.includes(busqueda);
      }
      if (filtroFechaInicio) cumpleInicio = reg.fecha_proyeccion >= filtroFechaInicio;
      if (filtroFechaFin) cumpleFin = reg.fecha_proyeccion <= filtroFechaFin;

      return cumpleEmpleado && cumpleInicio && cumpleFin;
    }
    if (categoriaSeleccionada === 'Forecast de Ventas') {
      const dc = reg.detalle_columnas || {};
      let cumpleMesRango = true;
      let cumpleCliente = true;
      let cumpleProducto = true;
      let cumpleUnidad = true;
      let cumpleEmpleado = true;
      let cumpleMoneda = true;

      if (filtroMesInicio || filtroMesFin) {
        const cants = dc.cantidades || {};
        const idxInicio = filtroMesInicio ? MESES.indexOf(filtroMesInicio) : 0;
        const idxFin = filtroMesFin ? MESES.indexOf(filtroMesFin) : MESES.length - 1;

        let tieneCantidadEnRango = false;
        for (let i = idxInicio; i <= idxFin; i++) {
          const mesNombre = MESES[i];
          if ((parseFloat(cants[mesNombre]) || 0) > 0) {
            tieneCantidadEnRango = true;
            break;
          }
        }
        cumpleMesRango = tieneCantidadEnRango;
      }

      if (filtroCliente) cumpleCliente = dc.cliente?.toLowerCase().includes(filtroCliente.toLowerCase());
      if (filtroProducto) cumpleProducto = dc.producto?.toLowerCase().includes(filtroProducto.toLowerCase());
      if (filtroUnidadNegocio) cumpleUnidad = dc.unidad_negocio === filtroUnidadNegocio;

      if (filtroEmpleado) {
        const busqueda = filtroEmpleado.toLowerCase();
        cumpleEmpleado =
          reg.empleado_nombre?.toLowerCase().includes(busqueda) ||
          reg.empleado_dni?.includes(busqueda);
      }
      if (filtroMoneda) {
        const monedaReg = dc.moneda || 'S/';
        cumpleMoneda = monedaReg === filtroMoneda;
      }

      return cumpleMesRango && cumpleCliente && cumpleProducto && cumpleUnidad && cumpleEmpleado && cumpleMoneda;
    }
  });

  const totalPresupuestado = calcularTotalPresupuestado(registrosFiltrados, categoriaSeleccionada, filtroMesInicio);

  const calcularSumaForecastPorMoneda = (monedaTarget, mesInicio, mesFin) => {
    let suma = 0;
    registrosFiltrados.forEach(reg => {
      const dc = reg.detalle_columnas || {};
      if ((dc.moneda || 'S/') === monedaTarget) {
        const cants = dc.cantidades || {};
        if (mesInicio || mesFin) {
          const idxInicio = mesInicio ? MESES.indexOf(mesInicio) : 0;
          const idxFin = mesFin ? MESES.indexOf(mesFin) : MESES.length - 1;
          for (let i = idxInicio; i <= idxFin; i++) {
            suma += (parseFloat(cants[MESES[i]]) || 0) * (parseFloat(dc.precio_venta) || 0);
          }
        } else {
          suma += (parseFloat(dc.cantidad_total_anio) || 0) * (parseFloat(dc.precio_venta) || 0);
        }
      }
    });
    return suma;
  };

  const totalPaginas = Math.max(1, Math.ceil(registrosFiltrados.length / tamanoPagina));
  const registrosPagina = registrosFiltrados.slice(
    (paginaActual - 1) * tamanoPagina,
    paginaActual * tamanoPagina
  );

  // PRODUCTOS: Filtrar el maestro de productos por texto (código/nombre) y categoría
  const productosFiltrados = listaProductos.filter(prod => {
    const textoMatch = 
      (prod.codigo && prod.codigo.toLowerCase().includes(busquedaProducto.toLowerCase())) ||
      (prod.nombre && prod.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()));
    
    const categoriaMatch = categoriaProdSeleccionada === 'TODAS' || prod.categoria === categoriaProdSeleccionada;

    return textoMatch && categoriaMatch;
  });

  // 2. Calcular paginación de productos
  const totalPaginasProductos = Math.ceil(productosFiltrados.length / tamanoPaginaProductos) || 1;
  const indiceInicioProd = (paginaProductos - 1) * tamanoPaginaProductos;
  const productosPaginados = productosFiltrados.slice(indiceInicioProd, indiceInicioProd + tamanoPaginaProductos);

  // Extraer lista única de categorías de los productos para el menú desplegable
  const categoriasProductosDisponibles = ['TODAS', ...new Set(listaProductos.map(p => p.categoria).filter(Boolean))];

  // CUENTAS CONTABLES: Filtrar cuentas contables por texto, categoría y subcategoría
  const cuentasFiltradas = listaCuentas.filter(cta => {
    const textoMatch = 
      (cta.codigo && cta.codigo.toLowerCase().includes(busquedaCuenta.toLowerCase())) ||
      (cta.nombre && cta.nombre.toLowerCase().includes(busquedaCuenta.toLowerCase()));
    
    const categoriaMatch = categoriaCuentaSel === 'TODAS' || cta.categoria === categoriaCuentaSel;
    const subcategoriaMatch = subcategoriaCuentaSel === 'TODAS' || cta.subcategoria === subcategoriaCuentaSel;

    return textoMatch && categoriaMatch && subcategoriaMatch;
  });

  const totalPaginasCuentas = Math.ceil(cuentasFiltradas.length / tamanoPaginaCuentas) || 1;
  const indiceInicioCuentas = (paginaCuentas - 1) * tamanoPaginaCuentas;
  const cuentasPaginadas = cuentasFiltradas.slice(indiceInicioCuentas, indiceInicioCuentas + tamanoPaginaCuentas);

  // 2. Extraer listas únicas para los selectores de categoría y subcategoría
  const categoriasCuentasDisponibles = ['TODAS', ...new Set(listaCuentas.map(c => c.categoria).filter(Boolean))];
  const subcategoriasCuentasDisponibles = ['TODAS', ...new Set(listaCuentas.map(c => c.subcategoria).filter(Boolean))];

 // CLIENTES: Filtrar clientes por texto (RUC o nombre) y zona
  const clientesFiltrados = listaClientes.filter(cli => {
    const textoMatch = 
      (cli.ruc && cli.ruc.toLowerCase().includes(busquedaCliente.toLowerCase())) ||
      (cli.nombre && cli.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()));
    
    const zonaMatch = zonaClienteSel === 'TODAS' || cli.zona === zonaClienteSel;

    return textoMatch && zonaMatch;
  });
  

  const totalPaginasClientes = Math.ceil(clientesFiltrados.length / tamanoPaginaClientes) || 1;
  const indiceInicioClientes = (paginaClientes - 1) * tamanoPaginaClientes;
  const clientesPaginados = clientesFiltrados.slice(indiceInicioClientes, indiceInicioClientes + tamanoPaginaClientes);
  
  // USUARIOS: Paginación
  const arrayUsuarios = Object.values(listaUsuarios || []);
  const totalPaginasUsuarios = Math.ceil(arrayUsuarios.length / tamanoPaginaUsuarios) || 1;
  const indiceInicioUsuarios = (paginaUsuarios - 1) * tamanoPaginaUsuarios;
  const usuariosPaginados = arrayUsuarios.slice(indiceInicioUsuarios, indiceInicioUsuarios + tamanoPaginaUsuarios);

  // FÓRMULAS: Paginación
  const arrayFormulas = Object.values(listaFormulas || {});
  const totalPaginasFormulas = Math.ceil(arrayFormulas.length / tamanoPaginaFormulas) || 1;
  const indiceInicioFormulas = (paginaFormulas - 1) * tamanoPaginaFormulas;
  const formulasPaginadas = arrayFormulas.slice(indiceInicioFormulas, indiceInicioFormulas + tamanoPaginaFormulas);

  // 👇 ASEGÚRATE DE QUE ESTA LÍNEA EXISTA EXACTAMENTE ASÍ:
  const zonasClientesDisponibles = ['TODAS', ...new Set(listaClientes.map(c => c.zona).filter(Boolean))];

  return (
    <div className="page" style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>

      {/* VISTA 1: ÁREAS */}
      {vistaActual === 'areas' && (
        <section style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '10px 20px' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: '20px', marginBottom: '30px',
            borderBottom: '1px solid #e2e8f0', paddingBottom: '20px'
          }}>
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                Panel general
              </div>
              <h2 style={{ margin: 0, fontSize: '24px', color: '#0f172a' }}>
                Seleccione un área para revisión
              </h2>
            </div>

            <button
              onClick={() => { if (typeof onCambiarVersion === 'function') onCambiarVersion(); }}
              style={{
                background: '#334155', color: 'white', border: 'none', padding: '10px 18px',
                borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              <span>📂</span>
              Versión: {versionActiva ? versionActiva.toUpperCase() : 'V1'} (Cambiar)
            </button>
          </div>

          <div className="area-grid">
            {usuario.areasPermitidas.map((area) => {
              const info = datosAreas[area];
              if (!info) return null;
              return (
                <button key={area} onClick={() => abrirArea(area)} className="area-card" style={{ '--accent-c': info.color }}>
                  <div className="bar-top"></div>
                  <span className="ic">{info.ic}</span>
                  <h3>{area}</h3>
                  <div className="amt">Presupuesto asignado · S/ {info.presupuesto}</div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${info.consumido}%` }}></div>
                  </div>
                  <div className="progress-meta">
                    <span>{info.consumido}% ejecutado</span>
                    <span>{100 - info.consumido}% disponible</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* VISTA 2: CATEGORÍAS */}
      {vistaActual === 'categorias' && (
        <section style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '10px 20px' }}>
          <button
            onClick={() => { setVistaActual('areas'); setAreaSeleccionada(''); }}
            style={{ background: 'white', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, marginBottom: '24px', color: '#334155' }}
          >
            ← Volver a áreas
          </button>

          <div style={{ marginBottom: '30px', borderBottom: '1px solid #e2e8f0', paddingBottom: '20px' }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
              Presupuestos
            </div>
            <h2 style={{ margin: 0, fontSize: '24px', color: '#0f172a' }}>
              Menú de {areaSeleccionada}
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, calc(50% - 10px)), 1fr))',
            gap: '10px'
          }}>
            {Object.keys(configModulos)
              .filter(cat => {
                const permitidos = modulosVisiblesParaArea(areaSeleccionada);
                return permitidos ? permitidos.includes(cat) : true;
              })
              .map(cat => (
                <button
                  key={cat}
                  onClick={() => abrirCategoria(cat)}
                  className="cat-tile"
                  style={{ width: '100%', margin: 0 }}
                >
                  <span className="ic">{configModulos[cat].icono || '📂'}</span>
                  <h4>{cat}</h4>
                </button>
              ))}
          </div>
        </section>
      )}

      {/* VISTA 3: TABLA DE PRESUPUESTOS DINÁMICA */}
      {vistaActual === 'tabla' && (
        <section style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>

          <button onClick={() => { setVistaActual('categorias'); setCategoriaSeleccionada(''); }} className="btn-back">← Volver al menú</button>
          <div className="page-head" style={{ marginTop: '20px' }}>
            <div className="eyebrow">Detalle presupuestal</div>
            <h2>{categoriaSeleccionada} — {areaSeleccionada}</h2>
          </div>

          <div style={{
            display: 'flex', gap: '16px', marginBottom: '20px', marginTop: '16px',
            background: 'white', padding: '16px', borderRadius: '8px',
            border: '1px solid var(--line)', alignItems: 'center', flexWrap: 'wrap'
          }}>
            
            {categoriaSeleccionada === 'Forecast de Ventas' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '0 0 auto', minWidth: '220px' }}>
                
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px' }}>
                  <div style={{ fontSize: '9px', color: '#166534', fontWeight: 700 }}>TOTAL (S/)</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#15803d' }}>
                    S/ {calcularSumaForecastPorMoneda('S/', filtroMesInicio, filtroMesFin).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>

                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '8px 12px' }}>
                  <div style={{ fontSize: '9px', color: '#b45309', fontWeight: 700 }}>TOTAL (US$)</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#d97706' }}>
                    US$ {calcularSumaForecastPorMoneda('US$', filtroMesInicio, filtroMesFin).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>

              </div>
            ) : (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 16px', flex: '0 0 auto' }}>
                <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 700, letterSpacing: '0.5px' }}>TOTAL PRESUPUESTADO</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  {totalPresupuestado.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '10px', color: '#166534', fontWeight: 600 }}>
                  {registrosFiltrados.length} registro(s)
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', flex: '1 1 500px', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
              
              {categoriaSeleccionada === 'Forecast de Ventas' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', width: '100%' }}>
                  
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Vendedor</label>
                    <input type="text" placeholder="Ej. Gerardo..." value={filtroEmpleado} onChange={e => setFiltroEmpleado(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>MES DESDE</label>
                    <select value={filtroMesInicio} onChange={e => setFiltroMesInicio(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }}>
                      <option value="">Inicio (Ene)</option>
                      {MESES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>MES HASTA</label>
                    <select value={filtroMesFin} onChange={e => setFiltroMesFin(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }}>
                      <option value="">Fin (Dic)</option>
                      {MESES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>Moneda</label>
                    <select value={filtroMoneda} onChange={e => setFiltroMoneda(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }}>
                      <option value="">Todas</option>
                      <option value="S/">Soles (S/)</option>
                      <option value="US$">Dólares (US$)</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>U. Negocio</label>
                    <select value={filtroUnidadNegocio} onChange={e => setFiltroUnidadNegocio(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }}>
                      <option value="">Todas</option>
                      {UNIDADES_NEGOCIO.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>Cliente</label>
                    <input type="text" placeholder="Ej. Minera..." value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>Producto</label>
                    <input type="text" placeholder="Ej. Crisol..." value={filtroProducto} onChange={e => setFiltroProducto(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                  </div>

                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', width: '100%' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Personal (DNI / Nombre)</label>
                    <input type="text" placeholder="Ej. Juana o 0753..." value={filtroEmpleado} onChange={e => setFiltroEmpleado(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Fecha Desde</label>
                    <input type="date" value={filtroFechaInicio} onChange={e => setFiltroFechaInicio(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Fecha Hasta</label>
                    <input type="date" value={filtroFechaFin} onChange={e => setFiltroFechaFin(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                  </div>
                </div>
              )}

            </div>

          </div>

          <div className="panel" style={{ width: '100%', margin: '0 auto' }}>
            
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: '8px 8px 0 0' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary-700)' }}>Registros de {categoriaSeleccionada}</span>
              <button className="btn-add" onClick={() => {
                setRegistroSeleccionado(null);
                setModoAccion('nuevo');
                setIsOffcanvasOpen(true);
              }}>
                + Nuevo
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="data" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {configModulos[categoriaSeleccionada]?.columnasTabla.map((col, idx) => (
                      <th key={idx} style={{ textAlign: col.alinear }}>{col.nombre}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {registrosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={configModulos[categoriaSeleccionada]?.columnasTabla.length || 5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-low)' }}>
                        No hay datos registrados aún.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {FILAS_ESPECIFICAS[categoriaSeleccionada] ? (
                        registrosPagina.map(reg => {
                          const FilaEspecifica = FILAS_ESPECIFICAS[categoriaSeleccionada];
                          return (
                            <FilaEspecifica
                              key={reg.id_registro} reg={reg} 
                              filtroMesInicio={filtroMesInicio} 
                              filtroMesFin={filtroMesFin}
                              onVer={(item) => { setRegistroSeleccionado(item); setModoAccion('ver'); setIsOffcanvasOpen(true); }}
                              onEditar={(item) => { setRegistroSeleccionado(item); setModoAccion('editar'); setIsOffcanvasOpen(true); }}
                              onBorrar={eliminarRegistro}
                            />
                          );
                        })
                      ) : (
                        <TablaGenerica
                              registros={registrosPagina}
                              onVer={(item) => { setRegistroSeleccionado(item); setModoAccion('ver'); setIsOffcanvasOpen(true); }}
                              onEditar={(item) => { setRegistroSeleccionado(item); setModoAccion('editar'); setIsOffcanvasOpen(true); }}
                              onBorrar={eliminarRegistro}
                              mostrarProducto={['Materias Primas', 'Materiales Auxiliares y Suministros', 'Envases y Embalajes'].includes(categoriaSeleccionada)}
                            />
                      )}
                    </>
                  )}
                </tbody>
              </table>
            
            {registrosFiltrados.length > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 20px', borderTop: '1px solid var(--line)', background: '#f8fafc',
              borderRadius: '0 0 8px 8px', flexWrap: 'wrap', gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748b' }}>
                Mostrar
                <select
                  value={tamanoPagina}
                  onChange={e => { setTamanoPagina(parseInt(e.target.value, 10)); setPaginaActual(1); }}
                  style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                registros por página · {registrosFiltrados.length} en total
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  disabled={paginaActual === 1}
                  onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
                  style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: paginaActual === 1 ? '#f1f5f9' : 'white', cursor: paginaActual === 1 ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                >
                  ← Anterior
                </button>
                <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                  Página {paginaActual} de {totalPaginas}
                </span>
                <button
                  type="button"
                  disabled={paginaActual === totalPaginas}
                  onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))}
                  style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: paginaActual === totalPaginas ? '#f1f5f9' : 'white', cursor: paginaActual === totalPaginas ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}


            </div>
          </div>

          {isOffcanvasOpen && (
            <Offcanvas
              isOpen={isOffcanvasOpen}
              onClose={() => {
                setIsOffcanvasOpen(false);
                setRegistroSeleccionado(null);
                recargarRegistros();
              }}
              categoria={categoriaSeleccionada}
              idVersion={versionActiva}
              area={areaSeleccionada}
              registroParaVer={registroSeleccionado}
              modo={modoAccion}
              onGuardado={() => {
                // Aseguramos que se guarden y recarguen los registros al instante
                recargarRegistros(); 
                setIsOffcanvasOpen(false);
              }}
            />
          )}
        </section>
      )}

      {/* VISTA MAESTROS */}
      {vistaActual.startsWith('maestros_') && (
        <section style={{ flex: 1, padding: '24px', maxWidth: '100vw', boxSizing: 'border-box', overflowX: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <button onClick={() => { setVistaActual('areas'); setAreaSeleccionada(''); setCategoriaSeleccionada(''); }} className="btn-back">
              ← Volver al inicio
            </button>

            {/* 🌟 BOTÓN DE ACTUALIZACIÓN / SINCRONIZACIÓN MANUAL */}
            <button 
              onClick={async () => {
                if (window.confirm('¿Desea actualizar los datos de este maestro consultando directamente a Odoo?')) {
                  setCargandoOdoo(true);
                  try {
                    const res = await sincronizarConOdooDB();
                    alert(res.mensaje || '¡Actualizado correctamente!');
                    
                    // Recargamos los datos locales correspondientes según la vista actual
                    if (vistaActual === 'maestros_empleados') {
                      const data = await obtenerEmpleadosOdoo();
                      setListaEmpleados(data);
                    } else if (vistaActual === 'maestros_productos') {
                      const data = await obtenerProductosOdoo();
                      setListaProductos(data);
                    } else if (vistaActual === 'maestros_clientes') {
                      const data = await obtenerClientesOdoo();
                      setListaClientes(data);
                    } else if (vistaActual === 'maestros_cuentas') {
                      const data = await obtenerCuentasOdoo();
                      setListaCuentas(data);
                    }
                  } catch (err) {
                    alert('Hubo un error al sincronizar con Odoo.');
                  } finally {
                    setCargandoOdoo(false);
                  }
                }
              }}
              style={{
                background: '#0284c7', color: 'white', border: 'none', padding: '8px 16px',
                borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              <span>🔄</span> Actualizar desde Odoo
            </button>
          </div>
          
          <div className="page-head" style={{ marginTop: '20px' }}>
            <div className="eyebrow">Datos maestros</div>
            <h2>
              Maestro de {
                vistaActual === 'maestros_empleados' ? 'Empleados' :
                vistaActual === 'maestros_cuentas' ? 'Cuentas' :
                vistaActual === 'maestros_clientes' ? 'Clientes' :
                vistaActual === 'maestros_usuarios' ? 'Usuarios' : 
                vistaActual === 'maestros_formulas' ? 'Fórmulas y Recetas' : 'Productos'
              }
            </h2>
          </div>

          {/* 🌟 BARRA DE FILTROS Y CONTADOR (SOLO PARA PRODUCTOS) */}
          {vistaActual === 'maestros_productos' && (
            <div style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
              flexWrap: 'wrap', gap: '15px', marginTop: '16px', marginBottom: '16px',
              background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' 
            }}>
              <div style={{ display: 'flex', gap: '12px', flex: '1 1 400px', flexWrap: 'wrap' }}>
                <input 
                  type="text"
                  placeholder="Buscar por código o descripción..."
                  value={busquedaProducto}
                  onChange={(e) => { setBusquedaProducto(e.target.value); setPaginaProductos(1); }}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', flex: 1, minWidth: '220px', fontSize: '13px' }}
                />

                <select 
                  value={categoriaProdSeleccionada}
                  onChange={(e) => { setCategoriaProdSeleccionada(e.target.value); setPaginaProductos(1); }}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', minWidth: '180px', background: '#fff', fontSize: '13px' }}
                >
                  {categoriasProductosDisponibles.map((cat, index) => (
                    <option key={index} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold', color: '#475569' }}>
                Total de líneas encontradas: {productosFiltrados.length}
              </div>
            </div>
          )}

          {/* 🔍 BARRA DE BÚSQUEDA Y FILTROS POR CATEGORÍA Y SUBCATEGORÍA */}
          {vistaActual === 'maestros_cuentas' && (
            <div style={{ 
              display: 'flex', flexDirection: 'column', gap: '12px', 
              marginTop: '16px', marginBottom: '16px',
              background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0',
              boxSizing: 'border-box', width: '100%'
            }}>
              
              {/* Inputs y Selectores */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', width: '100%' }}>
                {/* Buscador de texto */}
                <input 
                  type="text"
                  placeholder="Buscar por código o nombre..."
                  value={busquedaCuenta}
                  onChange={(e) => { setBusquedaCuenta(e.target.value); setPaginaCuentas(1); }}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', flex: '1 1 220px', fontSize: '13px', minWidth: '180px' }}
                />

                {/* Filtro por Categoría (Tipo de cuenta) */}
                <select 
                  value={categoriaCuentaSel}
                  onChange={(e) => { setCategoriaCuentaSel(e.target.value); setPaginaCuentas(1); }}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', flex: '1 1 160px', background: '#fff', fontSize: '13px', minWidth: '150px' }}
                >
                  <option value="TODAS">Categoría: Todas</option>
                  {categoriasCuentasDisponibles.filter(c => c !== 'TODAS').map((cat, index) => (
                    <option key={index} value={cat}>{cat}</option>
                  ))}
                </select>

                {/* Filtro por Subcategoría (Grupo contable) */}
                <select 
                  value={subcategoriaCuentaSel}
                  onChange={(e) => { setSubcategoriaCuentaSel(e.target.value); setPaginaCuentas(1); }}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', flex: '1 1 160px', background: '#fff', fontSize: '13px', minWidth: '150px' }}
                >
                  <option value="TODAS">Grupo: Todos</option>
                  {subcategoriasCuentasDisponibles.filter(s => s !== 'TODAS').map((sub, index) => (
                    <option key={index} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>

              {/* Contador total alineado abajo */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>
                  Total de cuentas encontradas: {cuentasFiltradas.length}
                </span>
              </div>

            </div>
          )}

          {/* 🔍 BARRA DE BÚSQUEDA Y FILTRO PARA CLIENTES */}
          {vistaActual === 'maestros_clientes' && (
            <div style={{ 
              display: 'flex', flexDirection: 'column', gap: '12px', 
              marginTop: '16px', marginBottom: '16px',
              background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0',
              boxSizing: 'border-box', width: '100%'
            }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', width: '100%' }}>
                <input 
                  type="text"
                  placeholder="Buscar por RUC o razón social..."
                  value={busquedaCliente}
                  onChange={(e) => { setBusquedaCliente(e.target.value); setPaginaClientes(1); }}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', flex: '1 1 250px', fontSize: '13px', minWidth: '200px' }}
                />

                <select 
                  value={zonaClienteSel}
                  onChange={(e) => { setZonaClienteSel(e.target.value); setPaginaClientes(1); }}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', flex: '1 1 180px', background: '#fff', fontSize: '13px', minWidth: '150px' }}
                >
                  <option value="TODAS">Zona: Todas</option>
                  {zonasClientesDisponibles.filter(z => z !== 'TODAS').map((zona, index) => (
                    <option key={index} value={zona}>{zona}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>
                  Total de clientes encontrados: {clientesFiltrados.length}
                </span>
              </div>
            </div>
          )}

          <div className="panel" style={{ width: '100%', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '16px', overflowX: 'auto' }}>
            <table className="table-custom" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>

              {/* Encabezados - CORREGIDO: SE AGREGARON LOS DE FÓRMULAS */}
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: '12px', color: '#64748b' }}>
                  {vistaActual === 'maestros_empleados' ? (
                    <>
                      <th style={{ padding: '12px' }}>DNI / ID</th>
                      <th style={{ padding: '12px' }}>Nombre</th>
                      <th style={{ padding: '12px' }}>Cargo</th>
                      <th style={{ padding: '12px' }}>Sueldo</th>
                      <th style={{ padding: '12px' }}>Asignación Familiar</th>
                      <th style={{ padding: '12px' }}>Distribución</th>
                      <th style={{ padding: '12px' }}>Proceso</th>
                      <th style={{ padding: '12px' }}>Área encargada</th>
                      
                    </>
                  ) : vistaActual === 'maestros_cuentas' ? (
                    <>
                      <th style={{ padding: '12px' }}>Código Cuenta</th>
                      <th style={{ padding: '12px' }}>Nombre de Cuenta</th>
                      <th style={{ padding: '12px' }}>Categoría</th>
                      <th style={{ padding: '12px' }}>Subcategoría</th>
                      
                    </>
                  ) : vistaActual === 'maestros_clientes' ? (
                    <>
                      <th style={{ padding: '12px' }}>RUC / ID</th>
                      <th style={{ padding: '12px' }}>Razón Social / Cliente</th>
                      <th style={{ padding: '12px' }}>Zona</th>
                      <th style={{ padding: '12px' }}>Vendedor</th>
                      <th style={{ padding: '12px' }}>País</th>
                      <th style={{ padding: '12px' }}>Tipo de cliente</th>
                      
                      
                    </>
                  ) : vistaActual === 'maestros_usuarios' ? (
                    <>
                      <th style={{ padding: '12px' }}>ID Usuario</th>
                      <th style={{ padding: '12px' }}>Usuario</th>
                      <th style={{ padding: '12px' }}>Nombre de Usuario</th>
                      <th style={{ padding: '12px' }}>Iniciales</th>
                      <th style={{ padding: '12px' }}>Rol / Permiso</th>
                      
                    </>
                  ) : vistaActual === 'maestros_formulas' ? (
                    <>
                      <th style={{ padding: '12px' }}>Código BOM</th>
                      <th style={{ padding: '12px' }}>Producto Final</th>
                      <th style={{ padding: '12px' }}>Cantidad de Insumos</th>
                    </>
                  ) : (
                    <>
                      <th style={{ padding: '12px' }}>Código / SKU</th>
                      <th style={{ padding: '12px' }}>Descripción de Producto</th>
                      <th style={{ padding: '12px' }}>Categoría</th>
                      <th style={{ padding: '12px' }}>Unidad de Medida</th>
                      <th style={{ padding: '12px' }}>Precio de Venta</th>
                      <th style={{ padding: '12px' }}>Último Precio Venta</th>
                      <th style={{ padding: '12px' }}>Precio Promedio</th>
                      <th style={{ padding: '12px' }}>Costo</th>
                      
                      
                    </>
                  )}
                  <th style={{ padding: '12px', textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>

              {/* Filas de tabla, datos de las tablas */}
              <tbody>
                {vistaActual === 'maestros_empleados' ? (
                  cargandoOdoo ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        ⏳ Cargando empleados desde Odoo...
                      </td>
                    </tr>
                  ) : listaEmpleados.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        No se encontraron empleados registrados.
                      </td>
                    </tr>
                  ) : (
                    listaEmpleados.map((emp, index) => (
                      <tr key={`${emp.dni || emp.id}-${index}`} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '13px', textAlign: 'center' }}>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{emp.dni || '-'}</td>
                        <td style={{ padding: '12px', textAlign: 'left' }}>{emp.nombre || '-'}</td>
                        <td style={{ padding: '12px' }}>{emp.puesto || emp.cargo || 'Sin asignar'}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>S/ {(parseFloat(emp.sueldo) || 0).toFixed(2)}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          S/ {(parseFloat(emp.asignacion_familiar || emp.asigFam) || 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '12px' }}>{emp.distribucion || '100%'}</td>
                        <td style={{ padding: '12px' }}>{emp.proceso || 'Sin asignar'}</td>
                        <td style={{ padding: '12px' }}>{emp.area || 'General'}</td>
                        <td style={{ padding: '12px', textAlign: 'center', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button onClick={() => { setItemMaestroSeleccionado(emp); setModoAccionMaestro('ver'); setIsModalMaestroAbierto(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Ver">👁️</button>
                          <button onClick={() => { setItemMaestroSeleccionado(emp); setModoAccionMaestro('editar'); setIsModalMaestroAbierto(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Editar">✏️</button>
                          <button onClick={() => { if (window.confirm('¿Desea eliminar este registro?')) { const actualizada = eliminarDeMaestro('empleados', emp.dni || emp.id); setListaEmpleados([...actualizada]); } }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#ef4444' }} title="Eliminar">🗑️</button>
                        </td>
                      </tr>
                    ))
                  )
                ) : vistaActual === 'maestros_cuentas' ? (
                  cargandoOdoo ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        ⏳ Cargando plan contable desde Odoo...
                      </td>
                    </tr>
                  ) : cuentasPaginadas.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        No se encontraron cuentas contables.
                      </td>
                    </tr>
                  ) : (
                    cuentasPaginadas.map((cta) => (
                      <tr key={cta.id_odoo || cta.codigo} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{cta.codigo}</td>
                        <td style={{ padding: '12px' }}>{cta.nombre}</td>
                        <td style={{ padding: '12px' }}>{cta.categoria}</td>
                        <td style={{ padding: '12px' }}>{cta.subcategoria || cta.grupo}</td>
                        <td style={{ padding: '12px', textAlign: 'center', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button onClick={() => { setItemMaestroSeleccionado(cta); setModoAccionMaestro('ver'); setIsModalMaestroAbierto(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Ver">👁️</button>
                          <button onClick={() => { setItemMaestroSeleccionado(cta); setModoAccionMaestro('editar'); setIsModalMaestroAbierto(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Editar">✏️</button>
                          <button onClick={() => { if (window.confirm('¿Desea eliminar este registro?')) { const actualizada = eliminarDeMaestro('cuentas', cta.nombre || cta.id); setListaCuentas([...actualizada]); } }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#ef4444' }} title="Eliminar">🗑️</button>
                        </td>
                      </tr>
                    ))
                  )
                ) : vistaActual === 'maestros_clientes' ? (
                  cargandoOdoo ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        ⏳ Cargando clientes desde Odoo...
                      </td>
                    </tr>
                  ) : clientesPaginados.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        No se encontraron clientes registrados.
                      </td>
                    </tr>
                  ) : (
                    clientesPaginados.map((cli, index) => (
                    // 👇 Añadimos el index para garantizar que la llave sea siempre única en cada fila
                    <tr key={`${cli.id || cli.ruc}-${index}`} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>{cli.ruc}</td>
                      <td style={{ padding: '12px' }}>{cli.nombre}</td>
                      <td style={{ padding: '12px' }}>{cli.zona}</td>
                      <td style={{ padding: '12px' }}>{cli.vendedor}</td>
                      <td style={{ padding: '12px' }}>{cli.pais}</td>
                      <td style={{ padding: '12px' }}>{cli.tipo}</td>
                      <td style={{ padding: '12px', textAlign: 'center', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button onClick={() => { setItemMaestroSeleccionado(cli); setModoAccionMaestro('ver'); setIsModalMaestroAbierto(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Ver">👁️</button>
                        <button onClick={() => { setItemMaestroSeleccionado(cli); setModoAccionMaestro('editar'); setIsModalMaestroAbierto(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Editar">✏️</button>
                        <button onClick={() => { if (window.confirm('¿Desea eliminar este registro?')) { const actualizada = eliminarDeMaestro('clientes', cli.ruc || cli.nombre); setListaClientes([...actualizada]); } }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#ef4444' }} title="Eliminar">🗑️</button>
                      </td>
                    </tr>
                  ))
                  )
                ) : vistaActual === 'maestros_usuarios' ? (
                    usuariosPaginados.map((usr, idx) => {
                      
                      // Función para generar las iniciales a partir del nombre en tiempo real
                      const getIniciales = (nombre) => {
                        if (!nombre) return "--";
                        const palabras = nombre.trim().split(/\s+/);
                        if (palabras.length === 1) return palabras[0].substring(0, 2).toUpperCase();
                        return (palabras[0][0] + palabras[1][0]).toUpperCase();
                      };

                      return (
                        <tr key={usr.id_odoo || idx} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '13px', background: 'white' }}>
                          
                          {/* ID Usuario: Prioriza el id_odoo de la base de datos */}
                          <td style={{ padding: '12px', fontWeight: 600, color: '#0f172a' }}>
                            {usr.id_odoo || usr.id || Object.keys(baseDatosUsuarios)[idx] || '-'}
                          </td>

                          {/* Nuevo campo User Login */}
                          <td style={{ padding: '12px', color: '#2563eb', fontFamily: 'monospace' }}>
                            {usr.login || '-'}
                          </td>

                          {/* Nombre de Usuario */}
                          <td style={{ padding: '12px', color: '#334155' }}>
                            {usr.nombre || 'Sin Nombre'}
                          </td>

                          {/* Iniciales: Círculo con letras generadas automáticamente */}
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <span style={{ 
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: '#f1f5f9', 
                              color: '#475569', 
                              width: '32px', 
                              height: '32px', 
                              borderRadius: '50%', 
                              fontWeight: 'bold',
                              fontSize: '12px'
                            }}>
                              {usr.iniciales || getIniciales(usr.nombre)}
                            </span>
                          </td>

                          {/* Rol / Permiso */}
                          <td style={{ padding: '12px', color: '#64748b' }}>
                            {usr.rol || 'Usuario'}
                          </td>

                          {/* Acciones */}
                          <td style={{ padding: '12px', textAlign: 'center', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button onClick={() => { setItemMaestroSeleccionado(usr); setModoAccionMaestro('ver'); setIsModalMaestroAbierto(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Ver">👁️</button>
                            <button onClick={() => { setItemMaestroSeleccionado(usr); setModoAccionMaestro('editar'); setIsModalMaestroAbierto(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Editar">✏️</button>
                            <button onClick={() => { 
                              if (window.confirm('¿Desea eliminar este registro?')) { 
                                const actualizada = eliminarDeMaestro('usuarios', usr.id_odoo || usr.nombre || usr.id); 
                                setListaUsuarios([...actualizada]); 
                              } 
                            }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#ef4444' }} title="Eliminar">🗑️</button>
                          </td>
                          
                        </tr>
                      );
                    })
                  ) : vistaActual === 'maestros_formulas' ? (
                  cargandoOdoo ? (
                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>⏳ Cargando fórmulas desde Odoo...</td></tr>
                  ) : (
                    formulasPaginadas.map((formu, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{formu.codigo}</td>
                        <td style={{ padding: '12px', fontWeight: 'bold', color: '#1e293b' }}>{formu.producto}</td>
                        <td style={{ padding: '12px' }}>{formu.materia_prima?.length || 0} Insumos/Componentes</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <button onClick={() => { setItemMaestroSeleccionado(formu); setModoAccionMaestro('ver'); setIsModalMaestroAbierto(true); }} style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }} title="Ver Componentes">👁️ Ver Receta</button>
                        </td>
                      </tr>
                    ))
                  )
                ) : vistaActual === 'maestros_productos' ? (
                  cargandoOdoo ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        ⏳ Cargando el catálogo completo desde Odoo, por favor espere un momento...
                      </td>
                    </tr>
                  ) : productosPaginados.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        No se encontraron productos con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                  productosPaginados.map((prod) => (
                      <tr key={prod.id_odoo || prod.codigo} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>
                          {prod.codigo || prod.default_code || prod.sku || '-'}
                        </td>
                        <td style={{ padding: '12px' }}>{prod.nombre}</td>
                        <td style={{ padding: '12px' }}>{prod.categoria}</td>
                        <td style={{ padding: '12px' }}>{prod.unidad}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          S/ {Number(prod.pv ?? prod.precio_venta ?? prod.lst_price ?? 0).toFixed(2)}
                        </td>                       
                        <td style={{ padding: '12px' }}>{prod.ultimo_precio_venta !== undefined ? Number(prod.ultimo_precio_venta).toFixed(2) : '0.00'}</td>
                        <td style={{ padding: '12px' }}>{prod.precio_promedio_venta !== undefined ? Number(prod.precio_promedio_venta).toFixed(2) : '0.00'}</td>
                        <td style={{ padding: '12px' }}>{prod.costo !== undefined ? Number(prod.costo).toFixed(2) : '0.00'}</td>
                        <td style={{ padding: '12px', textAlign: 'center', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button onClick={() => { setItemMaestroSeleccionado(prod); setModoAccionMaestro('ver'); setIsModalMaestroAbierto(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Ver">👁️</button>
                          <button onClick={() => { setItemMaestroSeleccionado(prod); setModoAccionMaestro('editar'); setIsModalMaestroAbierto(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Editar">✏️</button>
                          <button onClick={() => { if (window.confirm('¿Desea eliminar este registro?')) { const actualizada = eliminarDeMaestro('productos', prod.nombre || prod.codigo); setListaProductos([...actualizada]); } }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#ef4444' }} title="Eliminar">🗑️</button>
                        </td>
                      </tr>
                    ))
                  )
                ) : null}
              </tbody>
            </table>

            {/* 🌟 CONTROLES DE PAGINACIÓN INFERIOR (SOLO PARA PRODUCTOS) */}
            {vistaActual === 'maestros_productos' && productosFiltrados.length > 0 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                borderRadius: '0 0 8px 8px', flexWrap: 'wrap', gap: '10px'
              }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  Mostrando del {indiceInicioProd + 1} al {Math.min(indiceInicioProd + tamanoPaginaProductos, productosFiltrados.length)} de {productosFiltrados.length} productos
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    disabled={paginaProductos === 1}
                    onClick={() => setPaginaProductos(p => Math.max(1, p - 1))}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: paginaProductos === 1 ? '#f1f5f9' : 'white', cursor: paginaProductos === 1 ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                  >
                    ← Anterior
                  </button>
                  <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                    Página {paginaProductos} de {totalPaginasProductos}
                  </span>
                  <button
                    type="button"
                    disabled={paginaProductos === totalPaginasProductos}
                    onClick={() => setPaginaProductos(p => Math.min(totalPaginasProductos, p + 1))}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: paginaProductos === totalPaginasProductos ? '#f1f5f9' : 'white', cursor: paginaProductos === totalPaginasProductos ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}

            {/* 📄 CONTROLES DE PAGINACIÓN INFERIOR (CUENTAS) */}
            {vistaActual === 'maestros_cuentas' && cuentasFiltradas.length > 0 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                borderRadius: '0 0 8px 8px', flexWrap: 'wrap', gap: '10px'
              }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  Mostrando del {indiceInicioCuentas + 1} al {Math.min(indiceInicioCuentas + tamanoPaginaCuentas, cuentasFiltradas.length)} de {cuentasFiltradas.length} cuentas
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    disabled={paginaCuentas === 1}
                    onClick={() => setPaginaCuentas(p => Math.max(1, p - 1))}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: paginaCuentas === 1 ? '#f1f5f9' : 'white', cursor: paginaCuentas === 1 ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                  >
                    ← Anterior
                  </button>
                  <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                    Página {paginaCuentas} de {totalPaginasCuentas}
                  </span>
                  <button
                    type="button"
                    disabled={paginaCuentas === totalPaginasCuentas}
                    onClick={() => setPaginaCuentas(p => Math.min(totalPaginasCuentas, p + 1))}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: paginaCuentas === totalPaginasCuentas ? '#f1f5f9' : 'white', cursor: paginaCuentas === totalPaginasCuentas ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}

            {/* 📄 CONTROLES DE PAGINACIÓN INFERIOR (CLIENTES) */}
            {vistaActual === 'maestros_clientes' && clientesFiltrados.length > 0 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                borderRadius: '0 0 8px 8px', flexWrap: 'wrap', gap: '10px'
              }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  Mostrando del {indiceInicioClientes + 1} al {Math.min(indiceInicioClientes + tamanoPaginaClientes, clientesFiltrados.length)} de {clientesFiltrados.length} clientes
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    disabled={paginaClientes === 1}
                    onClick={() => setPaginaClientes(p => Math.max(1, p - 1))}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: paginaClientes === 1 ? '#f1f5f9' : 'white', cursor: paginaClientes === 1 ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                  >
                    ← Anterior
                  </button>
                  <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                    Página {paginaClientes} de {totalPaginasClientes}
                  </span>
                  <button
                    type="button"
                    disabled={paginaClientes === totalPaginasClientes}
                    onClick={() => setPaginaClientes(p => Math.min(totalPaginasClientes, p + 1))}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: paginaClientes === totalPaginasClientes ? '#f1f5f9' : 'white', cursor: paginaClientes === totalPaginasClientes ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}

            {/* 📄 CONTROLES DE PAGINACIÓN INFERIOR (usuarios) */}
            {vistaActual === 'maestros_usuarios' && arrayUsuarios.length > 0 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                borderRadius: '0 0 8px 8px', flexWrap: 'wrap', gap: '10px'
              }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  Mostrando del {indiceInicioUsuarios + 1} al {Math.min(indiceInicioUsuarios + tamanoPaginaUsuarios, arrayUsuarios.length)} de {arrayUsuarios.length} usuarios
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    disabled={paginaUsuarios === 1}
                    onClick={() => setPaginaUsuarios(p => Math.max(1, p - 1))}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: paginaUsuarios === 1 ? '#f1f5f9' : 'white', cursor: paginaUsuarios === 1 ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                  >
                    ← Anterior
                  </button>
                  <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                    Página {paginaUsuarios} de {totalPaginasUsuarios}
                  </span>
                  <button
                    type="button"
                    disabled={paginaUsuarios === totalPaginasUsuarios}
                    onClick={() => setPaginaUsuarios(p => Math.min(totalPaginasUsuarios, p + 1))}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: paginaUsuarios === totalPaginasUsuarios ? '#f1f5f9' : 'white', cursor: paginaUsuarios === totalPaginasUsuarios ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}

            {/* 📄 CONTROLES DE PAGINACIÓN INFERIOR (formulas) */}

            {vistaActual === 'maestros_formulas' && arrayFormulas.length > 0 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                borderRadius: '0 0 8px 8px', flexWrap: 'wrap', gap: '10px'
              }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  Mostrando del {indiceInicioFormulas + 1} al {Math.min(indiceInicioFormulas + tamanoPaginaFormulas, arrayFormulas.length)} de {arrayFormulas.length} fórmulas
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    disabled={paginaFormulas === 1}
                    onClick={() => setPaginaFormulas(p => Math.max(1, p - 1))}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: paginaFormulas === 1 ? '#f1f5f9' : 'white', cursor: paginaFormulas === 1 ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                  >
                    ← Anterior
                  </button>
                  <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                    Página {paginaFormulas} de {totalPaginasFormulas}
                  </span>
                  <button
                    type="button"
                    disabled={paginaFormulas === totalPaginasFormulas}
                    onClick={() => setPaginaFormulas(p => Math.min(totalPaginasFormulas, p + 1))}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: paginaFormulas === totalPaginasFormulas ? '#f1f5f9' : 'white', cursor: paginaFormulas === totalPaginasFormulas ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </div>


          {/* ── MODAL FLOTANTE PARA VER / EDITAR / CREAR MAESTROS ── */}
{isModalMaestroAbierto && (
  <div style={{
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
    boxSizing: 'border-box', overflow: 'hidden'
  }}>
    <div style={{ background: 'white', padding: '24px', borderRadius: '8px', width: '500px', maxWidth: '90%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', boxSizing: 'border-box' }}>
      
      <h3 style={{ marginBottom: '16px', textTransform: 'capitalize', fontSize: '18px', color: '#0f172a' }}>
        {modoAccionMaestro === 'ver' ? 'Ver' : modoAccionMaestro === 'editar' ? 'Editar' : 'Nuevo'} Registro
      </h3>

      <form onSubmit={async (e) => {
        e.preventDefault();

        // Si está en modo 'ver', solo cerramos el modal
        if (modoAccionMaestro === 'ver') {
          setIsModalMaestroAbierto(false);
          return;
        }

        // Identificamos a qué tabla/maestro pertenece la vista actual
        let tipo = '';
        if (vistaActual === 'maestros_empleados') tipo = 'empleados';
        else if (vistaActual === 'maestros_cuentas') tipo = 'cuentas';
        else if (vistaActual === 'maestros_clientes') tipo = 'clientes';
        else if (vistaActual === 'maestros_productos') tipo = 'productos';
        else if (vistaActual === 'maestros_usuarios') tipo = 'usuarios';

        // Obtenemos los valores ingresados en los inputs del modal
        const formData = new FormData(e.target);
        const datosNuevos = Object.fromEntries(formData.entries());
        
        // Extraemos el ID clave original del elemento seleccionado (DNI, código, RUC o ID Odoo)
        const idOriginal = itemMaestroSeleccionado?.dni || 
                            itemMaestroSeleccionado?.codigo || 
                            itemMaestroSeleccionado?.ruc || 
                            itemMaestroSeleccionado?.id_odoo || 
                            itemMaestroSeleccionado?.id;

        if (!idOriginal) {
          alert("No se pudo identificar el ID del registro a actualizar.");
          return;
        }

        // 1. Guardamos en la base de datos PostgreSQL a través del backend
        const resultado = await actualizarMaestroDB(tipo, idOriginal, datosNuevos);

        if (resultado) {
          // 2. Refrescamos el estado local de la tabla correspondiente para ver el cambio al instante
          if (tipo === 'empleados') {
            const data = await obtenerEmpleadosOdoo();
            setListaEmpleados(data);
          } else if (tipo === 'cuentas') {
            const data = await obtenerCuentasOdoo();
            setListaCuentas(data);
          } else if (tipo === 'clientes') {
            const data = await obtenerClientesOdoo();
            setListaClientes(data);
          } else if (tipo === 'productos') {
            const data = await obtenerProductosOdoo();
            setListaProductos(data);
          } else if (tipo === 'usuarios') {
            const data = await obtenerUsuariosOdoo();
            setListaUsuarios(data);
          }

          // 3. Cerramos el modal
          setIsModalMaestroAbierto(false);
          setItemMaestroSeleccionado(null);
        }
      }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
          
          {/* VISTA DETALLE PARA FÓRMULAS */}
          {vistaActual === 'maestros_formulas' && modoAccionMaestro === 'ver' && (
            <div style={{ padding: '10px 0' }}>
              <h4 style={{ margin: '0 0 16px 0', color: '#0f172a', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px' }}>
                Fórmula: {itemMaestroSeleccionado?.producto}
              </h4>
              <div style={{ background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#e2e8f0' }}>
                    <tr style={{ textAlign: 'left' }}>
                      <th style={{ padding: '10px' }}>Insumo</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemMaestroSeleccionado?.materia_prima?.map((insumo, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px' }}>{insumo.insumo}</td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>
                          {insumo.cantidad} {insumo.unidad}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/*Modales para ver/editar/crear registros de empleados, cuentas, clientes, productos y usuarios*/}
          {/* 1. CAMPOS: MAESTRO DE EMPLEADOS (8 columnas alineadas) */}
          {vistaActual === 'maestros_empleados' && (
            <>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>DNI / ID:</label>
                <input name="dni" defaultValue={itemMaestroSeleccionado?.dni || itemMaestroSeleccionado?.id || ''} disabled={modoAccionMaestro === 'ver' || modoAccionMaestro === 'editar'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Nombre:</label>
                <input name="nombre" defaultValue={itemMaestroSeleccionado?.nombre || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Cargo:</label>
                <input name="puesto" defaultValue={itemMaestroSeleccionado?.puesto || itemMaestroSeleccionado?.cargo || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Sueldo:</label>
                <input name="sueldo" type="number" step="0.01" defaultValue={itemMaestroSeleccionado?.sueldo || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Asignación Familiar:</label>
                {/* 🛠️ CORRECCIÓN AQUÍ: Evaluamos asignacion_familiar */}
                <input name="asignacionFamiliar" type="number" step="0.01" defaultValue={itemMaestroSeleccionado?.asignacion_familiar || itemMaestroSeleccionado?.asignacionFamiliar || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Distribución (%):</label>
                <input name="distribucion" defaultValue={itemMaestroSeleccionado?.distribucion || '100%'} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Proceso:</label>
                <select name="proceso" defaultValue={itemMaestroSeleccionado?.proceso || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                  <option value="">Sin asignar</option>
                  {PROCESOS_PRODUCTIVOS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Área encargada:</label>
                <input name="area" defaultValue={itemMaestroSeleccionado?.area || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
            </>
          )}

          {/* 2. CAMPOS: CUENTAS CONTABLES */}
          {vistaActual === 'maestros_cuentas' && (
            <>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Código Cuenta:</label>
                <input name="codigo" defaultValue={itemMaestroSeleccionado?.codigo || itemMaestroSeleccionado?.id || ''} disabled={modoAccionMaestro === 'ver' || modoAccionMaestro === 'editar'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Nombre de Cuenta:</label>
                <input name="nombre" defaultValue={itemMaestroSeleccionado?.nombre || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Categoría:</label>
                <input name="categoria" defaultValue={itemMaestroSeleccionado?.categoria || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Subcategoría:</label>
                <input name="subcategoria" defaultValue={itemMaestroSeleccionado?.subcategoria || itemMaestroSeleccionado?.grupo || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
            </>
          )}

          {/* 3. CAMPOS: PRODUCTOS (Corregido con name="precio_venta" y id_odoo) */}
          {vistaActual === 'maestros_productos' && (
            <>
              {/* Campo oculto que asegura que el SKU/Código siempre viaje al backend aunque esté deshabilitado visualmente */}
              <input type="hidden" name="codigo" value={itemMaestroSeleccionado?.codigo || ''} />

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Código / SKU:</label>
                <input value={itemMaestroSeleccionado?.codigo || ''} disabled style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#f1f5f9' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Descripción de Producto:</label>
                <input name="nombre" defaultValue={itemMaestroSeleccionado?.nombre || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Unidad de Medida:</label>
                <input name="unidad" defaultValue={itemMaestroSeleccionado?.unidad || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Precio de Venta:</label>
                <input name="precio_venta" type="number" step="0.01" defaultValue={itemMaestroSeleccionado?.precio_venta || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Costo:</label>
                <input name="costo" type="number" step="0.01" defaultValue={itemMaestroSeleccionado?.costo || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Categoría:</label>
                <input name="categoria" defaultValue={itemMaestroSeleccionado?.categoria || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
            </>
          )}

          {/* 4. CAMPOS: CLIENTES */}
          {vistaActual === 'maestros_clientes' && (
            <>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>RUC / ID:</label>
                <input name="ruc" defaultValue={itemMaestroSeleccionado?.ruc || itemMaestroSeleccionado?.id || ''} disabled={modoAccionMaestro === 'ver' || modoAccionMaestro === 'editar'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Razón Social / Cliente:</label>
                <input name="nombre" defaultValue={itemMaestroSeleccionado?.nombre || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Zona:</label>
                <input name="zona" defaultValue={itemMaestroSeleccionado?.zona || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Vendedor:</label>
                <input name="vendedor" defaultValue={itemMaestroSeleccionado?.vendedor || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>País:</label>
                <input name="pais" defaultValue={itemMaestroSeleccionado?.pais || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Tipo de cliente:</label>
                <input name="tipo" defaultValue={itemMaestroSeleccionado?.tipo || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
              </div>
            </>
          )}

          {/* 5. CAMPOS: USUARIOS */}
          {vistaActual === 'maestros_usuarios' && (
            <>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>ID Usuario:</label>
                <input name="id" defaultValue={itemMaestroSeleccionado?.id || itemMaestroSeleccionado?.id_odoo || ''} disabled={modoAccionMaestro === 'ver' || modoAccionMaestro === 'editar'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Usuario (Login / Email):</label>
                <input name="login" defaultValue={itemMaestroSeleccionado?.login || itemMaestroSeleccionado?.email || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Nombre de Usuario:</label>
                <input name="nombre" defaultValue={itemMaestroSeleccionado?.nombre || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Iniciales:</label>
                <input name="iniciales" defaultValue={itemMaestroSeleccionado?.iniciales || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Rol / Permiso:</label>
                <input name="rol" defaultValue={itemMaestroSeleccionado?.rol || ''} disabled={modoAccionMaestro === 'ver'} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} required />
              </div>
            </>
          )}

        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <button 
            type="button" 
            onClick={() => setIsModalMaestroAbierto(false)}
            style={{ padding: '8px 16px', background: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, color: '#334155' }}
          >
            {modoAccionMaestro === 'ver' ? 'Cerrar' : 'Cancelar'}
          </button>
          
          {modoAccionMaestro !== 'ver' && (
            <button 
              type="submit"
              style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
            >
              Guardar Cambios
            </button>
          )}
        </div>
      </form>

    </div>
  </div>
)}

          
        </section>
      )}
      
    </div>
  );
}