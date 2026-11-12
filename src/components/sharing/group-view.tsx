"use client";

import { Plus, Receipt, Users } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SplitBar } from "@/components/charts/split-bar";
import { CategoryIcon } from "@/components/finance/category-icon";
import { DayHeader } from "@/components/finance/day-header";
import { Money } from "@/components/money/money";
import { useSheetTarget } from "@/components/planning/form/use-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import { dayHeaderLabel } from "@/lib/format/date";
import { formatBRL } from "@/lib/format/money";
import { settlementLine } from "@/lib/sharing/labels";
import type {
  GroupActivity,
  MonthSummary,
  SettlementView,
  SharedExpenseView,
} from "@/server/domain/sharing/expenses";
import type { GroupDetail } from "@/server/domain/sharing/groups";
import { AddExpensesSheet, type CategoryOption } from "./add-expenses-sheet";
import { BalanceText } from "./balance-text";
import { ExpenseDetailSheet } from "./expense-detail-sheet";
import { MembersSheet } from "./members-sheet";
import type { SplitMember } from "./model";
import { PlanSheet, SettleSheet, type SettleTarget } from "./settle-sheet";

export type GroupViewProps = {
  group: GroupDetail;
  activity: GroupActivity;
  summary: MonthSummary;
  /** "novembro". */
  monthName: string;
  todayIso: string;
  /** The financial months of "Este mês" and "Mês passado". */
  periods: Record<"current" | "previous", { start: string; end: string }>;
  categories: CategoryOption[];
  monthSwitcher: ReactNode;
};

const SEGMENT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

type Row =
  | { kind: "expense"; date: string; item: SharedExpenseView }
  | { kind: "settlement"; date: string; item: SettlementView };

