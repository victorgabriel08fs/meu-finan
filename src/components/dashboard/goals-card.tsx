import { Flag } from "lucide-react";
import Link from "next/link";
import { Ring } from "@/components/finance/ring";
import { Money } from "@/components/money/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GoalItem } from "@/server/domain/goals";

type GoalStatus = GoalItem["projection"]["status"];

const STATUS: Record<GoalStatus, { label: string; className: string }> = {
  achieved: {
    label: "Concluída",
    className: "bg-primary-soft text-on-primary-soft",
  },
  ahead: {
    label: "Adiantada",
    className: "bg-primary-soft text-on-primary-soft",
  },
  on_track: {
    label: "No ritmo",
    className: "bg-primary-soft text-on-primary-soft",
  },
  behind: { label: "Atrasada", className: "bg-warning-soft text-warning" },
  no_plan: { label: "Sem aporte", className: "bg-surface-2 text-fg-2" },
};

/**
 * Metas of the Início (doc 02 §6.3, §5.10): up to two goals with a 44px ring,
 * saved of target and a status pill; the card opens Planejar › Metas.
 */
export function GoalsCard({
  goals,
  href,
}: {
  goals: GoalItem[];
  href: string;
}) {
  return (
    <Card className="px-4 py-1">
      <ul className="[&>li+li]:border-t [&>li+li]:border-border">
        {goals.slice(0, 2).map((goal) => {
          const status = STATUS[goal.projection.status];
          return (
            <li
              key={goal.id}
              className="relative -mx-4 flex min-h-18 items-center gap-3 px-4 py-2 transition-colors duration-100 has-[a:active]:bg-surface-2"
            >
              <Ring value={goal.progress} size={44} label={goal.name} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-semibold text-fg">
                  <Link
                    href={href}
                    className="outline-0 after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus focus-visible:after:outline-solid"
                  >
                    {goal.name}
                  </Link>
                </span>
                <span className="truncate text-caption text-fg-3">
                  <Money
                    cents={goal.currentCents}
                    variant="caption"
                    tone="neutral"
                    className="text-inherit"
                  />{" "}
                  de{" "}
                  <Money
                    cents={goal.targetCents}
                    variant="caption"
                    tone="neutral"
                    className="text-inherit"
                  />
                </span>
              </div>
              <span
                className={cn(
                  "inline-flex h-6.5 shrink-0 items-center rounded-full px-2.5 text-caption font-bold",
                  status.className,
                )}
              >
                {status.label}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** No goal yet: a compact invitation (doc 02 §8, "Qual é o próximo sonho?"). */
export function GoalsInvite({ href }: { href: string }) {
  return (
    <Card className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft"
      >
        <Flag className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-headline text-fg">Qual é o próximo sonho?</h3>
        <p className="text-caption text-fg-3">
          Uma reserva, uma viagem… a gente calcula o caminho.
        </p>
      </div>
      <Button asChild variant="tonal" size="sm">
        <Link href={href}>Criar meta</Link>
      </Button>
    </Card>
  );
}
