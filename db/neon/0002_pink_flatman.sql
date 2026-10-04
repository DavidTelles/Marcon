ALTER TYPE "public"."request_status" ADD VALUE 'Em separação';--> statement-breakpoint
ALTER TYPE "public"."request_status" ADD VALUE 'Em entrega';--> statement-breakpoint
ALTER TYPE "public"."request_status" ADD VALUE 'Rejeitada';--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "requested_unit" varchar(12) DEFAULT 'piece' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "requested_amount" integer;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "pack_size_at_request" integer;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "anomaly" jsonb;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "picked_at" timestamp(3);