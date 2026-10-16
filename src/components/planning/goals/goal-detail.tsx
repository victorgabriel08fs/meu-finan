"use client";

import { Archive, ChevronRight, CircleCheck, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { ChartViewSwitch } from "@/components/charts/chart-view-switch";
import { DataTable } from "@/components/charts/data-table";
import { monthYearLabel } from "@/components/charts/format";
import { LegendSwatch } from "@/components/charts/legend";
import { Masked } from "@/components/charts/masked";
import { niceTicks } from "@/components/charts/scale";
import { Ring } from "@/components/finance/ring";
import { Money } from "@/components/money/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import { monthsBetween, type YearMonth } from "@/lib/finance";
import { durationLabel, shortMonthLabel } from "@/lib/format/date";
import { formatRate } from "@/lib/format/number";
import { cn } from "@/lib/utils";
import { usePrivacyStore } from "@/stores/privacy";
import { useSheetTarget } from "../form/use-sheet";
import { type MarketRatesView, marketRateLabel } from "../market";
import { ContributeSheet, type ContributionSource } from "./contribute-sheet";
import {
  type ChartPoint,
  chartSummary,
  type GoalChartModel,
  type GoalHistoryMonth,
  goalChart,
  pointDescription,
  pointTitle,
  tableRows,
  xAxisLabels,
} from "./detail-model";
import { type GoalAccount, type GoalFormGoal, GoalSheet } from "./goal-sheet";
import type { GoalCardData } from "./goals-view";
import {
  deadlineMonth,
  GOALS_HREF,
  projectionSentence,
  type Segment,
} from "./model";
import {
  dashStyle,
  GoalProjectionChart,
  PROJECTION_COLOR,
} from "./projection-chart";
import { GoalStatusPill } from "./status-pill";

export type GoalDetailData = GoalCardData & {
  /** Expected monthly rate, as the server projects the goal. */
  monthlyRate: number;
  /** Linked to an active account: "Aportar" is a transfer into it. */
  linked: boolean;
};

type GoalDetailViewProps = {
  goal: GoalDetailData;
  /** The linked account's last 12 months (empty without one). */
  history: GoalHistoryMonth[];
  /** For the goal form: regular accounts, with balances. */
  accounts: GoalAccount[];
  /** For "Aportar": regular accounts other than the goal's. */
  sources: ContributionSource[];
  market: MarketRatesView;
  today: YearMonth;
  /** `YYYY-MM-DD`. */
  todayIso: string;
};

type GoalSheetTarget = {
  mode: "edit" | "archive" | "create";
  suggestedMonthlyCents?: number | null;
};

const BACK = { href: GOALS_HREF, label: "Metas" };

/**
 * Planejar › Metas › meta (doc 02 §6.10): the 120px ring with the saved
 * amount, status and projection sentence, "Aportar", the projection chart
 * (or a calm success state once reached) and the plan. Editar and Arquivar
 * reuse the goal sheet; archiving leaves for the list.
 */
export function GoalDetailView({
  goal,
  history,
  accounts,
  sources,
  market,
  today,
  todayIso,
}: GoalDetailViewProps) {
  const router = useRouter();
  const goalSheet = useSheetTarget<GoalSheetTarget>();
  const contribute = useSheetTarget<true>();
  const deadline = deadlineMonth(goal.targetDate);
  const achieved = goal.projection.status === "achieved";
  // Built here, not in the chart card: scrubbing re-renders only the card.
  const chart = achieved
    ? null
    : goalChart({
        today,
        currentCents: goal.currentCents,
        targetCents: goal.targetCents,
        monthlyPlanCents: goal.monthlyPlanCents,
        monthlyRate: goal.monthlyRate,
        deadline,
        projection: goal.projection,
        history,
        linked: goal.linked,
      });
  const formGoal: GoalFormGoal = {
    id: goal.id,
    name: goal.name,
    icon: goal.icon,
    color: goal.color,
    targetCents: goal.targetCents,
    currentCents: goal.currentCents,
    targetDate: goal.targetDate,
    monthlyPlanCents: goal.monthlyPlanCents,
    expectedRate: goal.expectedRate,
    accountId: goal.accountId,
  };
  const index = goal.expectedRate?.index;
  const marketNote =
    index === "cdi" || index === "selic" || index === "ipca"
      ? `, com ${marketRateLabel(index, market)}`
      : "";

  return (
    <>
      <PageHeader
        title={goal.name}
        back={BACK}
        actions={
          <>
            <IconButton
              label="Editar meta"
              onClick={() => goalSheet.show({ mode: "edit" })}
            >
              <Pencil />
            </IconButton>
            <IconButton
              label="Arquivar meta"
              onClick={() => goalSheet.show({ mode: "archive" })}
            >
              <Archive />
            </IconButton>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <GoalHero
          goal={goal}
          deadline={deadline}
          onContribute={() => contribute.show(true)}
          className="lg:col-start-1"
        />
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {chart ? (
            <ProjectionCard model={chart} />
          ) : (
            <AchievedCard
              name={goal.name}
              onCreate={() => goalSheet.show({ mode: "create" })}
            />
          )}
        </div>
        <PlanCard
          goal={goal}
          deadline={deadline}
          today={today}
          onAdjust={(suggestedMonthlyCents) =>
            goalSheet.show({ mode: "edit", suggestedMonthlyCents })
          }
          className="lg:col-start-1"
        />
      </div>
      {chart ? (
        <p className="px-1 text-caption text-fg-3">
          Projeções em valores brutos, antes do IR{marketNote}.
        </p>
      ) : null}

      <Sheet open={goalSheet.isOpen} onOpenChange={goalSheet.onOpenChange}>
        {goalSheet.target ? (
          <GoalSheet
            key={goalSheet.key}
            goal={goalSheet.target.mode === "create" ? null : formGoal}
            initialStep={
              goalSheet.target.mode === "archive" ? "archive" : "form"
            }
            suggestedMonthlyCents={goalSheet.target.suggestedMonthlyCents}
            accounts={accounts}
            market={market}
            today={today}
            onDone={goalSheet.close}
            onArchived={() => router.push(GOALS_HREF)}
          />
        ) : null}
      </Sheet>
      <Sheet open={contribute.isOpen} onOpenChange={contribute.onOpenChange}>
        {contribute.target ? (
          <ContributeSheet
            key={contribute.key}
            goal={{
              id: goal.id,
              name: goal.name,
              linked: goal.linked,
              accountName: goal.accountName,
              targetCents: goal.targetCents,
              currentCents: goal.currentCents,
              monthlyPlanCents: goal.monthlyPlanCents,
            }}
            sources={sources}
            today={todayIso}
            onDone={contribute.close}
          />
        ) : null}
      </Sheet>
    </>
  );
}

/** Sentence segments, with the amounts hidden in privacy mode. */
function Sentence({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) => {
        const Tag = segment.strong ? "strong" : "span";
        return (
          <Tag
            // biome-ignore lint/suspicious/noArrayIndexKey: static sentence parts
            key={index}
            className={segment.strong ? "font-bold text-fg" : undefined}
          >
            {segment.money ? (
              <Masked mask="R$ ••••">{segment.text}</Masked>
            ) : (
              segment.text
            )}
          </Tag>
        );
      })}
    </>
  );
}

