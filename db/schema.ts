import {
  bigint, char, customType, date, decimal, index, integer, jsonb, pgEnum,
  pgTable, primaryKey, smallint, text, timestamp, uniqueIndex,
  varchar,
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

export const blocks = pgTable("blocks", {
  id: id(), code: varchar("code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 80 }).notNull().unique(),
});

export const warehouses = pgTable("warehouses", {
  id: id(), code: varchar("code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  blockId: bigint("block_id", { mode: "number" }).references(() => blocks.id),
  isCentral: smallint("is_central").notNull().default(0),
  active: smallint("active").notNull().default(1),
}, (t) => [
  uniqueIndex("uq_warehouse_central").on(t.isCentral).where(sql`${t.isCentral} = 1`),
]);

export const users = pgTable("users", {
  id: id(), employeeNo: varchar("employee_no", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(), email: varchar("email", { length: 190 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 190 }).notNull(), role: userRole("role").notNull(),
  sector: varchar("sector", { length: 80 }).notNull(),
  blockId: bigint("block_id", { mode: "number" }).references(() => blocks.id),
  active: smallint("active").notNull().default(1), rfidTag: varchar("rfid_tag", { length: 32 }).unique(),
  rfidAccessEnabled: smallint("rfid_access_enabled").notNull().default(1),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const parts = pgTable("parts", {
  id: id(), code: varchar("code", { length: 64 }).notNull().unique(),
  qrCode: varchar("qr_code", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(), imageUrl: text("image_url"),
  location: varchar("location", { length: 80 }).notNull(),
  packSize: integer("pack_size").notNull().default(1), minimumTotal: integer("minimum_total").notNull().default(1),
  consumed30: integer("consumed_30").notNull().default(0), previous30: integer("previous_30").notNull().default(0),
  leadDays: integer("lead_days").notNull().default(7), referenceUnitPrice: decimal("reference_unit_price", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
  active: smallint("active").notNull().default(1), unit: varchar("unit", { length: 24 }).notNull().default("un"),
  category: varchar("category", { length: 80 }).notNull().default("Peças"), criticality: smallint("criticality").notNull().default(1),
  description: text("description"), purpose: varchar("purpose", { length: 500 }), material: varchar("material", { length: 120 }),
  dimensions: varchar("dimensions", { length: 120 }), approvedAliases: jsonb("approved_aliases"),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const inventory = pgTable("inventory", {
  partId: ref("part_id", () => parts), warehouseId: ref("warehouse_id", () => warehouses), quantity: integer("quantity").notNull().default(0),
  minimumQuantity: integer("minimum_quantity").notNull().default(0), updatedAt: updatedAt(),
  aisle: varchar("aisle", { length: 80 }).notNull().default(""), shelf: varchar("shelf", { length: 80 }).notNull().default(""),
  capacity: integer("capacity"), mapNodeId: varchar("map_node_id", { length: 64 }),
}, (t) => [primaryKey({ columns: [t.partId, t.warehouseId] })]);

export const requests = pgTable("requests", {
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
}, (t) => [index("idx_request_block_status").on(t.blockId, t.status, t.createdAt), index("idx_request_user_date").on(t.requesterId, t.createdAt), index("idx_request_part_date").on(t.partId, t.createdAt)]);

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
export const faceChallenges = pgTable("face_challenges", {
  tokenHash: bytea("token_hash").primaryKey(), userId: ref("user_id", () => users), purpose: challengePurpose("purpose").notNull(),
  poses: jsonb("poses").notNull(), sessionHash: bytea("session_hash"), passwordHash: varchar("password_hash", { length: 190 }).notNull(),
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
