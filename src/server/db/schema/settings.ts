import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  jsonb,
  pgTable,
  smallint,
  text,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, oneOf, timestamptz, updatedAt } from "./columns";
import { REPORT_BASES, THEMES } from "./enums";

/**
 * The blocks of the Início a person chose (src/lib/home/layout.ts): the
 * movable ones, in order. Ids are plain strings: a retired id may linger
 * here, and reading ignores it.
 */
export type StoredHomeLayout = { id: string; visible: boolean }[];

/** Owner preferences, one row per user. */
export const userSettings = pgTable(
  "user_settings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    currency: char("currency", { length: 3 }).notNull().default("BRL"),
    locale: text("locale").notNull().default("pt-BR"),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    monthStartDay: smallint("month_start_day").notNull().default(1),
    // The app is dark by default (doc 02 §3.11); see src/lib/theme.ts.
    theme: text("theme", { enum: THEMES }).notNull().default("dark"),
    privacyModeDefault: boolean("privacy_mode_default")
      .notNull()
      .default(false),
    reportBasis: text("report_basis", { enum: REPORT_BASES })
      .notNull()
      .default("accrual"),
    onboardingDoneAt: timestamptz("onboarding_done_at"),
    // Null: the app's own Início (doc 02 §6.3), later default blocks included.
    homeLayout: jsonb("home_layout").$type<StoredHomeLayout>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "user_settings_month_start_day_check",
      sql`${t.monthStartDay} between 1 and 28`,
    ),
    check("user_settings_theme_check", oneOf(t.theme, THEMES)),
    check(
      "user_settings_report_basis_check",
      oneOf(t.reportBasis, REPORT_BASES),
    ),
    check(
      "user_settings_home_layout_check",
      sql`${t.homeLayout} is null or jsonb_typeof(${t.homeLayout}) = 'array'`,
    ),
  ],
);
