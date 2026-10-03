const { query } = require('../config/db');

// Peças do catálogo: tabela unificada `parts` (sku = code).
function map(row) {
  if (!row) return null;
  return {
    id: row.id,
    sku: row.code,
    code: row.code,
    qr_code: row.qr_code,
    name: row.name,
    description: row.description || null,
    unit: row.unit || 'un',
    category: row.category || 'Peças',
    min_quantity: row.minimum_total,
    pack_size: row.pack_size,
    lead_days: row.lead_days,
    reference_unit_price: row.reference_unit_price,
    location: row.location,
    corridor: row.location || null,
    shelf: null,
    is_active: Boolean(row.active),
    total_quantity: row.total_quantity !== undefined ? Number(row.total_quantity) : undefined,
    created_at: row.created_at
  };
}

const BASE = `
  SELECT p.*, COALESCE((SELECT SUM(i.quantity) FROM inventory i WHERE i.part_id = p.id), 0) AS total_quantity
  FROM parts p
`;

async function list() {
  const rows = await query(`${BASE} WHERE p.active = TRUE ORDER BY p.name`);
  return rows.map(map);
}

async function findById(id) {
  const numericId = /^\d+$/.test(String(id)) && Number.isSafeInteger(Number(id)) ? Number(id) : null;
  const rows = await query(`${BASE} WHERE p.id = ? OR p.code = ?`, [numericId, String(id)]);
  return map(rows[0]);
}

async function create(data) {
  const code = String(data.sku || data.code || data.id || `SKU-${Date.now()}`).trim();
  const result = await query(
    `INSERT INTO parts (code, qr_code, name, description, location, pack_size, minimum_total, reference_unit_price, category, unit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      String(data.qr_code || code),
      data.name,
      data.description || null,
      data.location || data.corridor || '',
      data.pack_size || 1,
      data.min_quantity ?? data.minimum_total ?? 1,
      data.reference_unit_price ?? 0,
      data.category || 'Peças',
      data.unit || 'un'
    ]
  );
  return findById(result.insertId);
}

async function update(id, data) {
  const part = await findById(id);
  if (!part) return null;
  const fields = [];
  const params = [];
  const mapCols = {
    name: 'name',
    description: 'description',
    location: 'location',
    category: 'category',
    unit: 'unit'
  };
  for (const [key, col] of Object.entries(mapCols)) {
    if (data[key] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(data[key]);
    }
  }
  if (data.min_quantity !== undefined) {
    fields.push('minimum_total = ?');
    params.push(data.min_quantity);
  }
  if (data.reference_unit_price !== undefined) {
    fields.push('reference_unit_price = ?');
    params.push(data.reference_unit_price);
  }
  if (data.is_active !== undefined) {
    fields.push('active = ?');
    params.push(data.is_active ? 1 : 0);
  }
  if (fields.length) {
    params.push(part.id);
    await query(`UPDATE parts SET ${fields.join(', ')} WHERE id = ?`, params);
  }
  return findById(part.id);
}

module.exports = { list, findById, create, update, map };
