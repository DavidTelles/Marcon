// Aditiva e retomável. Transferências anteriores já foram recebidas.
export async function up(c) {
  for (const [name, definition] of Object.entries({
    status:
      "ENUM('Solicitada','Em trânsito','Recebida','Cancelada') NOT NULL DEFAULT 'Recebida'",
    reason:
      "VARCHAR(1000) NOT NULL DEFAULT 'Transferência anterior à migração 003'",
    request_key: "VARCHAR(64) NULL UNIQUE",
    shipped_by: "BIGINT UNSIGNED NULL",
    received_by: "BIGINT UNSIGNED NULL",
    shipped_at: "DATETIME(3) NULL",
    received_at: "DATETIME(3) NULL",
  })) {
    const [r] = await c.execute(
      "SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='stock_transfers' AND column_name=?",
      [name],
    );
    if (!r.length)
      await c.query(
        `ALTER TABLE stock_transfers ADD COLUMN ${name} ${definition}`,
      );
  }
  await c.query(`CREATE TABLE IF NOT EXISTS delivery_route_history (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    request_id BIGINT UNSIGNED NOT NULL,
    map_version_id BIGINT UNSIGNED NULL,
    actor_id BIGINT UNSIGNED NOT NULL,
    event ENUM('Planejada','Recalculada','Saída') NOT NULL,
    payload JSON NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(request_id) REFERENCES requests(id),
    FOREIGN KEY(map_version_id) REFERENCES map_versions(id),
    FOREIGN KEY(actor_id) REFERENCES users(id),
    INDEX idx_delivery_history(request_id,id)
  ) ENGINE=InnoDB`);
}
