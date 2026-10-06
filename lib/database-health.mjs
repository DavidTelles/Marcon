// Read-only probes: connectivity alone does not prove the schema is ready.
export async function databaseHealth(pool) {
  try {
    await pool.query("SELECT 1");
  } catch {
    return "disconnected";
  }
  try {
    await pool.query("SELECT id,employee_no,password_hash FROM users LIMIT 0");
    await pool.query("SELECT identity_digest FROM auth_attempts LIMIT 0");
    await pool.query("SELECT request_key FROM request_submissions LIMIT 0");
    await pool.query("SELECT id FROM parts LIMIT 0");
    await pool.query("SELECT part_id,warehouse_id,quantity FROM inventory LIMIT 0");
    return "connected";
  } catch {
    return "schema-unavailable";
  }
}
