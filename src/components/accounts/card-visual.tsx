import { CreditCard, TriangleAlert } from "lucide-react";
import { Money } from "@/components/money/money";

type CardVisualProps = {
  name: string;
  closingDay: number;
  dueDay: number;
  limitCents: number;
  /** Owed today plus future installments and scheduled purchases. */
  usedCents: number;
  futureCents: number;
  availableCents: number;
};

const share = (part: number, whole: number) =>
  whole > 0 ? Math.min(Math.max(part / whole, 0), 1) : 0;

/**
 * The card in solid dark ink (doc 02 §6.8, mockup Fatura): available limit,
 * a bar with what is owed (solid) and the future installments (hatched), and
 * both amounts spelled out. The same ink in both themes; white text on it is
 * above 12:1 and the muted text above 7:1.
 */
export function CardVisual({
  name,
  closingDay,
  dueDay,
  limitCents,
  usedCents,
  futureCents,
  availableCents,
}: CardVisualProps) {
  const owedCents = Math.max(0, usedCents - futureCents);
  const owedShare = share(owedCents, limitCents);
  const futureShare = Math.min(share(futureCents, limitCents), 1 - owedShare);
  const usedPercent = Math.round(share(usedCents, limitCents) * 100);
  const over = availableCents < 0;

  return (
    <section
      aria-label={`Limite do ${name}`}
      className="relative isolate overflow-hidden rounded-card bg-[#0f2a20] p-5 text-white shadow-card dark:ring-1 dark:ring-white/10"
    >
      {/* Soft light in a corner, so it reads as a physical card. */}
      <div
        aria-hidden="true"
        className="absolute -top-20 -right-16 -z-10 size-56 rounded-full bg-[radial-gradient(circle,rgb(61_220_151/0.22),transparent_70%)]"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-body font-bold">
          <CreditCard aria-hidden="true" className="size-5 shrink-0" />
          <span className="truncate">{name}</span>
        </span>
        <span className="shrink-0 text-caption font-semibold text-[#a7c4b8]">
          Fecha {closingDay} · vence {dueDay}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-0.5">
        <span className="text-caption font-semibold text-[#a7c4b8]">
          Limite disponível
        </span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <Money
            cents={Math.max(0, availableCents)}
            variant="title"
            tone="income"
            sign="never"
            className="text-title-1 text-white"
          />
          <span className="text-callout font-semibold text-[#a7c4b8]">
            de{" "}
            <Money
              cents={limitCents}
              variant="callout"
              tone="income"
              sign="never"
              className="font-semibold text-inherit"
            />
          </span>
        </span>
      </div>

      <div
        role="img"
        aria-label={`${usedPercent}% do limite em uso`}
        className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-white/15"
      >
        {owedShare > 0 ? (
          <div
            className="meter-grow h-full rounded-full bg-[#3ddc97]"
            style={{ width: `${owedShare * 100}%` }}
          />
        ) : null}
        {futureShare > 0 ? (
          <div
            className="meter-grow h-full rounded-full bg-hatch text-[#3ddc97] opacity-80"
            style={{ width: `${futureShare * 100}%` }}
          />
        ) : null}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-[#a7c4b8]">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[3px] bg-[#3ddc97]"
          />
          <Money
            cents={owedCents}
            variant="caption"
            tone="income"
            sign="never"
            className="font-semibold text-white"
          />
          em aberto
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[3px] bg-hatch text-[#3ddc97]"
          />
          <Money
            cents={futureCents}
            variant="caption"
            tone="income"
            sign="never"
            className="font-semibold text-white"
          />
          em parcelas futuras
        </li>
      </ul>

      {over ? (
        <p className="mt-3 flex items-center gap-2 rounded-control bg-white/10 px-3 py-2 text-caption font-semibold text-[#f5c66a]">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          <span>
            Limite excedido em{" "}
            <Money
              cents={-availableCents}
              variant="caption"
              tone="income"
              sign="never"
              className="font-bold text-inherit"
            />
          </span>
        </p>
      ) : null}
    </section>
  );
}
