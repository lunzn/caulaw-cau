CREATE TABLE "wechat_known_contacts" (
	"bot_user_id" text NOT NULL,
	"contact_user_id" text NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wechat_known_contacts_pkey" PRIMARY KEY("bot_user_id","contact_user_id")
);
--> statement-breakpoint
ALTER TABLE "wechat_known_contacts" ADD CONSTRAINT "wechat_known_contacts_bot_user_id_user_id_fk" FOREIGN KEY ("bot_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
