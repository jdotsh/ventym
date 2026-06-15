CREATE SCHEMA "sensitive";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"code" varchar(50) NOT NULL,
	"engagement_type" varchar(20) NOT NULL,
	"lifecycle_status" varchar(30) DEFAULT 'DRAFT' NOT NULL,
	"erp_link_status" varchar(20) DEFAULT 'UNLINKED' NOT NULL,
	"title" varchar(300),
	"description" text,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"vat_rate" numeric(5, 4) NOT NULL,
	"total_excl" numeric(14, 2) DEFAULT '0' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"vendor_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_order_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"line_num" integer NOT NULL,
	"role_code" varchar(100) NOT NULL,
	"seniority_code" varchar(40),
	"category_code" varchar(40),
	"geo_code" varchar(40),
	"bill_rate_daily_excl" numeric(12, 4) NOT NULL,
	"pay_rate_daily_excl" numeric(12, 4),
	"planned_days" numeric(8, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_wo_line_pay_le_bill" CHECK ("work_order_line"."pay_rate_daily_excl" IS NULL OR "work_order_line"."pay_rate_daily_excl" <= "work_order_line"."bill_rate_daily_excl")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_log" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_kind" varchar(20) DEFAULT 'human' NOT NULL,
	"actor_user_id" uuid,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" uuid NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"wo_line_id" uuid,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_benchmark_consent" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"consented" boolean DEFAULT false NOT NULL,
	"consented_at" timestamp with time zone,
	"consented_by_user_id" uuid,
	"scope" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dimension" varchar(30) NOT NULL,
	"code" varchar(60) NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sensitive"."party_pii" (
	"party_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text,
	"email" text,
	"erased_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sensitive"."tenant_pseudonym" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"analytic_surrogate" uuid NOT NULL,
	CONSTRAINT "tenant_pseudonym_analytic_surrogate_unique" UNIQUE("analytic_surrogate")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_order" ADD CONSTRAINT "work_order_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_order" ADD CONSTRAINT "work_order_created_by_user_id_app_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_order_line" ADD CONSTRAINT "work_order_line_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_order_line" ADD CONSTRAINT "work_order_line_work_order_id_work_order_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_order"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_log" ADD CONSTRAINT "event_log_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_benchmark_consent" ADD CONSTRAINT "tenant_benchmark_consent_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_code" ADD CONSTRAINT "tenant_code_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_work_order_tenant_code" ON "work_order" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_work_order_tenant_lifecycle" ON "work_order" USING btree ("tenant_id","lifecycle_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_work_order_tenant_erp_link" ON "work_order" USING btree ("tenant_id","erp_link_status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_wo_line_workorder_num" ON "work_order_line" USING btree ("work_order_id","line_num");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wo_line_tenant" ON "work_order_line" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_log_tenant_time" ON "event_log" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_log_tenant_entity" ON "event_log" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tenant_code" ON "tenant_code" USING btree ("tenant_id","dimension","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_party_pii_tenant" ON "sensitive"."party_pii" USING btree ("tenant_id");--> statement-breakpoint
-- ── Row-Level Security (operational plane; isolated by the app.tenant_id GUC) ──
-- Public tables inherit DML grants for vms_app via ALTER DEFAULT PRIVILEGES (0000).
ALTER TABLE "work_order" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_order_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_code" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_benchmark_consent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "work_order_isolation" ON "work_order" USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "work_order_line_isolation" ON "work_order_line" USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "event_log_isolation" ON "event_log" USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_code_isolation" ON "tenant_code" USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_benchmark_consent_isolation" ON "tenant_benchmark_consent" USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
-- ── SEAM 1: event_log is append-only (validated event log; immutable) ─────────
CREATE OR REPLACE FUNCTION event_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'event_log is append-only'; END; $$;--> statement-breakpoint
CREATE TRIGGER event_log_no_mutate BEFORE UPDATE OR DELETE ON "event_log" FOR EACH ROW EXECUTE FUNCTION event_log_immutable();--> statement-breakpoint
-- ── SEAM 3: sensitive schema — PII isolated; vms_app gets in-tenant party_pii only.
-- tenant_pseudonym is intentionally NOT granted to vms_app (the future ETL gate role owns it).
ALTER TABLE "sensitive"."party_pii" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "party_pii_isolation" ON "sensitive"."party_pii" USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
GRANT USAGE ON SCHEMA "sensitive" TO vms_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "sensitive"."party_pii" TO vms_app;