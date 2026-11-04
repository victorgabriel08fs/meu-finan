/**
 * URL state of the statement (doc 02 §4.1, §6.4): `/extrato?mes=2026-10&
 * conta=…&categoria=…&tipo=despesa&status=pendente&q=farmácia`. Pure, so the
 * server page and the client filters read and write it the same way.
 */

export const KIND_PARAMS = ["receita", "despesa", "transferencia"] as const;
export const STATUS_PARAMS = ["pendente", "pago"] as const;

export type KindParam = (typeof KIND_PARAMS)[number];
export type StatusParam = (typeof STATUS_PARAMS)[number];

export type StatementKind = "income" | "expense" | "transfer";
export type StatementStatus = "pending" | "paid";

export const KIND_FROM_PARAM: Record<KindParam, StatementKind> = {
  receita: "income",
  despesa: "expense",
  transferencia: "transfer",
};

export const STATUS_FROM_PARAM: Record<StatusParam, StatementStatus> = {
  pendente: "pending",
  pago: "paid",
};

/** The longest search the server accepts (suggestions use the same cap). */
export const MAX_QUERY_LENGTH = 60;

export type StatementFilters = {
  /** `YYYY-MM`; null = the current period. */
  month: string | null;
  accountId: string | null;
  categoryId: string | null;
  kind: StatementKind | null;
  status: StatementStatus | null;
  q: string;
};

type RawParams = Record<string, string | string[] | undefined>;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function single(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === "string" && text !== "" ? text : null;
}

function oneOf<T extends string>(
  value: string | null,
  options: readonly T[],
): T | null {
  return value !== null && (options as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Reads the search params; anything malformed is ignored, never trusted. */
export function parseStatementParams(params: RawParams): StatementFilters {
  const month = single(params.mes);
  const account = single(params.conta);
  const category = single(params.categoria);
  const kind = oneOf(single(params.tipo), KIND_PARAMS);
  const status = oneOf(single(params.status), STATUS_PARAMS);
  return {
    month: month && MONTH.test(month) ? month : null,
    accountId: isUuid(account) ? account.toLowerCase() : null,
    categoryId: isUuid(category) ? category.toLowerCase() : null,
    kind: kind ? KIND_FROM_PARAM[kind] : null,
    status: status ? STATUS_FROM_PARAM[status] : null,
    q: (single(params.q) ?? "").trim().slice(0, MAX_QUERY_LENGTH),
  };
}

/** Filters other than the month are on (they change the empty state and the summary). */
export function hasActiveFilters(filters: StatementFilters): boolean {
  return Boolean(
    filters.accountId ||
      filters.categoryId ||
      filters.kind ||
      filters.status ||
      filters.q,
  );
}

const KIND_TO_PARAM: Record<StatementKind, KindParam> = {
  income: "receita",
  expense: "despesa",
  transfer: "transferencia",
};

const STATUS_TO_PARAM: Record<StatementStatus, StatusParam> = {
  pending: "pendente",
  paid: "pago",
};

export function kindParam(kind: StatementKind): KindParam {
  return KIND_TO_PARAM[kind];
}

export function statusParam(status: StatementStatus): StatusParam {
  return STATUS_TO_PARAM[status];
}

/**
 * `/extrato?…` for the given filters. The current month is left out so the
 * plain `/extrato` always means "now".
 */
export function statementHref(
  filters: StatementFilters,
  currentMonth: string,
): string {
  const params = new URLSearchParams();
  if (filters.month && filters.month !== currentMonth) {
    params.set("mes", filters.month);
  }
  if (filters.accountId) params.set("conta", filters.accountId);
  if (filters.categoryId) params.set("categoria", filters.categoryId);
  if (filters.kind) params.set("tipo", KIND_TO_PARAM[filters.kind]);
  if (filters.status) params.set("status", STATUS_TO_PARAM[filters.status]);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();
  return query ? `/extrato?${query}` : "/extrato";
}

/**
 * The category and its subcategories, at any depth (doc 02 §6.4: filtering
 * a parent category brings its children). Empty when `id` is not in the
 * list, so only the person's own categories ever reach the query.
 */
export function categoryWithDescendants(
  categories: readonly { id: string; parentId: string | null }[],
  id: string,
): string[] {
  if (!categories.some((category) => category.id === id)) return [];
  const ids = [id];
  // Breadth-first; `ids` doubles as the visited set, so a cycle ends.
  for (let index = 0; index < ids.length; index += 1) {
    for (const category of categories) {
      if (category.parentId === ids[index] && !ids.includes(category.id)) {
        ids.push(category.id);
      }
    }
  }
  return ids;
}

/**
 * The categories as a tree for a list: each one followed by its
 * subcategories, keeping the given order among siblings. A subcategory whose
 * parent is not in the list goes to the end.
 */
export function categoryTree<T extends { id: string; parentId: string | null }>(
  categories: readonly T[],
): T[] {
  const placed = new Set<string>();
  const tree: T[] = [];
  const place = (category: T) => {
    if (placed.has(category.id)) return;
    placed.add(category.id);
    tree.push(category);
    for (const child of categories) {
      if (child.parentId === category.id) place(child);
    }
  };
  for (const category of categories) {
    if (category.parentId === null) place(category);
  }
  // Orphans (and anything caught in a cycle), with their own children.
  for (const category of categories) place(category);
  return tree;
}