function GoalHero({
  goal,
  deadline,
  onContribute,
  className,
}: {
  goal: GoalDetailData;
  deadline: YearMonth | null;
  onContribute: () => void;
  className?: string;
}) {
  const achieved = goal.projection.status === "achieved";
  return (
    <Card asChild className={cn("flex flex-col gap-4 p-5", className)}>
      <section aria-label="Progresso da meta">
        <div className="flex items-center gap-4">
          <Ring value={goal.progress} size={120} label={goal.name} />
          <div className="flex min-w-0 flex-1 flex-col items-start">
            <span className="text-caption font-semibold text-fg-3">
              Guardado
            </span>
            <Money
              cents={goal.currentCents}
              variant="title"
              tone="neutral"
              className="mt-0.5"
            />
            <span className="text-callout text-fg-2">
              de{" "}
              <Money
                cents={goal.targetCents}
                variant="callout"
                tone="neutral"
                className="text-fg-2"
              />
            </span>
            <GoalStatusPill
              status={goal.projection.status}
              className="mt-2.5"
            />
          </div>
        </div>
        {achieved ? null : (
          <p className="border-t border-border pt-3 text-callout text-fg-2">
            <Sentence
              segments={projectionSentence({
                projection: goal.projection,
                monthlyPlanCents: goal.monthlyPlanCents,
                deadline,
              })}
            />
          </p>
        )}
        <Button size="lg" className="w-full" onClick={onContribute}>
          <Plus aria-hidden="true" />
          Aportar
        </Button>
      </section>
    </Card>
  );
}

