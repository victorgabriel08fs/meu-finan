CREATE TABLE "share_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by" text,
	"default_split" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_groups_name_check" CHECK (char_length("share_groups"."name") between 1 and 40),
	CONSTRAINT "share_groups_default_split_check" CHECK (jsonb_typeof("share_groups"."default_split") = 'object')
);
--> statement-breakpoint
CREATE TABLE "share_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" text,
	"invited_email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text NOT NULL,
	"invited_by" text,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	CONSTRAINT "share_members_role_check" CHECK ("share_members"."role" in ('owner', 'member')),
	CONSTRAINT "share_members_status_check" CHECK ("share_members"."status" in ('invited', 'active', 'declined', 'left', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "share_settlements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"from_member" uuid NOT NULL,
	"to_member" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"created_by_member" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "share_settlements_members_check" CHECK ("share_settlements"."from_member" <> "share_settlements"."to_member"),
	CONSTRAINT "share_settlements_amount_cents_check" CHECK ("share_settlements"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "shared_expense_shares" (
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"input" integer NOT NULL,
	"share_cents" bigint NOT NULL,
	CONSTRAINT "shared_expense_shares_pkey" PRIMARY KEY("expense_id","member_id"),
	CONSTRAINT "shared_expense_shares_input_check" CHECK ("shared_expense_shares"."input" >= 0),
	CONSTRAINT "shared_expense_shares_share_cents_check" CHECK ("shared_expense_shares"."share_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shared_expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"created_by_member" uuid NOT NULL,
	"paid_by_member" uuid NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"split_method" text NOT NULL,
	"source_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "shared_expenses_description_check" CHECK (char_length("shared_expenses"."description") between 1 and 80),
	CONSTRAINT "shared_expenses_amount_cents_check" CHECK ("shared_expenses"."amount_cents" > 0),
	CONSTRAINT "shared_expenses_split_method_check" CHECK ("shared_expenses"."split_method" in ('equal', 'amounts', 'percent', 'shares'))
);
--> statement-breakpoint
ALTER TABLE "share_groups" ADD CONSTRAINT "share_groups_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_members" ADD CONSTRAINT "share_members_group_id_share_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."share_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_members" ADD CONSTRAINT "share_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_members" ADD CONSTRAINT "share_members_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_settlements" ADD CONSTRAINT "share_settlements_group_id_share_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."share_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_settlements" ADD CONSTRAINT "share_settlements_from_member_share_members_id_fk" FOREIGN KEY ("from_member") REFERENCES "public"."share_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_settlements" ADD CONSTRAINT "share_settlements_to_member_share_members_id_fk" FOREIGN KEY ("to_member") REFERENCES "public"."share_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_settlements" ADD CONSTRAINT "share_settlements_created_by_member_share_members_id_fk" FOREIGN KEY ("created_by_member") REFERENCES "public"."share_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expense_shares" ADD CONSTRAINT "shared_expense_shares_expense_id_shared_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."shared_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expense_shares" ADD CONSTRAINT "shared_expense_shares_member_id_share_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."share_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expenses" ADD CONSTRAINT "shared_expenses_group_id_share_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."share_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expenses" ADD CONSTRAINT "shared_expenses_created_by_member_share_members_id_fk" FOREIGN KEY ("created_by_member") REFERENCES "public"."share_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expenses" ADD CONSTRAINT "shared_expenses_paid_by_member_share_members_id_fk" FOREIGN KEY ("paid_by_member") REFERENCES "public"."share_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expenses" ADD CONSTRAINT "shared_expenses_source_transaction_id_transactions_id_fk" FOREIGN KEY ("source_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "share_members_group_user_key" ON "share_members" USING btree ("group_id","user_id") WHERE "share_members"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "share_members_group_email_open_key" ON "share_members" USING btree ("group_id","invited_email") WHERE "share_members"."status" in ('invited', 'active');--> statement-breakpoint
CREATE INDEX "share_members_user_status_idx" ON "share_members" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "share_settlements_group_idx" ON "share_settlements" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_expenses_source_key" ON "shared_expenses" USING btree ("source_transaction_id") WHERE "shared_expenses"."deleted_at" is null and "shared_expenses"."source_transaction_id" is not null;--> statement-breakpoint
CREATE INDEX "shared_expenses_group_date_idx" ON "shared_expenses" USING btree ("group_id","occurred_on");