-- =====================================================================
-- ESQUEMA DE REFERENCIA — Sistema de Presupuestos C&V International
-- Jerarquía: Versión -> Área -> Módulo -> Registros
-- Este archivo NO se ejecuta desde el frontend. Es la base para cuando
-- el equipo construya el backend real (Postgres/MySQL). El store.js
-- (src/data/store.js) usa exactamente esta misma forma de datos sobre
-- localStorage, para que migrar a este esquema sea casi mecánico.
-- =====================================================================

-- Catálogo de versiones de presupuesto (escenarios: v1, v2, ajuste Q2...)
CREATE TABLE versiones (
  id_version      VARCHAR(20)  PRIMARY KEY,
  nombre          VARCHAR(120) NOT NULL,
  estado          VARCHAR(20)  NOT NULL DEFAULT 'Borrador', -- Borrador | En Revisión | Aprobado
  fecha_creacion  DATE         NOT NULL,
  clonada_de      VARCHAR(20)  NULL REFERENCES versiones(id_version)
);

-- Catálogo de áreas (hoy vive como objeto JS en config/data.js)
CREATE TABLE areas (
  id_area   VARCHAR(60) PRIMARY KEY,   -- 'Administración', 'Comercial', 'Producción Crisoles'...
  color     VARCHAR(9),
  icono     VARCHAR(10)
);

-- Catálogo de módulos (Remuneraciones, Uniforme - EPPs, Transporte...)
CREATE TABLE modulos (
  id_modulo   VARCHAR(80) PRIMARY KEY,
  prefijo     VARCHAR(5)  NOT NULL,    -- 'REM', 'EPP', 'TRP'... usado para generar id_registro
  icono       VARCHAR(10)
);

-- Reemplaza el objeto "modulosPermitidosPorArea" duplicado 7 veces en Dashboard.jsx
CREATE TABLE areas_modulos (
  id_area     VARCHAR(60) REFERENCES areas(id_area),
  id_modulo   VARCHAR(80) REFERENCES modulos(id_modulo),
  PRIMARY KEY (id_area, id_modulo)
);

CREATE TABLE empleados (
  dni       VARCHAR(15)  PRIMARY KEY,
  nombre    VARCHAR(150) NOT NULL,
  cargo     VARCHAR(80),
  area      VARCHAR(60)  REFERENCES areas(id_area),
  sueldo    DECIMAL(12,2),
  asig_fam  DECIMAL(12,2)
);

CREATE TABLE plan_cuentas (
  id_cuenta   VARCHAR(20)  PRIMARY KEY,  -- '946211000'
  nombre      VARCHAR(150) NOT NULL,
  grupo       VARCHAR(80),
  subgrupo    VARCHAR(80)
);

-- TABLA CENTRAL: una fila = un registro presupuestado, ya georreferenciado
-- dentro de la jerarquía versión / área / módulo.
CREATE TABLE registros (
  id_registro       VARCHAR(40)   PRIMARY KEY,
  id_lote           VARCHAR(40),          -- agrupa registros generados en un mismo guardado (ej. varias fechas a la vez)
  id_version        VARCHAR(20)   NOT NULL REFERENCES versiones(id_version),
  id_area           VARCHAR(60)   NOT NULL REFERENCES areas(id_area),
  id_modulo         VARCHAR(80)   NOT NULL REFERENCES modulos(id_modulo),
  fecha_proyeccion  DATE          NOT NULL,
  empleado_dni      VARCHAR(15)   REFERENCES empleados(dni),
  empleado_nombre   VARCHAR(150), -- desnormalizado a propósito: si el empleado cambia de nombre,
                                  -- no se reescribe el histórico de presupuestos ya aprobados
  distribucion_pct  DECIMAL(5,2)  DEFAULT 100,
  detalle_columnas  JSONB,        -- campos propios del módulo (sueldo_base, epp_nombre, cantidad, etc.)
  costo_total       DECIMAL(12,2) NOT NULL,
  creado_en         TIMESTAMP     DEFAULT now(),
  actualizado_en    TIMESTAMP     DEFAULT now()
);

-- Desglose contable de cada registro (1 registro puede afectar N cuentas)
CREATE TABLE registros_desglose (
  id_desglose   SERIAL PRIMARY KEY,
  id_registro   VARCHAR(40) REFERENCES registros(id_registro) ON DELETE CASCADE,
  id_cuenta     VARCHAR(20) REFERENCES plan_cuentas(id_cuenta),
  monto         DECIMAL(12,2) NOT NULL
);

-- Índices recomendados: toda la navegación de la UI filtra por estos 3 campos juntos
CREATE INDEX idx_registros_version_area_modulo ON registros (id_version, id_area, id_modulo);
CREATE INDEX idx_registros_fecha ON registros (fecha_proyeccion);
CREATE INDEX idx_registros_empleado ON registros (empleado_dni);
