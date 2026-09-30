// Migração de integração MARCON: recursos do backend sobre o schema unificado.
// Aditiva e retomável, como as demais.
export async function up(c) {
  async function column(table, name, definition) {
    const [rows] = await c.execute(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
      [table, name],
    );
    if (!rows.length)
      await c.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }

  // Acesso por crachá RFID (login e registro de eventos de acesso).
  await column("users", "rfid_tag", "VARCHAR(32) NULL UNIQUE");
  await column("users", "rfid_access_enabled", "BOOLEAN NOT NULL DEFAULT TRUE");

  await c.query(`CREATE TABLE IF NOT EXISTS rfid_access_events (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    rfid_id VARCHAR(32) NOT NULL,
    user_id BIGINT UNSIGNED NULL,
    allowed BOOLEAN NOT NULL DEFAULT FALSE,
    reason VARCHAR(190) NOT NULL,
    location VARCHAR(120) NULL,
    device VARCHAR(120) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(user_id) REFERENCES users(id),
    INDEX idx_rfid_events_tag (rfid_id, created_at)
  ) ENGINE=InnoDB`);

  await c.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    used_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(user_id) REFERENCES users(id),
    INDEX idx_reset_token (token_hash)
  ) ENGINE=InnoDB`);

  // Overrides individuais de permissão da API REST (perm.code -> allowed).
  await c.query(`CREATE TABLE IF NOT EXISTS user_permission_overrides (
    user_id BIGINT UNSIGNED NOT NULL,
    permission VARCHAR(80) NOT NULL,
    allowed BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (user_id, permission),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}
