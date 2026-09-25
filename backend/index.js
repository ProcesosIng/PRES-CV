const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();
const { crearRouterPresupuesto, inicializarEsquemaPresupuesto } = require('./presupuesto');

const app = express();
// CORS_ORIGIN (separado por comas) limita qué dominios pueden llamar a la API; sin definir, se permite todo (desarrollo).
const origenesPermitidos = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors(origenesPermitidos.length ? { origin: origenesPermitidos } : undefined));
// Los costeos envían sus registros derivados en un solo lote: se sube el límite por defecto (100kb).
app.use(express.json({ limit: '15mb' }));

// Configuración de conexiones a las bases de datos leyendo tu .env actual
const dbCorp = new Pool({
  user: process.env.ODOO_DB_USER,
  host: process.env.ODOO_DB_HOST,
  database: process.env.ODOO_DB_NAME,
  password: process.env.ODOO_DB_PASSWORD,
  port: parseInt(process.env.ODOO_DB_PORT || 5432),
});

const dbLocal = new Pool({
  user: process.env.DB_LOCAL_USER,
  host: process.env.DB_LOCAL_HOST,
  database: process.env.DB_LOCAL_NAME,
  password: process.env.DB_LOCAL_PASSWORD,
  port: parseInt(process.env.DB_LOCAL_PORT || 5433),
});

// Versiones, registros (CRUD) e historial de cambios del presupuesto
app.use('/api', crearRouterPresupuesto(dbLocal));

// =====================================================================
// PRUEBA DE CONEXIÓN DE DIAGNÓSTICO
// =====================================================================
async function probarConexiones() {
  try {
    await dbCorp.query('SELECT 1 AS ok');
    console.log('✅ dbCorp (Odoo) conectada correctamente al host');
  } catch (err) {
    console.error('❌ Falló conexión a dbCorp (Odoo)', err.message);
  }

  try {
    await dbLocal.query('SELECT 1 AS ok');
    console.log('✅ dbLocal conectada correctamente al host');
  } catch (err) {
    console.error('❌ Falló conexión a dbLocal:', err.message);
  }
}

