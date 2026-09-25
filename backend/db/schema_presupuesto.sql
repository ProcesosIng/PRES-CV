-- =====================================================================
-- Esquema de datos del sistema de presupuestos (reemplaza localStorage)
--
-- Jerarquía: Versión -> Área -> Módulo -> Registros
-- Cada registro guarda de qué versión, área y módulo proviene, quién lo
-- creó / modificó / eliminó y cuándo. El contenido completo del registro
-- (detalle_columnas, totales, desglose_contable, materiales...) vive en
-- `datos` (JSONB), porque cada módulo tiene campos distintos.
--
-- Es idempotente: se ejecuta al arrancar el backend y solo crea lo que falta.
-- =====================================================================

CREATE TABLE IF NOT EXISTS ppto_versiones (
  id_version       VARCHAR(40) PRIMARY KEY,
  nombre           TEXT        NOT NULL,
  estado           VARCHAR(20) NOT NULL DEFAULT 'Borrador',   -- Borrador | En revisión | Aprobado
  fecha_creacion   DATE        NOT NULL DEFAULT CURRENT_DATE,
  clonada_de       VARCHAR(40),
  rev              INTEGER     NOT NULL DEFAULT 1,             -- control de edición simultánea
  creado_por       TEXT,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por  TEXT,
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  eliminado        BOOLEAN     NOT NULL DEFAULT false,         -- borrado lógico (se puede restaurar)
  eliminado_por    TEXT,
  eliminado_en     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ppto_registros (
  id_registro      VARCHAR(255) PRIMARY KEY,
  id_version       VARCHAR(40)  NOT NULL REFERENCES ppto_versiones(id_version),
  area             VARCHAR(120) NOT NULL,
  modulo           VARCHAR(160) NOT NULL,
  id_lote          VARCHAR(255),                               -- agrupa un costeo con sus registros derivados
  fecha_proyeccion TEXT,
  es_derivado      BOOLEAN      NOT NULL DEFAULT false,        -- generado automáticamente por un costeo
  datos            JSONB        NOT NULL,                      -- registro completo tal como lo usa el frontend
  rev              INTEGER      NOT NULL DEFAULT 1,
  creado_por       TEXT,
  creado_en        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_por  TEXT,
  actualizado_en   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  eliminado        BOOLEAN      NOT NULL DEFAULT false,
  eliminado_por    TEXT,
  eliminado_en     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_ppto_registros_jerarquia ON ppto_registros (id_version, area, modulo) WHERE NOT eliminado;
CREATE INDEX IF NOT EXISTS ix_ppto_registros_lote      ON ppto_registros (id_lote) WHERE id_lote IS NOT NULL;

-- Historial de cambios: valor anterior y nuevo de cada creación, edición, eliminación o restauración.
CREATE TABLE IF NOT EXISTS ppto_auditoria (
  id           BIGSERIAL    PRIMARY KEY,
  fecha        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  usuario      TEXT,
  accion       VARCHAR(20)  NOT NULL,     -- CREAR | ACTUALIZAR | ELIMINAR | RESTAURAR | LOTE | IMPORTAR
  tabla        VARCHAR(40)  NOT NULL,     -- ppto_versiones | ppto_registros
  id_objeto    VARCHAR(255),
  id_version   VARCHAR(40),
  area         VARCHAR(120),
  modulo       VARCHAR(160),
  antes        JSONB,
  despues      JSONB,
  detalle      TEXT,
  ip           TEXT
);

CREATE INDEX IF NOT EXISTS ix_ppto_auditoria_fecha  ON ppto_auditoria (fecha DESC);
CREATE INDEX IF NOT EXISTS ix_ppto_auditoria_objeto ON ppto_auditoria (tabla, id_objeto);
