"use client";

import { Eye, EyeOff } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { formatBRL } from "@/lib/format/money";
import { DemoCard, DemoLabel } from "./home-section";
import { DEMO } from "./model";
import { HOME_MASK_MS } from "./motion";
import { type Entrance, useEntrance } from "./use-entrance";

const MASK = formatBRL(0).replace("0,00", "••••");
const SWAP = { duration: HOME_MASK_MS / 1000 };

/** Two things in the same place, cross-faded: the box keeps the wider one's size. */
function Swap({
  entrance,
  shown,
  hidden,
  className,
}: {
  entrance: Entrance;
  /** Before the swap (only ever seen with motion, below the fold). */
  shown: ReactNode;
  /** After the swap: the resting state. */
  hidden: ReactNode;
  className?: string;
}) {
  const before = entrance === "armed";
  const transition = entrance === "play" ? SWAP : { duration: 0 };
  return (
    <span
      className={`inline-grid max-w-full [overflow-wrap:normal] ${className ?? ""}`}
    >
      <motion.span
        initial={false}
        animate={{ opacity: before ? 1 : 0 }}
        transition={transition}
        className="col-start-1 row-start-1 min-w-0"
      >
        {shown}
      </motion.span>
      <motion.span
        initial={false}
        animate={{ opacity: before ? 0 : 1 }}
        transition={transition}
        className="col-start-1 row-start-1 min-w-0"
      >
        {hidden}
      </motion.span>
    </span>
  );
}

/**
 * Section 5: the discreet mode. When the card reaches the middle of the
 * screen its amounts turn into "R$ ••••" (160ms, same width). At rest (server,
 * reduced motion) it is already discreet, with "Valores ocultos".
 */
export function DemoPrivacy() {
  const { ref, entrance } = useEntrance<HTMLDivElement>({
    amount: 0.5,
    margin: "0px 0px -40% 0px",
  });
  const amount = (cents: number, className?: string) => (
    <Swap
      entrance={entrance}
      shown={formatBRL(cents)}
      hidden={MASK}
      className={className}
    />
  );

  return (
    <div ref={ref}>
      <DemoCard className="gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <DemoLabel>Saldo em contas</DemoLabel>
            <p className="text-title-1 tabular-nums text-fg">
              {amount(DEMO.heroBalance)}
            </p>
          </div>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2">
            <Swap
              entrance={entrance}
              shown={<Eye className="size-5" />}
              hidden={<EyeOff className="size-5" />}
            />
          </span>
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-4 text-callout">
          <p className="flex flex-wrap justify-between gap-x-3">
            <span className="text-fg-2">Receitas</span>
            <span className="tabular-nums text-fg">
              {amount(DEMO.income, "justify-items-end")}
            </span>
          </p>
          <p className="flex flex-wrap justify-between gap-x-3">
            <span className="text-fg-2">Despesas</span>
            <span className="tabular-nums text-fg">
              {amount(DEMO.expense, "justify-items-end")}
            </span>
          </p>
        </div>
        <motion.p
          initial={false}
          animate={{ opacity: entrance === "armed" ? 0 : 1 }}
          transition={entrance === "play" ? SWAP : { duration: 0 }}
          className="text-caption text-fg-3"
        >
          Valores ocultos
        </motion.p>
      </DemoCard>
    </div>
  );
}
