export async function up(c) {
  await c.query(`CREATE TABLE IF NOT EXISTS request_submissions (
    actor_id BIGINT UNSIGNED NOT NULL,
    request_key VARCHAR(64) NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    result JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY(actor_id, request_key),
    FOREIGN KEY(actor_id) REFERENCES users(id)
  ) ENGINE=InnoDB`);
}
