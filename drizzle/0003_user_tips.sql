CREATE TABLE "user_tips" (
	"user_id" text NOT NULL,
	"tip_id" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_tips_pkey" PRIMARY KEY("user_id","tip_id"),
	CONSTRAINT "user_tips_tip_id_check" CHECK (char_length("user_tips"."tip_id") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "user_tips" ADD CONSTRAINT "user_tips_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;