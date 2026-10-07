// Idempotent metadata import. Availability always comes from the stock ledger.
export async function importPartsCatalog(db, items) {
  // Share the exact identifier namespace with edits, PCP binding and spreadsheet imports.
  await db.execute(
    "SELECT pg_advisory_xact_lock(hashtext('marcon-product-identifiers'))",
  );
  const counts = { added: 0, photos: 0 };
  for (const item of items) {
    const [existing] = await db.query(
      "SELECT id,image_url FROM parts WHERE code=? FOR UPDATE",
      [item.code],
    );
    let id = existing[0]?.id;
    if (!id) {
      const [collision] = await db.query(
        "SELECT id FROM parts WHERE qr_code=? LIMIT 1",
        [item.code],
      );
      if (collision.length)
        throw new Error(
          "Código do catálogo já está vinculado ao QR de outro produto.",
        );
      const [inserted] = await db.execute(
        "INSERT INTO parts(code,qr_code,name,location,pack_size,pack_verified,minimum_total,unit,category,description,purpose,material,dimensions,approved_aliases) VALUES(?,?,?,?,?,1,0,?,?,?,?,?,?,?)",
        [
          item.code,
          item.code,
          item.name,
          "",
          item.packSize,
          item.unit,
          item.category,
          item.description,
          item.purpose,
          item.material,
          item.dimensions,
          JSON.stringify([]),
        ],
      );
      id = inserted.insertId;
      counts.added++;
      await db.execute(
        "INSERT INTO inventory(part_id,warehouse_id,quantity,minimum_quantity) SELECT ?,id,0,0 FROM warehouses WHERE active=1",
        [id],
      );
    }
    await db.execute(
      "UPDATE parts SET category=CASE WHEN category='Peças' THEN ? ELSE category END,description=CASE WHEN description IS NULL OR description='' THEN ? ELSE description END,purpose=CASE WHEN purpose IS NULL OR purpose='' THEN ? ELSE purpose END,material=CASE WHEN material IS NULL OR material='' THEN ? ELSE material END,dimensions=CASE WHEN dimensions IS NULL OR dimensions='' THEN ? ELSE dimensions END WHERE id=?",
      [
        item.category,
        item.description,
        item.purpose,
        item.material,
        item.dimensions,
        id,
      ],
    );
    if (!existing[0]?.image_url || existing[0].image_url === item.image) {
      await db.execute(
        "UPDATE parts SET image_url=?,image_source=?,image_usage=?,image_verified_at=?,image_verified_by=NULL WHERE id=?",
        [item.image, item.source, item.usage, item.verifiedAt, id],
      );
      counts.photos++;
    }
  }
  return counts;
}
