import { readFile, mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import sharp from "sharp";
import { transaction, closeDatabase } from "../lib/neon-db.mjs";
import { importPartsCatalog } from "../lib/catalog-import.mjs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const items = JSON.parse(await readFile("data/parts-catalog.json", "utf8"));
for (const item of items) {
  if (
    !/^\/parts\/[a-z0-9-]+\.webp$/.test(item.image) ||
    !item.source.startsWith("https://") ||
    !item.credit ||
    !item.usage ||
    !item.verifiedAt
  )
    throw new Error(`Metadados de fotografia inválidos: ${item.code}`);
  const meta = await sharp(`public${item.image}`).metadata();
  if (meta.width < 200 || meta.height < 200)
    throw new Error(`Foto inválida: ${item.code}`);
}
try {
  const result = await transaction(async (db) => {
    // Serialize concurrent imports, so unique codes and QR identifiers stay stable.
    await db.query("SELECT pg_advisory_xact_lock(761029391)");
    const balanceQuery =
      "SELECT i.part_id,i.warehouse_id,i.quantity,COALESCE((SELECT SUM(r.quantity) FROM request_reservations r WHERE r.part_id=i.part_id AND r.warehouse_id=i.warehouse_id),0) AS reserved FROM inventory i ORDER BY i.part_id,i.warehouse_id";
    const [before] = await db.query(balanceQuery);
    const counts = await importPartsCatalog(db, items);
    const [after] = await db.query(balanceQuery);
    for (const previous of before) {
      const current = after.find(
        (row) =>
          row.part_id === previous.part_id &&
          row.warehouse_id === previous.warehouse_id,
      );
      if (
        !current ||
        current.quantity !== previous.quantity ||
        current.reserved !== previous.reserved
      )
        throw new Error(
          "O catálogo não pode modificar saldos ou reservas existentes.",
        );
    }
    return {
      ...counts,
      total: items.length,
      stock:
        "Novas peças com saldo zero; saldos e reservas existentes preservados.",
    };
  });
  await mkdir(".validation/catalog", { recursive: true });
  await writeFile(
    ".validation/catalog/import.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await closeDatabase();
}
