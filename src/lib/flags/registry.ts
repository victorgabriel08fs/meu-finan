// Feature flags of the app (doc 01 §11.10): the single source of truth for
// which flags exist. The database only stores what an administrator changed
// (src/server/db/schema/flags.ts), so a flag works with its default from the
// moment it is added here, and removing it here makes any stored value inert.
//
// How to add a flag (also in README › Feature flags):
//   1. Add an entry below: snake_case key, pt-BR label and description, its
//      grammar (gender and number of the label), the default, who owns it and since when.
//   2. Gate the feature on the server: `isFlagEnabled(key, userId)` in pages
//      and Route Handlers, `flaggedAction(key)` for Server Actions.
//   3. Hide or show UI: the server check above, or `useFlag(key)` in a Client
//      Component (inside <Suspense>). A tip or novidade about the feature
//      (src/lib/tips/registry.ts) gets `when: { flag: key }`.
//   4. Turn it on or off in Administração › Flags, globally or per person.

export type FlagGrammar = { gender: "masculine" | "feminine"; plural: boolean };

export type FlagDefinition = {
  /** Name shown in Administração › Flags (pt-BR). */
  label: string;
  /**
   * Gender and number of `label`, so the toast agrees with it ("Notificações
   * ligadas", "Importar extrato desligado"). Used by `switchedLabel`.
   */
  grammar: FlagGrammar;
  /** What changes when the flag is off (pt-BR, one sentence). */
  description: string;
  /** Value when nobody changed it. */
  defaultValue: boolean;
  /** Area of the app that owns the flag. */
  owner: string;
  /** When the flag was added, YYYY-MM-DD. */
  since: string;
};

export const FLAGS = {
  importar_extrato: {
    label: "Importar extrato",
    grammar: { gender: "masculine", plural: false },
    description:
      "Importar arquivos OFX e CSV do banco em Ajustes › Dados. Quando desligado, a entrada some e o servidor recusa a importação.",
    defaultValue: true,
    owner: "Dados",
    since: "2026-10-17",
  },
  notificacoes_push: {
    label: "Notificações",
    grammar: { gender: "feminine", plural: true },
    description:
      "Notificações no aparelho, o número no ícone do app e os avisos diários (resumos, contas a vencer, próxima receita), em Ajustes › Notificações. Quando desligado, a entrada some e o servidor não envia avisos nem aceita inscrições.",
    defaultValue: false,
    owner: "Notificações",
    since: "2026-10-30",
  },
  inicio_personalizavel: {
    label: "Início personalizável",
    grammar: { gender: "masculine", plural: false },
    description:
      "Escolher, esconder e reordenar os blocos do Início, incluindo o calendário de gastos. Quando desligado, o Início fica no padrão do app, o botão Personalizar some e o servidor recusa a mudança.",
    defaultValue: false,
    owner: "Início",
    since: "2026-11-02",
  },
} as const satisfies Record<string, FlagDefinition>;

export type FlagKey = keyof typeof FLAGS;

/** Every flag's effective value for one person. */
export type Flags = Record<FlagKey, boolean>;

export const FLAG_KEYS = Object.keys(FLAGS) as FlagKey[];

export function isFlagKey(key: string): key is FlagKey {
  return Object.hasOwn(FLAGS, key);
}

/** The registry defaults, e.g. for a signed-out request. */
export function defaultFlags(): Flags {
  return Object.fromEntries(
    FLAG_KEYS.map((key) => [key, FLAGS[key].defaultValue]),
  ) as Flags;
}
