const mysql = require('mysql2/promise');
const env = require('./env');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      // Mesmas opções do pool do frontend: datas/decimais chegam como texto/número
      // e BIGINT vira Number quando seguro — o contrato do workspace depende disso.
      dateStrings: true,
      decimalNumbers: true,
      timezone: 'Z',
      supportBigNumbers: true,
      bigNumberStrings: false
    });
    pool.on('connection', (connection) => {
      connection.query("SET time_zone = '+00:00'");
    });
  }
  return pool;
}

async function query(sql, params) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function withTransaction(work) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = { getPool, query, withTransaction };
