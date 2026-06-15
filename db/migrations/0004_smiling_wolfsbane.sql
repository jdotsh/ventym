ALTER TABLE "idempotency" ALTER COLUMN "status_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "idempotency" ALTER COLUMN "response_json" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "idempotency" ADD COLUMN "request_fingerprint" varchar(64);