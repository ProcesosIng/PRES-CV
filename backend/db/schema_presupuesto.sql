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

-- CABECERA: un registro de cualquier módulo y área.
-- Los datos comunes van en columnas (para reportes); lo propio de cada módulo, en `datos`.
CREATE TABLE IF NOT EXISTS ppto_registros (
  id_registro      VARCHAR(255) PRIMARY KEY,
  id_version       VARCHAR(40)  NOT NULL REFERENCES ppto_versiones(id_version),
  area             VARCHAR(120) NOT NULL,
  modulo           VARCHAR(160) NOT NULL,
  tipo_registro    VARCHAR(20)  NOT NULL DEFAULT 'gasto',      -- gasto | costeo (formulario de apoyo) | forecast (ventas)
  id_lote          VARCHAR(255),                               -- agrupa un costeo con sus registros derivados
  fecha_proyeccion DATE,
  anio             SMALLINT,
  mes              SMALLINT,
  detalle          TEXT,                                       -- concepto / descripción
  nombre_referencia TEXT,                                      -- empleado, producto o insumo
  monto_total      NUMERIC(18,2) NOT NULL DEFAULT 0,
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

-- DETALLE: una fila por cuenta contable + mes + monto de cada registro.
-- Se regenera automáticamente cada vez que se guarda el registro.
CREATE TABLE IF NOT EXISTS ppto_registro_lineas (
  id              BIGSERIAL     PRIMARY KEY,
  id_registro     VARCHAR(255)  NOT NULL REFERENCES ppto_registros(id_registro) ON DELETE CASCADE,
  id_version      VARCHAR(40)   NOT NULL,
  area            VARCHAR(120)  NOT NULL,
  modulo          VARCHAR(160)  NOT NULL,
  tipo_registro   VARCHAR(20)   NOT NULL,
  fecha           DATE,
  anio            SMALLINT,
  mes             SMALLINT,
  cuenta_codigo   VARCHAR(40),                                 -- p. ej. 916121000
  cuenta_nombre   TEXT,                                        -- p. ej. Materias primas - Materias primas
  detalle         TEXT,
  monto           NUMERIC(18,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_ppto_lineas_registro ON ppto_registro_lineas (id_registro);
CREATE INDEX IF NOT EXISTS ix_ppto_lineas_reporte  ON ppto_registro_lineas (id_version, area, cuenta_codigo, anio, mes);

-- Vista para el REPORTE DE GASTOS: solo gastos (sin costeos ni forecast), sin eliminados.
--   SELECT area, cuenta_codigo, mes, SUM(monto) FROM v_ppto_gastos WHERE id_version = 'v1' GROUP BY 1,2,3;
CREATE OR REPLACE VIEW v_ppto_gastos AS
SELECT l.id_version, v.nombre AS version_nombre, l.area, l.modulo, l.anio, l.mes, l.fecha,
       l.cuenta_codigo, l.cuenta_nombre, l.detalle, r.nombre_referencia, l.monto,
       r.id_registro, r.es_derivado, r.creado_por, r.creado_en, r.actualizado_por, r.actualizado_en
  FROM ppto_registro_lineas l
  JOIN ppto_registros r ON r.id_registro = l.id_registro AND NOT r.eliminado
  JOIN ppto_versiones v ON v.id_version = l.id_version AND NOT v.eliminado
 WHERE l.tipo_registro = 'gasto';

-- FORECAST DE VENTAS: una fila por registro de forecast (producto + cliente) y mes.
-- Se regenera cada vez que se guarda el forecast. Montos en la moneda del forecast y en soles.
CREATE TABLE IF NOT EXISTS ppto_forecast_mensual (
  id                BIGSERIAL     PRIMARY KEY,
  id_registro       VARCHAR(255)  NOT NULL REFERENCES ppto_registros(id_registro) ON DELETE CASCADE,
  id_version        VARCHAR(40)   NOT NULL,
  anio              SMALLINT,
  mes               SMALLINT      NOT NULL,
  unidad_negocio    VARCHAR(120),
  codigo_producto   VARCHAR(80),
  producto          TEXT,
  presentacion      VARCHAR(80),                 -- Granel / Sachet (Fundente)
  cliente           TEXT,
  tipo_cliente      VARCHAR(80),
  vendedor          TEXT,
  zona              VARCHAR(40),                 -- Local / Exterior
  pais              VARCHAR(80),
  um                VARCHAR(40),
  moneda            VARCHAR(10),
  tipo_cambio       NUMERIC(12,4),
  cantidad          NUMERIC(18,4) NOT NULL DEFAULT 0,   -- cantidad proyectada del mes
  probabilidad      NUMERIC(6,2)  NOT NULL DEFAULT 100, -- % de probabilidad de la venta
  cantidad_esperada NUMERIC(18,4) NOT NULL DEFAULT 0,   -- cantidad x probabilidad
  precio_venta      NUMERIC(18,4) NOT NULL DEFAULT 0,
  costo_unitario    NUMERIC(18,4) NOT NULL DEFAULT 0,
  ingreso           NUMERIC(18,2) NOT NULL DEFAULT 0,   -- cantidad esperada x precio (en la moneda del forecast)
  costo             NUMERIC(18,2) NOT NULL DEFAULT 0,
  margen            NUMERIC(18,2) NOT NULL DEFAULT 0,
  ingreso_soles     NUMERIC(18,2) NOT NULL DEFAULT 0,
  costo_soles       NUMERIC(18,2) NOT NULL DEFAULT 0,
  margen_soles      NUMERIC(18,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_ppto_forecast_registro ON ppto_forecast_mensual (id_registro);
CREATE INDEX IF NOT EXISTS ix_ppto_forecast_reporte  ON ppto_forecast_mensual (id_version, anio, producto, mes);

-- Detalle del forecast sin eliminados (por producto, cliente y mes).
CREATE OR REPLACE VIEW v_ppto_forecast AS
SELECT f.*, v.nombre AS version_nombre, r.creado_por, r.actualizado_por, r.actualizado_en
  FROM ppto_forecast_mensual f
  JOIN ppto_registros r ON r.id_registro = f.id_registro AND NOT r.eliminado
  JOIN ppto_versiones v ON v.id_version = f.id_version AND NOT v.eliminado;

-- Totales por PRODUCTO y MES (suma de todos los clientes), en soles.
CREATE OR REPLACE VIEW v_ppto_forecast_producto_mes AS
SELECT id_version, anio, mes, unidad_negocio, codigo_producto, producto, um,
       SUM(cantidad)          AS cantidad,
       SUM(cantidad_esperada) AS cantidad_esperada,
       SUM(ingreso_soles)     AS ingreso_soles,
       SUM(costo_soles)       AS costo_soles,
       SUM(margen_soles)      AS margen_soles,
       CASE WHEN SUM(cantidad_esperada) > 0 THEN ROUND(SUM(ingreso_soles) / SUM(cantidad_esperada), 4) END AS precio_promedio_soles,
       CASE WHEN SUM(cantidad_esperada) > 0 THEN ROUND(SUM(costo_soles)   / SUM(cantidad_esperada), 4) END AS costo_promedio_soles
  FROM v_ppto_forecast
 GROUP BY id_version, anio, mes, unidad_negocio, codigo_producto, producto, um;

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
