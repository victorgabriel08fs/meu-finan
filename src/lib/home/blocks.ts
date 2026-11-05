// Blocks of the Início (doc 02 §6.3): the single source of truth for which
// blocks exist. A person's choice (src/lib/home/layout.ts) only stores ids,
// order and visibility; everything else comes from here.
//
// Ids are stored on the accounts (user_settings.home_layout): never rename or
// reuse one. A retired id is simply removed from here; a stored copy of it is
// ignored.
//
// Reserved for the second stage (reports on the Início), not in the catalog
// yet: `cash-flow`, `category-breakdown`, `income-expense`, `net-worth`.

export type HomeBlockSize = "narrow" | "wide";

export type HomeBlockDefinition = {
  /** Name in "Personalizar o Início" (pt-BR). */
  label: string;
  /** One sentence under the name (pt-BR). */
  description: string;
  /** Title of the block's error card: "Não deu para carregar o orçamento". */
  errorTitle: string;
  /** On desktop a wide block takes a whole row; narrow ones share columns. */
  size: HomeBlockSize;
  /** Part of the app's own Início, the one people see until they change it. */
  inDefault: boolean;
  /** Always first and always shown (the Saldo, doc 02 §2 principle 2). */
  pinned?: boolean;
  /** Estimated height in px, to balance the desktop columns (packHomeLayout). */
  weight: number;
  /** When the block was added, YYYY-MM-DD. */
  since: string;
};

export const HOME_BLOCKS = {
  balance: {
    label: "Saldo em contas",
    description: "Quanto você tem hoje e quanto deve sobrar no fim do mês.",
    errorTitle: "Não deu para carregar o saldo",
    size: "narrow",
    inDefault: true,
    pinned: true,
    weight: 236,
    since: "2026-11-02",
  },
  "month-totals": {
    label: "Receitas e despesas",
    description: "O que entrou e saiu no mês, com o que ainda vai cair.",
    errorTitle: "Não deu para carregar as receitas e despesas",
    size: "narrow",
    inDefault: true,
    weight: 126,
    since: "2026-11-02",
  },
  budget: {
    label: "Orçamento",
    description: "Quanto do orçamento já foi e quanto dá para gastar por dia.",
    errorTitle: "Não deu para carregar o orçamento",
    size: "narrow",
    inDefault: true,
    weight: 380,
    since: "2026-11-02",
  },
  "upcoming-bills": {
    label: "Próximas contas",
    description: "O que vence nos próximos 7 dias, faturas incluídas.",
    errorTitle: "Não deu para carregar as próximas contas",
    size: "narrow",
    inDefault: true,
    weight: 252,
    since: "2026-11-02",
  },
  accounts: {
    label: "Contas",
    description: "O saldo de cada conta e cartão.",
    errorTitle: "Não deu para carregar as contas",
    size: "narrow",
    inDefault: true,
    weight: 156,
    since: "2026-11-02",
  },
  goals: {
    label: "Metas",
    description: "Como andam as suas metas.",
    errorTitle: "Não deu para carregar as metas",
    size: "narrow",
    inDefault: true,
    weight: 188,
    since: "2026-11-02",
  },
  insight: {
    label: "Destaque do mês",
    description: "Um gasto fora do seu normal, quando houver.",
    errorTitle: "Não deu para carregar o destaque do mês",
    size: "narrow",
    inDefault: true,
    weight: 96,
    since: "2026-11-02",
  },
  "spending-calendar": {
    label: "Calendário de gastos",
    description: "Quanto você gastou em cada dia do mês.",
    errorTitle: "Não deu para carregar o calendário de gastos",
    size: "wide",
    inDefault: false,
    weight: 448,
    since: "2026-11-02",
  },
} as const satisfies Record<string, HomeBlockDefinition>;

export type HomeBlockId = keyof typeof HOME_BLOCKS;

/** Every block, in catalog order. */
export const HOME_BLOCK_IDS = Object.keys(HOME_BLOCKS) as HomeBlockId[];

/**
 * The blocks a person can move or hide: all but the pinned one. A tuple, for
 * `z.enum` in the Server Action (a test keeps it in step with the catalog).
 */
export const MOVABLE_HOME_BLOCK_IDS = [
  "month-totals",
  "budget",
  "upcoming-bills",
  "accounts",
  "goals",
  "insight",
  "spending-calendar",
] as const satisfies readonly HomeBlockId[];

export type MovableHomeBlockId = (typeof MOVABLE_HOME_BLOCK_IDS)[number];

/** The app's own Início, in order. */
export const DEFAULT_HOME_ORDER: readonly HomeBlockId[] = HOME_BLOCK_IDS.filter(
  (id) => HOME_BLOCKS[id].inDefault,
);

export function isHomeBlockId(id: unknown): id is HomeBlockId {
  return typeof id === "string" && Object.hasOwn(HOME_BLOCKS, id);
}

export function isPinnedHomeBlock(id: HomeBlockId): boolean {
  const block: HomeBlockDefinition = HOME_BLOCKS[id];
  return block.pinned === true;
}