/** The group's screen (doc 02 §6.18); the server already checked membership. */
export function GroupView({
  group,
  activity,
  summary,
  monthName,
  todayIso,
  periods,
  categories,
  monthSwitcher,
}: GroupViewProps) {
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [adding, setAdding] = useState({ open: false, key: 0 });
  const [planOpen, setPlanOpen] = useState(false);
  const settle = useSheetTarget<SettleTarget>();
  const detail = useSheetTarget<SharedExpenseView>();

  const meId = group.me.id;
  const name = (memberId: string) =>
    memberId === meId ? "Você" : (group.names[memberId] ?? "Alguém");
  const active: SplitMember[] = group.members
    .filter((member) => member.status === "active")
    .map((member) => ({ id: member.id, name: member.name, isMe: member.isMe }));
  const activeCount = active.length;

  const rows = useMemo(() => {
    const all: Row[] = [
      ...activity.expenses.map(
        (item): Row => ({ kind: "expense", date: item.occurredOn, item }),
      ),
      ...activity.settlements.map(
        (item): Row => ({ kind: "settlement", date: item.occurredOn, item }),
      ),
    ];
    all.sort((a, b) => b.date.localeCompare(a.date));
    const days = new Map<string, Row[]>();
    for (const row of all)
      days.set(row.date, [...(days.get(row.date) ?? []), row]);
    return [...days];
  }, [activity]);

  const openAdd = () =>
    setAdding((state) => ({ open: true, key: state.key + 1 }));
  const mine = group.transfers;
  const onlyOne = mine.length === 1 ? mine[0] : undefined;

  return (
    <>
      <PageHeader
        title={group.name}
        back={{ href: "/compartilhado", label: "Compartilhado" }}
        actions={
          <>
            <IconButton
              label="Pessoas"
              aria-haspopup="dialog"
              onClick={() => setPeopleOpen(true)}
            >
              <Users />
            </IconButton>
            <IconButton
              label="Adicionar despesas"
              className="text-primary sm:hidden"
              onClick={openAdd}
              disabled={activeCount < 1}
            >
              <Plus />
            </IconButton>
            <Button
              size="sm"
              variant="tonal"
              className="max-sm:hidden"
              onClick={openAdd}
              disabled={activeCount < 1}
            >
              <Plus aria-hidden="true" />
              Adicionar despesas
            </Button>
          </>
        }
      />

      <Card className="flex flex-col gap-4">
        <h2 className="sr-only">Saldo</h2>
        <BalanceText transfers={mine} size="title" />
        {activeCount < 2 && mine.length === 0 ? (
          <p className="text-callout text-fg-3">
            Convide alguém em Pessoas para começar a dividir.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {onlyOne ? (
            <Button
              variant="tonal"
              onClick={() =>
                settle.show({
                  memberId: onlyOne.memberId,
                  name: onlyOne.name,
                  expectedCents: onlyOne.amountCents,
                })
              }
            >
              Marcar como acertado
            </Button>
          ) : null}
          {group.plan.length > 0 && (activeCount >= 3 || mine.length > 1) ? (
            <Button variant="secondary" onClick={() => setPlanOpen(true)}>
              Acertar contas
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="flex flex-col items-center">{monthSwitcher}</div>

      {activity.expenses.length === 0 && activity.settlements.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title={`Nenhuma despesa dividida em ${monthName}`}
          description="Adicione despesas do seu extrato ou registre uma nova."
          action={
            activeCount >= 1 ? (
              <Button variant="tonal" onClick={openAdd}>
                Adicionar despesas
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {summary.totalCents > 0 ? (
            <MonthCard
              summary={summary}
              monthName={monthName}
              name={name}
              meId={meId}
            />
          ) : null}
          <div className="flex flex-col">
            {rows.map(([date, dayRows]) => (
              <section key={date} aria-label={dayHeaderLabel(date, todayIso)}>
                <DayHeader label={dayHeaderLabel(date, todayIso)} />
                <ul className="overflow-hidden rounded-card bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border">
                  {dayRows.map((row) =>
                    row.kind === "expense" ? (
                      <li key={row.item.id}>
                        <ExpenseRow
                          item={row.item}
                          meId={meId}
                          name={name}
                          onOpen={() => detail.show(row.item)}
                        />
                      </li>
                    ) : (
                      <li key={row.item.id}>
                        <SettlementRow
                          item={row.item}
                          meId={meId}
                          name={name}
                        />
                      </li>
                    ),
                  )}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      <Sheet open={peopleOpen} onOpenChange={setPeopleOpen}>
        <MembersSheet
          group={group}
          todayIso={todayIso}
          onClose={() => setPeopleOpen(false)}
        />
      </Sheet>
      <Sheet
        open={adding.open}
        onOpenChange={(open) => setAdding((state) => ({ ...state, open }))}
      >
        <AddExpensesSheet
          key={adding.key}
          groupId={group.id}
          groupName={group.name}
          members={active}
          meId={meId}
          defaultSplit={group.defaultSplit}
          periods={periods}
          categories={categories}
          todayIso={todayIso}
          onDone={() => setAdding((state) => ({ ...state, open: false }))}
        />
      </Sheet>
      <Sheet open={planOpen} onOpenChange={setPlanOpen}>
        <PlanSheet
          plan={group.plan}
          meId={meId}
          name={name}
          onSettle={(target) => {
            setPlanOpen(false);
            settle.show(target);
          }}
        />
      </Sheet>
      <Sheet open={settle.isOpen} onOpenChange={settle.onOpenChange}>
        {settle.target ? (
          <SettleSheet
            key={settle.key}
            groupId={group.id}
            groupName={group.name}
            target={settle.target}
            todayIso={todayIso}
            onDone={settle.close}
          />
        ) : null}
      </Sheet>
      <Sheet open={detail.isOpen} onOpenChange={detail.onOpenChange}>
        {detail.target ? (
          <ExpenseDetailSheet
            key={detail.key}
            expense={detail.target}
            members={active}
            meId={meId}
            name={name}
            onDone={detail.close}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function MonthCard({
  summary,
  monthName,
  name,
  meId,
}: {
  summary: MonthSummary;
  monthName: string;
  name: (memberId: string) => string;
  meId: string;
}) {
  const segments = summary.members.map((row, index) => ({
    key: row.memberId,
    value: row.owedCents,
    color: SEGMENT_COLORS[index % SEGMENT_COLORS.length] ?? "var(--chart-1)",
  }));
  const spoken = summary.members
    .map((row) => `${name(row.memberId)}: parte ${formatBRL(row.owedCents)}`)
    .join("; ");
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-headline text-fg">
        Total de {monthName}:{" "}
        <Money
          cents={summary.totalCents}
          variant="headline"
          tone="neutral"
          sign="never"
        />
      </h2>
      <SplitBar
        segments={segments}
        summary={`Partes de ${monthName}. ${spoken}`}
      />
      <ul className="flex flex-col gap-2">
        {summary.members.map((row, index) => (
          <li
            key={row.memberId}
            className="flex items-start gap-2 text-callout text-fg-2"
          >
            <span
              aria-hidden="true"
              className="mt-1.5 size-2.5 shrink-0 rounded-full"
              style={{
                background: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
              }}
            />
            <span className="min-w-0">
              <strong className="font-semibold text-fg">
                {name(row.memberId)}
              </strong>{" "}
              · pagou{" "}
              <Money
                cents={row.paidCents}
                variant="callout"
                tone="neutral"
                sign="never"
              />{" "}
              · {row.memberId === meId ? "sua parte" : "parte"}{" "}
              <Money
                cents={row.owedCents}
                variant="callout"
                tone="neutral"
                sign="never"
              />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ExpenseRow({
  item,
  meId,
  name,
  onOpen,
}: {
  item: SharedExpenseView;
  meId: string;
  name: (memberId: string) => string;
  onOpen: () => void;
}) {
  const myPart =
    item.shares.find((share) => share.memberId === meId)?.shareCents ?? 0;
  const payer =
    item.paidByMemberId === meId ? "você" : name(item.paidByMemberId);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-16 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2"
    >
      <CategoryIcon icon="receipt" color="neutral" size="sm" />
      <span className="flex min-w-0 flex-[1_1_9rem] flex-col">
        <span className="truncate text-headline text-fg">
          {item.description}
        </span>
        <span className="text-caption text-fg-3">
          Pago por {payer} ·{" "}
          {myPart > 0 ? (
            <>
              sua parte{" "}
              <Money
                cents={myPart}
                variant="caption"
                tone="neutral"
                sign="never"
                className="text-fg-3"
              />
            </>
          ) : (
            "fora da sua parte"
          )}
        </span>
      </span>
      <Money
        cents={item.amountCents}
        variant="headline"
        tone="neutral"
        sign="never"
        className="ml-auto"
      />
    </button>
  );
}

function SettlementRow({
  item,
  meId,
  name,
}: {
  item: SettlementView;
  meId: string;
  name: (memberId: string) => string;
}) {
  const text = settlementLine({
    fromName: name(item.fromMemberId),
    toName: name(item.toMemberId),
    fromIsMe: item.fromMemberId === meId,
    toIsMe: item.toMemberId === meId,
    amountCents: item.amountCents,
  });
  // The amount through Money, so the privacy mode hides it.
  const [before, after] = text.split(formatBRL(item.amountCents));
  return (
    <div className="flex min-h-16 items-center gap-3 px-4 py-3">
      <CategoryIcon icon="arrow-left-right" color="transfer" size="sm" />
      <span className="min-w-0 flex-1 text-callout text-fg-2">
        <span className="sr-only">Acerto: </span>
        {before}
        <Money
          cents={item.amountCents}
          variant="callout"
          tone="transfer"
          sign="never"
        />
        {after}
      </span>
    </div>
  );
}