// =====================================================================
// FUNCIÓN CENTRAL DE SINCRONIZACIÓN MASIVA (ETL)
// =====================================================================
async function sincronizarMaestros() {
  console.log('🔄 Iniciando sincronización masiva con Odoo...');

  try {
    // Función auxiliar robusta para extraer el texto limpio si Odoo envía un JSON en formato texto o un objeto
    const limpiarTextoOdoo = (valor, porDefecto) => {
      if (!valor) return porDefecto;
      
      // Si es un objeto nativo de Postgres (JSON/JSONB)
      if (typeof valor === 'object' && valor !== null) {
        return valor.es_PE || valor.es_ES || valor.en_US || Object.values(valor)[0] || porDefecto;
      }

      // Si el texto parece un JSON (empieza con { y termina con })
      if (typeof valor === 'string' && valor.trim().startsWith('{') && valor.trim().endsWith('}')) {
        try {
          const obj = JSON.parse(valor);
          return obj.es_PE || obj.es_ES || obj.en_US || Object.values(obj)[0] || porDefecto;
        } catch (e) {
          return valor; // Si falla el parseo, devuelve el texto original
        }
      }
      return String(valor);
    };

    // 1. SINCRONIZAR PRODUCTOS
    const queryOdooProductos = `
      SELECT DISTINCT ON (pp.id)
        pp.id AS id_variante,
        pt.id AS template_id,
        COALESCE(pp.default_code, pt.default_code, '-') AS codigo,
        
        -- Descripción segura (soporta texto plano o JSON de Odoo)
        COALESCE(
          CASE 
            WHEN pg_typeof(pt.name)::text = 'json' OR pg_typeof(pt.name)::text = 'jsonb' 
              THEN COALESCE(pt.name->>'es_PE', pt.name->>'es_ES', pt.name::text)
            ELSE pt.name::text
          END, 
          'Sin Nombre'
        ) AS descripcion,
        
        -- Unidad segura
        COALESCE(
          CASE 
            WHEN pg_typeof(uom.name)::text = 'json' OR pg_typeof(uom.name)::text = 'jsonb' 
              THEN COALESCE(uom.name->>'es_PE', uom.name->>'es_ES', uom.name::text)
            ELSE uom.name::text
          END, 
          'Unidad'
        ) AS unidad,
        
        -- PRECIO DE CATÁLOGO BASE
        COALESCE(pt.list_price, 0) AS precio_catalogo,

        -- 1. ÚLTIMO PRECIO DE VENTA (Desde 2026) — convertido a la moneda de la compañía (PEN)
        COALESCE(
          (
            SELECT (sol.price_unit * COALESCE(uom_line.factor, 1.0) / COALESCE(uom_base.factor, 1.0))
                  / NULLIF(COALESCE(
                      (
                        SELECT cr.rate 
                        FROM public.res_currency_rate cr
                        WHERE cr.currency_id = so.currency_id
                          AND cr.name <= so.date_order::date
                        ORDER BY cr.name DESC 
                        LIMIT 1
                      ), 1.0
                    ), 0)
            FROM public.sale_order_line sol
            JOIN public.sale_order so ON so.id = sol.order_id
            LEFT JOIN public.uom_uom uom_line ON uom_line.id = sol.product_uom
            LEFT JOIN public.uom_uom uom_base ON uom_base.id = pt.uom_id
            WHERE sol.product_id = pp.id 
              AND so.state IN ('sale', 'done')
              AND sol.price_unit > 0
              AND so.date_order >= '2026-01-01 00:00:00'
            ORDER BY so.date_order DESC, sol.id DESC 
            LIMIT 1
          ), COALESCE(pt.list_price, 0)
        ) AS ultimo_precio_venta,

        -- 2. PRECIO PROMEDIO DE VENTA (Desde 2026) — convertido a la moneda de la compañía (PEN)
        COALESCE(
          (
            SELECT ROUND(
              AVG(
                (sol.price_unit * COALESCE(uom_line.factor, 1.0) / COALESCE(uom_base.factor, 1.0))
                / NULLIF(COALESCE(
                    (
                      SELECT cr.rate 
                      FROM public.res_currency_rate cr
                      WHERE cr.currency_id = so.currency_id
                        AND cr.name <= so.date_order::date
                      ORDER BY cr.name DESC 
                      LIMIT 1
                    ), 1.0
                  ), 0)
              ), 4
            )
            FROM public.sale_order_line sol
            JOIN public.sale_order so ON so.id = sol.order_id
            LEFT JOIN public.uom_uom uom_line ON uom_line.id = sol.product_uom
            LEFT JOIN public.uom_uom uom_base ON uom_base.id = pt.uom_id
            WHERE sol.product_id = pp.id 
              AND so.state IN ('sale', 'done')
              AND sol.price_unit > 0
              AND so.date_order >= '2026-01-01 00:00:00'
          ), COALESCE(pt.list_price, 0)
        ) AS precio_promedio_venta,

        -- 3. COSTO EN UNIDAD BASE (última salida real de almacén: venta o consumo)
        COALESCE(
          (
            SELECT ABS(svl.unit_cost)
            FROM public.stock_valuation_layer svl
            WHERE svl.product_id = pp.id
              AND svl.quantity < 0
              AND svl.unit_cost IS NOT NULL
            ORDER BY svl.create_date DESC, svl.id DESC
            LIMIT 1
          ), 0
        ) AS costo,
        
        -- CATEGORÍA 
        COALESCE(
          NULLIF(concat_ws(' - ', parent_cat.name::text, cat.name::text), ''), 
          'Sin Categoría'
        ) AS categoria

      FROM public.product_product pp
      JOIN public.product_template pt ON pp.product_tmpl_id = pt.id
      LEFT JOIN public.uom_uom uom ON pt.uom_id = uom.id
      LEFT JOIN public.product_category cat ON pt.categ_id = cat.id
      LEFT JOIN public.product_category parent_cat ON cat.parent_id = parent_cat.id
      WHERE pt.active = true 
        AND pp.active = true
        AND pt.detailed_type = 'product'
        AND (
          (pp.default_code IS NOT NULL AND TRIM(pp.default_code) != '') 
          OR 
          (pt.default_code IS NOT NULL AND TRIM(pt.default_code) != '')
        )
      ORDER BY pp.id ASC;
    `;
    const resOdooProd = await dbCorp.query(queryOdooProductos);

    for (let p of resOdooProd.rows) {
      const nombreLimpio = limpiarTextoOdoo(p.descripcion, 'Sin Nombre');
      const unidadLimpia = limpiarTextoOdoo(p.unidad, 'Unidad');
      const categoriaLimpia = limpiarTextoOdoo(p.categoria, 'Sin Categoría');
      const codigoSeguro = p.codigo && p.codigo.trim() !== '' ? p.codigo : '-';

      await dbLocal.query(`
        INSERT INTO public.maestros_productos_local 
          (id_odoo, nombre, codigo, precio_venta, ultimo_precio_venta, precio_promedio_venta, costo, unidad, categoria, modificado_manualmente)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)
        ON CONFLICT (id_odoo) DO UPDATE SET 
          nombre = EXCLUDED.nombre, 
          codigo = COALESCE(NULLIF(maestros_productos_local.codigo, '-'), EXCLUDED.codigo), -- Protege el SKU si ya existía
          -- 🛑 SI 'modificado_manualmente' ES TRUE, ODOO NO Toca el precio de venta local:
          precio_venta = CASE 
            WHEN maestros_productos_local.modificado_manualmente = TRUE THEN maestros_productos_local.precio_venta 
            ELSE EXCLUDED.precio_venta 
          END,
          ultimo_precio_venta = EXCLUDED.ultimo_precio_venta,
          precio_promedio_venta = EXCLUDED.precio_promedio_venta,
          costo = EXCLUDED.costo, 
          unidad = EXCLUDED.unidad,
          categoria = EXCLUDED.categoria,
          actualizado_at = CURRENT_TIMESTAMP;
      `, [
        p.template_id, 
        nombreLimpio, 
        codigoSeguro, 
        p.precio_catalogo || 0, 
        p.ultimo_precio_venta || 0, 
        p.precio_promedio_venta || 0, 
        p.costo || 0, 
        unidadLimpia, 
        categoriaLimpia
      ]);
    }

    // 2. SINCRONIZAR CLIENTES
    const queryOdooClientes = `
      SELECT DISTINCT 
        rp.id AS id_cliente,
        COALESCE(rp.vat, '-') AS ruc,
        COALESCE(rp.name, '-') AS nombre,
        COALESCE(rp.city, 'Sin zona') AS ciudad,
        COALESCE(u.name, 'Sin vendedor') AS vendedor,
        COALESCE(rc.name::text, 'Perú') AS pais,
        CASE 
          WHEN LOWER(COALESCE(rc.name::text, 'peru')) LIKE '%peru%' 
            THEN 'Local'
          ELSE 'Exterior'
        END AS zona,
        CASE 
          WHEN rp.is_company = true THEN 'Empresa'
          ELSE 'Persona Natural'
        END AS tipo
      FROM public.res_partner rp
      LEFT JOIN public.res_users ru ON ru.id = rp.user_id
      LEFT JOIN public.res_partner u ON u.id = ru.partner_id
      LEFT JOIN public.res_country rc ON rc.id = rp.country_id
      WHERE rp.is_company = true 
        AND rp.vat IS NOT NULL
        AND LENGTH(TRIM(rp.vat)) > 8 
        AND EXISTS (
          SELECT 1 
          FROM public.account_move am 
          WHERE am.partner_id = rp.id 
            AND am.move_type = 'out_invoice'
        )
      ORDER BY nombre ASC;
    `;
    const resOdooCli = await dbCorp.query(queryOdooClientes);

    for (let c of resOdooCli.rows) {
      const nombreCliLimpio = limpiarTextoOdoo(c.nombre, '-');
      const paisLimpio = limpiarTextoOdoo(c.pais, 'Perú');
      const vendedorLimpio = limpiarTextoOdoo(c.vendedor, 'Sin vendedor');

      await dbLocal.query(`
        INSERT INTO maestros_clientes_local (id_odoo, nombre, ruc, zona, vendedor, pais, tipo)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id_odoo) 
        DO UPDATE SET nombre = EXCLUDED.nombre, 
                    ruc = EXCLUDED.ruc, 
                    zona = EXCLUDED.zona, 
                    vendedor = EXCLUDED.vendedor, 
                    pais = EXCLUDED.pais, 
                    tipo = EXCLUDED.tipo,
                    actualizado_at = CURRENT_TIMESTAMP;
      `, [c.id_cliente, nombreCliLimpio, c.ruc, c.zona, vendedorLimpio, paisLimpio, c.tipo]);
    }

    // 3. SINCRONIZAR EMPLEADOS (Con enlace correcto al puesto de trabajo)
    const queryOdooEmpleados = `
      SELECT 
        he.id AS id_empleado,
        COALESCE(he.name, 'Sin Nombre') AS nombre,
        COALESCE(he.zk_user_id, he.ssnid, he.sinid) AS dni,
        COALESCE(hj.name::text, he.job_title, 'Sin Puesto') AS puesto,
        COALESCE(hd.name::text, 'Sin Área') AS area
      FROM public.hr_employee he
      LEFT JOIN public.hr_job hj ON hj.id = he.job_id
      LEFT JOIN public.hr_department hd ON hd.id = he.department_id
      WHERE (he.zk_user_id IS NOT NULL AND he.zk_user_id != '')
         OR (he.ssnid IS NOT NULL AND he.ssnid != '')
         OR (he.sinid IS NOT NULL AND he.sinid != '')
      GROUP BY he.id, he.name, he.zk_user_id, he.ssnid, he.sinid, hj.name, he.job_title, hd.name
      ORDER BY nombre ASC;
    `;
    const resOdooEmp = await dbCorp.query(queryOdooEmpleados);

    for (let e of resOdooEmp.rows) {
      const nombreEmpLimpio = limpiarTextoOdoo(e.nombre, 'Sin Nombre');
      const puestoLimpio = limpiarTextoOdoo(e.puesto, 'Sin Puesto');
      const areaLimpia = limpiarTextoOdoo(e.area, 'Sin Área');

      await dbLocal.query(`
        INSERT INTO maestros_empleados_local (id_odoo, nombre, dni, puesto, area)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id_odoo) 
        DO UPDATE SET nombre = EXCLUDED.nombre, 
                    dni = EXCLUDED.dni, 
                    puesto = EXCLUDED.puesto, 
                    area = EXCLUDED.area,
                    actualizado_at = CURRENT_TIMESTAMP;
      `, [e.id_empleado, nombreEmpLimpio, e.dni, puestoLimpio, areaLimpia]);
    }

    // 4. SINCRONIZAR CUENTAS CONTABLES
    const queryOdooCuentas = `
      SELECT 
        aa.id AS id_cuenta,
        aa.code AS codigo,
        aa.name AS nombre,
        aa.account_type AS tipo_interno,
        CASE aa.account_type
          WHEN 'asset_receivable' THEN 'Por cobrar'
          WHEN 'asset_cash' THEN 'Banco y efectivo'
          WHEN 'asset_current' THEN 'Activos Circulantes'
          WHEN 'asset_non_current' THEN 'Activos no-circulantes'
          WHEN 'asset_prepayments' THEN 'Pre-pagos'
          WHEN 'asset_fixed' THEN 'Activos Fijos'
          WHEN 'liability_payable' THEN 'Por pagar'
          WHEN 'liability_credit_card' THEN 'Tarjeta de Crédito'
          WHEN 'liability_current' THEN 'Pasivos Circulantes'
          WHEN 'liability_non_current' THEN 'Pasivos no-circulantes'
          WHEN 'equity' THEN 'Capital'
          WHEN 'equity_unaffected' THEN 'Ganancias del año actual'
          WHEN 'income' THEN 'Ingreso'
          WHEN 'income_other' THEN 'Otro Ingreso'
          WHEN 'expense' THEN 'Gastos'
          WHEN 'expense_depreciation' THEN 'Depreciación'
          WHEN 'expense_direct_cost' THEN 'Costo de ingresos'
          WHEN 'off_balance' THEN 'Hoja fuera de balance'
          ELSE aa.account_type
        END AS categoria,
        ag.name AS grupo_nombre,
        aj.name AS diario_nombre
      FROM public.account_account aa
      LEFT JOIN public.account_group ag ON ag.id = aa.group_id
      LEFT JOIN public.account_journal aj ON aj.default_account_id = aa.id
      ORDER BY aa.code ASC;
    `;
    const resOdooCuentas = await dbCorp.query(queryOdooCuentas);

    for (let cta of resOdooCuentas.rows) {
      const nombreCtaLimpio = limpiarTextoOdoo(cta.nombre, '-');
      const grupoLimpio = limpiarTextoOdoo(cta.grupo_nombre, 'Sin Grupo');
      const diarioLimpio = limpiarTextoOdoo(cta.diario_nombre, 'Sin Diario');

      await dbLocal.query(`
        INSERT INTO maestros_cuentas_local (id_odoo, codigo, nombre, categoria, grupo, diario)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id_odoo) 
        DO UPDATE SET codigo = EXCLUDED.codigo, 
                    nombre = EXCLUDED.nombre, 
                    categoria = EXCLUDED.categoria, 
                    grupo = EXCLUDED.grupo, 
                    diario = EXCLUDED.diario,
                    actualizado_at = CURRENT_TIMESTAMP;
      `, [
        cta.id_cuenta, 
        cta.codigo, 
        nombreCtaLimpio, 
        cta.categoria, 
        grupoLimpio, 
        diarioLimpio
      ]);
    }

    // 5. SINCRONIZAR USUARIOS
    const queryOdooUsuarios = `
      SELECT 
        ru.id AS id_usuario,
        COALESCE(rp.name, 'Sin Nombre') AS nombre,
        COALESCE(ru.login, rp.email, '-') AS email_o_login,
        ru.active AS activo
      FROM public.res_users ru
      JOIN public.res_partner rp ON rp.id = ru.partner_id
      WHERE ru.active = true
      ORDER BY rp.name ASC;
    `;
    const resOdooUsuarios = await dbCorp.query(queryOdooUsuarios);

    for (let usr of resOdooUsuarios.rows) {
      const nombreUsrLimpio = limpiarTextoOdoo(usr.nombre, 'Sin Nombre');

      await dbLocal.query(`
        INSERT INTO maestros_usuarios_local (id_odoo, login, nombre, email, activo)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id_odoo) 
        DO UPDATE SET login = EXCLUDED.login, 
                    nombre = EXCLUDED.nombre, 
                    email = EXCLUDED.email, 
                    activo = EXCLUDED.activo, 
                    actualizado_at = CURRENT_TIMESTAMP;
      `, [usr.id_usuario, usr.email_o_login, nombreUsrLimpio, usr.email_o_login, usr.activo]);
    }

    // 6. SINCRONIZAR UOMS
    const queryOdooUom = `
      SELECT 
        u.id AS id_odoo,
        COALESCE(
          CASE 
            WHEN pg_typeof(u.name)::text = 'json' OR pg_typeof(u.name)::text = 'jsonb' 
              THEN COALESCE(u.name->>'es_PE', u.name->>'es_ES', u.name->>'en_US', u.name::text)
            ELSE u.name::text
          END, 
          'Unidad'
        ) AS nombre,
        COALESCE(cat.name::text, 'General') AS categoria,
        u.active
      FROM public.uom_uom u
      LEFT JOIN public.uom_category cat ON u.category_id = cat.id;
    `;
    const resOdooUom = await dbCorp.query(queryOdooUom);

    for (let u of resOdooUom.rows) {
      await dbLocal.query(`
        INSERT INTO public.maestros_unidades_local (id_odoo, nombre, categoria, activo)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id_odoo) DO UPDATE SET 
          nombre = EXCLUDED.nombre, 
          categoria = EXCLUDED.categoria,
          activo = EXCLUDED.activo,
          actualizado_at = CURRENT_TIMESTAMP;
      `, [u.id_odoo, u.nombre, u.categoria, u.active]);
    }

    // 7. SINCRONIZAR FÓRMULAS / BOM
    const queryOdooFormulas = `
      SELECT 
        mb.id AS bom_id, 
        mb.code AS codigo_formula, 
        mb.product_qty AS cantidad_base, 
        COALESCE(pt_bom.name::text, 'Producto') AS producto_final, 
        mbl.id AS linea_id, 
        COALESCE(pt_comp.name::text, 'Componente') AS componente_nombre, 
        mbl.product_qty AS cantidad_componente, 
        COALESCE(uom.name::text, 'Unidad') AS unidad_medida
      FROM mrp_bom mb 
      INNER JOIN product_template pt_bom ON mb.product_tmpl_id = pt_bom.id 
      INNER JOIN mrp_bom_line mbl ON mbl.bom_id = mb.id 
      INNER JOIN product_product pp_comp ON mbl.product_id = pp_comp.id 
      INNER JOIN product_template pt_comp ON pp_comp.product_tmpl_id = pt_comp.id 
      LEFT JOIN uom_uom uom ON mbl.product_uom_id = uom.id
      ORDER BY mb.id ASC, mbl.id ASC;
    `;
    const resOdooFormulas = await dbCorp.query(queryOdooFormulas);

    const formulasMap = new Map();
    for (let row of resOdooFormulas.rows) {
      const productoFinalLimpio = limpiarTextoOdoo(row.producto_final, 'Producto');
      const componenteLimpio = limpiarTextoOdoo(row.componente_nombre, 'Componente');
      const unidadMedidaLimpia = limpiarTextoOdoo(row.unidad_medida, 'Unidad');

      if (!formulasMap.has(row.bom_id)) {
        formulasMap.set(row.bom_id, {
          codigo: row.codigo_formula || `BOM-${row.bom_id}`,
          producto: productoFinalLimpio, 
          cantidad_base: row.cantidad_base || 1,
          lineas: []
        });
      }
      formulasMap.get(row.bom_id).lineas.push({
        linea_id: row.linea_id,
        componente: componenteLimpio, 
        cantidad: row.cantidad_componente || 0,
        unidad: unidadMedidaLimpia 
      });
    }

    for (let [bomId, data] of formulasMap.entries()) {
      await dbLocal.query(`
        INSERT INTO maestros_formulas_local (id_odoo, codigo_formula, producto_final_nombre, cantidad_base)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id_odoo) 
        DO UPDATE SET codigo_formula = EXCLUDED.codigo_formula, producto_final_nombre = EXCLUDED.producto_final_nombre, cantidad_base = EXCLUDED.cantidad_base, actualizado_at = CURRENT_TIMESTAMP;
      `, [bomId, data.codigo, data.producto, data.cantidad_base]);

      for (let lin of data.lineas) {
        await dbLocal.query(`
          INSERT INTO maestros_formulas_lineas_local (id_odoo, bom_id, componente_nombre, cantidad_componente, unidad_medida)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id_odoo) 
          DO UPDATE SET componente_nombre = EXCLUDED.componente_nombre, cantidad_componente = EXCLUDED.cantidad_componente, unidad_medida = EXCLUDED.unidad_medida, actualizado_at = CURRENT_TIMESTAMP;
        `, [lin.linea_id, bomId, lin.componente, lin.cantidad, lin.unidad]);
      }
    }
    

    console.log('✅ ¡Sincronización masiva completada con éxito en la base de datos local!');
    return true;
  } catch (error) {
    console.error('❌ Error en proceso de sincronización:', error.message);
    throw error;
  }
}

