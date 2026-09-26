import React, { useEffect, useMemo, useState } from 'react';
import { API_URL } from '../../config/api';
import { obtenerEmpleadosOdoo } from '../../data/store';

// Usuarios que pueden entrar al sistema y qué áreas ven.
//  - Administrador: todo (áreas, reportes consolidados, EERR, maestros, versiones, usuarios).
//  - Usuario de área: solo ve y edita sus áreas.
// El DNI une al usuario con el empleado del maestro (nombre, área y puesto de Odoo).
const VACIO = { email: '', dni: '', nombre: '', rol: 'area', areas: [], activo: true };

async function api(ruta, opciones = {}) {
  const resp = await fetch(`${API_URL}/api${ruta}`, { headers: { 'Content-Type': 'application/json' }, ...opciones });
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(datos.error || `Error ${resp.status}`);
  return datos;
}

const fecha = (v) => (v ? new Date(v).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function AdminUsuarios({ usuarioActual }) {
  const [datos, setDatos] = useState({ areas: [], usuarios: [], adminEmails: [] });
  const [empleados, setEmpleados] = useState([]);
  const [form, setForm] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = () => api('/admin/usuarios').then(setDatos).catch(e => setError(e.message));
  useEffect(() => {
    cargar();
    obtenerEmpleadosOdoo().then(l => setEmpleados(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);

  const empleadoPorDni = useMemo(() => {
    const m = new Map();
    empleados.forEach(e => { if (e.dni) m.set(String(e.dni).replace(/\D/g, ''), e); });
    return m;
  }, [empleados]);

  const filtrados = datos.usuarios.filter(u => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return true;
    return [u.email, u.nombre, u.dni, u.empleado_nombre, ...(u.areas || [])].some(v => String(v || '').toLowerCase().includes(t));
  });

  const alCambiarDni = (dni) => {
    const limpio = dni.replace(/\D/g, '');
    const emp = empleadoPorDni.get(limpio);
    setForm(f => ({ ...f, dni: limpio, nombre: f.nombre || (emp ? emp.nombre : '') }));
  };

  const alternarArea = (area) => setForm(f => ({ ...f, areas: f.areas.includes(area) ? f.areas.filter(a => a !== area) : [...f.areas, area] }));

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      await api('/admin/usuarios', { method: 'POST', body: JSON.stringify(form) });
      setForm(null);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const cerrarSesiones = async (email) => {
    if (!window.confirm(`¿Cerrar todas las sesiones abiertas de ${email}? Tendrá que volver a iniciar sesión.`)) return;
    try {
      const r = await api(`/admin/usuarios/${encodeURIComponent(email)}/cerrar-sesiones`, { method: 'POST' });
      alert(`Se cerraron ${r.cerradas} sesiones.`);
    } catch (err) { setError(err.message); }
  };

  const empleadoForm = form?.dni ? empleadoPorDni.get(form.dni) : null;
  const inp = { width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' };
  const th = { padding: '10px', textAlign: 'left', fontSize: '11px', color: '#475569', textTransform: 'uppercase', borderBottom: '2px solid #cbd5e1', whiteSpace: 'nowrap' };
  const td = { padding: '9px 10px', borderBottom: '1px solid #e2e8f0', fontSize: '12.5px', verticalAlign: 'top' };

  return (
    <section style={{ flex: 1, padding: '24px', maxWidth: '1300px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Administración</div>
          <h2 style={{ margin: '4px 0 0', fontSize: '22px', color: '#0f172a' }}>🛡️ Usuarios y permisos</h2>
          <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '4px' }}>
            Solo entran los correos de esta lista, con su cuenta de Microsoft. Un usuario de área ve y edita únicamente sus áreas.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input placeholder="Buscar nombre, correo, DNI o área..." value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ ...inp, width: '280px' }} />
          <button type="button" onClick={() => { setError(''); setForm({ ...VACIO }); }} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Nuevo usuario</button>
        </div>
      </div>

      {error && <div role="alert" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>{error}</div>}

      {form && (
        <form onSubmit={guardar} style={{ background: 'white', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '18px', marginBottom: '18px', boxShadow: '0 4px 12px rgba(37,99,235,0.08)' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '15px', color: '#1e3a8a' }}>{datos.usuarios.some(u => u.email === form.email) ? 'Editar usuario' : 'Nuevo usuario'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>CORREO MICROSOFT *
              <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value.trim().toLowerCase() })} style={inp} placeholder="nombre@cvinternational.com.pe" />
            </label>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>DNI (vincula con el empleado)
              <input list="dni-empleados" value={form.dni || ''} onChange={e => alCambiarDni(e.target.value)} style={inp} placeholder="Ej. 45678912" />
              <datalist id="dni-empleados">
                {empleados.filter(e => e.dni).slice(0, 2000).map(e => <option key={`${e.dni}-${e.id_odoo || e.nombre}`} value={String(e.dni).replace(/\D/g, '')}>{e.nombre} · {e.area}</option>)}
              </datalist>
              {form.dni && (
                <div style={{ fontSize: '11px', fontWeight: 500, marginTop: '4px', color: empleadoForm ? '#15803d' : '#b45309' }}>
                  {empleadoForm ? `✔ ${empleadoForm.nombre} · ${empleadoForm.area || 'Sin área'} · ${empleadoForm.puesto || ''}` : 'No hay un empleado con ese DNI en el maestro'}
                </div>
              )}
            </label>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>NOMBRE
              <input value={form.nombre || ''} onChange={e => setForm({ ...form, nombre: e.target.value })} style={inp} placeholder="Se completa con el empleado" />
            </label>
          </div>

          <div style={{ display: 'flex', gap: '18px', margin: '16px 0 10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>ROL</span>
            <label style={{ fontSize: '13px' }}><input type="radio" checked={form.rol === 'admin'} onChange={() => setForm({ ...form, rol: 'admin' })} /> Administrador (todo)</label>
            <label style={{ fontSize: '13px' }}><input type="radio" checked={form.rol === 'area'} onChange={() => setForm({ ...form, rol: 'area' })} /> Usuario de área</label>
            <label style={{ fontSize: '13px', marginLeft: 'auto' }}><input type="checkbox" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} /> Activo (puede ingresar)</label>
          </div>

          {form.rol === 'area' && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
              {datos.areas.map(a => (
                <label key={a} style={{ fontSize: '12.5px', padding: '6px 10px', borderRadius: '999px', cursor: 'pointer', border: `1px solid ${form.areas.includes(a) ? '#2563eb' : '#cbd5e1'}`, background: form.areas.includes(a) ? '#eff6ff' : 'white' }}>
                  <input type="checkbox" checked={form.areas.includes(a)} onChange={() => alternarArea(a)} style={{ marginRight: '6px' }} />{a}
                </label>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
            <button type="button" onClick={() => setForm(null)} className="btn-ghost">Cancelar</button>
            <button type="submit" disabled={guardando} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '8px 18px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>{guardando ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      )}

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f8fafc' }}>
            <tr>
              <th style={th}>Usuario</th><th style={th}>DNI / Empleado</th><th style={th}>Rol</th><th style={th}>Áreas</th>
              <th style={th}>Estado</th><th style={th}>Último ingreso</th><th style={th}>Modificado por</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: '24px' }}>No hay usuarios registrados.</td></tr>}
            {filtrados.map(u => (
              <tr key={u.email} style={{ opacity: u.activo ? 1 : 0.55 }}>
                <td style={td}><b>{u.nombre || '—'}</b><div style={{ color: '#64748b', fontSize: '11.5px' }}>{u.email}</div></td>
                <td style={td}>{u.dni || '—'}{u.empleado_nombre && <div style={{ color: '#64748b', fontSize: '11.5px' }}>{u.empleado_nombre} · {u.empleado_area}</div>}</td>
                <td style={td}>{u.rol === 'admin' ? <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>Administrador</span> : 'Usuario de área'}</td>
                <td style={td}>{u.rol === 'admin' ? 'Todas' : (u.areas || []).join(', ')}</td>
                <td style={td}>{u.activo ? '🟢 Activo' : '⛔ Inactivo'}</td>
                <td style={td}>{fecha(u.ultimo_ingreso)}</td>
                <td style={td}>{u.actualizado_por || '—'}<div style={{ color: '#94a3b8', fontSize: '11px' }}>{fecha(u.actualizado_en)}</div></td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn-ghost" onClick={() => { setError(''); setForm({ email: u.email, dni: u.dni || '', nombre: u.nombre || '', rol: u.rol, areas: u.areas || [], activo: u.activo }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</button>
                  {u.email !== usuarioActual?.email && <button type="button" className="btn-ghost" onClick={() => cerrarSesiones(u.email)} title="Cierra sus sesiones abiertas">Cerrar sesiones</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {datos.adminEmails.length > 0 && (
        <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '10px' }}>
          Administradores fijos del servidor (ADMIN_EMAILS): {datos.adminEmails.join(', ')}. Siempre pueden ingresar como administradores.
        </div>
      )}
    </section>
  );
}
