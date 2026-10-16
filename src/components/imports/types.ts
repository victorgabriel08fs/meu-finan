import type {
  analyzeImportAction,
  confirmImportAction,
} from "@/server/actions/imports";

type ActionData<T extends (input: never) => Promise<{ data?: unknown }>> =
  NonNullable<Awaited<ReturnType<T>>["data"]>;

/** What "Escolher arquivo" returns: the CSV columns to confirm or the rows to review. */
export type AnalyzeData = ActionData<typeof analyzeImportAction>;
export type MappingStage = Extract<AnalyzeData, { stage: "mapping" }>;
export type ReviewStage = Extract<AnalyzeData, { stage: "review" }>;
export type ConfirmData = ActionData<typeof confirmImportAction>;

export type ImportAccountOption = {
  id: string;
  name: string;
  type: string;
  icon: string;
  color: string;
};

export type ImportCategoryOption = {
  id: string;
  kind: "income" | "expense";
  /** "Mercado", or "Alimentação › Mercado" for a subcategory. */
  label: string;
  icon: string;
  color: string;
};

/** An entry of "Importações recentes", with its labels already in pt-BR. */
export type RecentImportView = {
  id: string;
  accountName: string;
  /** "112 lançamentos · 1/out – 14/out". */
  summary: string;
  /** "Hoje, 10:32". */
  when: string;
  undoable: boolean;
  /** Undone (or every entry deleted since). */
  undone: boolean;
  /** Statement filtered by the account, while there is something to see. */
  href: string | null;
};