function ProjectionCard({ model }: { model: GoalChartModel }) {
  const hidden = usePrivacyStore((state) => state.hidden);
  const [chosen, setChosen] = useState<number | null>(null);
  const last = model.points.length - 1;
  // Starts on the last month (where the goal is reached); a stale choice
  // after the data changed falls back to it too.
  const selected = chosen !== null && chosen <= last ? chosen : last;
  const point = model.points[selected];
  const hasHistory = model.todayIndex > 0;

  return (
    <Card asChild className="flex flex-col gap-3">
      <section aria-labelledby="meta-projecao">
        <h2 id="meta-projecao" className="text-headline text-fg">
          Projeção
        </h2>
        <ChartViewSwitch
          chart={
            <div className="flex flex-col gap-3">
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption font-semibold text-fg-2">
                <li className="flex items-center gap-1.5">
                  <LegendSwatch color={PROJECTION_COLOR} shape="line" />
                  Projeção
                </li>
                <li className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-0.75 w-3.5 shrink-0"
                    style={dashStyle(4, 2)}
                  />
                  Meta
                </li>
                {hasHistory ? (
                  <li className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full bg-primary"
                    />
                    Aportes
                  </li>
                ) : null}
              </ul>
              {point ? <Readout point={point} /> : null}
              <p className="sr-only">{chartSummary(model, hidden)}</p>
              <GoalProjectionChart
                model={model}
                ticks={niceTicks(0, model.maxCents, 3)}
                selected={selected}
                onSelectedChange={setChosen}
                scrubLabel="Percorrer a projeção mês a mês"
                valueText={(index) => {
                  const at = model.points[index];
                  return at ? pointDescription(at, hidden) : "";
                }}
                xLabels={xAxisLabels(model)}
                plotClassName="h-44 lg:h-56"
              />
              <p className="text-caption text-fg-3">
                Arraste sobre o gráfico, ou use as setas, para ver cada mês.
              </p>
            </div>
          }
          table={
            <DataTable
              caption="Saldo da meta mês a mês: aportes realizados e projeção"
              maxHeightClassName="max-h-96"
              columns={[
                { key: "month", header: "Mês", align: "start" },
                { key: "contribution", header: "Aporte", align: "end" },
                { key: "balance", header: "Saldo", align: "end" },
              ]}
              rows={tableRows(model).map((row) => ({
                key: row.month,
                header:
                  row.kind === "today"
                    ? `${shortMonthLabel(row.month)} · hoje`
                    : shortMonthLabel(row.month),
                cells: [
                  row.contributionCents === null ? (
                    "—"
                  ) : (
                    <Money
                      key="contribution"
                      cents={row.contributionCents}
                      variant="caption"
                      tone="neutral"
                    />
                  ),
                  <Money
                    key="balance"
                    cents={row.balanceCents}
                    variant="caption"
                    tone="neutral"
                  />,
                ],
                strongLast: row.kind === "today",
              }))}
            />
          }
        />
      </section>
    </Card>
  );
}

/**
 * Values of the point under the scrub, above the chart (doc 02 §9.4): the
 * month, then its values, always on two lines so the chart never jumps.
 */
function Readout({ point }: { point: ChartPoint }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-chip bg-surface-2/70 px-3 py-2.5">
      <span className="text-callout font-bold text-fg">
        {pointTitle(point)}
        {point.kind === "projection" ? (
          <span className="font-semibold text-fg-3"> · previsto</span>
        ) : null}
      </span>
      <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-caption font-semibold text-fg-2">
        <span>
          Saldo{" "}
          <Money
            cents={point.balanceCents}
            variant="caption"
            tone="neutral"
            className="font-bold"
          />
        </span>
        {point.contributionCents === null ? null : (
          <span>
            {point.kind === "projection" ? "Aporte" : "Aportes"}{" "}
            <Money
              cents={point.contributionCents}
              variant="caption"
              tone="neutral"
              className="font-bold"
            />
          </span>
        )}
      </span>
    </div>
  );
}

