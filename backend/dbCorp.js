const { Pool } = require('pg');
require('dotenv').config();

const dbCorp = new Pool({
  user: process.env.ODOO_DB_USER,
  host: process.env.ODOO_DB_HOST,
  database: process.env.ODOO_DB_NAME,
  password: process.env.ODOO_DB_PASSWORD,
  port: process.env.ODOO_DB_PORT || 5432,
  ssl: false  // <- Mantén esto en false
});

dbCorp.connect((err, client, release) => {
  if (err) console.error('❌ Error de conexión a Odoo:', err.message);
  else {
    console.log('✅ Conectado exitosamente a Odoo');
    release();
  }
});

module.exports = dbCorp;