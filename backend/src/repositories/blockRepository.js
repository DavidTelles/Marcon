const { query } = require('../config/db');

async function list() {
  return query('SELECT * FROM blocks ORDER BY id');
}

async function findById(id) {
  const rows = await query('SELECT * FROM blocks WHERE id = ?', [id]);
  return rows[0] || null;
}

async function create({ code, name }) {
  const result = await query('INSERT INTO blocks (code, name) VALUES (?, ?)', [code, name]);
  return findById(result.insertId);
}

async function update(id, { code, name }) {
  await query(
    'UPDATE blocks SET code = COALESCE(?, code), name = COALESCE(?, name) WHERE id = ?',
    [code || null, name || null, id]
  );
  return findById(id);
}

module.exports = { list, findById, create, update };
