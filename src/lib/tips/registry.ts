import type { FlagKey } from "@/lib/flags/registry";
import type { Tip } from "./types";

/**
 * Every tip of the app (doc 02 §6.2 and §6.16). To add one:
 *
 * 1. Put `data-tip="<anchor>"` on the element it points at (any element; the
 *    first one visible on screen wins, so a phone and a desktop version of
 *    the same control can share the name).
 * 2. Add an entry below with a new, stable `id` and today's date as `since`.
 *    A `novidade` reaches only accounts in use before `since`; give it an
 *    `icon` and, when there is a place to go, a `link`. Without `routes` and
 *    `anchor` it lives only in Ajustes › Novidades. Conditions go in `when`
 *    (see TipCondition). A feature behind a feature flag takes
 *    `when: { flag: "<key>" }` and one only administrators can open takes
 *    `when: { roles: ["admin"] }`: their tips and links never reach anyone
 *    who could not open the screen.
 * 3. Keep a screen at three tips at most, and write like doc 02 §10: "você",
 *    short sentences, no jargon.
 *
 * Ids are stored per user once seen: never rename or reuse one.
 */
export const TIPS: readonly Tip[] = [
  // Início --------------------------------------------------------------------
  // While there is no account the Início is the "Comece por aqui" checklist,
  // which guides on its own: these wait for the first account.
  {
    id: "inicio-lancamento-rapido",
    kind: "primeiros-passos",
    routes: ["/inicio"],
    anchor: "quick-add",
    title: "Registre em segundos",
    body: "Toque no + para lançar uma despesa, receita ou transferência. O teclado já abre pronto para o valor.",
    desktopBody:
      "Clique em Nova transação ou use o teclado: N abre uma despesa, R uma receita e T uma transferência.",
    since: "2026-10-17",
    order: 1,
    when: { hasAccounts: true },
    placement: ["top", "right", "bottom"],
  },
  {
    id: "inicio-previsao",
    kind: "primeiros-passos",
    routes: ["/inicio"],
    anchor: "forecast",
    title: "Quanto deve sobrar no mês",
    body: "É o saldo previsto para o fim do mês, já contando contas agendadas, receitas a receber e faturas. O botão ao lado mostra a conta.",
    since: "2026-10-17",
    order: 2,
    when: { hasAccounts: true },
  },
  {
    id: "inicio-modo-discreto",
    kind: "primeiros-passos",
    routes: ["/inicio"],
    anchor: "privacy",
    title: "Modo discreto",
    body: "Vai abrir o app em público? Use o olho para esconder todos os valores. A escolha fica salva neste aparelho.",
    since: "2026-10-17",
    order: 3,
    when: { hasAccounts: true },
  },

  // Extrato -------------------------------------------------------------------
  {
    id: "extrato-busca",
    kind: "primeiros-passos",
    routes: ["/extrato"],
    anchor: "statement-search",
    title: "Ache qualquer lançamento",
    body: "Busque pela descrição, sem se preocupar com acentos. Os filtros logo abaixo mostram só uma conta, uma categoria ou o que está pendente.",
    since: "2026-10-17",
    order: 1,
    when: { hasAccounts: true },
  },

  // Planejar ------------------------------------------------------------------
  {
    id: "planejar-secoes",
    kind: "primeiros-passos",
    routes: ["/planejar/orcamentos", "/planejar/metas", "/planejar/simulador"],
    anchor: "planning-sections",
    title: "Três jeitos de planejar",
    body: "Orçamentos para o mês, metas para o que você quer conquistar e o simulador para ver o dinheiro render.",
    since: "2026-10-17",
    order: 1,
  },
  {
    id: "simulador-modos",
    kind: "primeiros-passos",
    routes: ["/planejar/simulador"],
    anchor: "simulator-modes",
    title: "Pergunte do seu jeito",
    body: "Quanto vai ter, quanto investir por mês ou em quanto tempo chega lá: escolha a pergunta e ajuste os valores.",
    since: "2026-10-17",
    order: 2,
  },

  // Relatórios ----------------------------------------------------------------
  {
    id: "relatorios-abas",
    kind: "primeiros-passos",
    routes: ["/relatorios/*"],
    anchor: "report-tabs",
    title: "Um relatório por aba",
    body: "Cada aba responde uma pergunta: para onde vai o dinheiro, como fica o saldo no mês e quanto o patrimônio cresce.",
    since: "2026-10-17",
    order: 1,
    when: { hasAccounts: true },
  },

  // Ajustes -------------------------------------------------------------------
  {
    id: "ajustes-passkey",
    kind: "primeiros-passos",
    routes: ["/ajustes"],
    anchor: "security",
    title: "Entre sem senha",
    body: "Em Segurança, cadastre uma passkey para entrar com a digital, o rosto ou o PIN do aparelho.",
    since: "2026-10-17",
    order: 1,
    when: { hasPasskey: false },
  },
  {
    id: "ajustes-dicas",
    kind: "primeiros-passos",
    routes: ["/ajustes"],
    anchor: "preferences",
    title: "Dicas do seu jeito",
    body: "Aqui você desliga estas dicas ou vê todas de novo quando quiser.",
    since: "2026-10-17",
    order: 2,
  },

  // Novidades de 16/out/2026 --------------------------------------------------
  {
    id: "novidade-detalhe-da-meta",
    kind: "novidade",
    routes: ["/planejar/metas"],
    anchor: "goal-card",
    title: "Cada meta com seu detalhe",
    body: "Toque numa meta para ver a projeção mês a mês e registrar quanto guardou com o botão Aportar.",
    since: "2026-10-16",
    order: 10,
    icon: "target",
    link: { href: "/planejar/metas", label: "Ver metas" },
  },
  {
    id: "novidade-relatorios",
    kind: "novidade",
    routes: ["/relatorios/*"],
    anchor: "report-tab-fluxo",
    title: "Três relatórios novos",
    body: "Fluxo mostra o saldo dia a dia até o fim do mês; Patrimônio, como ele evolui; e o Calendário, em que dias você gasta mais.",
    since: "2026-10-16",
    order: 11,
    when: { hasAccounts: true },
    replaces: ["relatorios-abas"],
    icon: "chart",
    link: { href: "/relatorios/fluxo", label: "Ver relatórios" },
  },
  {
    id: "novidade-importar-extrato",
    kind: "novidade",
    // Only in Ajustes › Novidades: its row sits below the fold of Ajustes,
    // where a balloon would always be skipped.
    routes: [],
    anchor: null,
    title: "Importe o extrato do banco",
    body: "Traga os lançamentos de um arquivo OFX ou CSV, sem duplicar o que já existe. E, se precisar, exporte tudo em CSV.",
    since: "2026-10-16",
    order: 12,
    when: { flag: "importar_extrato" },
    icon: "file-up",
    link: { href: "/importar", label: "Importar extrato" },
  },
  {
    id: "novidade-atalhos-do-app",
    kind: "novidade",
    routes: [],
    anchor: null,
    title: "Atalhos no ícone do app",
    body: "Com o app instalado, toque e segure o ícone dele para abrir direto uma nova despesa, uma nova receita ou o extrato.",
    since: "2026-10-16",
    order: 13,
    icon: "smartphone",
  },

  // Novidades de 17/out/2026 --------------------------------------------------
  {
    id: "novidade-tema-escuro",
    kind: "novidade",
    routes: [],
    anchor: null,
    title: "O app agora abre no escuro",
    body: "Prefere o claro? Escolha Claro ou Sistema em Preferências. A escolha fica na sua conta e vale em todos os aparelhos.",
    since: "2026-10-17",
    order: 10,
    icon: "sun-moon",
    link: { href: "/ajustes/preferencias", label: "Escolher o tema" },
  },
];

/** A screen shows at most this many tips in a row (doc 02 §6.2). */
export const MAX_TIPS_PER_SCREEN = 3;

const BY_ID = new Map(TIPS.map((tip) => [tip.id, tip]));

export const TIP_IDS: readonly string[] = TIPS.map((tip) => tip.id);

/** Ids of the novidades: "Rever dicas" keeps them read. */
export const NOVIDADE_IDS: readonly string[] = TIPS.filter(
  (tip) => tip.kind === "novidade",
).map((tip) => tip.id);

/**
 * Feature flags some tip depends on: the server resolves just these for the
 * user (TipContext.flags).
 */
export const TIP_FLAG_KEYS: readonly FlagKey[] = [
  ...new Set(TIPS.flatMap((tip) => (tip.when?.flag ? [tip.when.flag] : []))),
];

export function isTipId(value: unknown): value is string {
  return typeof value === "string" && BY_ID.has(value);
}

export function tipById(id: string): Tip | undefined {
  return BY_ID.get(id);
}
