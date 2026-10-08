import {
  bigint, char, customType, date, decimal, index, integer, jsonb, pgEnum,
  pgTable, primaryKey, smallint, text, timestamp, uniqueIndex,
  varchar, foreignKey, check, type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity();
const createdAt = () => timestamp("created_at", { mode: "string", precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { mode: "string", precision: 3 }).notNull().defaultNow();
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const ref = (name: string, get: () => { id: import("drizzle-orm/pg-core").AnyPgColumn }) => bigint(name, { mode: "number" }).notNull().references(() => get().id);

export const userRole = pgEnum("user_role", ["admin", "lider", "almoxarifado", "funcionario"]);
export const requestPriority = pgEnum("request_priority", ["Leve", "Moderado", "Urgente"]);
export const requestStatus = pgEnum("request_status", ["Pendente", "Em análise", "Aprovada", "Entregue", "Cancelada", "Cancelamento solicitado", "Em separação", "Em entrega", "Rejeitada"]);
export const transferStatus = pgEnum("transfer_status", ["Solicitada", "Em trânsito", "Recebida", "Cancelada"]);
export const returnCondition = pgEnum("return_condition", ["Apto", "Danificado"]);
export const returnInspection = pgEnum("return_inspection", ["Pendente", "Conferida"]);
export const movementKind = pgEnum("movement_kind", ["entrada", "saida", "transferencia_entrada", "transferencia_saida", "devolucao", "ajuste_entrada", "ajuste_saida"]);
export const expectedReceiptStatus = pgEnum("expected_receipt_status", ["Confirmada", "Recebida", "Cancelada"]);
export const mapStatus = pgEnum("map_status", ["Rascunho", "Publicada", "Arquivada"]);
export const integrationStatus = pgEnum("integration_status", ["Pendente", "Enviado"]);
export const routeEvent = pgEnum("route_event", ["Planejada", "Recalculada", "Saída"]);
export const challengePurpose = pgEnum("challenge_purpose", ["register", "login"]);

export const schemaMigrations = pgTable("schema_migrations", {
  version: varchar("version", { length: 80 }).primaryKey(),
  appliedAt: timestamp("applied_at", { mode: "string", precision: 3 }).notNull().defaultNow(),
});

export const branches = pgTable("branches", {
  id: id(), code: varchar("code", { length: 64 }).notNull().unique(), name: varchar("name", { length: 160 }),
});
export const blocks = pgTable("blocks", {
  id: id(), code: varchar("code", { length: 20 }).notNull().unique(),
  branchId: bigint("branch_id", { mode: "number" }).references(() => branches.id),
  name: varchar("name", { length: 80 }).notNull().unique(),
});

export const sectors = pgTable("sectors", {
  id: id(), code: varchar("code", { length: 64 }).notNull(), name: varchar("name", { length: 160 }).notNull(),
  branchId: ref("branch_id", () => branches), blockId: ref("block_id", () => blocks),
}, (t) => [uniqueIndex("sectors_branch_block_code").on(t.branchId,t.blockId,t.code), uniqueIndex("sectors_id_branch_block").on(t.id,t.branchId,t.blockId)]);
export const warehouses = pgTable("warehouses", {
  pcpKind: varchar("pcp_kind", { length: 24 }).notNull().default("almoxarifado"),
  id: id(), code: varchar("code", { length: 30 }).notNull().unique(),
  branchId: bigint("branch_id", { mode: "number" }).references(() => branches.id),
  name: varchar("name", { length: 80 }).notNull().unique(),
  blockId: bigint("block_id", { mode: "number" }).references(() => blocks.id),
  isCentral: smallint("is_central").notNull().default(0),
  active: smallint("active").notNull().default(1),
}, (t) => [
  check("warehouses_pcp_kind_check", sql`${t.pcpKind} IN ('almoxarifado','producao','aguardando-qualidade')`),
  uniqueIndex("uq_warehouse_central").on(t.isCentral).where(sql`${t.isCentral} = 1`),
]);

export const users = pgTable("users", {
  id: id(), employeeNo: varchar("employee_no", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(), email: varchar("email", { length: 190 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 190 }).notNull(), role: userRole("role").notNull(),
  sector: varchar("sector", { length: 80 }).notNull(),
  blockId: bigint("block_id", { mode: "number" }).references(() => blocks.id),
  branchId: bigint("branch_id", { mode: "number" }).references(() => branches.id),
  sectorId: bigint("sector_id", { mode: "number" }).references(() => sectors.id),
  workplaceId: bigint("workplace_id", { mode: "number" }),
  active: smallint("active").notNull().default(1), rfidTag: varchar("rfid_tag", { length: 32 }).unique(),
  rfidAccessEnabled: smallint("rfid_access_enabled").notNull().default(1),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  foreignKey({ name: "fk_user_workplace", columns: [t.workplaceId,t.branchId,t.blockId,t.sectorId], foreignColumns: [workplaces.id,workplaces.branchId,workplaces.blockId,workplaces.sectorId] }),
  check("ck_user_workplace",sql`${t.workplaceId} IS NULL OR (${t.branchId} IS NOT NULL AND ${t.blockId} IS NOT NULL AND ${t.sectorId} IS NOT NULL)`),
]);

export const parts = pgTable("parts", {
  materialKind: varchar("material_kind", { length: 24 }).notNull().default("componente"),
  packVerified: smallint("pack_verified").notNull().default(1),
  id: id(), code: varchar("code", { length: 64 }).notNull().unique(),
  qrCode: varchar("qr_code", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(), imageUrl: text("image_url"),
  imageSource: text("image_source"), imageUsage: text("image_usage"), imageVerifiedAt: timestamp("image_verified_at", { mode: "string", precision: 3 }), imageVerifiedBy: bigint("image_verified_by", { mode: "number" }).references(() => users.id),
  location: varchar("location", { length: 80 }).notNull(),
  packSize: integer("pack_size").notNull().default(1), minimumTotal: integer("minimum_total").notNull().default(1),
  consumed30: integer("consumed_30").notNull().default(0), previous30: integer("previous_30").notNull().default(0),
  leadDays: integer("lead_days").notNull().default(7), referenceUnitPrice: decimal("reference_unit_price", { precision: 12, scale: 2, mode: "number" }),
  active: smallint("active").notNull().default(1), unit: varchar("unit", { length: 24 }).notNull().default("un"),
  category: varchar("category", { length: 80 }).notNull().default("Peças"), criticality: smallint("criticality").notNull().default(1),
  description: text("description"), purpose: varchar("purpose", { length: 500 }), material: varchar("material", { length: 120 }),
  dimensions: varchar("dimensions", { length: 120 }), approvedAliases: jsonb("approved_aliases"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [check("parts_material_kind_check", sql`${t.materialKind} IN ('materia-prima','componente','embalagem','consumivel')`)]);

export const inventory = pgTable("inventory", {
  partId: ref("part_id", () => parts), warehouseId: ref("warehouse_id", () => warehouses), quantity: integer("quantity").notNull().default(0),
  minimumQuantity: integer("minimum_quantity").notNull().default(0), updatedAt: updatedAt(),
  aisle: varchar("aisle", { length: 80 }).notNull().default(""), shelf: varchar("shelf", { length: 80 }).notNull().default(""),
  capacity: integer("capacity"), mapNodeId: varchar("map_node_id", { length: 64 }).references((): AnyPgColumn => plantPoints.id),
}, (t) => [primaryKey({ columns: [t.partId, t.warehouseId] })]);

export const requests = pgTable("requests", {
  destinationPointId: varchar("destination_point_id", { length: 64 }),
  sectorId: bigint("sector_id", { mode: "number" }).references(() => sectors.id),
  workplaceId: bigint("workplace_id", { mode: "number" }).references((): AnyPgColumn => workplaces.id),
  requestedUnit: varchar("requested_unit", { length: 12 }).notNull().default("piece"),
  requestedAmount: integer("requested_amount"), packSizeAtRequest: integer("pack_size_at_request"),
  anomaly: jsonb("anomaly"), pickedAt: timestamp("picked_at", { mode: "string", precision: 3 }),
  pickupConfirmation: jsonb("pickup_confirmation"),
  id: id(), requesterId: ref("requester_id", () => users), blockId: ref("block_id", () => blocks), partId: ref("part_id", () => parts),
  quantity: integer("quantity").notNull(), priority: requestPriority("priority").notNull().default("Leve"),
  status: requestStatus("status").notNull().default("Pendente"), justification: text("justification"),
  approvedBy: bigint("approved_by", { mode: "number" }).references(() => users.id),
  fulfilledBy: bigint("fulfilled_by", { mode: "number" }).references(() => users.id),
  fulfilledFrom: bigint("fulfilled_from", { mode: "number" }).references(() => warehouses.id),
  createdAt: createdAt(), updatedAt: updatedAt(), batchId: varchar("batch_id", { length: 36 }),
  sector: varchar("sector", { length: 80 }).notNull().default(""),
  approvedAt: timestamp("approved_at", { mode: "string", precision: 3 }),
  deliveredAt: timestamp("delivered_at", { mode: "string", precision: 3 }),
  receivedAt: timestamp("received_at", { mode: "string", precision: 3 }),
  cancellationReason: varchar("cancellation_reason", { length: 1000 }),
}, (t) => [index("idx_request_block_status").on(t.blockId, t.status, t.createdAt), index("idx_request_user_date").on(t.requesterId, t.createdAt), index("idx_request_part_date").on(t.partId, t.createdAt), index("idx_requests_destination_point").on(t.destinationPointId).where(sql`${t.destinationPointId} IS NOT NULL`), foreignKey({name:"requests_destination_point_id_fkey",columns:[t.destinationPointId],foreignColumns:[plantPoints.id]})]);

export const stockTransfers = pgTable("stock_transfers", {
  id: id(), partId: ref("part_id", () => parts), sourceWarehouseId: ref("source_warehouse_id", () => warehouses), destinationWarehouseId: ref("destination_warehouse_id", () => warehouses),
  quantity: integer("quantity").notNull(), qrCodeScanned: varchar("qr_code_scanned", { length: 128 }).notNull(),
  performedBy: ref("performed_by", () => users), createdAt: createdAt(), status: transferStatus("status").notNull().default("Recebida"),
  reason: varchar("reason", { length: 1000 }).notNull().default(""), requestKey: varchar("request_key", { length: 64 }).unique(),
  shippedBy: bigint("shipped_by", { mode: "number" }).references(() => users.id),
  receivedBy: bigint("received_by", { mode: "number" }).references(() => users.id),
  shippedAt: timestamp("shipped_at", { mode: "string", precision: 3 }),
  receivedAt: timestamp("received_at", { mode: "string", precision: 3 }),
});

export const pcpReceipts = pgTable("pcp_receipts", {
  id: id(), partId: ref("part_id", () => parts), invoice: varchar("invoice", { length: 190 }).notNull(), lot: varchar("lot", { length: 120 }).notNull(),
  invoiceQuantity: integer("invoice_quantity").notNull(), invoiceWeight: decimal("invoice_weight", { precision: 20, scale: 6, mode: "number" }),
  countedQuantity: integer("counted_quantity"), countedWeight: decimal("counted_weight", { precision: 20, scale: 6, mode: "number" }),
  status: varchar("status", { length: 32 }).notNull().default("Aguardando conferência"), qualityNote: text("quality_note"), totusReference: varchar("totus_reference", { length: 190 }),
  transferredTo: bigint("transferred_to", { mode: "number" }).references(() => warehouses.id), actorId: ref("actor_id", () => users), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("idx_pcp_receipts_part").on(t.partId,t.status), check("pcp_receipts_invoice_quantity_check", sql`${t.invoiceQuantity}>0`), check("pcp_receipts_invoice_weight_check", sql`${t.invoiceWeight}>0`), check("pcp_receipts_counted_quantity_check", sql`${t.countedQuantity}>=0`), check("pcp_receipts_counted_weight_check", sql`${t.countedWeight}>=0`), check("pcp_receipts_status_check", sql`${t.status} IN ('Aguardando conferência','Pendente','Aguardando qualidade','Aprovado','Reprovado','Transferido')`)]);
export const pcpRequests = pgTable("pcp_requests", {
  id: id(), partId: ref("part_id", () => parts), requesterId: ref("requester_id", () => users), sourceWarehouseId: ref("source_warehouse_id", () => warehouses),
  destinationWarehouseId: bigint("destination_warehouse_id", { mode: "number" }).references(() => warehouses.id), quantity: integer("quantity").notNull(), pickedQuantity: integer("picked_quantity"),
  costCenter: varchar("cost_center", { length: 120 }).notNull(), productionOrder: varchar("production_order", { length: 120 }), consumable: smallint("consumable").notNull().default(0),
  status: varchar("status", { length: 24 }).notNull().default("Pendente"), transferId: bigint("transfer_id", { mode: "number" }).unique().references(() => stockTransfers.id), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("idx_pcp_requests_actor").on(t.requesterId,t.status), check("pcp_requests_quantity_check", sql`${t.quantity}>0`), check("pcp_requests_picked_quantity_check", sql`${t.pickedQuantity}>0`), check("pcp_requests_consumable_check", sql`${t.consumable} IN (0,1)`), check("pcp_requests_status_check", sql`${t.status} IN ('Pendente','Separada','Liberada','Transferida','Baixada')`)]);
export const pcpOrders = pgTable("pcp_orders", {
  id: id(), requestId: ref("request_id", () => pcpRequests).unique(), partId: ref("part_id", () => parts), quantity: integer("quantity").notNull(), reference: varchar("reference", { length: 190 }).notNull(), actorId: ref("actor_id", () => users), createdAt: createdAt(),
}, (t) => [check("pcp_orders_quantity_check", sql`${t.quantity}>0`)]);

export const returnRecords = pgTable("return_records", {
  id: id(), partId: ref("part_id", () => parts), blockId: ref("block_id", () => blocks), warehouseId: ref("warehouse_id", () => warehouses),
  quantity: integer("quantity").notNull(), conditionType: returnCondition("condition_type").notNull(),
  returnedBy: varchar("returned_by", { length: 120 }).notNull(), note: text("note"), receivedBy: ref("received_by", () => users),
  createdAt: createdAt(), requestId: bigint("request_id", { mode: "number" }).references(() => requests.id),
  inspectionStatus: returnInspection("inspection_status").notNull().default("Conferida"),
  inspectedAt: timestamp("inspected_at", { mode: "string", precision: 3 }),
});

export const stockMovements = pgTable("stock_movements", {
  id: id(), partId: ref("part_id", () => parts), warehouseId: ref("warehouse_id", () => warehouses), kind: movementKind("kind").notNull(),
  quantity: integer("quantity").notNull(), requestId: bigint("request_id", { mode: "number" }).references(() => requests.id),
  transferId: bigint("transfer_id", { mode: "number" }).references(() => stockTransfers.id),
  returnId: bigint("return_id", { mode: "number" }).references(() => returnRecords.id),
  blockId: bigint("block_id", { mode: "number" }).references(() => blocks.id), actorId: ref("actor_id", () => users),
  createdAt: createdAt(), reason: varchar("reason", { length: 1000 }).notNull().default(""),
}, (t) => [index("idx_movement_part_date").on(t.partId, t.createdAt), index("idx_movement_warehouse_date").on(t.warehouseId, t.createdAt), index("idx_movement_block_date").on(t.blockId, t.createdAt)]);

export const auditLog = pgTable("audit_log", {
  id: id(), actorId: ref("actor_id", () => users), entityType: varchar("entity_type", { length: 40 }).notNull(),
  entityId: bigint("entity_id", { mode: "number" }).notNull(), action: varchar("action", { length: 40 }).notNull(),
  details: jsonb("details"), createdAt: createdAt(),
}, (t) => [index("idx_audit_entity").on(t.entityType, t.entityId, t.createdAt)]);

export const authAttempts = pgTable("auth_attempts", {
  identityDigest: bytea("identity_digest").primaryKey(), attempts: smallint("attempts").notNull().default(0),
  firstAt: timestamp("first_at", { mode: "string", precision: 3 }).notNull().defaultNow(), blockedUntil: timestamp("blocked_until", { mode: "string", precision: 3 }),
});

export const passkeyCredentials = pgTable("passkey_credentials", {
  credentialId: varchar("credential_id", { length: 512 }).primaryKey(), userId: ref("user_id", () => users),
  publicKey: bytea("public_key").notNull(), counter: bigint("counter", { mode: "number" }).notNull().default(0),
  transports: jsonb("transports"), createdAt: createdAt(),
});
export const passkeyChallenges = pgTable("passkey_challenges", {
  tokenHash: bytea("token_hash").primaryKey(), userId: ref("user_id", () => users), challenge: varchar("challenge", { length: 128 }).notNull(),
  purpose: challengePurpose("purpose").notNull(), expiresAt: timestamp("expires_at", { mode: "string", precision: 3 }).notNull(),
});
export const faceCredentials = pgTable("face_credentials", {
  userId: bigint("user_id", { mode: "number" }).primaryKey().references(() => users.id, { onDelete: "cascade" }),
  embeddings: bytea("embeddings").notNull(), modelVersion: varchar("model_version", { length: 64 }).notNull(),
  consentVersion: varchar("consent_version", { length: 40 }).notNull(), createdAt: createdAt(),
});
export const faceLoginGrants = pgTable("face_login_grants", {
  tokenHash: bytea("token_hash").primaryKey(), userId: ref("user_id", () => users),
  passwordHash: varchar("password_hash", { length: 190 }).notNull(),
  credentialHash: varchar("credential_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { mode: "string", precision: 3 }).notNull(), createdAt: createdAt(),
}, (t) => [index("idx_face_login_grants_expiry").on(t.expiresAt)]);
export const faceChallenges = pgTable("face_challenges", {
  tokenHash: bytea("token_hash").primaryKey(), userId: bigint("user_id", { mode: "number" }).references(() => users.id), purpose: challengePurpose("purpose").notNull(),
  poses: jsonb("poses").notNull(), sessionHash: bytea("session_hash"), passwordHash: varchar("password_hash", { length: 190 }),
  createdAt: createdAt(), expiresAt: timestamp("expires_at", { mode: "string", precision: 3 }).notNull(),
}, (t) => [index("idx_face_challenge_expiry").on(t.expiresAt)]);

export const requestReservations = pgTable("request_reservations", {
  requestId: ref("request_id", () => requests), partId: bigint("part_id", { mode: "number" }).notNull().references(() => parts.id), warehouseId: bigint("warehouse_id", { mode: "number" }).notNull().references(() => warehouses.id),
  quantity: integer("quantity").notNull(),
}, (t) => [primaryKey({ columns: [t.requestId, t.warehouseId] }), index("idx_reserve_stock").on(t.partId, t.warehouseId)]);
export const expectedReceipts = pgTable("expected_receipts", {
  id: id(), partId: ref("part_id", () => parts), warehouseId: ref("warehouse_id", () => warehouses), quantity: integer("quantity").notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(), supplier: varchar("supplier", { length: 190 }).notNull(),
  reference: varchar("reference", { length: 190 }).notNull(), status: expectedReceiptStatus("status").notNull().default("Confirmada"),
  createdBy: ref("created_by", () => users), createdAt: createdAt(),
});
export const mapVersions = pgTable("map_versions", {
  id: id(), title: varchar("title", { length: 120 }).notNull(), imageData: bytea("image_data").notNull(),
  imageType: varchar("image_type", { length: 30 }).notNull(), graph: jsonb("graph").notNull(), status: mapStatus("status").notNull().default("Rascunho"),
  createdBy: ref("created_by", () => users), createdAt: createdAt(), publishedAt: timestamp("published_at", { mode: "string", precision: 3 }),
}, (t) => [uniqueIndex("uq_map_published").on(t.status).where(sql`${t.status} = 'Publicada'`)]);
export const integrationEvents = pgTable("integration_events", {
  id: id(), eventKey: varchar("event_key", { length: 190 }).notNull().unique(), eventType: varchar("event_type", { length: 64 }).notNull(),
  payload: jsonb("payload").notNull(), status: integrationStatus("status").notNull().default("Pendente"), createdAt: createdAt(),
});
export const deliveryRouteHistory = pgTable("delivery_route_history", {
  id: id(), requestId: ref("request_id", () => requests), mapVersionId: bigint("map_version_id", { mode: "number" }).references(() => mapVersions.id),
  actorId: ref("actor_id", () => users), event: routeEvent("event").notNull(), payload: jsonb("payload").notNull(), createdAt: createdAt(),
}, (t) => [index("idx_delivery_history").on(t.requestId, t.id)]);
export const requestSubmissions = pgTable("request_submissions", {
  actorId: ref("actor_id", () => users), requestKey: varchar("request_key", { length: 64 }).notNull(), payloadHash: char("payload_hash", { length: 64 }).notNull(),
  result: jsonb("result"), createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.actorId, t.requestKey] })]);
export const rfidAccessEvents = pgTable("rfid_access_events", {
  id: id(), rfidId: varchar("rfid_id", { length: 32 }).notNull(), userId: bigint("user_id", { mode: "number" }).references(() => users.id),
  allowed: smallint("allowed").notNull().default(0), reason: varchar("reason", { length: 190 }).notNull(),
  location: varchar("location", { length: 120 }), device: varchar("device", { length: 120 }), createdAt: createdAt(),
}, (t) => [index("idx_rfid_events_tag").on(t.rfidId, t.createdAt)]);
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: id(), userId: ref("user_id", () => users), tokenHash: char("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { mode: "string", precision: 3 }).notNull(),
  usedAt: timestamp("used_at", { mode: "string", precision: 3 }), createdAt: createdAt(),
}, (t) => [index("idx_reset_token").on(t.tokenHash)]);
export const userPermissionOverrides = pgTable("user_permission_overrides", {
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  permission: varchar("permission", { length: 80 }).notNull(), allowed: smallint("allowed").notNull().default(1),
}, (t) => [primaryKey({ columns: [t.userId, t.permission] })]);

export const plantPoints = pgTable("plant_points", {
  id: varchar("id", { length: 64 }).primaryKey(), label: varchar("label", { length: 120 }).notNull(), kind: varchar("kind", { length: 40 }).notNull(),
  warehouseId: bigint("warehouse_id", { mode: "number" }).references(() => warehouses.id), blockId: bigint("block_id", { mode: "number" }).references(() => blocks.id), sectorId: bigint("sector_id", { mode: "number" }).references(() => sectors.id),
  publishedVersionId: bigint("published_version_id", { mode: "number" }).references((): AnyPgColumn => mapVersions.id), active: smallint("active").notNull().default(0),
});
export const workplaces = pgTable("workplaces", {
  id: id(), code: varchar("code", { length: 64 }).notNull().unique(), name: varchar("name", { length: 160 }).notNull(),
  branchId: ref("branch_id", () => branches), blockId: ref("block_id", () => blocks), sectorId: bigint("sector_id", { mode: "number" }).notNull(), pointId: varchar("point_id", { length: 64 }).references(() => plantPoints.id),
}, (t) => [foreignKey({ columns: [t.sectorId,t.branchId,t.blockId], foreignColumns: [sectors.id,sectors.branchId,sectors.blockId] }), uniqueIndex("workplaces_id_scope").on(t.id,t.branchId,t.blockId,t.sectorId)]);
export const materialImportRuns = pgTable("material_import_runs", {
  id: id(), fileName: varchar("file_name", { length: 190 }).notNull(), fileHash: char("file_hash", { length: 64 }).notNull().unique(), mapping: jsonb("mapping").notNull(), actorId: ref("actor_id", () => users), createdAt: createdAt(),
});
export const materialImportLines = pgTable("material_import_lines", {
  id: id(), runId: ref("run_id", () => materialImportRuns), sheet: varchar("sheet", { length: 120 }).notNull(), rowNumber: integer("row_number").notNull(), code: varchar("code", { length: 64 }).notNull(), branchCode: varchar("branch_code", { length: 64 }).notNull(), materialId: bigint("material_id", { mode: "number" }).references(() => parts.id),
  rawCells: jsonb("raw_cells").notNull(), parameters: jsonb("parameters").notNull(), consumption: jsonb("consumption").notNull(), conflicts: jsonb("conflicts").notNull(),
}, (t) => [uniqueIndex("import_run_line").on(t.runId,t.sheet,t.rowNumber)]);
export const reportedBalances = pgTable("reported_balances", {
  id: id(), sourceLineId: bigint("source_line_id", { mode: "number" }).notNull().unique().references(() => materialImportLines.id), materialId: bigint("material_id", { mode: "number" }).references(() => parts.id), branchId: ref("branch_id", () => branches), warehouseId: bigint("warehouse_id", { mode: "number" }).references(() => warehouses.id), quantity: decimal("quantity", { precision: 20, scale: 6, mode: "number" }), unit: varchar("unit", { length: 32 }).notNull(), reconciliationMovementId: bigint("reconciliation_movement_id", { mode: "number" }).references(() => stockMovements.id),
});
export const reportedPurchases = pgTable("reported_purchases", {
  id: id(), sourceLineId: bigint("source_line_id", { mode: "number" }).notNull().unique().references(() => materialImportLines.id), materialId: bigint("material_id", { mode: "number" }).references(() => parts.id), branchId: ref("branch_id", () => branches), directive: text("directive"), orderQuantity: decimal("order_quantity", { precision: 20, scale: 6, mode: "number" }), parcelTotal: decimal("parcel_total", { precision: 20, scale: 6, mode: "number" }), programme: jsonb("programme").notNull(),
});

export const stockRecommendations = pgTable("stock_recommendations", {
  key: char("key", { length: 64 }).primaryKey(), partId: bigint("part_id", { mode: "number" }).notNull(),
  sourceWarehouseId: bigint("source_warehouse_id", { mode: "number" }).notNull(), destinationWarehouseId: bigint("destination_warehouse_id", { mode: "number" }).notNull(),
  quantity: integer("quantity").notNull(), mapVersionId: bigint("map_version_id", { mode: "number" }).notNull(),
  partUpdatedAt: timestamp("part_updated_at", { mode: "string", precision: 3 }).notNull(), payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("Pendente"), createdAt: createdAt(),
  decidedAt: timestamp("decided_at", { mode: "string", precision: 3 }), decidedBy: bigint("decided_by", { mode: "number" }),
  transferId: bigint("transfer_id", { mode: "number" }),
}, (t) => [index("idx_stock_recommendations_part").on(t.partId,t.status), check("stock_recommendations_quantity_check", sql`${t.quantity}>0`), check("stock_recommendations_status_check", sql`${t.status} IN ('Pendente','Aceita','Rejeitada')`),
  foreignKey({name:"stock_recommendations_part_id_fkey",columns:[t.partId],foreignColumns:[parts.id]}),
  foreignKey({name:"stock_recommendations_source_warehouse_id_fkey",columns:[t.sourceWarehouseId],foreignColumns:[warehouses.id]}),
  foreignKey({name:"stock_recommendations_destination_warehouse_id_fkey",columns:[t.destinationWarehouseId],foreignColumns:[warehouses.id]}),
  foreignKey({name:"stock_recommendations_map_version_id_fkey",columns:[t.mapVersionId],foreignColumns:[mapVersions.id]}),
  foreignKey({name:"stock_recommendations_decided_by_fkey",columns:[t.decidedBy],foreignColumns:[users.id]}),
  foreignKey({name:"stock_recommendations_transfer_id_fkey",columns:[t.transferId],foreignColumns:[stockTransfers.id]}),
]);
