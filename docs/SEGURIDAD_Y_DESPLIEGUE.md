# Seguridad, accesos y despliegue — Sistema de Presupuestos C&V

Este documento explica:

1. cómo funciona el login con Microsoft y cómo activarlo;
2. los permisos por usuario;
3. el análisis de uso;
4. el plan de seguridad para que nadie entre ni saque información;
5. por qué las URLs no cambian;
6. si conviene un servidor propio o la nube.

---

## 1. Login con Microsoft (Entra ID)

### Cómo funciona

```
Navegador ──(1) botón "Ingresar con Microsoft"──▶ login.microsoftonline.com
          ◀─(2) id_token firmado por Microsoft (con 2FA si su empresa lo exige)──
          ──(3) id_token──▶ Backend: valida firma, tenant y Client ID
                              ¿el correo está activo en "Usuarios y permisos"?
          ◀─(4) token de sesión propio (10 h máx., se corta a los 60 min sin uso)──
          ──(5) cada llamada lleva el token──▶ Backend revisa sesión + permisos en la BD
```

- **La contraseña nunca pasa por el sistema.** La maneja Microsoft, con su 2FA y sus políticas.
- **Además de tener cuenta de Microsoft, el correo tiene que estar habilitado en *Usuarios y permisos*.** Si no, el sistema responde "La cuenta no tiene acceso".
- **Cada petición se vuelve a validar en la base de datos.** Si desactivas a alguien o cierras sus sesiones, pierde el acceso al instante, aunque tenga la pestaña abierta.
- **El token se guarda en `sessionStorage`.** Al cerrar el navegador, la sesión termina.

### Pasos para activarlo (una sola vez, en el portal de Azure)

Lo hace quien administra Microsoft 365 en la empresa.

1. Entra a <https://entra.microsoft.com> → **Aplicaciones → Registros de aplicaciones → Nuevo registro**.
2. Completa el registro:
   - **Nombre:** `Presupuestos C&V`.
   - **Tipos de cuenta admitidos:** *Solo cuentas de este directorio organizativo* (un solo inquilino).
   - **URI de redirección:** plataforma **Aplicación de página única (SPA)** con la URL `http://localhost:5173`.
3. En **Autenticación**, agrega también la URL del frontend en Render (por ejemplo `https://presupuestos-cv.onrender.com`) como otra URI de la SPA.
4. Copia estos dos datos de **Información general**:
   - **Id. de directorio (inquilino)**, que va en `AZURE_TENANT_ID`;
   - **Id. de aplicación (cliente)**, que va en `AZURE_CLIENT_ID`.
5. Pasos recomendados:
   - **Aplicaciones empresariales → Presupuestos C&V → Propiedades → "¿Asignación necesaria?" = Sí**, y asigna solo a los usuarios o grupos que usarán el sistema. Es una doble barrera.
   - **Acceso condicional:** exigir MFA para esta aplicación. Opcionalmente, permitir solo equipos de la empresa o países permitidos.

**No se necesita "secreto de cliente".** La SPA usa PKCE; el backend solo verifica la firma pública de Microsoft.

### Variables del backend (`backend/.env`; en Render, en *Environment*)

| Variable | Qué es |
|---|---|
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` | Los dos datos del paso 4 |
| `APP_JWT_SECRET` | Texto aleatorio de 32+ caracteres. Se genera con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_EMAILS` | Tu correo (y el de otro administrador de respaldo). Siempre entran como administradores |
| `CORS_ORIGIN` | URL exacta del frontend en producción |
| `NODE_ENV=production` | En Render. Apaga el modo desarrollo y exige `APP_JWT_SECRET` |
| `AUTH_MODO=desarrollo` | **Solo en tu PC**, para probar sin Microsoft escribiendo el correo |

### Primer ingreso

1. Pon tu correo en `ADMIN_EMAILS` y reinicia el backend.
2. Entra con Microsoft (o con el modo desarrollo en tu PC).
3. Ve a **Administración → Usuarios y permisos** y crea a cada usuario:
   - correo de Microsoft;
   - DNI, que lo vincula con el empleado del maestro y muestra su nombre, área y puesto;
   - rol;
   - áreas.

---

## 2. Permisos

