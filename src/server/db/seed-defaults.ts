import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { db, type Executor } from "./client";
import {
  type CategoryKind,
  type ColorToken,
  categories,
  userSettings,
} from "./schema";

export type DefaultCategory = {
  kind: CategoryKind;
  name: string;
  /** Lucide icon name. */
  icon: string;
  color: ColorToken;
  /** Position within its kind. */
  sortOrder: number;
};

type CategorySeed = Pick<DefaultCategory, "name" | "icon" | "color">;

// doc 02 §3.2, in display order. Transferência and Ajuste de saldo are
// transaction kinds, not categories.
const EXPENSE_CATEGORIES = [
  { name: "Moradia", icon: "house", color: "cat-1" },
  { name: "Mercado", icon: "shopping-cart", color: "cat-3" },
  { name: "Restaurantes", icon: "utensils", color: "cat-2" },
  { name: "Transporte", icon: "car", color: "cat-4" },
  { name: "Saúde", icon: "heart-pulse", color: "cat-8" },
  { name: "Lazer", icon: "ticket", color: "cat-5" },
  { name: "Educação", icon: "graduation-cap", color: "cat-1" },
  { name: "Compras", icon: "shopping-bag", color: "cat-7" },
  { name: "Contas da casa", icon: "zap", color: "cat-4" },
  { name: "Assinaturas", icon: "repeat", color: "cat-7" },
  { name: "Cuidados pessoais", icon: "scissors", color: "cat-5" },
  { name: "Pets", icon: "paw-print", color: "cat-2" },
  { name: "Viagem", icon: "plane", color: "cat-1" },
  { name: "Impostos e taxas", icon: "landmark", color: "cat-8" },
  { name: "Presentes e doações", icon: "gift", color: "cat-5" },
  { name: "Outros", icon: "ellipsis", color: "neutral" },
] satisfies CategorySeed[];

const INCOME_CATEGORIES = [
  { name: "Salário", icon: "briefcase", color: "cat-6" },
  { name: "Freelance", icon: "laptop", color: "cat-3" },
  { name: "Rendimentos", icon: "trending-up", color: "cat-6" },
  { name: "Reembolsos", icon: "rotate-ccw", color: "cat-1" },
  { name: "Outras receitas", icon: "plus", color: "neutral" },
] satisfies CategorySeed[];

const withKind = (
  kind: CategoryKind,
  seeds: CategorySeed[],
): DefaultCategory[] =>
  seeds.map((seed, sortOrder) => ({ kind, ...seed, sortOrder }));

/** Categories created for the owner on first access (doc 02 §3.2). */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  ...withKind("expense", EXPENSE_CATEGORIES),
  ...withKind("income", INCOME_CATEGORIES),
];

/**
 * Creates the owner's user_settings (column defaults: BRL, pt-BR,
 * America/Sao_Paulo, month starting on day 1, dark theme) and the default
 * categories. Safe to call again: existing settings are kept, and categories
 * are only created while the owner has none, so later edits are never undone.
 */
export async function ensureOwnerDefaults(
  userId: string,
  executor: Executor = db,
): Promise<void> {
  await executor.transaction(async (tx) => {
    await tx
      .insert(userSettings)
      .values({ userId })
      .onConflictDoNothing({ target: userSettings.userId });

    const [existing] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.userId, userId))
      .limit(1);
    if (existing) return;

    const rows = DEFAULT_CATEGORIES.map((category) => ({
      id: uuidv7(),
      userId,
      ...category,
    }));
    // A concurrent call that also found no categories hits the unique
    // (user_id, parent_id, name) and inserts nothing.
    await tx.insert(categories).values(rows).onConflictDoNothing();
  });
}
