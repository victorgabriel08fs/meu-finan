CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."fin_account_type" AS ENUM('checking', 'savings', 'cash', 'investment', 'credit_card', 'other');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('uploaded', 'parsed', 'review', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."rate_index" AS ENUM('fixed', 'cdi', 'selic', 'ipca');--> statement-breakpoint
CREATE TYPE "public"."recurrence_freq" AS ENUM('daily', 'weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."txn_kind" AS ENUM('income', 'expense', 'transfer', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."txn_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TABLE "account_yield" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"index" "rate_index" NOT NULL,
	"pct_of_index" numeric(7, 4),
	"spread_annual" numeric(7, 6),
	"fixed_annual" numeric(7, 6),
	"tax_mode" text DEFAULT 'regressive' NOT NULL,
	CONSTRAINT "account_yield_tax_mode_check" CHECK ("account_yield"."tax_mode" in ('regressive', 'exempt'))
);
--> statement-breakpoint
CREATE TABLE "balance_snapshots" (
	"account_id" uuid NOT NULL,
	"on_date" date NOT NULL,
	"balance_cents" bigint NOT NULL,
	"source" text DEFAULT 'auto' NOT NULL,
	CONSTRAINT "balance_snapshots_pkey" PRIMARY KEY("account_id","on_date"),
	CONSTRAINT "balance_snapshots_source_check" CHECK ("balance_snapshots"."source" in ('auto', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "card_invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"reference_month" date NOT NULL,
	"closing_date" date NOT NULL,
	"due_date" date NOT NULL,
	CONSTRAINT "card_invoices_account_id_reference_month_key" UNIQUE("account_id","reference_month"),
	CONSTRAINT "card_invoices_reference_month_check" CHECK (extract(day from "card_invoices"."reference_month") = 1)
);
--> statement-breakpoint
CREATE TABLE "credit_card_details" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"limit_cents" bigint NOT NULL,
	"closing_day" smallint NOT NULL,
	"due_day" smallint NOT NULL,
	"payment_account_id" uuid,
	CONSTRAINT "credit_card_details_limit_cents_check" CHECK ("credit_card_details"."limit_cents" >= 0),
	CONSTRAINT "credit_card_details_closing_day_check" CHECK ("credit_card_details"."closing_day" between 1 and 31),
	CONSTRAINT "credit_card_details_due_day_check" CHECK ("credit_card_details"."due_day" between 1 and 31)
);
--> statement-breakpoint
CREATE TABLE "fin_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "fin_account_type" NOT NULL,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"initial_balance_cents" bigint DEFAULT 0 NOT NULL,
	"include_in_net_worth" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_accounts_name_check" CHECK (char_length("fin_accounts"."name") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" uuid,
	"kind" "category_kind" NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "categories_user_id_parent_id_name_key" UNIQUE NULLS NOT DISTINCT("user_id","parent_id","name"),
	CONSTRAINT "categories_name_check" CHECK (char_length("categories"."name") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "tags_user_id_name_key" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"month" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"rollover" boolean DEFAULT false NOT NULL,
	CONSTRAINT "budgets_user_id_category_id_month_key" UNIQUE("user_id","category_id","month"),
	CONSTRAINT "budgets_month_check" CHECK (extract(day from "budgets"."month") = 1),
	CONSTRAINT "budgets_amount_cents_check" CHECK ("budgets"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"target_cents" bigint NOT NULL,
	"target_date" date,
	"account_id" uuid,
	"initial_cents" bigint DEFAULT 0 NOT NULL,
	"monthly_plan_cents" bigint,
	"expected_rate" jsonb,
	"achieved_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_target_cents_check" CHECK ("goals"."target_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "installment_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"description" text NOT NULL,
	"total_cents" bigint NOT NULL,
	"count" smallint NOT NULL,
	"first_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installment_plans_total_cents_check" CHECK ("installment_plans"."total_cents" > 0),
	CONSTRAINT "installment_plans_count_check" CHECK ("installment_plans"."count" between 2 and 72)
);
--> statement-breakpoint
CREATE TABLE "recurrences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid,
	"kind" "txn_kind" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description" text NOT NULL,
	"freq" "recurrence_freq" NOT NULL,
	"interval" smallint DEFAULT 1 NOT NULL,
	"by_month_day" smallint,
	"start_on" date NOT NULL,
	"end_on" date,
	"generated_until" date NOT NULL,
	"paused_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurrences_kind_check" CHECK ("recurrences"."kind" in ('income', 'expense')),
	CONSTRAINT "recurrences_amount_cents_check" CHECK ("recurrences"."amount_cents" <> 0),
	CONSTRAINT "recurrences_interval_check" CHECK ("recurrences"."interval" between 1 and 12),
	CONSTRAINT "recurrences_by_month_day_check" CHECK ("recurrences"."by_month_day" between 1 and 31)
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"currency" char(3) DEFAULT 'BRL' NOT NULL,
	"locale" text DEFAULT 'pt-BR' NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"month_start_day" smallint DEFAULT 1 NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"privacy_mode_default" boolean DEFAULT false NOT NULL,
	"report_basis" text DEFAULT 'accrual' NOT NULL,
	"onboarding_done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_month_start_day_check" CHECK ("user_settings"."month_start_day" between 1 and 28),
	CONSTRAINT "user_settings_theme_check" CHECK ("user_settings"."theme" in ('system', 'light', 'dark')),
	CONSTRAINT "user_settings_report_basis_check" CHECK ("user_settings"."report_basis" in ('accrual', 'cash'))
);
--> statement-breakpoint
CREATE TABLE "categorization_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pattern" text NOT NULL,
	"category_id" uuid NOT NULL,
	"account_id" uuid,
	"hits" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorization_rules_user_id_pattern_key" UNIQUE("user_id","pattern")
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"blob_pathname" text NOT NULL,
	"format" text NOT NULL,
	"status" "import_status" DEFAULT 'uploaded' NOT NULL,
	"stats" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imports_format_check" CHECK ("imports"."format" in ('ofx', 'csv'))
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"report" jsonb
);
--> statement-breakpoint
CREATE TABLE "market_rates" (
	"index" "rate_index" NOT NULL,
	"ref_date" date NOT NULL,
	"value" numeric(12, 8) NOT NULL,
	CONSTRAINT "market_rates_pkey" PRIMARY KEY("index","ref_date")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_user_id_dedupe_key_key" UNIQUE("user_id","dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "simulations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"params" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_tags" (
	"transaction_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "transaction_tags_pkey" PRIMARY KEY("transaction_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid,
	"kind" "txn_kind" NOT NULL,
	"status" "txn_status" DEFAULT 'paid' NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description" text NOT NULL,
	"notes" text,
	"occurred_on" date NOT NULL,
	"paid_at" timestamp with time zone,
	"transfer_id" uuid,
	"invoice_id" uuid,
	"installment_plan_id" uuid,
	"installment_number" smallint,
	"recurrence_id" uuid,
	"goal_id" uuid,
	"import_id" uuid,
	"external_id" text,
	"attachment_pathname" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "transactions_amount_cents_check" CHECK ("transactions"."amount_cents" <> 0),
	CONSTRAINT "transactions_description_check" CHECK (char_length("transactions"."description") between 1 and 120),
	CONSTRAINT "transfer_pair" CHECK ("transactions"."kind" <> 'transfer' or "transactions"."transfer_id" is not null),
	CONSTRAINT "installment_fields" CHECK (("transactions"."installment_plan_id" is null) = ("transactions"."installment_number" is null))
);
--> statement-breakpoint
ALTER TABLE "account_yield" ADD CONSTRAINT "account_yield_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_invoices" ADD CONSTRAINT "card_invoices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_invoices" ADD CONSTRAINT "card_invoices_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_details" ADD CONSTRAINT "credit_card_details_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_details" ADD CONSTRAINT "credit_card_details_payment_account_id_fin_accounts_id_fk" FOREIGN KEY ("payment_account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_accounts" ADD CONSTRAINT "fin_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_invoice_id_card_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."card_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_installment_plan_id_installment_plans_id_fk" FOREIGN KEY ("installment_plan_id") REFERENCES "public"."installment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurrence_id_recurrences_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."recurrences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fin_accounts_user" ON "fin_accounts" USING btree ("user_id","sort_order") WHERE "fin_accounts"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_userId_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_credentialID_idx" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "txn_user_date" ON "transactions" USING btree ("user_id","occurred_on" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "txn_account_date" ON "transactions" USING btree ("account_id","occurred_on" DESC NULLS FIRST) WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "txn_user_cat_date" ON "transactions" USING btree ("user_id","category_id","occurred_on") WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "txn_pending" ON "transactions" USING btree ("user_id","occurred_on") WHERE "transactions"."status" = 'pending' and "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "txn_invoice" ON "transactions" USING btree ("invoice_id") WHERE "transactions"."invoice_id" is not null;--> statement-breakpoint
CREATE INDEX "txn_transfer" ON "transactions" USING btree ("transfer_id") WHERE "transactions"."transfer_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "txn_external" ON "transactions" USING btree ("account_id","external_id") WHERE "transactions"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "txn_recurrence_occ" ON "transactions" USING btree ("recurrence_id","occurred_on") WHERE "transactions"."recurrence_id" is not null;--> statement-breakpoint
CREATE INDEX "txn_search" ON "transactions" USING gin (f_unaccent(lower("description")) gin_trgm_ops);