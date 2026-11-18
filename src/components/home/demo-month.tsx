"use client";

import { m } from "motion/react";
import { formatBRL } from "@/lib/format/money";
import { DemoCard, DemoLabel } from "./home-section";
import { DEMO } from "./model";
import {
  HOME_GROW_MS,
  HOME_REVEAL_MS,
  HOME_RISE_PX,
  revealDelay,
} from "./motion";
import { useCountText } from "./use-count";
import { type Entrance, entranceTransition, useEntrance } from "./use-entrance";

function Bar({
  label,
  amount,
  share,
  fill,
  entrance,
}: {
  label: string;
  amount: number;
  share: number;
  fill: string;
  entrance: Entrance;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-callout">
        <span className="text-fg-2">{label}</span>
        <span className="tabular-nums text-fg">{formatBRL(amount)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <m.div
          initial={false}
          animate={{ scaleX: entrance === "armed" ? 0 : 1 }}
          transition={entranceTransition(entrance, HOME_GROW_MS)}
          className={`h-full origin-left rounded-full ${fill}`}
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Section 3: a card of the Início. The balance counts up from zero (1s), the
 * income and expense bars grow (800ms) and the three upcoming bills come in
 * one after the other. At rest: final figures, full bars, every row.
 */
export function DemoMonth() {
  const { ref, entrance } = useEntrance<HTMLDivElement>();
  const balance = useCountText(DEMO.heroBalance, entrance);

  return (
    <div ref={ref}>
      <DemoCard className="gap-5">
        <div className="flex flex-col gap-1">
          <DemoLabel>Saldo em contas</DemoLabel>
          <m.p className="text-display tabular-nums text-fg">{balance}</m.p>
          <p className="text-callout text-fg-2">
            Previsto para o fim do mês{" "}
            <span className="tabular-nums text-fg">
              {formatBRL(DEMO.forecast)}
            </span>
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Bar
            label="Receitas"
            amount={DEMO.income}
            share={1}
            fill="bg-income"
            entrance={entrance}
          />
          <Bar
            label="Despesas"
            amount={DEMO.expense}
            share={DEMO.expense / DEMO.income}
            fill="bg-expense"
            entrance={entrance}
          />
        </div>
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <p className="text-overline uppercase text-fg-3">Próximas contas</p>
          <ul className="flex flex-col">
            {DEMO.upcoming.map((bill, index) => (
              <m.li
                key={bill.name}
                initial={false}
                animate={
                  entrance === "armed"
                    ? { opacity: 0, y: HOME_RISE_PX / 2 }
                    : { opacity: 1, y: 0 }
                }
                transition={entranceTransition(
                  entrance,
                  HOME_REVEAL_MS,
                  revealDelay(index + 1),
                )}
                className="flex min-h-10 items-center justify-between gap-3 text-callout"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-fg">{bill.name}</span>
                  <span className="text-micro text-fg-3">{bill.when}</span>
                </span>
                <span className="tabular-nums text-fg">
                  {formatBRL(bill.amount)}
                </span>
              </m.li>
            ))}
          </ul>
        </div>
      </DemoCard>
    </div>
  );
}