| Acción | Administrador | Usuario de área |
|---|---|---|
| Ver y editar registros | Todas las áreas | **Solo sus áreas** (el backend rechaza lo demás con 403) |
| Forecast de Ventas | Todo | Producción y Logística lo **leen** para sus costeos; no lo editan |
| Costeo de Embalajes | Todo | Producción lo lee; Logística escribe el embalaje en la cuenta 6142000 de cada centro (91/92/93) |
| Reportes consolidados | Todo | Solo con los datos de sus áreas |
| Estado de Resultados | Sí | No (es de toda la empresa) |
| Ejecutado de Odoo (gastos) | Todas las cuentas | Solo las cuentas de destino de su área (94 Adm., 95 Com., 98 Log., …) |
| Crear, editar o eliminar versiones | Sí | No |
| Maestros y sincronización con Odoo | Sí | No |
| Usuarios, permisos y análisis de uso | Sí | No |

Cada registro guarda **quién lo creó, quién lo modificó y cuándo**. El historial completo, con el valor anterior y el nuevo, está en `ppto_auditoria`.

---

## 3. Análisis de uso (Administración → Análisis de uso)

| Qué se mide | Cómo |
|---|---|
| Ingresos | Cada inicio de sesión (`ppto_sesiones`), con IP y navegador |
| Tiempo en la app | Solo cuenta mientras la pestaña está **visible** y la persona la usó en los últimos 5 min. Una pestaña olvidada no suma |
| Pantallas abiertas | Área, módulo o reporte visitado (`ppto_actividad`) |
| Información registrada | Creados, modificados, eliminados y costeos por usuario, y por área y módulo (desde la auditoría) |
| Accesos rechazados | Correos sin permiso o tokens inválidos quedan registrados como `rechazo` |

Se puede filtrar por fechas y exportar a Excel. Los rechazos todavía no tienen pantalla: se consultan en la tabla `ppto_actividad` (`tipo = 'rechazo'`).

---

## 4. Plan de seguridad

La seguridad se arma en capas: si una falla, la siguiente protege.

### Ya implementado en el código

- **Identidad:**
  - login con Microsoft (2FA y políticas de la empresa);
  - lista blanca de correos;
  - sesión de 10 h con cierre a los 60 min sin uso;
  - revocación inmediata.
- **Autorización en el servidor:** los permisos por área se validan en el backend, no solo en la pantalla. Aunque alguien modifique el navegador, el backend rechaza lo que no le corresponde.
- **Credenciales fuera del código:** `.env` en `.gitignore` y el historial de GitHub ya fue limpiado.
- **Límite de intentos de login:** 30 cada 15 min por IP.
- **Cabeceras de seguridad:**
  - `X-Frame-Options: DENY` (evita el clickjacking);
  - `nosniff`, `no-referrer`, `no-store`;
  - HSTS en producción.
- **CORS:** solo el dominio del frontend puede llamar a la API.
- **SQL parametrizado:** todas las consultas usan `$1, $2…`, lo que evita la inyección SQL.
- **Auditoría completa y borrado lógico:** se puede ver y restaurar lo que alguien borró.

### Pendiente (checklist recomendado, en orden)

1. **Odoo:**
   - crear en PostgreSQL un **usuario de solo lectura** para este sistema (`GRANT SELECT` solo a las tablas que usa);
   - abrir el puerto **solo a las IPs de salida de Render**, nunca a todo internet;
   - forzar **SSL** (`sslmode=require`).
2. **Base del presupuesto:**
   - en Render, usar la PostgreSQL administrada con conexión interna (no expuesta);
   - activar backups diarios y probar una restauración una vez al mes.
3. **Secretos:**
   - cambiar las contraseñas de las bases que estuvieron en el `.env` antiguo cuando sea posible;
   - guardar las nuevas solo en Render.
4. **Cuentas de administrador:** mínimo dos, ambas con MFA obligatorio.
5. **Errores:** en producción no devolver el detalle técnico de la base de datos al navegador. Hoy algunos endpoints de maestros lo hacen; hay que cambiarlo antes de salir a producción.
6. **Dependencias:** ejecutar `npm audit` una vez al mes y activar **Dependabot** en GitHub (Settings → Code security).
7. **GitHub:**
   - repositorio privado;
   - rama `main` protegida (solo por PR);
   - 2FA para todos los colaboradores;
   - activar *Secret scanning*.
8. **Monitoreo:**
   - revisar cada semana *Análisis de uso* y los `rechazo` de `ppto_actividad`;
   - alertas de Render por caídas.
9. **Política de datos:** el sistema guarda DNI y sueldos, que son datos personales según la **Ley 29733**. Conviene:
   - dar acceso mínimo;
   - mantener un registro de quién ve qué (ya existe);
   - definir cuánto tiempo se guardan las sesiones.
