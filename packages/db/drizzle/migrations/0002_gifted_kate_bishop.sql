CREATE TABLE "pending_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"content" text NOT NULL,
	"source" text NOT NULL,
	"source_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "last_run_at" timestamp;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "last_run_status" text;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "last_digest" text;--> statement-breakpoint
ALTER TABLE "pending_deliveries" ADD CONSTRAINT "pending_deliveries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_deliveries_user_target_idx" ON "pending_deliveries" USING btree ("user_id","target_user_id");
