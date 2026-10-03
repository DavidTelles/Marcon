const { query } = require('../config/db');
const { ROLE_CODES, ROLE_PERMISSIONS } = require('../config/constants');

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    employee_code: row.employee_no,
    name: row.name,
    email: row.email,
    role: ROLE_CODES[row.role] || row.role,
    role_enum: row.role,
    role_name: row.role,
    sector: row.sector,
    block_id: row.block_id,
    block: row.block_name || null,
    rfid_tag: row.rfid_tag || null,
    is_active: Boolean(row.active),
    rfid_access_enabled: row.rfid_access_enabled === undefined ? true : Boolean(row.rfid_access_enabled),
    created_at: row.created_at
  };
}

const BASE_SELECT = `
  SELECT u.*, b.name AS block_name
  FROM users u
  LEFT JOIN blocks b ON b.id = u.block_id
`;

async function findById(id) {
  const rows = await query(`${BASE_SELECT} WHERE u.id = ?`, [id]);
  return rows[0] || null;
}

async function findByEmail(email) {
  const rows = await query(`${BASE_SELECT} WHERE u.email = ?`, [email]);
  return rows[0] || null;
}

async function findByEmployeeCode(code) {
  const rows = await query(`${BASE_SELECT} WHERE u.employee_no = ?`, [code]);
  return rows[0] || null;
}

async function findByRfid(rfid) {
  const rows = await query(`${BASE_SELECT} WHERE u.rfid_tag = ?`, [rfid]);
  return rows[0] || null;
}

async function list(filters = {}) {
  const where = [];
  const params = [];
  if (filters.role) {
    where.push('u.role = ?');
    params.push(ROLE_ENUM_FROM_CODE(filters.role));
  }
  if (filters.sector) {
    where.push('u.sector = ?');
    params.push(filters.sector);
  }
  const sql = `${BASE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY u.id`;
  return query(sql, params);
}

function ROLE_ENUM_FROM_CODE(role) {
  // aceita tanto o código (ADMIN) quanto o enum (admin)
  return ROLE_CODES[role] ? role : (Object.entries(ROLE_CODES).find(([, v]) => v === role) || [])[0] || role;
}

async function create(data) {
  const result = await query(
    `INSERT INTO users (employee_no, name, email, password_hash, role, sector, block_id, rfid_tag, active, rfid_access_enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.employee_code,
      data.name,
      data.email,
      data.password_hash,
      data.role_enum,
      data.sector || 'Geral',
      data.block_id || null,
      data.rfid_tag || null,
      data.is_active ?? 1,
      data.rfid_access_enabled ?? 1
    ]
  );
  return findById(result.insertId);
}

async function update(id, data) {
  const fields = [];
  const params = [];
  const map = {
    name: 'name',
    email: 'email',
    password_hash: 'password_hash',
    role_enum: 'role',
    sector: 'sector',
    block_id: 'block_id',
    rfid_tag: 'rfid_tag',
    is_active: 'active',
    rfid_access_enabled: 'rfid_access_enabled'
  };
  for (const [key, column] of Object.entries(map)) {
    if (data[key] !== undefined) {
      fields.push(`${column} = ?`);
      params.push(data[key]);
    }
  }
  if (!fields.length) return findById(id);
  params.push(id);
  await query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

async function getPermissionsForUser(userId) {
  const rows = await query('SELECT role FROM users WHERE id = ?', [userId]);
  if (!rows[0]) return [];
  const roleCode = ROLE_CODES[rows[0].role];
  const set = new Set(ROLE_PERMISSIONS[roleCode] || []);
  const overrides = await query(
    'SELECT permission, allowed FROM user_permission_overrides WHERE user_id = ?',
    [userId]
  );
  for (const o of overrides) {
    if (o.allowed) set.add(o.permission);
    else set.delete(o.permission);
  }
  return [...set];
}
async function getPermissionOverridesForUser(userId) {
  const rows = await query('SELECT permission,allowed FROM user_permission_overrides WHERE user_id=?', [userId]);
  return Object.fromEntries(rows.map((row) => [row.permission, Boolean(row.allowed)]));
}

async function setPermissionOverride(userId, permissionCode, allowed) {
  await query(
    `INSERT INTO user_permission_overrides (user_id, permission, allowed)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE allowed = VALUES(allowed)`,
    [userId, permissionCode, allowed ? 1 : 0]
  );
  return getPermissionsForUser(userId);
}

module.exports = {
  getPermissionOverridesForUser,
  publicUser,
  findById,
  findByEmail,
  findByEmployeeCode,
  findByRfid,
  list,
  create,
  update,
  getPermissionsForUser,
  setPermissionOverride
};
