CREATE TABLE "shared_box_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"box_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"source_transfer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "shared_box_entries_amount_cents_check" CHECK ("shared_box_entries"."amount_cents" <> 0)
);
--> statement-breakpoint
CREATE TABLE "shared_box_members" (
	"box_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"monthly_plan_cents" bigint DEFAULT 0 NOT NULL,
	"target_weight" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "shared_box_members_pkey" PRIMARY KEY("box_id","member_id"),
	CONSTRAINT "shared_box_members_monthly_plan_cents_check" CHECK ("shared_box_members"."monthly_plan_cents" >= 0),
	CONSTRAINT "shared_box_members_target_weight_check" CHECK ("shared_box_members"."target_weight" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "shared_boxes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"target_cents" bigint,
	"target_date" date,
	"expected_rate" jsonb,
	"target_split" text DEFAULT 'equal' NOT NULL,
	"created_by_member" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "shared_boxes_name_check" CHECK (char_length("shared_boxes"."name") between 1 and 40),
	CONSTRAINT "shared_boxes_color_check" CHECK ("shared_boxes"."color" in ('cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8', 'neutral')),
	CONSTRAINT "shared_boxes_target_cents_check" CHECK ("shared_boxes"."target_cents" > 0),
	CONSTRAINT "shared_boxes_expected_rate_check" CHECK (jsonb_typeof("shared_boxes"."expected_rate") = 'object'),
	CONSTRAINT "shared_boxes_target_split_check" CHECK ("shared_boxes"."target_split" in ('equal', 'percent'))
);
--> statement-breakpoint
ALTER TABLE "shared_box_entries" ADD CONSTRAINT "shared_box_entries_box_id_shared_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."shared_boxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_box_entries" ADD CONSTRAINT "shared_box_entries_member_id_share_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."share_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_box_members" ADD CONSTRAINT "shared_box_members_box_id_shared_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."shared_boxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_box_members" ADD CONSTRAINT "shared_box_members_member_id_share_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."share_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_boxes" ADD CONSTRAINT "shared_boxes_group_id_share_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."share_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_boxes" ADD CONSTRAINT "shared_boxes_created_by_member_share_members_id_fk" FOREIGN KEY ("created_by_member") REFERENCES "public"."share_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shared_box_entries_box_date_idx" ON "shared_box_entries" USING btree ("box_id","occurred_on");--> statement-breakpoint
CREATE INDEX "shared_boxes_group_idx" ON "shared_boxes" USING btree ("group_id");