10. **Opcional, más adelante:**
    - WAF o Cloudflare delante del frontend;
    - restringir el acceso a la red de la empresa o VPN mediante Acceso condicional;
    - pentest externo antes de producción.

### Lo que un atacante NO puede hacer hoy

- Entrar sin una cuenta Microsoft de la empresa **y** sin estar habilitado en la lista.
- Leer o editar otra área cambiando la URL o el código del navegador: el backend lo bloquea.
- Reutilizar una sesión cerrada o de un usuario desactivado.
- Probar contraseñas por fuerza bruta: no hay contraseñas propias y el login tiene límite de intentos.

---

## 5. ¿Por qué la URL siempre es la misma (sin `/inicio/reportes`)?

**Hoy la app es de una sola página (SPA)** y la navegación se guarda en memoria (`vistaActual`, `areaSeleccionada`…), no en la URL. Por eso:

- la dirección no cambia al moverse entre áreas y módulos;
- **F5** vuelve al inicio;
- el botón **Atrás** del navegador sale de la app;
- no se puede compartir el link directo a un módulo.

Las URLs como `https://app/inicio/calidad/form1` salen de un **enrutador** (en React, *React Router*). Para tenerlas:

1. instalar `react-router-dom` y definir rutas como `/versiones`, `/v/:version/areas`, `/v/:version/:area/:modulo`, `/reportes/:pestaña` y `/admin/usuarios`;
2. cambiar los `setVistaActual(...)` por `navigate('/…')`;
3. en Render (Static Site) agregar la regla *Rewrite* `/* → /index.html`, para que al recargar una URL interna no dé 404.

**La URL no da acceso a nada por sí misma.** Aunque alguien escriba `/admin/usuarios`, el backend valida sesión y rol en cada llamada. Es una mejora de comodidad (links, F5, botón Atrás), no de seguridad.

---

## 6. ¿Servidor propio o nube?

| Criterio | Servidor propio (en la empresa) | Nube (Render u otro PaaS) |
|---|---|---|
| Costo inicial | Alto (servidor, UPS, licencias, instalación) | Casi cero |
| Costo mensual | Luz, internet con IP fija, mantenimiento y horas de TI | Pago por servicio, aprox. USD 20–60/mes para este tamaño (ver precios vigentes) |
| Quién mantiene el SO, parches y certificados | Tu equipo de TI | El proveedor |
| Disponibilidad | Depende de la luz e internet de la oficina | Centros de datos con redundancia |
| Backups | Hay que montarlos y probarlos | Automáticos (PostgreSQL administrada) |
| Acceso desde fuera de la oficina | Requiere abrir puertos o VPN; más superficie de ataque | Nativo (HTTPS) |
| Cercanía a Odoo | Máxima (misma red, sin abrir Odoo a internet) | Hay que abrir Odoo solo a las IPs de Render, con SSL y usuario de solo lectura |
| Control de los datos | Total, dentro de la empresa | En el proveedor (EE.UU./UE); revisar la política de datos personales |
| Escalar | Comprar hardware | Cambiar de plan con un clic |

**Recomendación:** empezar en la **nube (Render)**. El equipo es pequeño y la app necesita acceso desde cualquier lugar. Render ya resuelve HTTPS, backups, parches y disponibilidad sin personal dedicado.

El único punto delicado es **Odoo**. Si TI prefiere no exponerlo a internet, hay dos alternativas:

- **(a) Híbrido:** un pequeño servicio *sincronizador* dentro de la red de la empresa envía cada noche a la base de Render los maestros y los saldos ejecutados. Odoo nunca queda expuesto.
- **(b) Todo en un servidor propio:** conviene si la empresa ya tiene un servidor con TI que lo mantenga, con Nginx + HTTPS y backups externos.

Pasar de uno a otro es simple: la app es la misma y solo cambian las variables de entorno.

### Despliegue en Render (cuando se decida)

| Servicio | Qué es | Configuración clave |
|---|---|---|
| PostgreSQL | Base del presupuesto | Plan con backups; se usa la *Internal URL* |
| Web Service `backend` | `node index.js` | Variables de la sección 1 + `DB_LOCAL_*` + `ODOO_DB_*` + `NODE_ENV=production` |
| Static Site `frontend` | `npm run build` → `dist` | `VITE_API_URL=https://<backend>.onrender.com` y rewrite `/* → /index.html` |

Luego:

1. agregar la URL del frontend en Entra ID (paso 3 de la sección 1) y en `CORS_ORIGIN`;
2. pasar las IPs de salida de Render (*Settings → Outbound IPs*) al equipo que administra Odoo.
