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
  {
    // On Preferências, not on the Início: the Início already has 3 tips and
    // its "Personalizar o Início" button sits below the fold.
    id: "preferencias-inicio",
    kind: "primeiros-passos",
    routes: ["/ajustes/preferencias"],
    anchor: "home-customize",
    title: "Seu Início, do seu jeito",
    body: "Escolha os blocos do Início e a ordem deles. Dá para trazer o calendário de gastos para logo abaixo do saldo.",
    since: "2026-11-02",
    order: 1,
    when: { flag: "inicio_personalizavel" },
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

  // Novidades de 30/out/2026 --------------------------------------------------
  {
    id: "novidade-notificacoes",
    kind: "novidade",
    // Only in Ajustes › Novidades: like the import, the Notificações row sits
    // below the fold of Ajustes, where a balloon would always be skipped.
    routes: [],
    anchor: null,
    title: "Notificações no aparelho",
    body: "Ative os avisos neste aparelho e veja no ícone do app quantos você ainda não leu. No iPhone, vale no app da Tela de Início.",
    since: "2026-10-30",
    order: 10,
    when: { flag: "notificacoes_push" },
    icon: "bell",
    link: { href: "/ajustes/notificacoes", label: "Ativar notificações" },
  },

  // Novidades de 2/nov/2026 ---------------------------------------------------
  {
    id: "novidade-inicio-personalizavel",
    kind: "novidade",
    // Only in Ajustes › Novidades, with a link to Preferências (where the
    // tip above points at the row).
    routes: [],
    anchor: null,
    title: "Monte o seu Início",
    body: "Mostre, esconda e reordene os blocos do Início, e traga o calendário de gastos dos relatórios. Vale em todos os aparelhos.",
    since: "2026-11-02",
    order: 10,
    when: { flag: "inicio_personalizavel" },
    icon: "layout",
    link: { href: "/ajustes/preferencias", label: "Personalizar o Início" },
  },

  // Novidades de 5/nov/2026 ---------------------------------------------------
  {
    id: "novidade-inicio-blocos-relatorios",
    kind: "novidade",
    // Only in Ajustes › Novidades, like "Monte o seu Início": the blocks
    // come in hidden, so the way to them is Preferências.
    routes: [],
    anchor: null,
    title: "Mais blocos para o Início",
    body: "Agora dá para trazer o fluxo de caixa, as categorias, receitas × despesas e o patrimônio para o Início.",
    // REPORT_BLOCKS_SINCE in src/lib/home/blocks.ts (a test keeps them equal).
    since: "2026-11-05",
    order: 10,
    when: { flag: "inicio_personalizavel" },
    icon: "chart",
    link: { href: "/ajustes/preferencias", label: "Personalizar o Início" },
  },
  {
    id: "novidade-avisos-notificacoes",
    kind: "novidade",
    // Only in Ajustes › Novidades, like "Notificações no aparelho": the row
    // sits below the fold of Ajustes.
    routes: [],
    anchor: null,
    title: "Avisos todo dia pela manhã",
    body: "Contas a vencer e resumos da semana e do mês já vêm ligados. Ligue também o resumo do dia e a próxima receita. Os valores, só se você quiser.",
    since: "2026-11-05",
    order: 11,
    when: { flag: "notificacoes_push" },
    icon: "bell",
    link: { href: "/ajustes/notificacoes", label: "Escolher avisos" },
  },
  {
    id: "novidade-subcategorias",
    kind: "novidade",
    // Only in Ajustes › Novidades: the choice lives inside a category's
    // sheet, which has no anchor of its own.
    routes: [],
    anchor: null,
    title: "Subcategorias",
    body: "Agora dá para criar subcategorias, como Mercado › Feira, em Ajustes › Categorias. No Extrato, filtrar a categoria traz as subcategorias junto.",
    since: "2026-11-05",
    order: 12,
    icon: "sparkles",
    link: { href: "/ajustes/categorias", label: "Ver categorias" },
  },
  {
    id: "novidade-categorias-organizar",
    kind: "novidade",
    // Only in Ajustes › Novidades: the choices live inside sheets and the
    // detail has no anchor of its own.
    routes: [],
    anchor: null,
    title: "Categorias mais organizadas",
    body: "Mescle categorias, mude a ordem delas e passe os lançamentos para outra ao arquivar. Em Relatórios, toque numa categoria para ver o detalhe.",
    since: "2026-11-06",
    order: 13,
    icon: "sparkles",
    link: { href: "/ajustes/categorias", label: "Ver categorias" },
  },
  {
    id: "novidade-caixinhas",
    kind: "novidade",
    // Only in Ajustes › Novidades: the type is chosen inside the new-account form.
    routes: [],
    anchor: null,
    title: "Caixinhas",
    body: "Guarde dinheiro à parte numa caixinha: ela conta no patrimônio, mas fica fora do Saldo em contas e do que dá para gastar.",
    since: "2026-11-06",
    order: 14,
    icon: "vault",
    link: { href: "/contas/nova?tipo=caixinha", label: "Criar caixinha" },
  },
  {
    id: "novidade-inicio-gasto-por-dia",
    kind: "novidade",
    // Only in Ajustes › Novidades: the block is added in "Personalizar o Início".
    routes: [],
    anchor: null,
    title: "Quanto dá para gastar por dia",
    body: "Traga para o Início quanto dá para gastar por dia em cada um dos próximos 14 dias, pelo saldo previsto das suas contas.",
    since: "2026-11-10",
    order: 15,
    when: { flag: "inicio_personalizavel" },
    icon: "chart",
    link: { href: "/ajustes/preferencias", label: "Personalizar o Início" },
  },
  {
    id: "novidade-dia-nao-util",
    kind: "novidade",
    // Only in Ajustes › Novidades: the note shows only when a bill falls on
    // a non-business day. The push notice stays out of the text: `when`
    // takes one flag, and notificacoes_push may be off for the reader.
    routes: [],
    anchor: null,
    title: "Vencimento em dia não útil",
    body: "Quando uma conta vence no fim de semana ou num feriado, o Início, o Extrato e a fatura do cartão mostram para quando o pagamento costuma passar.",
    since: "2026-11-12",
    order: 16,
    when: { flag: "alerta_dia_nao_util" },
    icon: "sparkles",
    link: { href: "/extrato?status=pendente", label: "Ver contas pendentes" },
  },
  {
    id: "novidade-sino",
    kind: "novidade",
    // Only in Ajustes › Novidades: the Início already has 3 tips (the limit
    // per screen), so the bell has its anchor (`data-tip="sino"`) but no balloon.
    routes: [],
    anchor: null,
    title: "Notificações num lugar só",
    body: "Toque no sino para ver os avisos e os convites, mesmo sem notificações no celular.",
    since: "2026-11-12",
    order: 17,
    when: { flag: "central_notificacoes" },
    icon: "bell",
    link: { href: "/inicio", label: "Ver no Início" },
  },
  {
    id: "novidade-compartilhado",
    kind: "novidade",
    // Only in Ajustes › Novidades: the area has no fixed place on the phone
    // (the Início block shows up once there is a group or an invite).
    routes: [],
    anchor: null,
    title: "Divida despesas com outra pessoa",
    body: "Crie um grupo, convide pelo e-mail e veja quem deve quanto, com o acerto num toque.",
    since: "2026-11-12",
    order: 18,
    when: { flag: "financas_compartilhadas" },
    icon: "users",
    link: { href: "/compartilhado", label: "Ver Compartilhado" },
  },
  {
    id: "novidade-caixinha-compartilhada",
    kind: "novidade",
    // Only in Ajustes › Novidades, like the one above: the boxes live inside
    // each group.
    routes: [],
    anchor: null,
    title: "Guardem dinheiro juntos",
    body: "Uma caixinha do grupo, com quanto cada um já guardou e quando vocês chegam no objetivo.",
    since: "2026-11-12",
    order: 19,
    when: { flag: "financas_compartilhadas" },
    icon: "vault",
    link: { href: "/compartilhado", label: "Ver Compartilhado" },
  },
  {
    id: "novidade-gasto-por-dia-por-conta",
    kind: "novidade",
    // Only in Ajustes › Novidades, like the block's own: it lives in
    // "Personalizar o Início".
    routes: [],
    anchor: null,
    title: "Quanto dá para gastar, por conta",
    body: "O bloco Quanto dá para gastar por dia mostra também quanto dá em cada conta, com a fatura do cartão na conta que paga.",
    since: "2026-11-12",
    order: 20,
    when: { flag: "inicio_personalizavel" },
    icon: "chart",
    link: { href: "/ajustes/preferencias", label: "Personalizar o Início" },
  },
  {
    id: "novidade-conta-beneficio",
    kind: "novidade",
    routes: [],
    anchor: null,
    title: "Conta de benefício",
    body: "Cadastre o vale-refeição ou o vale-alimentação como Benefício: o saldo fica fora do Saldo em contas e, por padrão, do patrimônio.",
    since: "2026-11-12",
    order: 21,
    icon: "utensils",
    link: { href: "/contas/nova?tipo=beneficio", label: "Criar benefício" },
  },
  {
    id: "novidade-inicio-maior-gasto-semana",
    kind: "novidade",
    routes: [],
    anchor: null,
    title: "Maior gasto da semana",
    body: "Traga para o Início os 3 maiores gastos dos últimos 7 dias, com atalho para o Extrato.",
    since: "2026-11-13",
    order: 22,
    when: { flag: "inicio_personalizavel" },
    icon: "chart",
    link: { href: "/ajustes/preferencias", label: "Personalizar o Início" },
  },
  {
    id: "novidade-inicio-parcelas-a-terminar",
    kind: "novidade",
    routes: [],
    anchor: null,
    title: "Parcelas a terminar",
    body: "Veja no Início o que falta pagar das compras parceladas, quando cada uma acaba e quanto sai por mês.",
    since: "2026-11-13",
    order: 23,
    when: { flag: "inicio_personalizavel" },
    icon: "chart",
    link: { href: "/ajustes/preferencias", label: "Personalizar o Início" },
  },
  {
    id: "novidade-inicio-comparado-mes-passado",
    kind: "novidade",
    routes: [],
    anchor: null,
    title: "Comparado ao mês passado",
    body: "Veja no Início se está gastando mais ou menos que no mês passado até o mesmo dia, e as categorias que mais mudaram.",
    since: "2026-11-14",
    order: 24,
    when: { flag: "inicio_personalizavel" },
    icon: "chart",
    link: { href: "/ajustes/preferencias", label: "Personalizar o Início" },
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
