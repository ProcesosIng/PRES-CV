import React, { useEffect, useState } from 'react';
import { API_URL } from '../../config/api';
import { exportarExcel } from '../../config/excel';

// Análisis de uso: quién ingresa, cuánto tiempo usa el sistema y qué registra.
//  - Tiempo en la aplicación: solo cuenta mientras la pestaña está visible y la persona la usa
//    (mouse/teclado en los últimos 5 minutos). Una pestaña olvidada abierta no suma.
//  - Registros creados / modificados / eliminados: salen del historial de cambios (auditoría).
const hoy = () => new Date().toISOString().slice(0, 10);
const haceDias = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const duracion = (seg) => {
  const s = Math.round(seg || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
};
const fecha = (v) => (v ? new Date(v).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const navegadorCorto = (ua) => {
  const t = String(ua || '');
  const nav = /Edg\//.test(t) ? 'Edge' : /Chrome\//.test(t) ? 'Chrome' : /Firefox\//.test(t) ? 'Firefox' : /Safari\//.test(t) ? 'Safari' : 'Otro';
  const so = /Windows/.test(t) ? 'Windows' : /Android/.test(t) ? 'Android' : /iPhone|iPad/.test(t) ? 'iOS' : /Mac OS/.test(t) ? 'Mac' : /Linux/.test(t) ? 'Linux' : '';
  return `${nav}${so ? ` · ${so}` : ''}`;
};
const MOTIVOS = { salir: 'Cerró sesión', inactividad: 'Por inactividad', revocada: 'Cerrada por admin' };

export default function AdminActividad() {
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(hoy());
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const cargar = async () => {
    setCargando(true);
    setError('');
    try {
      const resp = await fetch(`${API_URL}/api/admin/actividad?desde=${desde}&hasta=${hasta}`);
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error || `Error ${resp.status}`);
      setDatos(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const porUsuario = datos?.porUsuario || [];
  const activos = porUsuario.filter(u => u.sesiones > 0);
  const totalSeg = porUsuario.reduce((a, u) => a + (u.segundos || 0), 0);
  const totalCambios = porUsuario.reduce((a, u) => a + u.creados + u.modificados + u.eliminados + u.costeos, 0);
  const maxDia = Math.max(1, ...(datos?.porDia || []).map(d => d.segundos));

  const exportar = () => exportarExcel(`Analisis de uso ${desde} a ${hasta}`, [
    {
      nombre: 'Por usuario', titulo: 'Análisis de uso por usuario', subtitulo: `Del ${desde} al ${hasta}`,
      columnas: [
        { titulo: 'Usuario', clave: 'nombre', ancho: 28 }, { titulo: 'Correo', clave: 'email', ancho: 32 },
        { titulo: 'Rol', valor: u => (u.rol === 'admin' ? 'Administrador' : 'Usuario de área') }, { titulo: 'Áreas', valor: u => (u.areas || []).join(', '), ancho: 30 },
        { titulo: 'Sesiones', clave: 'sesiones', formato: 'entero' }, { titulo: 'Horas en la app', valor: u => (u.segundos || 0) / 3600, formato: 'numero' },
        { titulo: 'Min. promedio por sesión', valor: u => (u.sesiones ? (u.segundos || 0) / 60 / u.sesiones : 0), formato: 'numero' },
        { titulo: 'Pantallas abiertas', clave: 'vistas', formato: 'entero' },
        { titulo: 'Registros creados', clave: 'creados', formato: 'entero' }, { titulo: 'Modificados', clave: 'modificados', formato: 'entero' },
        { titulo: 'Eliminados', clave: 'eliminados', formato: 'entero' }, { titulo: 'Costeos guardados', clave: 'costeos', formato: 'entero' },
        { titulo: 'Último ingreso', clave: 'ultimo_ingreso', formato: 'fechahora', ancho: 18 }, { titulo: 'Último cambio', clave: 'ultimo_cambio', formato: 'fechahora', ancho: 18 },
      ],
      filas: porUsuario,
    },
    {
      nombre: 'Por módulo', titulo: 'Cambios por área y módulo',
      columnas: [
        { titulo: 'Área', clave: 'area', ancho: 22 }, { titulo: 'Módulo', clave: 'modulo', ancho: 28 }, { titulo: 'Cambios', clave: 'cambios', formato: 'entero' },
        { titulo: 'Usuarios', clave: 'usuarios', formato: 'entero' }, { titulo: 'Quiénes', clave: 'quienes', ancho: 50 }, { titulo: 'Último cambio', clave: 'ultimo', formato: 'fechahora', ancho: 18 },
      ],
      filas: datos?.porModulo || [],
    },
    {
      nombre: 'Por día', titulo: 'Uso por día',
      columnas: [{ titulo: 'Día', clave: 'dia', ancho: 12 }, { titulo: 'Usuarios', clave: 'usuarios', formato: 'entero' }, { titulo: 'Sesiones', clave: 'sesiones', formato: 'entero' }, { titulo: 'Horas', valor: d => d.segundos / 3600, formato: 'numero' }],
      filas: datos?.porDia || [],
    },
    {
      nombre: 'Sesiones', titulo: 'Sesiones (últimas 300)',
      columnas: [
        { titulo: 'Usuario', valor: s => s.nombre || s.email, ancho: 28 }, { titulo: 'Correo', clave: 'email', ancho: 30 }, { titulo: 'Inicio', clave: 'inicio', formato: 'fechahora', ancho: 18 },
        { titulo: 'Fin', clave: 'fin', formato: 'fechahora', ancho: 18 }, { titulo: 'Cómo terminó', valor: s => (s.fin ? MOTIVOS[s.motivo_fin] || s.motivo_fin : 'Abierta') },
        { titulo: 'Minutos activos', valor: s => s.segundos_activos / 60, formato: 'numero' }, { titulo: 'IP', clave: 'ip', ancho: 16 }, { titulo: 'Navegador', valor: s => navegadorCorto(s.navegador) },
      ],
      filas: datos?.sesiones || [],
    },
  ]).catch(e => alert(e.message));

  const tarjeta = (titulo, valor, color) => (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderTop: `3px solid ${color}`, borderRadius: '8px', padding: '14px 16px' }}>
      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{titulo}</div>
      <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{valor}</div>
    </div>
  );
  const th = { padding: '9px 10px', textAlign: 'left', fontSize: '11px', color: '#475569', textTransform: 'uppercase', borderBottom: '2px solid #cbd5e1', whiteSpace: 'nowrap', background: '#f8fafc' };
  const td = { padding: '8px 10px', borderBottom: '1px solid #e2e8f0', fontSize: '12.5px' };
  const num = { ...td, textAlign: 'right' };
  const caja = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', overflowX: 'auto', marginBottom: '18px' };
  const h3 = { fontSize: '15px', color: '#0f172a', margin: '0 0 8px' };

  return (
    <section style={{ flex: 1, padding: '24px', maxWidth: '1300px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Administración</div>
          <h2 style={{ margin: '4px 0 0', fontSize: '22px', color: '#0f172a' }}>📊 Análisis de uso</h2>
          <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '4px' }}>Quién ingresa, cuánto tiempo usa el sistema (solo tiempo activo) y qué información registra.</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>DESDE <input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></label>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>HASTA <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></label>
          <button type="button" onClick={cargar} disabled={cargando} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '7px 14px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>{cargando ? 'Cargando...' : 'Consultar'}</button>
          <button type="button" onClick={exportar} disabled={!datos} style={{ background: '#15803d', color: 'white', border: 'none', padding: '7px 14px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>📥 Exportar a Excel</button>
        </div>
      </div>

      {error && <div role="alert" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: '6px', marginBottom: '12px' }}>{error}</div>}

      {datos && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            {tarjeta('Usuarios que ingresaron', `${activos.length} de ${porUsuario.filter(u => u.activo).length}`, '#2563eb')}
            {tarjeta('Sesiones', activos.reduce((a, u) => a + u.sesiones, 0), '#0ea5e9')}
            {tarjeta('Tiempo total en la app', duracion(totalSeg), '#16a34a')}
            {tarjeta('Cambios en registros', totalCambios, '#f59e0b')}
          </div>

          <h3 style={h3}>Por usuario</h3>
          <div style={caja}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Usuario</th><th style={th}>Áreas</th><th style={{ ...th, textAlign: 'right' }}>Sesiones</th><th style={{ ...th, textAlign: 'right' }}>Tiempo en la app</th>
                <th style={{ ...th, textAlign: 'right' }}>Prom./sesión</th><th style={{ ...th, textAlign: 'right' }}>Creados</th><th style={{ ...th, textAlign: 'right' }}>Modificados</th>
                <th style={{ ...th, textAlign: 'right' }}>Eliminados</th><th style={{ ...th, textAlign: 'right' }}>Costeos</th><th style={th}>Último ingreso</th>
              </tr></thead>
              <tbody>
                {porUsuario.length === 0 && <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>Sin actividad en el período.</td></tr>}
                {porUsuario.map(u => (
                  <tr key={u.email} style={{ opacity: u.sesiones ? 1 : 0.55 }}>
                    <td style={td}><b>{u.nombre || u.email}</b><div style={{ fontSize: '11px', color: '#64748b' }}>{u.email}</div></td>
                    <td style={{ ...td, fontSize: '11.5px' }}>{u.rol === 'admin' ? 'Administrador' : (u.areas || []).join(', ') || '—'}</td>
                    <td style={num}>{u.sesiones}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{duracion(u.segundos)}</td>
                    <td style={num}>{u.sesiones ? duracion(u.segundos / u.sesiones) : '—'}</td>
                    <td style={num}>{u.creados}</td><td style={num}>{u.modificados}</td><td style={num}>{u.eliminados}</td><td style={num}>{u.costeos}</td>
                    <td style={td}>{fecha(u.ultimo_ingreso)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '18px' }}>
            <div>
              <h3 style={h3}>Uso por día</h3>
              <div style={{ ...caja, padding: '10px 14px' }}>
                {(datos.porDia || []).length === 0 && <div style={{ color: '#94a3b8', fontSize: '13px' }}>Sin sesiones en el período.</div>}
                {(datos.porDia || []).map(d => (
                  <div key={d.dia} style={{ display: 'grid', gridTemplateColumns: '84px 1fr 150px', gap: '10px', alignItems: 'center', fontSize: '12px', padding: '3px 0' }}>
                    <span style={{ color: '#475569' }}>{d.dia}</span>
                    <div style={{ background: '#eff6ff', borderRadius: '4px', height: '14px' }}><div style={{ width: `${(d.segundos / maxDia) * 100}%`, background: '#3b82f6', height: '100%', borderRadius: '4px' }} /></div>
                    <span style={{ textAlign: 'right', color: '#334155' }}>{duracion(d.segundos)} · {d.usuarios} usu.</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 style={h3}>Cambios por área y módulo</h3>
              <div style={caja}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Área / Módulo</th><th style={{ ...th, textAlign: 'right' }}>Cambios</th><th style={th}>Quiénes</th><th style={th}>Último</th></tr></thead>
                  <tbody>
                    {(datos.porModulo || []).length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>Sin cambios en el período.</td></tr>}
                    {(datos.porModulo || []).map(m => (
                      <tr key={`${m.area}-${m.modulo}`}>
                        <td style={td}><b>{m.modulo}</b><div style={{ fontSize: '11px', color: '#64748b' }}>{m.area}</div></td>
                        <td style={num}>{m.cambios}</td>
                        <td style={{ ...td, fontSize: '11.5px' }}>{m.quienes}</td>
                        <td style={{ ...td, fontSize: '11.5px' }}>{fecha(m.ultimo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <h3 style={h3}>Sesiones recientes</h3>
          <div style={caja}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Usuario</th><th style={th}>Inicio</th><th style={th}>Fin</th><th style={{ ...th, textAlign: 'right' }}>Tiempo activo</th><th style={th}>IP</th><th style={th}>Navegador</th></tr></thead>
              <tbody>
                {(datos.sesiones || []).map(s => (
                  <tr key={s.id}>
                    <td style={td}>{s.nombre || s.email}{s.metodo === 'desarrollo' && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#b45309' }}>(modo desarrollo)</span>}</td>
                    <td style={td}>{fecha(s.inicio)}</td>
                    <td style={td}>{s.fin ? `${fecha(s.fin)} · ${MOTIVOS[s.motivo_fin] || s.motivo_fin}` : <span style={{ color: '#16a34a', fontWeight: 600 }}>Abierta</span>}</td>
                    <td style={num}>{duracion(s.segundos_activos)}</td>
                    <td style={td}>{s.ip || '—'}</td>
                    <td style={td}>{navegadorCorto(s.navegador)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
