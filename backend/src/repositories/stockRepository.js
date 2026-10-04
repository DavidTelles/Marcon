const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const commitments = `COALESCE((SELECT SUM(r.quantity) FROM request_reservations r WHERE r.part_id=i.part_id AND r.warehouse_id=i.warehouse_id),0) AS reserved,
  COALESCE((SELECT SUM(t.quantity) FROM stock_transfers t WHERE t.part_id=i.part_id AND t.source_warehouse_id=i.warehouse_id AND t.status='Solicitada'),0) AS committed`;

// Estoque: tabela unificada `inventory` (part_id, warehouse_id).
async function list(filters = {}) {
  const where = [];
  const params = [];
  if (filters.product_id) {
    where.push('i.part_id = ?');
    params.push(filters.product_id);
  }
  if (filters.warehouse_id) {
    where.push('i.warehouse_id = ?');
    params.push(filters.warehouse_id);
  }
  const rows = await query(
    `SELECT i.part_id AS product_id, p.code AS sku, p.name,
            i.warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name,
            CASE WHEN w.is_central = 1 THEN 'CENTRAL' ELSE 'AUXILIARY' END AS warehouse_type,
            i.quantity,p.unit,${commitments},i.minimum_quantity AS min_quantity, i.aisle AS corridor, i.shelf, i.updated_at
     FROM inventory i
     JOIN parts p ON p.id = i.part_id
     JOIN warehouses w ON w.id = i.warehouse_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY p.name, w.id`,
    params
  );
  return rows;
}

async function listByProduct(productId) {
  return query(
    `SELECT i.warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name,
            CASE WHEN w.is_central = 1 THEN 'CENTRAL' ELSE 'AUXILIARY' END AS warehouse_type,
            i.quantity,p.unit,${commitments},i.minimum_quantity AS min_quantity, i.aisle AS corridor, i.shelf
     FROM inventory i JOIN warehouses w ON w.id = i.warehouse_id JOIN parts p ON p.id=i.part_id
     WHERE i.part_id = ?
     ORDER BY w.id`,
    [productId]
  );
}

async function listMovements(filters = {}) {
  const where = [];
  const params = [];
  if (filters.product_id) {
    where.push('m.part_id = ?');
    params.push(filters.product_id);
  }
  if (filters.warehouse_id) {
    where.push('m.warehouse_id = ?');
    params.push(filters.warehouse_id);
  }
  const requestedLimit = Number(filters.limit ?? 200);
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 1000) throw new AppError(400, 'Limite inválido (1–1000)');
  const limit = requestedLimit;
  return query(
    `SELECT m.id, m.part_id AS product_id, p.code AS sku, p.name AS product_name,
            m.warehouse_id, w.name AS warehouse_name, m.kind AS type, m.quantity,
            m.reason AS notes, m.request_id, m.transfer_id, m.return_id, m.block_id,
            m.actor_id AS user_id, u.name AS user_name, m.created_at
     FROM stock_movements m
     JOIN parts p ON p.id = m.part_id
     JOIN warehouses w ON w.id = m.warehouse_id
     JOIN users u ON u.id = m.actor_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT ${limit}`,
    params
  );
}

module.exports = { list, listByProduct, listMovements };
