// A person's Início: which blocks, in which order (doc 02 §6.3). The account
// stores only what the person chose (user_settings.home_layout, null = never
// changed); this merges it with the catalog (src/lib/home/blocks.ts) and lays
// the visible blocks out for the desktop. Pure functions, no I/O.
import {
  HOME_BLOCK_IDS,
  HOME_BLOCKS,
  type HomeBlockDefinition,
  type HomeBlockId,
  isHomeBlockId,
  isPinnedHomeBlock,
  type MovableHomeBlockId,
} from "./blocks";

export type HomeLayoutEntry = {
  id: HomeBlockId;
  visible: boolean;
  /** In the catalog but unknown to the person's saved choice ("Novo"). */
  isNew?: boolean;
};

export type HomeLayout = {
  /** Every block of the catalog, the pinned one first and visible. */
  entries: HomeLayoutEntry[];
  /** The person saved a choice of their own (false: the app's default). */
  customized: boolean;
};

/** What the account keeps: the movable blocks the person knew, in order. */
export type StoredHomeBlock = { id: MovableHomeBlockId; visible: boolean };

const PINNED_IDS = HOME_BLOCK_IDS.filter(isPinnedHomeBlock);

/**
 * The app's Início: the default blocks visible, in order, then the others
 * hidden, in catalog order.
 */
export function defaultHomeLayout(): HomeLayoutEntry[] {
  return [
    ...HOME_BLOCK_IDS.filter((id) => HOME_BLOCKS[id].inDefault).map((id) => ({
      id,
      visible: true,
    })),
    ...HOME_BLOCK_IDS.filter((id) => !HOME_BLOCKS[id].inDefault).map((id) => ({
      id,
      visible: false,
    })),
  ];
}

/** A block out of the default stays "Novo" this many days after it ships. */
export const NEW_BLOCK_DAYS = 30;

export type ResolveOptions = {
  /** Today, YYYY-MM-DD in the person's time zone, for the "Novo" mark. */
  today?: string;
};

/** A block out of the default that shipped less than 30 days before today. */
function isRecentBlock(id: HomeBlockId, today: string | undefined): boolean {
  const block: HomeBlockDefinition = HOME_BLOCKS[id];
  if (!today || block.inDefault) return false;
  const days = (Date.parse(today) - Date.parse(block.since)) / 86_400_000;
  return days >= 0 && days < NEW_BLOCK_DAYS;
}

/**
 * Merges what the account stored with the catalog. Not an array: the
 * default. Otherwise the pinned block comes first and visible; unknown,
 * repeated (the first one wins), pinned or malformed items are ignored; and
 * catalog blocks missing from it come last, hidden and marked new. With
 * `today`, a block out of the default is also marked new during its first
 * 30 days, wherever it is.
 */
export function resolveHomeLayout(
  stored: unknown,
  { today }: ResolveOptions = {},
): HomeLayout {
  const mark = (entry: HomeLayoutEntry): HomeLayoutEntry =>
    !entry.isNew && isRecentBlock(entry.id, today)
      ? { ...entry, isNew: true }
      : entry;
  if (!Array.isArray(stored)) {
    return { entries: defaultHomeLayout().map(mark), customized: false };
  }
  const seen = new Set<HomeBlockId>();
  const chosen: HomeLayoutEntry[] = [];
  for (const item of stored) {
    if (typeof item !== "object" || item === null) continue;
    const { id, visible } = item as { id?: unknown; visible?: unknown };
    if (!isHomeBlockId(id) || isPinnedHomeBlock(id) || seen.has(id)) continue;
    if (typeof visible !== "boolean") continue;
    seen.add(id);
    chosen.push({ id, visible });
  }
  const entries: HomeLayoutEntry[] = [
    ...PINNED_IDS.map((id) => ({ id, visible: true })),
    ...chosen,
    ...HOME_BLOCK_IDS.filter(
      (id) => !isPinnedHomeBlock(id) && !seen.has(id),
    ).map((id) => ({ id, visible: false, isNew: true })),
  ].map(mark);
  return { entries, customized: true };
}

/** What to save on the account: the movable blocks, in order. */
export function toStoredLayout(
  entries: readonly HomeLayoutEntry[],
): StoredHomeBlock[] {
  const seen = new Set<HomeBlockId>();
  const stored: StoredHomeBlock[] = [];
  for (const { id, visible } of entries) {
    if (!isHomeBlockId(id) || isPinnedHomeBlock(id) || seen.has(id)) continue;
    seen.add(id);
    stored.push({ id: id as MovableHomeBlockId, visible });
  }
  return stored;
}

