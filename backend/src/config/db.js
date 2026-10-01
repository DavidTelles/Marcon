const loadNeonDb = () => import("../../../lib/neon-db.mjs");
const pool = {
  execute: (...args) => loadNeonDb().then(({ getPool }) => getPool().execute(...args)),
  query: (...args) => loadNeonDb().then(({ getPool }) => getPool().query(...args)),
};

function getPool() {
  return pool;
}

async function query(sql, params) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function withTransaction(work) {
  const { transaction } = await loadNeonDb();
  return transaction(work);
}

module.exports = { getPool, query, withTransaction };
