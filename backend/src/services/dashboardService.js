const { query } = require('../config/db');
const requestRepository = require('../repositories/requestRepository');

async function general() {
  const stats = await requestRepository.dashboardStats();
  const stock = await query(
    `SELECT COALESCE(SUM(i.quantity), 0) AS total_quantity,
            COUNT(DISTINCT i.part_id) AS products,
            COUNT(DISTINCT i.warehouse_id) AS warehouses
     FROM inventory i`
  );
  return { requests: stats, stock: stock[0] };
}

async function byWarehouse() {
  return query(
    `SELECT w.id, w.code, w.name,
            CASE WHEN w.is_central THEN 'CENTRAL' ELSE 'AUXILIARY' END AS type,
            COALESCE(SUM(i.quantity), 0) AS quantity
     FROM warehouses w
     LEFT JOIN inventory i ON i.warehouse_id = w.id
     GROUP BY w.id, w.code, w.name, w.is_central
     ORDER BY w.is_central DESC, w.id`
  );
}

async function stockComparative() {
  return query(
    `SELECT p.code AS sku, p.name,
            COALESCE(SUM(CASE WHEN sm.kind IN ('entrada','transferencia_entrada','devolucao','ajuste_entrada') THEN sm.quantity ELSE 0 END), 0) AS arrived,
            COALESCE(SUM(CASE WHEN sm.kind IN ('saida','transferencia_saida','ajuste_saida') THEN sm.quantity ELSE 0 END), 0) AS consumed
     FROM parts p
     LEFT JOIN stock_movements sm ON sm.part_id = p.id
     WHERE p.active = TRUE
     GROUP BY p.id, p.code, p.name
     ORDER BY p.name`
  );
}

async function byBlock() {
  return query(
    `SELECT b.id, b.name,
            COUNT(r.id) AS requests,
            COUNT(DISTINCT r.requester_id) AS requisitors,
            COALESCE(SUM(r.quantity), 0) AS pieces
     FROM blocks b
     LEFT JOIN requests r ON r.block_id = b.id
     GROUP BY b.id, b.name
     ORDER BY b.id`
  );
}

async function bySector(sector) {
  return query(
    `SELECT u.sector AS name, b.name AS block,
            COUNT(r.id) AS requests,
            COALESCE(SUM(r.quantity), 0) AS pieces
     FROM users u
     LEFT JOIN blocks b ON b.id = u.block_id
     LEFT JOIN requests r ON r.requester_id = u.id
     WHERE u.sector = ?
     GROUP BY u.sector, b.name`,
    [sector]
  );
}

async function lowStock() {
  return query(
    `SELECT p.code AS sku, p.name, w.name AS warehouse, i.quantity, i.minimum_quantity AS min_quantity
     FROM inventory i
     JOIN parts p ON p.id = i.part_id
     JOIN warehouses w ON w.id = i.warehouse_id
     WHERE i.quantity <= i.minimum_quantity AND p.active = TRUE AND w.active = TRUE
     ORDER BY i.quantity ASC`
  );
}

module.exports = { general, byWarehouse, stockComparative, byBlock, bySector, lowStock };