/** The blocks to render, in order. */
export function visibleHomeBlocks(
  entries: readonly HomeLayoutEntry[],
): HomeBlockId[] {
  return entries.filter((entry) => entry.visible).map((entry) => entry.id);
}

/** Whether "Subir" / "Descer" would move the block (false at either end). */
export function canMoveHomeBlock(
  entries: readonly HomeLayoutEntry[],
  id: HomeBlockId,
  direction: "up" | "down",
): boolean {
  const from = entries.findIndex((entry) => entry.id === id);
  const other = entries[direction === "up" ? from - 1 : from + 1];
  return (
    from !== -1 &&
    other !== undefined &&
    !isPinnedHomeBlock(id) &&
    !isPinnedHomeBlock(other.id)
  );
}

/**
 * Moves a block one place up or down ("Subir" / "Descer"). The pinned block
 * never moves and nothing moves past it; at either end nothing changes.
 */
export function moveHomeBlock(
  entries: readonly HomeLayoutEntry[],
  id: HomeBlockId,
  direction: "up" | "down",
): HomeLayoutEntry[] {
  if (!canMoveHomeBlock(entries, id, direction)) return [...entries];
  const from = entries.findIndex((entry) => entry.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  const moving = entries[from];
  const other = entries[to];
  if (!moving || !other) return [...entries];
  const next = [...entries];
  next[from] = other;
  next[to] = moving;
  return next;
}

/** Shows or hides a block; the pinned one is always shown. */
export function setHomeBlockVisible(
  entries: readonly HomeLayoutEntry[],
  id: HomeBlockId,
  visible: boolean,
): HomeLayoutEntry[] {
  if (isPinnedHomeBlock(id)) return [...entries];
  return entries.map((entry) =>
    entry.id === id ? { ...entry, visible } : entry,
  );
}

/** A row of the desktop Início: one wide block, or columns of narrow ones. */
export type HomeSection =
  | { kind: "wide"; id: HomeBlockId }
  /** The pinned block (Saldo) and the wide one after it, side by side. */
  | { kind: "hero-wide"; hero: HomeBlockId; id: HomeBlockId }
  | { kind: "columns"; groups: HomeBlockId[][] };

/** Most columns on the desktop (doc 02 §4.5: three from xl). */
const MAX_COLUMNS = 3;

/**
 * Lays the visible blocks out for the desktop, keeping their order: each
 * wide block is a row of its own, and each run of narrow blocks between
 * them is split into up to 3 contiguous columns, making the tallest column
 * (by the blocks' weights) as short as possible; ties go to the earliest
 * cuts. With the default blocks this gives the Início's three columns
 * [saldo, receitas e despesas] [orçamento, próximas contas]
 * [contas, metas, destaque].
 *
 * The Saldo is never alone in a whole row: when a wide block comes right
 * after it, the two share one (a third and two thirds, from xl).
 */
export function packHomeLayout(ids: readonly HomeBlockId[]): HomeSection[] {
  const sections: HomeSection[] = [];
  let run: HomeBlockId[] = [];
  const flush = () => {
    if (run.length > 0) sections.push({ kind: "columns", groups: split(run) });
    run = [];
  };
  let rest = ids;
  const [first, second] = ids;
  if (
    first &&
    second &&
    isPinnedHomeBlock(first) &&
    HOME_BLOCKS[second].size === "wide"
  ) {
    sections.push({ kind: "hero-wide", hero: first, id: second });
    rest = ids.slice(2);
  }
  for (const id of rest) {
    if (HOME_BLOCKS[id].size === "wide") {
      flush();
      sections.push({ kind: "wide", id });
    } else {
      run.push(id);
    }
  }
  flush();
  return sections;
}

function split(run: HomeBlockId[]): HomeBlockId[][] {
  if (run.length <= MAX_COLUMNS) return run.map((id) => [id]);
  const prefix = [0];
  for (const id of run) {
    prefix.push((prefix.at(-1) ?? 0) + HOME_BLOCKS[id].weight);
  }
  const height = (from: number, to: number) =>
    (prefix[to] ?? 0) - (prefix[from] ?? 0);
  const n = run.length;
  let best: [number, number] = [1, 2];
  let tallest = Number.POSITIVE_INFINITY;
  for (let i = 1; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const max = Math.max(height(0, i), height(i, j), height(j, n));
      if (max < tallest) {
        tallest = max;
        best = [i, j];
      }
    }
  }
  const [i, j] = best;
  return [run.slice(0, i), run.slice(i, j), run.slice(j)];
}
