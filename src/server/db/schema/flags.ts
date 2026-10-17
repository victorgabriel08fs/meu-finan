import { type AnyColumn, sql } from "drizzle-orm";
import { boolean, check, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { updatedAt } from "./columns";

// Feature flags (doc 01 §11.10). The flags themselves live in code
// (src/lib/flags/registry.ts); these tables only hold what an administrator
// changed. Resolution: per-person value > global value > registry default.
// Keys that are no longer in the registry are ignored, never an error.

/** snake_case keys, like the registry's (CHECK takes no bind parameters). */
const keyFormat = (column: AnyColumn) =>
  sql`${column} ~ '^[a-z][a-z0-9_]{0,62}$'`;

/** Global value of a flag. No row: the registry default. */
export const featureFlags = pgTable(
  "feature_flags",
  {
    key: text("key").primaryKey(),
    enabled: boolean("enabled").notNull(),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: updatedAt(),
  },
  (t) => [check("feature_flags_key_check", keyFormat(t.key))],
);

/** A person's own value of a flag; wins over the global value. */
export const featureFlagOverrides = pgTable(
  "feature_flag_overrides",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    enabled: boolean("enabled").notNull(),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({
      name: "feature_flag_overrides_pkey",
      columns: [t.userId, t.key],
    }),
    check("feature_flag_overrides_key_check", keyFormat(t.key)),
  ],
);
