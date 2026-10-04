const { query } = require('../config/db');
const requestRepository = require('../repositories/requestRepository');

async function general() {
  const stats = await requestRepository.dashboardStats();
  const stock = await query(
    `SELECT COUNT(DISTINCT i.part_id) AS products,
            COUNT(DISTINCT i.warehouse_id) AS warehouses
     FROM inventory i`
  );
  const quantities = await query(
    `SELECT p.unit,COALESCE(SUM(i.quantity),0) AS physical,
       COALESCE((SELECT SUM(t.quantity) FROM stock_transfers t JOIN parts tp ON tp.id=t.part_id WHERE t.status='Em trânsito' AND tp.unit=p.unit),0) AS in_transit
     FROM parts p LEFT JOIN inventory i ON i.part_id=p.id GROUP BY p.unit ORDER BY p.unit`
  );
  return { requests: stats, stock: { ...stock[0], byUnit: quantities.map((r) => ({ ...r, company_total: Number(r.physical) + Number(r.in_transit) })) } };
}

async function byWarehouse() {
  return query(
    `SELECT w.id, w.code, w.name,p.unit,
            CASE WHEN w.is_central = 1 THEN 'CENTRAL' ELSE 'AUXILIARY' END AS type,
            COALESCE(SUM(i.quantity), 0) AS quantity
     FROM warehouses w
     LEFT JOIN inventory i ON i.warehouse_id = w.id
     LEFT JOIN parts p ON p.id=i.part_id
     GROUP BY w.id, w.code, w.name, w.is_central,p.unit
     ORDER BY w.is_central DESC, w.id`
  );
}

async function stockComparative() {
  return query(
    `SELECT p.code AS sku, p.name,p.unit,
            COALESCE(SUM(CASE WHEN sm.kind='entrada' THEN sm.quantity ELSE 0 END), 0) AS arrived,
            COALESCE(SUM(CASE WHEN sm.kind='saida' THEN sm.quantity ELSE 0 END), 0) AS consumed,
            COALESCE(SUM(CASE WHEN sm.kind='devolucao' THEN sm.quantity ELSE 0 END), 0) AS returned
     FROM parts p
     LEFT JOIN stock_movements sm ON sm.part_id = p.id
     WHERE p.active = TRUE
     GROUP BY p.id, p.code, p.name,p.unit
     ORDER BY p.name`
  );
}

async function byBlock(blockId = null) {
  return query(
    `SELECT b.id, b.name,
            COUNT(r.id) AS requests,
            COUNT(DISTINCT r.requester_id) AS requisitors,
            p.unit,COALESCE(SUM(r.quantity), 0) AS requested_quantity,
            COALESCE(SUM(CASE WHEN r.approved_at IS NOT NULL THEN r.quantity ELSE 0 END),0) AS approved_quantity,
            COALESCE(SUM((SELECT SUM(m.quantity) FROM stock_movements m WHERE m.request_id=r.id AND m.kind='saida')),0) AS delivered_quantity
     FROM blocks b
     LEFT JOIN requests r ON r.block_id = b.id
     LEFT JOIN parts p ON p.id=r.part_id
     WHERE (CAST(? AS BIGINT) IS NULL OR b.id=?)
     GROUP BY b.id, b.name,p.unit
     ORDER BY b.id`, [blockId, blockId]
  );
}

async function bySector(sector) {
  return query(
    `SELECT u.sector AS name, b.name AS block,p.unit,
            COUNT(r.id) AS requests,
            COALESCE(SUM(r.quantity), 0) AS requested_quantity
     FROM users u
     LEFT JOIN blocks b ON b.id = u.block_id
     LEFT JOIN requests r ON r.requester_id = u.id
     LEFT JOIN parts p ON p.id=r.part_id
     WHERE u.sector = ?
     GROUP BY u.sector, b.name,p.unit`,
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
