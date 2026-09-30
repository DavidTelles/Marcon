// Search evidence stays on the official parts row and is edited through savePart.
export async function up(connection) {
  const fields = {
    description: "TEXT NULL",
    purpose: "VARCHAR(500) NULL",
    material: "VARCHAR(120) NULL",
    dimensions: "VARCHAR(120) NULL",
    approved_aliases: "JSON NULL",
  };
  for (const [name, definition] of Object.entries(fields)) {
    const [rows] = await connection.execute(
      "SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='parts' AND column_name=?",
      [name],
    );
    if (!rows.length) await connection.query(`ALTER TABLE parts ADD COLUMN ${name} ${definition}`);
  }
}
