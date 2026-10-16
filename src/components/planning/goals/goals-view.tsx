"use client";

import {
  ArrowUpRight,
  CircleCheck,
  CircleDashed,
  Goal,
  Pencil,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { formatMoneyShort } from "@/components/charts/format";
import { Ring } from "@/components/finance/ring";
import { Money } from "@/components/money/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import type { GoalProjection, YearMonth } from "@/lib/finance";
import { formatPercent } from "@/lib/format/number";
import { useSheetTarget } from "../form/use-sheet";
import { type MarketRatesView, marketRateLabel } from "../market";
import { type GoalAccount, type GoalFormGoal, GoalSheet } from "./goal-sheet";
import {
  deadlineMonth,
  GOAL_STATUS,
  type GoalRate,
  planLine,
  projectionSentence,
  type StatusPill,
} from "./model";

export type GoalCardData = GoalFormGoal & {
  progress: number;
  rateLabel: string;
  accountName: string | null;
  projection: GoalProjection;
  expectedRate: GoalRate | null;
};

type GoalsViewProps = {
  goals: GoalCardData[];
  accounts: GoalAccount[];
  market: MarketRatesView;
  today: YearMonth;
};

type SheetTarget = {
  goal: GoalFormGoal | null;
  suggestedMonthlyCents?: number | null;
};

/** Planejar › Metas (doc 02 §6.10). */
export function GoalsView({ goals, accounts, market, today }: GoalsViewProps) {
  const sheet = useSheetTarget<SheetTarget>();
  const saved = goals.reduce((sum, goal) => sum + goal.currentCents, 0);
  const target = goals.reduce((sum, goal) => sum + goal.targetCents, 0);
  const ratio = target > 0 ? Math.min(1, saved / target) : 0;
  const usesCdi = goals.some((goal) => goal.expectedRate?.index === "cdi");
  const usesIpca = goals.some((goal) => goal.expectedRate?.index === "ipca");

  return (
    <>
      {goals.length === 0 ? (
        <EmptyState
          icon={<Goal />}
          title="Qual é o próximo sonho?"
          description="Uma reserva, uma viagem, um carro… a gente calcula o caminho."
          action={
            <Button onClick={() => sheet.show({ goal: null })}>
              <Plus aria-hidden="true" />
              Criar meta
            </Button>
          }
        />
      ) : (
        <>
          <Card asChild className="flex flex-col gap-2 px-5 py-4.5">
            <section aria-labelledby="metas-resumo">
              <h2
                id="metas-resumo"
                className="text-overline uppercase text-fg-3"
              >
                Guardado em metas
              </h2>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <Money
                  cents={saved}
                  variant="title"
                  tone="neutral"
                  className="text-[2rem] leading-[2.375rem]"
                />
                <span className="text-callout text-fg-3">
                  de {formatMoneyShort(target)} · {formatPercent(ratio)}
                </span>
              </p>
              {/* biome-ignore lint/a11y/useSemanticElements: <meter> cannot be styled consistently across browsers */}
              <div
                role="meter"
                aria-label="Progresso das metas"
                aria-valuemin={0}
                aria-valuemax={target}
                aria-valuenow={Math.min(saved, target)}
                aria-valuetext={`${formatMoneyShort(saved)} de ${formatMoneyShort(target)}, ${formatPercent(ratio)}`}
                className="h-1.5 overflow-hidden rounded-full bg-surface-2"
              >
                <div
                  className="meter-grow h-full rounded-full bg-primary"
                  style={{ width: `${ratio * 100}%` }}
                />
              </div>
            </section>
          </Card>

          <section
            aria-labelledby="metas-lista"
            className="flex flex-col gap-3"
          >
            <SectionHeader
              id="metas-lista"
              title="Suas metas"
              className="mt-2 mb-0"
              action={
                <Button
                  variant="tonal"
                  size="sm"
                  onClick={() => sheet.show({ goal: null })}
                >
                  <Plus aria-hidden="true" />
                  Nova meta
                </Button>
              }
            />
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onEdit={(suggestedMonthlyCents) =>
                  sheet.show({ goal, suggestedMonthlyCents })
                }
              />
            ))}
            <p className="px-1 text-caption text-fg-3">
              Projeções em valores brutos, antes do IR
              {usesCdi ? `, com ${marketRateLabel("cdi", market)}` : ""}
              {usesIpca
                ? `${usesCdi ? " e" : ", com"} ${marketRateLabel("ipca", market)}`
                : ""}
              .
            </p>
          </section>
        </>
      )}

      <Sheet open={sheet.isOpen} onOpenChange={sheet.onOpenChange}>
        {sheet.target ? (
          <GoalSheet
            key={sheet.key}
            goal={sheet.target.goal}
            suggestedMonthlyCents={sheet.target.suggestedMonthlyCents}
            accounts={accounts}
            market={market}
            today={today}
            onDone={sheet.close}
          />
        ) : null}
      </Sheet>
    </>
  );
}

const PILL_ICON: Record<StatusPill["icon"], typeof CircleCheck> = {
  check: CircleCheck,
  ahead: ArrowUpRight,
  behind: TriangleAlert,
  none: CircleDashed,
};

function GoalCard({
  goal,
  onEdit,
}: {
  goal: GoalCardData;
  onEdit: (suggestedMonthlyCents?: number | null) => void;
}) {
  const pill = GOAL_STATUS[goal.projection.status];
  const Icon = PILL_ICON[pill.icon];
  const deadline = deadlineMonth(goal.targetDate);
  const sentence = projectionSentence({
    projection: goal.projection,
    monthlyPlanCents: goal.monthlyPlanCents,
    deadline,
  });
  const titleId = `meta-${goal.id}`;
  const behind =
    goal.projection.status === "behind" &&
    goal.projection.requiredMonthlyCents !== null;

  return (
    <Card asChild className="flex flex-col gap-3">
      <article aria-labelledby={titleId}>
        <div className="flex items-center gap-3.5">
          <Ring value={goal.progress} size={56} label={goal.name} />
          <div className="flex min-w-0 flex-1 flex-col">
            <h3 id={titleId} className="truncate text-headline text-fg">
              {goal.name}
            </h3>
            <p className="text-caption text-fg-3 tabular-nums">
              {formatMoneyShort(goal.currentCents)} de{" "}
              {formatMoneyShort(goal.targetCents)}
            </p>
          </div>
          <Badge tone={pill.tone} className="h-6.5 rounded-full px-2.5">
            <Icon aria-hidden="true" />
            {pill.label}
          </Badge>
        </div>
        <p className="border-t border-border pt-3 text-callout text-fg-2">
          {sentence.map((segment, index) =>
            segment.strong ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: static sentence parts
              <strong key={index} className="font-bold text-fg">
                {segment.text}
              </strong>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: static sentence parts
              <span key={index}>{segment.text}</span>
            ),
          )}
        </p>
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-caption font-semibold text-fg-3">
            {planLine({
              monthlyPlanCents: goal.monthlyPlanCents,
              rateLabel: goal.rateLabel,
              accountName: goal.accountName,
              deadline,
            })}
          </p>
          {behind ? (
            <Button
              variant="tonal"
              size="sm"
              onClick={() => onEdit(goal.projection.requiredMonthlyCents)}
              aria-label={`Ajustar plano de ${goal.name}`}
            >
              Ajustar plano
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="-mr-2"
              onClick={() => onEdit()}
              aria-label={`Editar ${goal.name}`}
            >
              <Pencil aria-hidden="true" />
              Editar
            </Button>
          )}
        </div>
      </article>
    </Card>
  );
}
