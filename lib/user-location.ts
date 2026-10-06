import type { PoolConnection } from "./db-types";
import { ActionError, integer, text } from "./permissions";
import { first, rows, type Row } from "./stock-ledger";

/** Resolves official IDs without inventing sectors from free text. */
export async function resolveUserLocation(
  c: PoolConnection,
  data: Record<string, unknown>,
  blockId: number | null,
  existing?: Row,
) {
  const sectorName = text(data.sector, 80);
  const workplaceId =
    data.workplaceId === undefined ? existing?.workplace_id : data.workplaceId;
  if (workplaceId) {
    const workplace = await first(
      c,
      "SELECT wp.*,s.name AS sector_name FROM workplaces wp JOIN sectors s ON s.id=wp.sector_id WHERE wp.id=? FOR SHARE",
      [integer(Number(workplaceId))],
    );
    if (!workplace)
      throw new ActionError("Local de trabalho inexistente.", 404);
    if (
      blockId !== Number(workplace.block_id) ||
      sectorName !== workplace.sector_name ||
      (data.sectorId !== undefined &&
        Number(data.sectorId) !== Number(workplace.sector_id))
    )
      throw new ActionError(
        "O bloco e setor devem corresponder ao local de trabalho. Altere o vínculo industrial antes de mudar a lotação.",
        409,
      );
    return {
      blockId,
      branchId: Number(workplace.branch_id),
      sectorId: Number(workplace.sector_id),
      workplaceId: Number(workplace.id),
      sector: String(workplace.sector_name),
    };
  }
  const block = blockId
    ? await first(c, "SELECT branch_id FROM blocks WHERE id=?", [blockId])
    : null;
  const matches = blockId
    ? await rows(
        c,
        "SELECT id,name,branch_id FROM sectors WHERE block_id=? AND LOWER(name)=LOWER(?)",
        [blockId, sectorName],
      )
    : [];
  const explicit = data.sectorId
    ? await first(
        c,
        "SELECT id,name,branch_id,block_id FROM sectors WHERE id=?",
        [integer(Number(data.sectorId))],
      )
    : null;
  if (
    data.sectorId &&
    (!explicit ||
      Number(explicit.block_id) !== blockId ||
      explicit.name !== sectorName)
  )
    throw new ActionError(
      "O setor oficial não corresponde ao bloco e nome informados.",
      409,
    );
  const sector = explicit || (matches.length === 1 ? matches[0] : null);
  let unscopedBranch: number | null = null;
  if (!blockId) {
    if (existing?.branch_id) unscopedBranch = Number(existing.branch_id);
    else {
      const branches = await rows(
        c,
        "SELECT id FROM branches ORDER BY id LIMIT 2",
      );
      if (branches.length === 1) unscopedBranch = Number(branches[0].id);
    }
  }
  return {
    blockId,
    branchId: sector
      ? Number(sector.branch_id)
      : (block?.branch_id ?? unscopedBranch),
    sectorId: sector ? Number(sector.id) : null,
    workplaceId: null,
    sector: sector ? String(sector.name) : sectorName,
  };
}
