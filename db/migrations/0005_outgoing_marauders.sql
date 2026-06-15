CREATE TABLE IF NOT EXISTS "erp_export" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" uuid NOT NULL,
	"wo_line_id" uuid,
	"kind" varchar(40) DEFAULT 'GOODS_RECEIPT' NOT NULL,
	"amount_excl" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"erp_document_ref" varchar(100),
	"attempt" integer DEFAULT 1 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_order" ADD COLUMN "po_code" varchar(100);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "erp_export" ADD CONSTRAINT "erp_export_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_erp_export_entity" ON "erp_export" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_erp_export_tenant_status" ON "erp_export" USING btree ("tenant_id","status");--> statement-breakpoint
ALTER TABLE "erp_export" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "erp_export_isolation" ON "erp_export" USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
