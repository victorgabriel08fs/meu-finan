CREATE TABLE "holidays" (
	"scope" text NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_pkey" PRIMARY KEY("scope","date"),
	CONSTRAINT "holidays_source_check" CHECK ("holidays"."source" in ('brasilapi')),
	CONSTRAINT "holidays_name_check" CHECK (char_length("holidays"."name") between 1 and 80)
);
