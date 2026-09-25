const { Pool } = require('pg');
require('dotenv').config();

const poolLocal = new Pool({
  host: process.env.DB_LOCAL_HOST,
  user: process.env.DB_LOCAL_USER,
  password: process.env.DB_LOCAL_PASSWORD,
  database: process.env.DB_LOCAL_NAME,
  port: process.env.DB_LOCAL_PORT,
});

module.exports = {
  query: (text, params) => poolLocal.query(text, params),
};