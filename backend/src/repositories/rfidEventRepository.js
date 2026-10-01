const { query } = require('../config/db');

async function create({ rfid_id, user_id, allowed, reason, location, device }) {
  const result = await query(
    'INSERT INTO rfid_access_events (rfid_id, user_id, allowed, reason, location, device) VALUES (?, ?, ?, ?, ?, ?)',
    [rfid_id, user_id || null, allowed ? 1 : 0, reason, location || null, device || null]
  );
  const rows = await query('SELECT * FROM rfid_access_events WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function list(limit = 100) {
  return query(
    `SELECT e.*, u.name AS user_name, u.employee_no AS employee_code
     FROM rfid_access_events e LEFT JOIN users u ON u.id = e.user_id
     ORDER BY e.created_at DESC, e.id DESC LIMIT ?`,
    [Math.min(Number(limit) || 100, 500)]
  );
}

module.exports = { create, list };
