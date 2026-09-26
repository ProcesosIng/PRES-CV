-- =====================================================================
-- SEGURIDAD: quién puede entrar, qué áreas ve y cuánto usa el sistema.
-- Idempotente: se ejecuta en cada arranque del backend.
-- =====================================================================

-- Usuarios con acceso. El correo es el de Microsoft (Entra ID); el DNI lo une con el empleado.
--   rol 'admin' -> ve y edita todo, administra usuarios, maestros y versiones.
--   rol 'area'  -> solo ve y edita las áreas de la columna `areas`.
CREATE TABLE IF NOT EXISTS ppto_usuarios_acceso (
  email           TEXT PRIMARY KEY,               -- siempre en minúsculas
  dni             VARCHAR(20),
  nombre          TEXT,
  rol             VARCHAR(10) NOT NULL DEFAULT 'area' CHECK (rol IN ('admin', 'area')),
  areas           TEXT[] NOT NULL DEFAULT '{}',
  activo          BOOLEAN NOT NULL DEFAULT true,
  ultimo_ingreso  TIMESTAMPTZ,
  creado_por      TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por TEXT,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_usuarios_acceso_dni ON ppto_usuarios_acceso (dni);

-- Cada ingreso al sistema. segundos_activos solo suma mientras la pestaña está visible y en uso.
CREATE TABLE IF NOT EXISTS ppto_sesiones (
  id               UUID PRIMARY KEY,
  email            TEXT NOT NULL,
  metodo           VARCHAR(20) NOT NULL,           -- 'microsoft' | 'desarrollo'
  inicio           TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_actividad TIMESTAMPTZ NOT NULL DEFAULT now(),
  fin              TIMESTAMPTZ,
  motivo_fin       VARCHAR(20),                    -- 'salir' | 'inactividad' | 'revocada'
  segundos_activos INTEGER NOT NULL DEFAULT 0,
  ip               TEXT,
  navegador        TEXT
);
CREATE INDEX IF NOT EXISTS ix_sesiones_email_inicio ON ppto_sesiones (email, inicio DESC);

-- Pantallas visitadas (área / módulo / reporte) y eventos de acceso (ingresos, rechazos).
CREATE TABLE IF NOT EXISTS ppto_actividad (
  id         BIGSERIAL PRIMARY KEY,
  id_sesion  UUID,
  email      TEXT,
  fecha      TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo       VARCHAR(20) NOT NULL,                 -- 'vista' | 'ingreso' | 'rechazo' | 'salida'
  area       TEXT,
  modulo     TEXT,
  detalle    TEXT,
  ip         TEXT
);
CREATE INDEX IF NOT EXISTS ix_actividad_fecha ON ppto_actividad (fecha DESC);
CREATE INDEX IF NOT EXISTS ix_actividad_email ON ppto_actividad (email, fecha DESC);
