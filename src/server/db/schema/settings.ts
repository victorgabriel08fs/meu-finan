import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  pgTable,
  smallint,
  text,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, oneOf, timestamptz, updatedAt } from "./columns";
import { REPORT_BASES, THEMES } from "./enums";

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
  ],
);
