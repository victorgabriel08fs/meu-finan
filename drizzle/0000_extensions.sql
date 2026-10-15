-- Custom migration: must run before the schema migration, because the
-- transactions.txn_search index uses f_unaccent() and gin_trgm_ops (doc 01 §6.3).
create extension if not exists pg_trgm;
--> statement-breakpoint
create extension if not exists unaccent;
--> statement-breakpoint
-- unaccent não é IMMUTABLE; wrapper para poder indexar
create or replace function f_unaccent(text) returns text
  language sql immutable parallel safe strict
  as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$;
