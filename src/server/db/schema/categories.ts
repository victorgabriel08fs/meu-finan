import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, idColumn, timestamptz, userIdColumn } from "./columns";
import { COLOR_TOKENS, categoryKind } from "./enums";

/** Income and expense categories; parent_id makes a subcategory. */
export const categories = pgTable(
  "categories",
  {
    id: idColumn(),
    userId: userIdColumn(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "cascade",
    }),
    kind: categoryKind("kind").notNull(),
    name: text("name").notNull(),
    /** Lucide icon name, e.g. `shopping-cart`. */
    icon: text("icon").notNull(),
    color: text("color", { enum: COLOR_TOKENS }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamptz("archived_at"),
  },
  (t) => [
    check(
      "categories_name_check",
      sql`char_length(${t.name}) between 1 and 40`,
    ),
    // NULLS NOT DISTINCT: two top-level categories cannot share a name either.
    unique("categories_user_id_parent_id_name_key")
      .on(t.userId, t.parentId, t.name)
      .nullsNotDistinct(),
  ],
);

/** Free labels across categories (task 18); a transaction can have several. */
export const tags = pgTable(
  "tags",
  {
    id: idColumn(),
    userId: userIdColumn(),
    name: text("name").notNull(),
    archivedAt: timestamptz("archived_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("tags_name_check", sql`char_length(${t.name}) between 1 and 30`),
    // One name per person ignoring case and accents, archived tags included.
    // f_unaccent comes from the custom migration (0000_extensions).
    uniqueIndex("tags_user_name_key").on(
      t.userId,
      sql`f_unaccent(lower(${t.name}))`,
    ),
  ],
);
