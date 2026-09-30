// Migração aditiva, retomável: MySQL faz commit implícito em DDL.
export async function up(c) {
  async function column(table, name, definition) {
    const [rows] = await c.execute(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
      [table, name],
    );
    if (!rows.length)
      await c.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
  for (const [name, definition] of Object.entries({
    unit: "VARCHAR(24) NOT NULL DEFAULT 'un'",
    category: "VARCHAR(80) NOT NULL DEFAULT 'Peças'",
    criticality: "TINYINT UNSIGNED NOT NULL DEFAULT 1",
  }))
    await column("parts", name, definition);
  for (const [name, definition] of Object.entries({
    aisle: "VARCHAR(80) NOT NULL DEFAULT ''",
    shelf: "VARCHAR(80) NOT NULL DEFAULT ''",
    capacity: "INT UNSIGNED NULL",
    map_node_id: "VARCHAR(64) NULL",
  }))
    await column("inventory", name, definition);
  for (const [name, definition] of Object.entries({
    batch_id: "VARCHAR(36) NULL",
    sector: "VARCHAR(80) NOT NULL DEFAULT ''",
    approved_at: "DATETIME(3) NULL",
    delivered_at: "DATETIME(3) NULL",
    received_at: "DATETIME(3) NULL",
    cancellation_reason: "VARCHAR(1000) NULL",
  }))
    await column("requests", name, definition);
  await c.query(
    "ALTER TABLE requests MODIFY status ENUM('Pendente','Em análise','Aprovada','Entregue','Cancelada','Cancelamento solicitado') NOT NULL DEFAULT 'Pendente'",
  );
  await column(
    "stock_movements",
    "reason",
    "VARCHAR(1000) NOT NULL DEFAULT 'Registro anterior à migração 002'",
  );
  await column("return_records", "request_id", "BIGINT UNSIGNED NULL");
  await column(
    "return_records",
    "inspection_status",
    "ENUM('Pendente','Conferida') NOT NULL DEFAULT 'Conferida'",
  );
  await column("return_records", "inspected_at", "DATETIME(3) NULL");
  const statements = [
    `CREATE TABLE IF NOT EXISTS request_reservations (request_id BIGINT UNSIGNED NOT NULL, part_id BIGINT UNSIGNED NOT NULL, warehouse_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL, PRIMARY KEY(request_id,warehouse_id), FOREIGN KEY(request_id) REFERENCES requests(id), FOREIGN KEY(part_id,warehouse_id) REFERENCES inventory(part_id,warehouse_id), CHECK(quantity > 0), INDEX idx_reserve_stock(part_id,warehouse_id)) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS expected_receipts (id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, part_id BIGINT UNSIGNED NOT NULL, warehouse_id BIGINT UNSIGNED NOT NULL, quantity INT UNSIGNED NOT NULL, due_date DATE NOT NULL, supplier VARCHAR(190) NOT NULL, reference VARCHAR(190) NOT NULL, status ENUM('Confirmada','Recebida','Cancelada') NOT NULL DEFAULT 'Confirmada', created_by BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY(part_id) REFERENCES parts(id), FOREIGN KEY(warehouse_id) REFERENCES warehouses(id), FOREIGN KEY(created_by) REFERENCES users(id), CHECK(quantity > 0)) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS map_versions (id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, title VARCHAR(120) NOT NULL, image_data MEDIUMBLOB NOT NULL, image_type VARCHAR(30) NOT NULL, graph JSON NOT NULL, status ENUM('Rascunho','Publicada','Arquivada') NOT NULL DEFAULT 'Rascunho', published_guard TINYINT GENERATED ALWAYS AS (CASE WHEN status = 'Publicada' THEN 1 ELSE NULL END) STORED UNIQUE, created_by BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), published_at DATETIME(3) NULL, FOREIGN KEY(created_by) REFERENCES users(id)) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS integration_events (id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, event_key VARCHAR(190) NOT NULL UNIQUE, event_type VARCHAR(64) NOT NULL, payload JSON NOT NULL, status ENUM('Pendente','Enviado') NOT NULL DEFAULT 'Pendente', created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB`,
  ];
  for (const sql of statements) await c.query(sql);
  await c.beginTransaction();
  try {
    await c.query(
      "UPDATE requests r JOIN users u ON u.id=r.requester_id SET r.sector=u.sector WHERE r.sector=''",
    );
    // Reserva legada até o saldo físico existente. Nenhuma baixa é inventada.
    // Entrega exige reserva completa; déficit legado deve ser reavaliado pelo gestor.
    const [requests] = await c.query(
      "SELECT id,part_id,quantity FROM requests WHERE status='Aprovada' ORDER BY part_id,id FOR UPDATE",
    );
    for (const request of requests) {
      const [existing] = await c.execute(
        "SELECT COALESCE(SUM(quantity),0) AS total FROM request_reservations WHERE request_id=?",
        [request.id],
      );
      let remaining = Number(request.quantity) - Number(existing[0].total);
      const [stocks] = await c.execute(
        "SELECT i.warehouse_id,i.quantity-COALESCE((SELECT SUM(r.quantity) FROM request_reservations r WHERE r.part_id=i.part_id AND r.warehouse_id=i.warehouse_id),0) AS available FROM inventory i WHERE i.part_id=? ORDER BY i.warehouse_id FOR UPDATE",
        [request.part_id],
      );
      for (const stock of stocks) {
        const quantity = Math.min(
          remaining,
          Math.max(0, Number(stock.available)),
        );
        if (quantity > 0) {
          await c.execute(
            "INSERT INTO request_reservations(request_id,part_id,warehouse_id,quantity) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)",
            [request.id, request.part_id, stock.warehouse_id, quantity],
          );
          remaining -= quantity;
        }
      }
    }
    await c.commit();
  } catch (e) {
    await c.rollback();
    throw e;
  }
}
