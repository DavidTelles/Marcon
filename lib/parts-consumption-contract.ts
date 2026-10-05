import type { PartsConsumptionReport } from "./parts-consumption";

// Increment when an incompatible report shape or calculation contract changes.
export const PARTS_REPORT_VERSION = 1;
export const PARTS_REPORT_INCOMPATIBLE =
  "A API de peças retornou uma resposta incompatível. Reinicie o serviço atualizado e tente novamente.";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value);
const strings = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** Reject old API contracts instead of inventing missing indicators as zero. */
export function isPartsConsumptionReport(
  value: unknown,
): value is PartsConsumptionReport {
  if (!record(value) || value.schemaVersion !== PARTS_REPORT_VERSION)
    return false;
  const { period, comparison, filters, total, quality, options, details } =
    value;
  return (
    record(period) &&
    typeof period.from === "string" &&
    typeof period.to === "string" &&
    period.timezone === "UTC" &&
    finite(period.days) &&
    record(comparison) &&
    typeof comparison.from === "string" &&
    typeof comparison.to === "string" &&
    record(filters) &&
    typeof filters.unit === "string" &&
    Object.values(filters).every((item) => typeof item === "string") &&
    record(total) &&
    ["quantity", "previousQuantity", "withdrawals", "difference"].every((key) =>
      finite(total[key]),
    ) &&
    (total.average === null || finite(total.average)) &&
    (total.change === null || finite(total.change)) &&
    record(quality) &&
    [
      "missingBlock",
      "nonConvertible",
      "missingCost",
      "missingReferencePrice",
      "insufficientHistory",
      "legacyWithoutLedger",
    ].every((key) => finite(quality[key])) &&
    typeof quality.financialUnavailable === "string" &&
    typeof quality.coverageUnavailable === "string" &&
    record(options) &&
    Array.isArray(options.parts) &&
    options.parts.every(
      (part) =>
        record(part) &&
        ["code", "name", "unit"].every((key) => typeof part[key] === "string"),
    ) &&
    ["units", "groups", "blocks", "warehouses"].every((key) =>
      strings(options[key]),
    ) &&
    [
      "items",
      "ranking",
      "blocks",
      "daily",
      "distribution",
      "returns",
      "cohort",
      "stocks",
    ].every((key) => Array.isArray(value[key])) &&
    strings(value.series) &&
    ["totalItems", "page", "pages", "threshold"].every((key) =>
      finite(value[key]),
    ) &&
    [
      "scope",
      "participation",
      "cohortMethod",
      "generatedAt",
      "methodology",
    ].every((key) => typeof value[key] === "string") &&
    (details === null ||
      (record(details) &&
        finite(details.total) &&
        finite(details.page) &&
        Array.isArray(details.records)))
  );
}
