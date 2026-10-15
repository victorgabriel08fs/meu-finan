// Database client with two drivers behind one Drizzle API:
// - Neon (WebSocket Pool) when DATABASE_URL is a postgres URL: production,
//   previews and anyone developing against a Neon branch.
// - PGlite (embedded Postgres) when DATABASE_URL is unset or "pglite:<dir>":
//   local development and tests, no account or Docker needed.
// Both support interactive transactions, so write paths use db.transaction().
//
// No `server-only` import: tsx scripts (db:seed, db:local) load this file
// outside Next.js. Only server modules may import it.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { Pool } from "@neondatabase/serverless";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Database = PgDatabase<PgQueryResultHKT, Schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that runs queries: the db itself or an open transaction. */
export type Executor = Database | Transaction;

export const DEFAULT_PGLITE_DIR = ".data/pglite";
const PGLITE_PREFIX = "pglite:";

export type DatabaseTarget =
  | { kind: "neon"; url: string }
  | { kind: "pglite"; dir: string | null };

/**
 * Picks the driver from DATABASE_URL. In production an unset DATABASE_URL is
 * an error (PGlite is only used there when asked for explicitly).
 */
export function resolveDatabaseTarget(
  env: Record<string, string | undefined> = process.env,
): DatabaseTarget {
  const url = env.DATABASE_URL?.trim();
  if (url?.startsWith(PGLITE_PREFIX)) {
    const dir = url.slice(PGLITE_PREFIX.length).trim();
    return {
      kind: "pglite",
      dir: dir === "memory" ? null : dir || DEFAULT_PGLITE_DIR,
    };
  }
  if (url) return { kind: "neon", url };
  if (env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL não está definida. Configure a variável no ambiente (na Vercel ela vem da integração com a Neon).",
    );
  }
  return { kind: "pglite", dir: DEFAULT_PGLITE_DIR };
}

/** Embedded Postgres with the extensions the migrations need (pg_trgm, unaccent). */
export function createPgliteClient(dir: string | null): PGlite {
  const extensions = { pg_trgm, unaccent };
  if (!dir) return new PGlite({ extensions });
  mkdirSync(dirname(resolve(dir)), { recursive: true });
  return new PGlite(dir, { extensions });
}

export function createPgliteDatabase(client: PGlite): Database {
  return drizzlePglite({ client, schema }) as unknown as Database;
}

function createDatabase(): Database {
  const target = resolveDatabaseTarget();
  if (target.kind === "pglite") {
    return createPgliteDatabase(createPgliteClient(target.dir));
  }
  const pool = new Pool({ connectionString: target.url, max: 5 });
  // On Vercel (Fluid compute) releases idle connections before the instance
  // is suspended; a no-op elsewhere.
  attachDatabasePool(pool);
  return drizzleNeon({ client: pool, schema }) as unknown as Database;
}

// One instance per process: survives hot reload in development (PGlite allows a
// single instance per data directory).
const globalForDb = globalThis as typeof globalThis & {
  __meuFinanDb?: Database;
};

function getDatabase(): Database {
  globalForDb.__meuFinanDb ??= createDatabase();
  return globalForDb.__meuFinanDb;
}

/**
 * The Drizzle database, created on first use so that `next build`, `tsc` and
 * Vitest import this module without DATABASE_URL.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const instance = getDatabase();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
