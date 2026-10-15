// Creates the owner's preferences and default categories.
// Usage: npm run db:seed (reads DATABASE_URL from the environment or .env.local).
// Imports are evaluated before loadEnvConfig runs; that is fine because the db
// client only reads DATABASE_URL on the first query.
import { loadEnvConfig } from "@next/env";
import { count, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  type CategoryKind,
  categories,
  user,
  userSettings,
} from "@/server/db/schema";
import { ensureOwnerDefaults } from "@/server/db/seed-defaults";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

/** Expected failure, reported without a stack trace. */
class SeedError extends Error {}

type CategoryCounts = Record<CategoryKind, number>;

async function findOwner() {
  const found = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .limit(2);
  const [owner, another] = found;

  if (!owner) {
    throw new SeedError(
      "Nenhum usuário encontrado. Crie a conta do dono em /primeiro-acesso e rode o seed de novo.",
    );
  }
  if (another) {
    const [row] = await db.select({ total: count() }).from(user);
    throw new SeedError(
      `Encontrei ${row?.total ?? found.length} usuários, mas o Meu Finan tem um único dono. Remova as contas que sobraram e rode o seed de novo.`,
    );
  }
  return owner;
}

async function hasSettings(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return row !== undefined;
}

async function countCategories(userId: string): Promise<CategoryCounts> {
  const rows = await db
    .select({ kind: categories.kind, total: count() })
    .from(categories)
    .where(eq(categories.userId, userId))
    .groupBy(categories.kind);

  const counts: CategoryCounts = { expense: 0, income: 0 };
  for (const row of rows) counts[row.kind] = row.total;
  return counts;
}

function describeCategories(counts: CategoryCounts): string {
  return `${counts.expense} de despesa e ${counts.income} de receita`;
}

function describeError(error: unknown): string {
  if (error instanceof SeedError) return error.message;
  if (!(error instanceof Error)) return String(error);

  // Drizzle wraps driver errors; the Postgres message is in `cause`.
  const cause = error.cause instanceof Error ? error.cause : undefined;
  const code =
    cause && "code" in cause && typeof cause.code === "string"
      ? cause.code
      : undefined;
  const lines = [error.message];
  if (cause) lines.push(cause.message);
  if (code === "42P01") {
    lines.push(
      "As tabelas ainda não existem. Rode npm run db:migrate antes do seed.",
    );
  }
  return lines.join("\n");
}

async function main() {
  const owner = await findOwner();
  const settingsExisted = await hasSettings(owner.id);
  const before = await countCategories(owner.id);

  await ensureOwnerDefaults(owner.id);

  const after = await countCategories(owner.id);
  const created =
    after.expense + after.income - (before.expense + before.income);

  console.log(`Dono: ${owner.name} <${owner.email}>`);
  console.log(
    settingsExisted
      ? "Preferências: já existiam, nada mudou."
      : "Preferências: criadas (BRL, pt-BR, America/Sao_Paulo, mês começando no dia 1, tema do sistema).",
  );
  console.log(
    created > 0
      ? `Categorias: ${created} criadas (${describeCategories(after)}).`
      : `Categorias: nenhuma criada; o dono já tem ${describeCategories(after)}.`,
  );
}

main().catch((error: unknown) => {
  console.error(`Seed não concluído.\n${describeError(error)}`);
  process.exitCode = 1;
});
