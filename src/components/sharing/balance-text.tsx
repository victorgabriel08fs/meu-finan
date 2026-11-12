import { UserAvatar } from "@/components/admin/user-avatar";
import { Money } from "@/components/money/money";
import { type BalancePhrase, balancePhrase } from "@/lib/sharing/labels";
import { cn } from "@/lib/utils";

const TONE = {
  income: "text-income",
  expense: "text-fg",
  settled: "text-fg-3",
} as const;

/**
 * The sentence of a balance (doc 02 §6.18): "Bruno te deve R$ 120,00" with
 * the amount in --income, "Você deve R$ 80,00 para Bruno" with it in
 * --expense, "Tudo acertado" in --text-3. The amount goes through Money, so
 * the privacy mode hides it.
 */
export function BalanceText({
  transfers,
  size = "callout",
  className,
}: {
  transfers: readonly { name: string; amountCents: number }[];
  size?: "callout" | "title";
  className?: string;
}) {
  const phrase: BalancePhrase = balancePhrase(transfers);
  const text = size === "title" ? "text-title-3" : "text-callout";
  if (phrase.amountCents === null) {
    return (
      <span className={cn(text, TONE.settled, className)}>{phrase.text}</span>
    );
  }
  return (
    <span className={cn(text, "text-fg-2", className)}>
      {phrase.before}
      <Money
        cents={phrase.amountCents}
        variant={size === "title" ? "headline" : "callout"}
        sign="never"
        tone={phrase.tone === "income" ? "income" : "neutral"}
        className={cn(
          "font-semibold",
          phrase.tone === "expense" && "text-expense",
          size === "title" && "text-title-3",
        )}
      />
      {phrase.after}
    </span>
  );
}

/** Up to three overlapping avatars of the people in a group. */
export function AvatarStack({ names }: { names: readonly string[] }) {
  const shown = names.slice(0, 3);
  return (
    <span aria-hidden="true" className="flex shrink-0 -space-x-3">
      {shown.map((name, index) => (
        <UserAvatar
          // biome-ignore lint/suspicious/noArrayIndexKey: names may repeat
          key={`${name}-${index}`}
          name={name}
          className="ring-2 ring-surface"
        />
      ))}
    </span>
  );
}
