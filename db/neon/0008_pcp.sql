CREATE TABLE "pcp_orders" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pcp_orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"request_id" bigint NOT NULL,
	"part_id" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"reference" varchar(190) NOT NULL,
	"actor_id" bigint NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "pcp_orders_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "pcp_orders_quantity_check" CHECK ("pcp_orders"."quantity">0)
);
--> statement-breakpoint
CREATE TABLE "pcp_receipts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pcp_receipts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"part_id" bigint NOT NULL,
	"invoice" varchar(190) NOT NULL,
	"lot" varchar(120) NOT NULL,
	"invoice_quantity" integer NOT NULL,
	"invoice_weight" numeric(20, 6),
	"counted_quantity" integer,
	"counted_weight" numeric(20, 6),
	"status" varchar(32) DEFAULT 'Aguardando conferência' NOT NULL,
	"quality_note" text,
	"totus_reference" varchar(190),
	"transferred_to" bigint,
	"actor_id" bigint NOT NULL,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "pcp_receipts_invoice_quantity_check" CHECK ("pcp_receipts"."invoice_quantity">0),
	CONSTRAINT "pcp_receipts_invoice_weight_check" CHECK ("pcp_receipts"."invoice_weight">0),
	CONSTRAINT "pcp_receipts_counted_quantity_check" CHECK ("pcp_receipts"."counted_quantity">=0),
	CONSTRAINT "pcp_receipts_counted_weight_check" CHECK ("pcp_receipts"."counted_weight">=0),
	CONSTRAINT "pcp_receipts_status_check" CHECK ("pcp_receipts"."status" IN ('Aguardando conferência','Pendente','Aguardando qualidade','Aprovado','Reprovado','Transferido'))
);
--> statement-breakpoint
CREATE TABLE "pcp_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pcp_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"part_id" bigint NOT NULL,
	"requester_id" bigint NOT NULL,
	"source_warehouse_id" bigint NOT NULL,
	"destination_warehouse_id" bigint,
	"quantity" integer NOT NULL,
	"picked_quantity" integer,
	"cost_center" varchar(120) NOT NULL,
	"production_order" varchar(120),
	"consumable" smallint DEFAULT 0 NOT NULL,
	"status" varchar(24) DEFAULT 'Pendente' NOT NULL,
	"transfer_id" bigint,
	"created_at" timestamp(3) DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "pcp_requests_transfer_id_unique" UNIQUE("transfer_id"),
	CONSTRAINT "pcp_requests_quantity_check" CHECK ("pcp_requests"."quantity">0),
	CONSTRAINT "pcp_requests_picked_quantity_check" CHECK ("pcp_requests"."picked_quantity">0),
	CONSTRAINT "pcp_requests_consumable_check" CHECK ("pcp_requests"."consumable" IN (0,1)),
	CONSTRAINT "pcp_requests_status_check" CHECK ("pcp_requests"."status" IN ('Pendente','Separada','Liberada','Transferida','Baixada'))
);
--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "material_kind" varchar(24) DEFAULT 'componente' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "pcp_kind" varchar(24) DEFAULT 'almoxarifado' NOT NULL;--> statement-breakpoint
ALTER TABLE "pcp_orders" ADD CONSTRAINT "pcp_orders_request_id_pcp_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."pcp_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcp_orders" ADD CONSTRAINT "pcp_orders_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcp_orders" ADD CONSTRAINT "pcp_orders_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcp_receipts" ADD CONSTRAINT "pcp_receipts_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcp_receipts" ADD CONSTRAINT "pcp_receipts_transferred_to_warehouses_id_fk" FOREIGN KEY ("transferred_to") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcp_receipts" ADD CONSTRAINT "pcp_receipts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcp_requests" ADD CONSTRAINT "pcp_requests_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcp_requests" ADD CONSTRAINT "pcp_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcp_requests" ADD CONSTRAINT "pcp_requests_source_warehouse_id_warehouses_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcp_requests" ADD CONSTRAINT "pcp_requests_destination_warehouse_id_warehouses_id_fk" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pcp_requests" ADD CONSTRAINT "pcp_requests_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pcp_receipts_part" ON "pcp_receipts" USING btree ("part_id","status");--> statement-breakpoint
CREATE INDEX "idx_pcp_requests_actor" ON "pcp_requests" USING btree ("requester_id","status");--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_material_kind_check" CHECK ("parts"."material_kind" IN ('materia-prima','componente','embalagem','consumivel'));--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_pcp_kind_check" CHECK ("warehouses"."pcp_kind" IN ('almoxarifado','producao','aguardando-qualidade'));
--> statement-breakpoint
-- Printed item IDs supplied by Marcon. No balances, prices or photographs are inferred.
INSERT INTO parts(code,qr_code,name,location,material_kind)
SELECT label.code,label.code,label.name,'Localização a cadastrar','componente'
FROM (VALUES
 ('129','Rodízio QLE 414 NPN — 4 polegadas giratório'),
 ('120','Rodízio FLE 312 NPP — 3 polegadas fixo'),
 ('127','Rodízio QLE 312 NPP — 3 polegadas giratório'),
 ('173','Garfo GQMS 3508 R — garfo giratório'),
 ('7988','Garfo GQMX 62 — plataforma elevadora'),
 ('17940','Guia de ferro fundido nº 06'),
 ('1794','Pneu maciço 8 polegadas'),
 ('1796','Pneu maciço 10 polegadas'),
 ('1795','Pneu maciço 9 polegadas'),
 ('5746','Roda de borracha 9200 BIN 3/4 — 9 polegadas')
) AS label(code,name)
WHERE NOT EXISTS(SELECT 1 FROM parts p WHERE p.code=label.code OR p.qr_code=label.code)
ON CONFLICT DO NOTHING;