// ----------------------------------------------------
// RUTAS DE MAESTROS EN VIVO (LECTURA DIRECTA DESDE BD LOCAL PgSQL)
// ----------------------------------------------------
app.get('/api/maestros/unidades', async (req, res) => {
  try {
    const resultado = await dbLocal.query('SELECT * FROM public.maestros_unidades_local WHERE activo = true ORDER BY nombre ASC');
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/maestros/productos', async (req, res) => {
  try {
    const resultado = await dbLocal.query('SELECT * FROM maestros_productos_local ORDER BY nombre ASC;');
    res.json(resultado.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/maestros/clientes', async (req, res) => {
  try {
    const resultado = await dbLocal.query('SELECT * FROM maestros_clientes_local ORDER BY nombre ASC;');
    res.json(resultado.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/maestros/empleados', async (req, res) => {
  try {
    // Lee directamente de la tabla local sincronizada
    const result = await dbLocal.query('SELECT * FROM maestros_empleados_local ORDER BY nombre ASC');
    res.json(result.rows);
  } catch (error) {
    console.error("Error obteniendo empleados:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/maestros/cuentas', async (req, res) => {
  try {
    const resultado = await dbLocal.query('SELECT * FROM maestros_cuentas_local ORDER BY codigo ASC;');
    res.json(resultado.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/maestros/usuarios', async (req, res) => {
  try {
    const resultado = await dbLocal.query('SELECT * FROM maestros_usuarios_local ORDER BY nombre ASC;');
    res.json(resultado.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/maestros/formulas', async (req, res) => {
  try {
    const query = `
      SELECT 
        f.id_odoo AS bom_id,
        f.codigo_formula,
        f.producto_final_nombre AS producto_final,
        f.cantidad_base,
        l.id_odoo AS linea_id,
        l.componente_nombre,
        l.cantidad_componente,
        l.unidad_medida
      FROM maestros_formulas_local f
      INNER JOIN maestros_formulas_lineas_local l ON l.bom_id = f.id_odoo
      ORDER BY f.id_odoo ASC, l.id_odoo ASC;
    `;
    const resultado = await dbLocal.query(query);
    res.json(resultado.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Últimas ventas (módulo Ventas) y últimas compras (facturas de proveedor, Contabilidad) de un producto
app.get('/api/maestros/productos/historial', async (req, res) => {
  const codigo = String(req.query.codigo || '').trim();
  const clienteFiltro = String(req.query.cliente || '').trim();
  if (!codigo || codigo === '-') return res.json({ ventas: [], compras: [], salidas: [], costoPromedio: 0 });

  const limpiar = (v) => {
    if (v && typeof v === 'object') return v.es_PE || v.es_ES || v.en_US || Object.values(v)[0] || '-';
    return v ? String(v) : '-';
  };

  const consultar = async (nombre, sql, params) => {
    try {
      const r = await dbCorp.query(sql, params);
      return r.rows.map(f => ({ ...f, unidad: limpiar(f.unidad) }));
    } catch (e) {
      console.error(`Historial de producto (${nombre}):`, e.message);
      return [];
    }
  };

  const CTE_PRODUCTO = `
    WITH pids AS (
      SELECT pp.id
      FROM public.product_product pp
      JOIN public.product_template pt ON pt.id = pp.product_tmpl_id
      WHERE COALESCE(pp.default_code, pt.default_code) = $1
    )`;

  const clienteParam = clienteFiltro ? `%${clienteFiltro}%` : null;

  // ---- Ventas y compras: no dependen de la ventana de tiempo dinámica (siempre traen las 3 últimas que existan) ----
  const [ventas, compras] = await Promise.all([
    consultar('ventas', `${CTE_PRODUCTO}
      SELECT to_char(so.date_order, 'YYYY-MM-DD') AS fecha,
             COALESCE(rpc.name, rp.name) AS tercero,
             sol.price_unit AS precio,
             uom.name AS unidad,
             cur.name AS moneda
      FROM public.sale_order_line sol
      JOIN public.sale_order so ON so.id = sol.order_id
      LEFT JOIN public.res_partner rp ON rp.id = so.partner_id
      LEFT JOIN public.res_partner rpc ON rpc.id = rp.commercial_partner_id
      LEFT JOIN public.uom_uom uom ON uom.id = sol.product_uom
      LEFT JOIN public.res_currency cur ON cur.id = so.currency_id
      WHERE sol.product_id IN (SELECT id FROM pids)
        AND so.state IN ('sale', 'done')
        AND sol.price_unit > 0
        AND ($2::text IS NULL OR COALESCE(rpc.name, rp.name) ILIKE $2)
      ORDER BY so.date_order DESC, sol.id DESC
      LIMIT 3;`, [codigo, clienteParam]),
    consultar('compras', `${CTE_PRODUCTO}
      SELECT to_char(am.invoice_date, 'YYYY-MM-DD') AS fecha,
             rp.name AS tercero,
             aml.price_unit AS precio,
             uom.name AS unidad,
             cur.name AS moneda
      FROM public.account_move_line aml
      JOIN public.account_move am ON am.id = aml.move_id
      LEFT JOIN public.res_partner rp ON rp.id = am.partner_id
      LEFT JOIN public.uom_uom uom ON uom.id = aml.product_uom_id
      LEFT JOIN public.res_currency cur ON cur.id = am.currency_id
      WHERE aml.product_id IN (SELECT id FROM pids)
        AND am.move_type = 'in_invoice'
        AND am.state = 'posted'
        AND (aml.display_type IS NULL OR aml.display_type = 'product')
        AND aml.price_unit > 0
      ORDER BY am.invoice_date DESC NULLS LAST, aml.id DESC
      LIMIT 3;`, [codigo]),
  ]);

  // ---- Salidas: cruce robusto por commercial_partner_id + ventana de tiempo dinámica ----
  const VENTANAS = ["'6 months'", "'1 year'", "'2 years'", null];

  const construirSqlSalidas = (ventanaSql) => `${CTE_PRODUCTO}
    SELECT to_char(svl.create_date, 'YYYY-MM-DD') AS fecha,
           COALESCE(rpc.name, rp_raw.name, sm.reference) AS tercero,
           ABS(svl.unit_cost) AS precio,
           uom.name AS unidad,
           'PEN' AS moneda,
           (
             SELECT cr.rate
             FROM public.res_currency_rate cr
             JOIN public.res_currency c ON c.id = cr.currency_id
             WHERE c.name = 'USD'
               AND cr.name <= svl.create_date::date
             ORDER BY cr.name DESC
             LIMIT 1
           ) AS tc_dia
    FROM public.stock_valuation_layer svl
    LEFT JOIN public.stock_move sm ON sm.id = svl.stock_move_id
    LEFT JOIN public.uom_uom uom ON uom.id = sm.product_uom
    LEFT JOIN public.sale_order_line sol ON sol.id = sm.sale_line_id
    LEFT JOIN public.sale_order so2 ON so2.id = sol.order_id
    LEFT JOIN public.stock_picking sp ON sp.id = sm.picking_id
    LEFT JOIN public.res_partner rp_raw ON rp_raw.id = COALESCE(so2.partner_id, sp.partner_id)
    LEFT JOIN public.res_partner rpc ON rpc.id = rp_raw.commercial_partner_id
    WHERE svl.product_id IN (SELECT id FROM pids)
      AND svl.quantity < 0
      AND svl.unit_cost IS NOT NULL
      ${ventanaSql ? `AND svl.create_date >= (CURRENT_DATE - INTERVAL ${ventanaSql})` : ''}
      AND ($2::text IS NULL OR COALESCE(rpc.name, rp_raw.name) ILIKE $2)
    ORDER BY svl.create_date DESC, svl.id DESC
    LIMIT 3;`;

  let salidas = [];
  for (const ventana of VENTANAS) {
    salidas = await consultar('salidas', construirSqlSalidas(ventana), [codigo, clienteParam]);
    if (salidas.length > 0) break;
  }

  // ---- Costo promedio: misma ventana dinámica, sin filtro de cliente (es referencia general de mercado) ----
  const construirSqlCostoProm = (ventanaSql) => `
    ${CTE_PRODUCTO}
    SELECT ROUND(AVG(ABS(svl.unit_cost))::numeric, 4) AS promedio, COUNT(*) AS n
    FROM public.stock_valuation_layer svl
    WHERE svl.product_id IN (SELECT id FROM pids)
      AND svl.quantity < 0
      AND svl.unit_cost IS NOT NULL
      ${ventanaSql ? `AND svl.create_date >= (CURRENT_DATE - INTERVAL ${ventanaSql})` : ''}
  `;

  let costoPromedio = 0;
  try {
    for (const ventana of VENTANAS) {
      const rCosto = await dbCorp.query(construirSqlCostoProm(ventana), [codigo]);
      const n = parseInt(rCosto.rows[0]?.n, 10) || 0;
      if (n > 0) {
        costoPromedio = parseFloat(rCosto.rows[0]?.promedio) || 0;
        break;
      }
    }
  } catch (e) {
    console.error('Historial de producto (costoPromedio):', e.message);
  }

  res.json({ ventas, compras, salidas, costoPromedio });
});
// ----------------------------------------------------
// EJECUTADO PARA EL ESTADO DE RESULTADOS (Odoo, asientos publicados)
// Saldo (debe - haber) por cuenta y mes de las clases 6, 7, 8 y 9 del año pedido.
// La clasificación en líneas del EERR se hace en el frontend (config/eerr.js).
// ----------------------------------------------------
app.get('/api/eerr/ejecutado', async (req, res) => {
  const anio = parseInt(req.query.anio, 10);
  if (!anio || anio < 2000 || anio > 2100) return res.status(400).json({ error: 'Indique un año válido' });
  try {
    const resultado = await dbCorp.query(
      `SELECT aa.code AS codigo,
              EXTRACT(MONTH FROM aml.date)::int AS mes,
              SUM(aml.debit - aml.credit) AS saldo
         FROM public.account_move_line aml
         JOIN public.account_move am ON am.id = aml.move_id
         JOIN public.account_account aa ON aa.id = aml.account_id
        WHERE am.state = 'posted'
          AND aml.date >= $1::date AND aml.date < $2::date
          AND (aa.code LIKE '6%' OR aa.code LIKE '7%' OR aa.code LIKE '8%' OR aa.code LIKE '9%')
        GROUP BY aa.code, EXTRACT(MONTH FROM aml.date)`,
      [`${anio}-01-01`, `${anio + 1}-01-01`]
    );
    res.json(resultado.rows.map(f => ({ codigo: String(f.codigo), mes: f.mes, saldo: parseFloat(f.saldo) || 0 })));
  } catch (error) {
    console.error('Error obteniendo el ejecutado del EERR:', error.message);
    res.status(500).json({ error: 'No se pudo leer el ejecutado desde Odoo', detalle: error.message });
  }
});

// ----------------------------------------------------
// RUTAS DE FORECASTS / REGISTROS (BD Propia)
// ----------------------------------------------------

app.get('/api/forecasts', async (req, res) => {
  try {
    const resultado = await dbLocal.query('SELECT * FROM forecasts_proyecto ORDER BY id_registro DESC');
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los forecasts locales' });
  }
});

app.post('/api/forecasts', async (req, res) => {
  try {
    const { id_registro, id_lote, area, version, detalle_columnas } = req.body;
    const query = `
      INSERT INTO forecasts_proyecto (id_registro, id_lote, area, version, detalle_columnas)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [id_registro, id_lote, area, version, JSON.stringify(detalle_columnas)];
    const nuevoRegistro = await dbLocal.query(query, values);
    res.status(201).json(nuevoRegistro.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al guardar el forecast en la base local' });
  }
});

// ----------------------------------------------------
// ENDPOINT DE SINCRONIZACIÓN MANUAL
// ----------------------------------------------------

app.get('/api/sincronizar/maestros', async (req, res) => {
  try {
    await sincronizarMaestros();
    res.json({ success: true, mensaje: '¡Maestros sincronizados localmente con éxito!' });
  } catch (error) {
    res.status(500).json({ error: 'Error al sincronizar con Odoo', detalle: error.message });
  }
});

// ----------------------------------------------------
// LEVANTAR SERVIDOR Y SINCRONIZACIÓN AUTOMÁTICA AL INICIO
// ----------------------------------------------------

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT} con doble base de datos.`);
  
  // Mantenemos solo el test de conexiones para que sepas si Odoo y la local responden al encender
  await probarConexiones();

  try {
    await inicializarEsquemaPresupuesto(dbLocal);
    console.log('✅ Tablas de presupuesto listas (ppto_versiones, ppto_registros, ppto_auditoria)');
  } catch (err) {
    console.error('❌ No se pudieron crear las tablas de presupuesto:', err.message);
  }
  
  console.log('✨ Servidor listo. La sincronización se hará de forma manual desde el sistema.');
});

// =====================================================================
// ENDPOINT PARA EL BOTÓN DE SINCRONIZACIÓN MANUAL DESDE EL FRONTEND
// =====================================================================
app.post('/api/sincronizar/maestros', async (req, res) => {
  try {
    console.log('🔄 Ejecutando sincronización manual solicitada desde la interfaz...');
    
    // Llamamos a la función ETL que construimos antes
    await sincronizarMaestros(); 

    res.json({ 
      success: true, 
      mensaje: '¡Sincronización con Odoo completada con éxito!' 
    });
  } catch (error) {
    console.error('❌ Error en el endpoint de sincronización:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Error al sincronizar con Odoo', 
      detalle: error.message 
    });
  }
});

// ----------------------------------------------------
// RUTAS DE ACTUALIZACIÓN (PUT) PARA MAESTROS
// ----------------------------------------------------

// 1. Actualizar Empleado
app.put('/api/maestros/empleados/:id', async (req, res) => {
  const { id } = req.params;
  
  // Capturamos todos los campos enviados desde el formulario de React
  const { 
    nombre, 
    puesto, 
    cargo, 
    sueldo, 
    asignacionFamiliar, 
    asignacion_familiar, 
    distribucion, 
    proceso, 
    area 
  } = req.body;
  
  const puestoFinal = puesto || cargo || 'Sin Puesto';
  const sueldoFinal = sueldo !== undefined && sueldo !== '' ? sueldo : 0;
  const asigFamFinal = asignacionFamiliar !== undefined && asignacionFamiliar !== '' ? asignacionFamiliar : (asignacion_familiar || 0);

  try {
    const resultado = await dbLocal.query(
      `UPDATE maestros_empleados_local 
       SET nombre = $1, 
           puesto = $2, 
           sueldo = $3, 
           asignacion_familiar = $4, 
           distribucion = $5, 
           proceso = $6, 
           area = $7, 
           actualizado_at = CURRENT_TIMESTAMP 
       WHERE dni = $8 OR id_odoo::text = $8
       RETURNING *;`,
      [nombre, puestoFinal, sueldoFinal, asigFamFinal, distribucion, proceso, area, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado en la base de datos local' });
    }

    res.json({ mensaje: 'Empleado actualizado correctamente', empleado: resultado.rows[0] });
  } catch (error) {
    console.error("Error actualizando empleado:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Actualizar Cuenta Contable
app.put('/api/maestros/cuentas/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, categoria, subcategoria, grupo } = req.body;
  try {
    const r = await dbLocal.query(
      `UPDATE maestros_cuentas_local
       SET nombre = COALESCE($1, nombre),
           categoria = COALESCE($2, categoria),
           grupo = COALESCE($3, grupo),
           actualizado_at = CURRENT_TIMESTAMP
       WHERE codigo = $4 OR id_odoo::text = $4
       RETURNING *;`,
      [nombre ?? null, categoria ?? null, subcategoria ?? grupo ?? null, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.json({ mensaje: 'Cuenta actualizada correctamente', cuenta: r.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Actualizar Cliente
app.put('/api/maestros/clientes/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, zona, vendedor, pais, tipo } = req.body;
  try {
    const r = await dbLocal.query(
      `UPDATE maestros_clientes_local
       SET nombre = COALESCE($1, nombre),
           zona = COALESCE($2, zona),
           vendedor = COALESCE($3, vendedor),
           pais = COALESCE($4, pais),
           tipo = COALESCE($5, tipo),
           actualizado_at = CURRENT_TIMESTAMP
       WHERE ruc = $6 OR id_odoo::text = $6
       RETURNING *;`,
      [nombre ?? null, zona ?? null, vendedor ?? null, pais ?? null, tipo ?? null, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ mensaje: 'Cliente actualizado correctamente', cliente: r.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Actualizar Producto (Corregido para capturar 'pv', 'unidad' y 'costo')
app.put('/api/maestros/productos/:id', async (req, res) => {
  const { id } = req.params; 
  const { codigo, nombre, categoria, precio_venta, pv, unidad, costo } = req.body;
  const precioFinal = precio_venta !== undefined ? precio_venta : (pv !== undefined ? pv : 0);

  try {
    const resultado = await dbLocal.query(
      `UPDATE maestros_productos_local 
       SET codigo = $1, nombre = $2, categoria = $3, precio_venta = $4, unidad = $5, costo = $6, 
           modificado_manualmente = TRUE, -- 👈 Marcamos que fue editado localmente para que Odoo no lo sobrescriba
           actualizado_at = CURRENT_TIMESTAMP 
       WHERE id_odoo::text = $7 OR codigo = $7
       RETURNING *;`,
      [codigo, nombre, categoria, precioFinal, unidad, costo, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json({ mensaje: 'Producto actualizado correctamente', producto: resultado.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Actualizar Usuario
app.put('/api/maestros/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  const { login, nombre, rol } = req.body;
  try {
    await dbLocal.query(
      `UPDATE maestros_usuarios_local 
       SET login = $1, nombre = $2, rol = $3, actualizado_at = CURRENT_TIMESTAMP 
       WHERE login = $4 OR id_odoo::text = $4`,
      [login, nombre, rol, id]
    );
    res.json({ mensaje: 'Usuario actualizado correctamente' });
  } catch (error) {
    console.error("Error actualizando usuario:", error);
    res.status(500).json({ error: error.message });
  }
});