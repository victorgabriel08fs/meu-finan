import { sql } from "drizzle-orm";
import { check, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { timestamptz, userIdColumn } from "./columns";

/**
 * Usage tips and novidades the user has seen (doc 02 §6.16): one row per tip
 * id of the registry in src/lib/tips, so the state follows the account across
 * devices. The row `tip_id = '*'` turns every balloon off ("Não mostrar mais
 * dicas"); "Rever dicas" deletes the basics and that row, keeping novidades
 * read.
 */
export const userTips = pgTable(
  "user_tips",
  {
    userId: userIdColumn(),
    tipId: text("tip_id").notNull(),
    seenAt: timestamptz("seen_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "user_tips_pkey", columns: [t.userId, t.tipId] }),
    check(
      "user_tips_tip_id_check",
      sql`char_length(${t.tipId}) between 1 and 80`,
    ),
  ],
);
