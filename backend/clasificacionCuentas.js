// =====================================================================
// Clasificación de cuentas para el REPORTE DE GASTOS (ID, Grupo, Subgrupo).
//
// Se guarda en el maestro de cuentas (maestros_cuentas_local) en 3 campos
// propios que la sincronización con Odoo NO toca:
//   id_reporte · grupo_reporte · subgrupo_reporte
//
// La carga inicial viene del Excel "CUENTAS ODOO - PRESUPUESTOS"
// (db/clasificacion_cuentas_reporte.json) y SOLO llena las cuentas que aún no
// tienen clasificación: lo que se cambie a mano en el maestro se respeta.
// =====================================================================
const CLASIFICACION = require('./db/clasificacion_cuentas_reporte.json');

async function asegurarClasificacionCuentas(pool) {
  const tabla = await pool.query("SELECT to_regclass('public.maestros_cuentas_local') AS t");
  if (!tabla.rows[0].t) return { actualizadas: 0, omitido: 'No existe maestros_cuentas_local todavía' };

  await pool.query(`
    ALTER TABLE maestros_cuentas_local
      ADD COLUMN IF NOT EXISTS id_reporte TEXT,
      ADD COLUMN IF NOT EXISTS grupo_reporte TEXT,
      ADD COLUMN IF NOT EXISTS subgrupo_reporte TEXT`);

  const r = await pool.query(
    `UPDATE maestros_cuentas_local m
        SET id_reporte = v.id, grupo_reporte = v.grupo, subgrupo_reporte = v.subgrupo
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS v(codigo, id, grupo, subgrupo)
      WHERE m.codigo::text = v.codigo
        AND m.id_reporte IS NULL AND m.grupo_reporte IS NULL AND m.subgrupo_reporte IS NULL`,
    [CLASIFICACION.map(c => c[0]), CLASIFICACION.map(c => c[1]), CLASIFICACION.map(c => c[2]), CLASIFICACION.map(c => c[3])]
  );
  return { actualizadas: r.rowCount };
}

module.exports = { asegurarClasificacionCuentas };
