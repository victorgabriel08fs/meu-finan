// Labels of the shared finances (doc 02 §6.18, §10.3, §10.4), pure: the
// sentence of a balance, a member's status, a split method and a split that
// does not close.
import type { SplitError, SplitMethod } from "@/lib/finance/split";
import { shortDateLabel } from "@/lib/format/date";
import { formatBRL } from "@/lib/format/money";

export const SPLIT_METHOD_LABELS: Record<SplitMethod, string> = {
  equal: "Iguais",
  amounts: "Valores",
  percent: "Percentual",
  shares: "Cotas",
};

/** "Dividida em partes iguais", for the detail of an expense. */
export const SPLIT_METHOD_DETAIL: Record<SplitMethod, string> = {
  equal: "Partes iguais",
  amounts: "Por valores",
  percent: "Por percentual",
  shares: "Por cotas",
};

/** The message under the split editor (aria-live). */
export function splitErrorLabel(error: SplitError): string {
  switch (error.kind) {
    case "amounts_short":
      return `Faltam ${formatBRL(error.missingCents)} para fechar o total.`;
    case "amounts_over":
      return `Passou ${formatBRL(error.excessCents)} do total.`;
    case "percent_sum":
      return `Os percentuais somam ${percentLabel(error.sumBasisPoints)}. Precisam somar 100%.`;
    case "no_participant":
      return "Escolha quem divide esta despesa.";
  }
}

/** "60%", "33,33%" from basis points. */
export function percentLabel(basisPoints: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(basisPoints / 100)}%`;
}

/**
 * How a member is shown in the history: their name, with "(saiu)" or
 * "(conta excluída)" once they are gone.
 */
export function memberName(member: {
  name: string;
  status: string;
  deleted: boolean;
}): string {
  if (member.deleted) return `${member.name} (conta excluída)`;
  if (member.status === "left" || member.status === "removed") {
    return `${member.name} (saiu)`;
  }
  return member.name;
}

export type MemberStatusInput = {
  status: "invited" | "active" | "declined" | "left" | "removed";
  role: "owner" | "member";
  isMe: boolean;
  /** The account behind the row was deleted. */
  deleted: boolean;
  /** YYYY-MM-DD in the viewer's time zone, and the invite's last day there. */
  todayIso: string;
  expiresOn: string | null;
};

/** The status line of a member in "Pessoas". */
export function memberStatusLabel(member: MemberStatusInput): string {
  if (member.deleted) return "Conta excluída";
  switch (member.status) {
    case "invited":
      return member.expiresOn && member.expiresOn >= member.todayIso
        ? `Convite enviado · vale até ${shortDateLabel(member.expiresOn)}`
        : "Convite expirado";
    case "declined":
      return "Recusou";
    case "left":
    case "removed":
      return "Saiu";
    case "active":
      if (member.isMe)
        return member.role === "owner" ? "Você · criou o grupo" : "Você";
      return member.role === "owner" ? "Criou o grupo" : "Participa";
  }
}

export type BalanceTone = "income" | "expense" | "settled";

export type BalancePhrase = {
  /** The whole sentence, also the accessible one. */
  text: string;
  tone: BalanceTone;
  /** The amount, drawn apart (with Money) by the screens; null when settled. */
  amountCents: number | null;
  /** The sentence around the amount: `before` + amount + `after`. */
  before: string;
  after: string;
};

/**
 * The sentence of a balance, from the payments of the plan that involve the
 * viewer (`toMe` positive: someone pays me). One payment names the other
 * person ("Bruno te deve R$ 120,00", "Você deve R$ 80,00 para Bruno"); several
 * sum ("Você tem R$ 200,00 a receber", "Você deve R$ 90,00 no total").
 */
export function balancePhrase(
  transfers: readonly { name: string; amountCents: number }[],
): BalancePhrase {
  const owed = transfers.filter((item) => item.amountCents > 0);
  const owing = transfers.filter((item) => item.amountCents < 0);
  if (owed.length === 0 && owing.length === 0) {
    return {
      text: "Tudo acertado",
      tone: "settled",
      amountCents: null,
      before: "Tudo acertado",
      after: "",
    };
  }
  if (owed.length > 0 && owing.length === 0) {
    const total = owed.reduce((sum, item) => sum + item.amountCents, 0);
    const [only] = owed;
    if (owed.length === 1 && only) {
      const before = `${only.name} te deve `;
      return {
        text: `${before}${formatBRL(total)}`,
        tone: "income",
        amountCents: total,
        before,
        after: "",
      };
    }
    return {
      text: `Você tem ${formatBRL(total)} a receber`,
      tone: "income",
      amountCents: total,
      before: "Você tem ",
      after: " a receber",
    };
  }
  const net = transfers.reduce((sum, item) => sum + item.amountCents, 0);
  const [only] = owing;
  if (owed.length === 0 && owing.length === 1 && only) {
    const after = ` para ${only.name}`;
    return {
      text: `Você deve ${formatBRL(-net)}${after}`,
      tone: "expense",
      amountCents: -net,
      before: "Você deve ",
      after,
    };
  }
  // The plan never has the same person paying and receiving, but sum anyway.
  return net >= 0
    ? {
        text: `Você tem ${formatBRL(net)} a receber`,
        tone: "income",
        amountCents: net,
        before: "Você tem ",
        after: " a receber",
      }
    : {
        text: `Você deve ${formatBRL(-net)} no total`,
        tone: "expense",
        amountCents: -net,
        before: "Você deve ",
        after: " no total",
      };
}

/** "Você e Bruno", "Você, Bruno e Carla", "Só você". */
export function membersLine(otherNames: readonly string[]): string {
  if (otherNames.length === 0) return "Só você";
  if (otherNames.length === 1) return `Você e ${otherNames[0]}`;
  return `Você, ${otherNames.slice(0, -1).join(", ")} e ${otherNames.at(-1)}`;
}

/** "Bruno acertou R$ 120,00 com você", "Você acertou … com Bruno", "Ana acertou … com Bruno". */
export function settlementLine(input: {
  fromName: string;
  toName: string;
  fromIsMe: boolean;
  toIsMe: boolean;
  amountCents: number;
}): string {
  const amount = formatBRL(input.amountCents);
  if (input.fromIsMe) return `Você acertou ${amount} com ${input.toName}`;
  if (input.toIsMe) return `${input.fromName} acertou ${amount} com você`;
  return `${input.fromName} acertou ${amount} com ${input.toName}`;
}
