const { query } = require('../config/db');

// Requisições: tabela unificada `requests` (uma peça por requisição).
const BASE = `
  SELECT r.id, r.requester_id, u.employee_no AS requester_code, u.name AS requester_name,
         r.sector, r.block_id, b.name AS block_name,
         r.part_id AS product_id, p.code AS sku, p.name AS product_name,
         r.quantity, r.requested_unit, r.requested_amount, r.pack_size_at_request, r.anomaly, r.picked_at, r.priority AS urgency, r.status, r.justification AS description,
         r.batch_id, r.approved_by, r.approved_at, r.fulfilled_by, r.fulfilled_from AS warehouse_id,
         r.delivered_at, r.received_at, r.cancellation_reason, r.created_at, r.updated_at
  FROM requests r
  JOIN users u ON u.id = r.requester_id
  JOIN parts p ON p.id = r.part_id
  JOIN blocks b ON b.id = r.block_id
`;

function map(row) {
  if (!row) return null;
  return {
    ...row,
    items: row.product_id
      ? [{ product_id: row.product_id, sku: row.sku, name: row.product_name, quantity: row.quantity }]
      : []
  };
}

async function findById(id) {
  const rows = await query(`${BASE} WHERE r.id = ?`, [id]);
  return map(rows[0]);
}

async function list(filters = {}) {
  const where = [];
  const params = [];
  if (filters.requester_id) {
    where.push('r.requester_id = ?');
    params.push(filters.requester_id);
  }
  if (filters.block) {
    where.push('b.name = ?');
    params.push(filters.block);
  }
  if (filters.status) {
    where.push('r.status = ?');
    params.push(filters.status);
  }
  if (Array.isArray(filters.statuses) && filters.statuses.length) {
    where.push(`r.status IN (${filters.statuses.map(() => '?').join(',')})`);
    params.push(...filters.statuses);
  }
  if (filters.part_id) {
    where.push('r.part_id = ?');
    params.push(filters.part_id);
  }
  const rows = await query(
    `${BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.created_at DESC, r.id DESC`,
    params
  );
  return rows.map(map);
}

async function dashboardStats() {
  const rows = await query('SELECT status, COUNT(*) AS total FROM requests GROUP BY status');
  const byStatus = {};
  let total = 0;
  for (const row of rows) {
    byStatus[row.status] = Number(row.total);
    total += Number(row.total);
  }
  return { total, by_status: byStatus };
}

module.exports = { findById, list, dashboardStats };
