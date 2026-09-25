-- =====================================================================
-- Corrige registros guardados con módulo "General" por error.
--
-- Algunos módulos (Atención al Personal, Examen Ocupacional, Seguros y
-- Suscripciones...) guardaban sus registros como "General" y por eso no
-- aparecían en su propio módulo. Este script los reasigna según la cuenta
-- contable (sin el prefijo de 2 dígitos del área).
--
-- PASO 1: ejecutar solo la consulta de diagnóstico y revisar el resultado.
-- PASO 2: completar/ajustar la tabla `mapa` y ejecutar el bloque de corrección.
-- =====================================================================

-- ---------- PASO 1: ¿qué registros hay en "General" y con qué cuentas? ----------
SELECT r.area, substring(l.cuenta_codigo FROM 3) AS cuenta_base, l.cuenta_nombre,
       count(DISTINCT r.id_registro) AS registros, sum(l.monto) AS monto
  FROM ppto_registros r
  JOIN ppto_registro_lineas l ON l.id_registro = r.id_registro
 WHERE r.modulo = 'General' AND NOT r.eliminado
 GROUP BY 1, 2, 3
 ORDER BY 1, 2;

-- ---------- PASO 2: reasignar el módulo según la cuenta base ----------
-- Ajusta la lista: cuenta base (7 dígitos, sin prefijo de área) -> nombre EXACTO del módulo.
BEGIN;

CREATE TEMP TABLE mapa (cuenta_base TEXT PRIMARY KEY, modulo TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO mapa VALUES
  ('6251000', 'Atencion al Personal'),
  ('6530000', 'Seguros, Suscripciones, Licencias y Regalias');
  -- ('XXXXXXX', 'Examen Ocupacional'),   <- completa con la cuenta que usas para exámenes

CREATE TEMP TABLE cambios ON COMMIT DROP AS
SELECT DISTINCT ON (r.id_registro) r.id_registro, m.modulo
  FROM ppto_registros r
  JOIN ppto_registro_lineas l ON l.id_registro = r.id_registro
  JOIN mapa m ON m.cuenta_base = substring(l.cuenta_codigo FROM 3)
 WHERE r.modulo = 'General';

UPDATE ppto_registros r
   SET modulo = c.modulo,
       datos = jsonb_set(jsonb_set(r.datos, '{modulo}', to_jsonb(c.modulo)), '{categoria}', to_jsonb(c.modulo)),
       rev = r.rev + 1, actualizado_en = now(), actualizado_por = 'corrección módulo General'
  FROM cambios c
 WHERE r.id_registro = c.id_registro;

UPDATE ppto_registro_lineas l
   SET modulo = c.modulo
  FROM cambios c
 WHERE l.id_registro = c.id_registro;

INSERT INTO ppto_auditoria (usuario, accion, tabla, detalle)
SELECT 'corrección módulo General', 'ACTUALIZAR', 'ppto_registros',
       count(*) || ' registros movidos de General a su módulo según la cuenta contable'
  FROM cambios;

SELECT modulo, count(*) AS registros_corregidos FROM cambios GROUP BY modulo;

COMMIT;
