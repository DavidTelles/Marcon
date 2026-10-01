CREATE TYPE "public"."challenge_purpose" AS ENUM('register', 'login');--> statement-breakpoint
CREATE TYPE "public"."expected_receipt_status" AS ENUM('Confirmada', 'Recebida', 'Cancelada');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('Pendente', 'Enviado');--> statement-breakpoint
CREATE TYPE "public"."map_status" AS ENUM('Rascunho', 'Publicada', 'Arquivada');--> statement-breakpoint
CREATE TYPE "public"."movement_kind" AS ENUM('entrada', 'saida', 'transferencia_entrada', 'transferencia_saida', 'devolucao', 'ajuste_entrada', 'ajuste_saida');--> statement-breakpoint
CREATE TYPE "public"."request_priority" AS ENUM('Leve', 'Moderado', 'Urgente');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('Pendente', 'Em análise', 'Aprovada', 'Entregue', 'Cancelada', 'Cancelamento solicitado');--> statement-breakpoint
CREATE TYPE "public"."return_condition" AS ENUM('Apto', 'Danificado');--> statement-breakpoint
CREATE TYPE "public"."return_inspection" AS ENUM('Pendente', 'Conferida');--> statement-breakpoint
CREATE TYPE "public"."route_event" AS ENUM('Planejada', 'Recalculada', 'Saída');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('Solicitada', 'Em trânsito', 'Recebida', 'Cancelada');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'lider', 'almoxarifado', 'funcionario');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_id" bigint NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" bigint NOT NULL,
	"action" varchar(40) NOT NULL,
	"details" jsonb,
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_attempts" (
	"identity_digest" "bytea" PRIMARY KEY NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"first_at" timestamp(3) DEFAULT now() NOT NULL,
	"blocked_until" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "blocks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" varchar(20) NOT NULL,
	"name" varchar(80) NOT NULL,
	CONSTRAINT "blocks_code_unique" UNIQUE("code"),
	CONSTRAINT "blocks_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "delivery_route_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "delivery_route_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"request_id" bigint NOT NULL,
	"map_version_id" bigint,
	"actor_id" bigint NOT NULL,
	"event" "route_event" NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expected_receipts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "expected_receipts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"part_id" bigint NOT NULL,
	"warehouse_id" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"due_date" date NOT NULL,
	"supplier" varchar(190) NOT NULL,
	"reference" varchar(190) NOT NULL,
	"status" "expected_receipt_status" DEFAULT 'Confirmada' NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "face_challenges" (
	"token_hash" "bytea" PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"purpose" "challenge_purpose" NOT NULL,
	"poses" jsonb NOT NULL,
	"session_hash" "bytea",
	"password_hash" varchar(190) NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"expires_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "face_credentials" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"embeddings" "bytea" NOT NULL,
	"model_version" varchar(64) NOT NULL,
	"consent_version" varchar(40) NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "integration_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_key" varchar(190) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "integration_status" DEFAULT 'Pendente' NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "integration_events_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"part_id" bigint NOT NULL,
	"warehouse_id" bigint NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"minimum_quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL,
	"aisle" varchar(80) DEFAULT '' NOT NULL,
	"shelf" varchar(80) DEFAULT '' NOT NULL,
	"capacity" integer,
	"map_node_id" varchar(64),
	CONSTRAINT "inventory_part_id_warehouse_id_pk" PRIMARY KEY("part_id","warehouse_id")
);
--> statement-breakpoint
CREATE TABLE "map_versions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "map_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"title" varchar(120) NOT NULL,
	"image_data" "bytea" NOT NULL,
	"image_type" varchar(30) NOT NULL,
	"graph" jsonb NOT NULL,
	"status" "map_status" DEFAULT 'Rascunho' NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"published_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "parts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" varchar(64) NOT NULL,
	"qr_code" varchar(128) NOT NULL,
	"name" varchar(160) NOT NULL,
	"image_url" text,
	"location" varchar(80) NOT NULL,
	"pack_size" integer DEFAULT 1 NOT NULL,
	"minimum_total" integer DEFAULT 1 NOT NULL,
	"consumed_30" integer DEFAULT 0 NOT NULL,
	"previous_30" integer DEFAULT 0 NOT NULL,
	"lead_days" integer DEFAULT 7 NOT NULL,
	"reference_unit_price" numeric(12, 2) DEFAULT 0 NOT NULL,
	"active" smallint DEFAULT 1 NOT NULL,
	"unit" varchar(24) DEFAULT 'un' NOT NULL,
	"category" varchar(80) DEFAULT 'Peças' NOT NULL,
	"criticality" smallint DEFAULT 1 NOT NULL,
	"description" text,
	"purpose" varchar(500),
	"material" varchar(120),
	"dimensions" varchar(120),
	"approved_aliases" jsonb,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "parts_code_unique" UNIQUE("code"),
	CONSTRAINT "parts_qr_code_unique" UNIQUE("qr_code")
);
--> statement-breakpoint
CREATE TABLE "passkey_challenges" (
	"token_hash" "bytea" PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"challenge" varchar(128) NOT NULL,
	"purpose" "challenge_purpose" NOT NULL,
	"expires_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey_credentials" (
	"credential_id" varchar(512) PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"public_key" "bytea" NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" jsonb,
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "password_reset_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"token_hash" char(64) NOT NULL,
	"expires_at" timestamp(3) NOT NULL,
	"used_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_reservations" (
	"request_id" bigint NOT NULL,
	"part_id" bigint NOT NULL,
	"warehouse_id" bigint NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "request_reservations_request_id_warehouse_id_pk" PRIMARY KEY("request_id","warehouse_id")
);
--> statement-breakpoint
CREATE TABLE "request_submissions" (
	"actor_id" bigint NOT NULL,
	"request_key" varchar(64) NOT NULL,
	"payload_hash" char(64) NOT NULL,
	"result" jsonb,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "request_submissions_actor_id_request_key_pk" PRIMARY KEY("actor_id","request_key")
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"requester_id" bigint NOT NULL,
	"block_id" bigint NOT NULL,
	"part_id" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"priority" "request_priority" DEFAULT 'Leve' NOT NULL,
	"status" "request_status" DEFAULT 'Pendente' NOT NULL,
	"justification" text,
	"approved_by" bigint,
	"fulfilled_by" bigint,
	"fulfilled_from" bigint,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL,
	"batch_id" varchar(36),
	"sector" varchar(80) DEFAULT '' NOT NULL,
	"approved_at" timestamp(3),
	"delivered_at" timestamp(3),
	"received_at" timestamp(3),
	"cancellation_reason" varchar(1000)
);
--> statement-breakpoint
CREATE TABLE "return_records" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "return_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"part_id" bigint NOT NULL,
	"block_id" bigint NOT NULL,
	"warehouse_id" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"condition_type" "return_condition" NOT NULL,
	"returned_by" varchar(120) NOT NULL,
	"note" text,
	"received_by" bigint NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"request_id" bigint,
	"inspection_status" "return_inspection" DEFAULT 'Conferida' NOT NULL,
	"inspected_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "rfid_access_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rfid_access_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"rfid_id" varchar(32) NOT NULL,
	"user_id" bigint,
	"allowed" smallint DEFAULT 0 NOT NULL,
	"reason" varchar(190) NOT NULL,
	"location" varchar(120),
	"device" varchar(120),
	"created_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_migrations" (
	"version" varchar(80) PRIMARY KEY NOT NULL,
	"applied_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_movements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"part_id" bigint NOT NULL,
	"warehouse_id" bigint NOT NULL,
	"kind" "movement_kind" NOT NULL,
	"quantity" integer NOT NULL,
	"request_id" bigint,
	"transfer_id" bigint,
	"return_id" bigint,
	"block_id" bigint,
	"actor_id" bigint NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"reason" varchar(1000) DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_transfers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"part_id" bigint NOT NULL,
	"source_warehouse_id" bigint NOT NULL,
	"destination_warehouse_id" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"qr_code_scanned" varchar(128) NOT NULL,
	"performed_by" bigint NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"status" "transfer_status" DEFAULT 'Recebida' NOT NULL,
	"reason" varchar(1000) DEFAULT '' NOT NULL,
	"request_key" varchar(64),
	"shipped_by" bigint,
	"received_by" bigint,
	"shipped_at" timestamp(3),
	"received_at" timestamp(3),
	CONSTRAINT "stock_transfers_request_key_unique" UNIQUE("request_key")
);
--> statement-breakpoint
CREATE TABLE "user_permission_overrides" (
	"user_id" bigint NOT NULL,
	"permission" varchar(80) NOT NULL,
	"allowed" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "user_permission_overrides_user_id_permission_pk" PRIMARY KEY("user_id","permission")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"employee_no" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(190) NOT NULL,
	"password_hash" varchar(190) NOT NULL,
	"role" "user_role" NOT NULL,
	"sector" varchar(80) NOT NULL,
	"block_id" bigint,
	"active" smallint DEFAULT 1 NOT NULL,
	"rfid_tag" varchar(32),
	"rfid_access_enabled" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "users_employee_no_unique" UNIQUE("employee_no"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_rfid_tag_unique" UNIQUE("rfid_tag")
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "warehouses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" varchar(30) NOT NULL,
	"name" varchar(80) NOT NULL,
	"block_id" bigint,
	"is_central" smallint DEFAULT 0 NOT NULL,
	"active" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "warehouses_code_unique" UNIQUE("code"),
	CONSTRAINT "warehouses_name_unique" UNIQUE("name"),
	CONSTRAINT "warehouses_block_id_unique" UNIQUE("block_id")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_route_history" ADD CONSTRAINT "delivery_route_history_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_route_history" ADD CONSTRAINT "delivery_route_history_map_version_id_map_versions_id_fk" FOREIGN KEY ("map_version_id") REFERENCES "public"."map_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_route_history" ADD CONSTRAINT "delivery_route_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_receipts" ADD CONSTRAINT "expected_receipts_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_receipts" ADD CONSTRAINT "expected_receipts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_receipts" ADD CONSTRAINT "expected_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_challenges" ADD CONSTRAINT "face_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_credentials" ADD CONSTRAINT "face_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_versions" ADD CONSTRAINT "map_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey_challenges" ADD CONSTRAINT "passkey_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey_credentials" ADD CONSTRAINT "passkey_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_reservations" ADD CONSTRAINT "request_reservations_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_reservations" ADD CONSTRAINT "request_reservations_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_reservations" ADD CONSTRAINT "request_reservations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_submissions" ADD CONSTRAINT "request_submissions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_fulfilled_by_users_id_fk" FOREIGN KEY ("fulfilled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_fulfilled_from_warehouses_id_fk" FOREIGN KEY ("fulfilled_from") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_records" ADD CONSTRAINT "return_records_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_records" ADD CONSTRAINT "return_records_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_records" ADD CONSTRAINT "return_records_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_records" ADD CONSTRAINT "return_records_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_records" ADD CONSTRAINT "return_records_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfid_access_events" ADD CONSTRAINT "rfid_access_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_return_id_return_records_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."return_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_source_warehouse_id_warehouses_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_destination_warehouse_id_warehouses_id_fk" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_shipped_by_users_id_fk" FOREIGN KEY ("shipped_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_delivery_history" ON "delivery_route_history" USING btree ("request_id","id");--> statement-breakpoint
CREATE INDEX "idx_face_challenge_expiry" ON "face_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_map_published" ON "map_versions" USING btree ("status") WHERE "map_versions"."status" = 'Publicada';--> statement-breakpoint
CREATE INDEX "idx_reset_token" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_reserve_stock" ON "request_reservations" USING btree ("part_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_request_block_status" ON "requests" USING btree ("block_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_request_user_date" ON "requests" USING btree ("requester_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_request_part_date" ON "requests" USING btree ("part_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_rfid_events_tag" ON "rfid_access_events" USING btree ("rfid_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_movement_part_date" ON "stock_movements" USING btree ("part_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_movement_warehouse_date" ON "stock_movements" USING btree ("warehouse_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_movement_block_date" ON "stock_movements" USING btree ("block_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_warehouse_central" ON "warehouses" USING btree ("is_central") WHERE "warehouses"."is_central" = 1;