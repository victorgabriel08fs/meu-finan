CREATE TABLE "recurrence_tags" (
	"recurrence_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "recurrence_tags_pkey" PRIMARY KEY("recurrence_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_user_id_name_key";--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "recurrence_tags" ADD CONSTRAINT "recurrence_tags_recurrence_id_recurrences_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."recurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_tags" ADD CONSTRAINT "recurrence_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_name_key" ON "tags" USING btree ("user_id",f_unaccent(lower("name")));--> statement-breakpoint
CREATE INDEX "transaction_tags_tag_id" ON "transaction_tags" USING btree ("tag_id");--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_name_check" CHECK (char_length("tags"."name") between 1 and 30);