/** Reached (doc 02 §10.3): a calm card instead of the projection. */
function AchievedCard({
  name,
  onCreate,
}: {
  name: string;
  onCreate: () => void;
}) {
  return (
    <Card asChild className="flex flex-col items-center px-6 py-8 text-center">
      <section aria-labelledby="meta-atingida">
        <span
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft"
        >
          <CircleCheck className="size-7" />
        </span>
        <h2 id="meta-atingida" className="mt-4 text-title-3 text-fg">
          Meta atingida
        </h2>
        <p className="mt-2 max-w-sm text-body text-pretty text-fg-2">
          Você atingiu a meta {name}. Que tal a próxima?
        </p>
        <Button variant="tonal" className="mt-5" onClick={onCreate}>
          <Plus aria-hidden="true" />
          Criar meta
        </Button>
      </section>
    </Card>
  );
}

const capitalize = (text: string) =>
  text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);

function PlanCard({
  goal,
  deadline,
  today,
  onAdjust,
  className,
}: {
  goal: GoalDetailData;
  deadline: YearMonth | null;
  today: YearMonth;
  onAdjust: (suggestedMonthlyCents: number | null) => void;
  className?: string;
}) {
  const { projection } = goal;
  const achieved = projection.status === "achieved";
  const behind =
    projection.status === "behind" && projection.requiredMonthlyCents !== null;
  const required =
    !achieved && deadline && projection.requiredMonthlyCents
      ? projection.requiredMonthlyCents
      : null;
  const monthsLeft = deadline ? monthsBetween(today, deadline) : null;

  return (
    <Card asChild className={cn("flex flex-col gap-1", className)}>
      <section aria-labelledby="meta-plano">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <h2 id="meta-plano" className="text-headline text-fg">
            Plano
          </h2>
          {behind ? (
            <Button
              variant="tonal"
              size="sm"
              onClick={() => onAdjust(projection.requiredMonthlyCents)}
            >
              Ajustar plano
            </Button>
          ) : null}
        </div>
        <dl className="flex flex-col [&>div+div]:border-t [&>div+div]:border-border">
          {achieved ? null : (
            <PlanRow label="Falta juntar">
              <Money
                cents={Math.max(0, goal.targetCents - goal.currentCents)}
                variant="callout"
                tone="neutral"
                className="font-semibold"
              />
            </PlanRow>
          )}
          <PlanRow label="Aporte mensal">
            {goal.monthlyPlanCents > 0 ? (
              <PerMonth cents={goal.monthlyPlanCents} />
            ) : (
              "Nenhum"
            )}
          </PlanRow>
          {required ? (
            <PlanRow label="Para cumprir o prazo">
              <PerMonth cents={required} />
            </PlanRow>
          ) : null}
          <PlanRow
            label="Prazo"
            support={
              monthsLeft === null
                ? undefined
                : monthsLeft > 0
                  ? `em ${durationLabel(monthsLeft)}`
                  : monthsLeft === 0
                    ? "este mês"
                    : "já passou"
            }
          >
            {deadline ? monthYearLabel(deadline) : "Sem prazo"}
          </PlanRow>
          <PlanRow
            label="Rentabilidade"
            support={
              goal.expectedRate
                ? `≈ ${formatRate({ kind: "monthly", value: goal.monthlyRate })}`
                : undefined
            }
          >
            {capitalize(goal.rateLabel)}
          </PlanRow>
          <PlanRow
            label="Onde está guardado"
            support={
              goal.linked
                ? "O progresso acompanha o saldo."
                : "Valor informado por você."
            }
          >
            {goal.linked && goal.accountId ? (
              <Link
                href={`/contas/${goal.accountId}`}
                className="-my-2 -mr-1 inline-flex min-h-11 items-center gap-0.5 rounded-control pl-1 text-primary underline-offset-2 hover:underline"
              >
                {goal.accountName}
                <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
              </Link>
            ) : (
              "Sem conta vinculada"
            )}
          </PlanRow>
        </dl>
      </section>
    </Card>
  );
}

function PerMonth({ cents }: { cents: number }) {
  return (
    <>
      <Money
        cents={cents}
        variant="callout"
        tone="neutral"
        className="font-semibold"
      />
      /mês
    </>
  );
}

function PlanRow({
  label,
  support,
  children,
}: {
  label: string;
  support?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 py-2.5">
      <dt className="text-callout text-fg-2">{label}</dt>
      <dd className="flex min-w-0 flex-col items-end text-right">
        <span className="text-callout font-semibold text-fg">{children}</span>
        {support ? (
          <span className="text-caption text-fg-3">{support}</span>
        ) : null}
      </dd>
    </div>
  );
}
