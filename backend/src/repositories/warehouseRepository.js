const { query } = require('../config/db');

function map(row) {
  if (!row) return null;
  return {
    ...row,
    type: row.is_central ? 'CENTRAL' : 'AUXILIARY',
    is_active: Boolean(row.active)
  };
}

async function list() {
  const rows = await query(
    `SELECT w.*, b.name AS block_name FROM warehouses w
     LEFT JOIN blocks b ON b.id = w.block_id ORDER BY w.is_central DESC, w.id`
  );
  return rows.map(map);
}

async function findById(id) {
  const rows = await query(
    `SELECT w.*, b.name AS block_name FROM warehouses w
     LEFT JOIN blocks b ON b.id = w.block_id WHERE w.id = ?`,
    [id]
  );
  return map(rows[0]);
}

async function create({ code, name, type, block_id, is_active }) {
  const isCentral = String(type || '').toUpperCase() === 'CENTRAL';
  const result = await query(
    'INSERT INTO warehouses (code, name, block_id, is_central, active) VALUES (?, ?, ?, ?, ?)',
    [code, name, isCentral ? null : block_id || null, isCentral, is_active === false ? 0 : 1]
  );
  return findById(result.insertId);
}

async function update(id, { code, name, block_id, is_active, type }) {
  const current = await findById(id);
  if (!current) return null;
  const isCentral = type !== undefined ? String(type).toUpperCase() === 'CENTRAL' : Boolean(current.is_central);
  await query(
    'UPDATE warehouses SET code = COALESCE(?, code), name = COALESCE(?, name), block_id = ?, is_central = ?, active = COALESCE(?, active) WHERE id = ?',
    [
      code || null,
      name || null,
      isCentral ? null : block_id !== undefined ? block_id : current.block_id,
      isCentral,
      is_active === undefined ? null : is_active ? 1 : 0,
      id
    ]
  );
  return findById(id);
}

module.exports = { list, findById, create, update };
