"use client";

import { Archive, Pencil, PiggyBank } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/admin/user-avatar";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeader } from "@/components/app/section-header";
import { formatMoneyShort, monthYearLabel } from "@/components/charts/format";
import { Masked } from "@/components/charts/masked";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Ring } from "@/components/finance/ring";
import { Money } from "@/components/money/money";
import { useSheetTarget } from "@/components/planning/form/use-sheet";
import { deadlineMonth } from "@/components/planning/goals/model";
import { actionErrorMessage } from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import type { YearMonth } from "@/lib/finance";
import { monthLabel, shortDateLabel } from "@/lib/format/date";
import { archiveBoxAction } from "@/server/actions/sharing";
import type { BoxDetail } from "@/server/domain/sharing/boxes";
import { Sentence } from "./box-card";
import { BoxEntrySheet, type OwnAccount } from "./box-entry-sheet";
import {
  boxesHref,
  boxProjectionSentence,
  entriesByMonth,
  entryLine,
  heroSaved,
  memberFacts,
  percentText,
} from "./box-model";
import { BoxPartsSheet, BoxPlanSheet } from "./box-plan-sheets";
import { BoxSheet } from "./box-sheet";
import { BoxUndoSheet } from "./box-undo-sheet";

/**
 * A shared box (doc 02 §6.18): the ring with what everyone saved and the
 * projection, each active member's part and plan, "Guardar", "Resgatar" and
 * "Mudar meu plano", and the history by month. Only what was put in the box
 * shows; nobody's accounts (ADR-13).
 */
export function BoxDetailView({
  box,
  accounts,
  todayIso,
  today,
}: {
  box: BoxDetail;
  /** The viewer's own accounts (not cards), for "Lançar no meu extrato". */
  accounts: OwnAccount[];
  todayIso: string;
  today: YearMonth;
}) {
  const entry = useSheetTarget<"save" | "withdraw">();
  const plan = useSheetTarget<true>();
  const parts = useSheetTarget<true>();
  const undo = useSheetTarget<{ id: string; text: string }>();
  const [editing, setEditing] = useState({ open: false, key: 0 });
  const restore = useAction(archiveBoxAction);
  const me = box.members.find((member) => member.isMe);
  const deadline = deadlineMonth(box.targetDate);
  const months = entriesByMonth(box.entries);

  async function unarchive() {
    const result = await restore
      .executeAsync({ boxId: box.id, archived: false })
      .catch(() => undefined);
    const message = result
      ? actionErrorMessage(result)
      : "Não deu para desarquivar. Verifique a conexão.";
    if (message) toast.error(message);
    else toast(`Caixinha ${box.name} de volta.`);
  }

  return (
    <>
      <PageHeader
        title={box.name}
        back={{ href: boxesHref(box.groupId), label: "Caixinhas" }}
        actions={
          box.archived ? undefined : (
            <IconButton
              label="Editar caixinha"
              aria-haspopup="dialog"
              onClick={() =>
                setEditing((state) => ({ open: true, key: state.key + 1 }))
              }
            >
              <Pencil />
            </IconButton>
          )
        }
      />

      {box.archived ? (
        <Card className="flex flex-wrap items-center gap-3">
          <Archive aria-hidden="true" className="size-5 shrink-0 text-fg-3" />
          <p className="min-w-0 flex-[1_1_12rem] text-callout text-fg-2">
            Esta caixinha está arquivada. O histórico continua aqui.
          </p>
          <Button
            variant="tonal"
            size="sm"
            className="max-w-full shrink"
            loading={restore.isPending}
            onClick={() => void unarchive()}
          >
            Desarquivar
          </Button>
        </Card>
      ) : null}

      <Card className="flex flex-col items-center gap-4 text-center">
        {box.progress === null ? (
          <CategoryIcon icon={box.icon} color={box.color} size="lg" />
        ) : (
          <Ring value={box.progress} size={120} label={box.name} />
        )}
        <h2 className="text-title-3 text-fg">
          <Sentence segments={heroSaved(box.savedCents, box.targetCents)} />
        </h2>
        <p className="text-callout text-fg-2">
          <Sentence
            segments={boxProjectionSentence({
              projection: box.projection,
              monthlyCents: box.monthlyCents,
              savedCents: box.savedCents,
              targetDate: box.targetDate,
            })}
          />
        </p>
        <p className="text-caption font-semibold text-fg-3">
          {box.monthlyCents > 0
            ? `Juntos: ${formatMoneyShort(box.monthlyCents)}/mês`
            : "Ninguém definiu quanto guarda por mês"}
          {deadline ? ` · prazo ${monthYearLabel(deadline)}` : ""}
        </p>
        {box.archived ? null : (
          <div className="flex w-full flex-wrap justify-center gap-2">
            <Button
              className="max-w-full shrink"
              onClick={() => entry.show("save")}
            >
              Guardar
            </Button>
            <Button
              variant="secondary"
              className="max-w-full shrink"
              disabled={box.mySavedCents <= 0}
              onClick={() => entry.show("withdraw")}
            >
              Resgatar
            </Button>
            <Button
              variant="tonal"
              className="max-w-full shrink"
              onClick={() => plan.show(true)}
            >
              Mudar meu plano
            </Button>
          </div>
        )}
      </Card>

      <section aria-labelledby="caixinha-pessoas" className="flex flex-col">
        <SectionHeader
          id="caixinha-pessoas"
          title="Quem guarda"
          action={
            box.isOwner && box.targetCents !== null && !box.archived ? (
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 max-w-full shrink"
                onClick={() => parts.show(true)}
              >
                Mudar partes
              </Button>
            ) : undefined
          }
        />
        <ul className="overflow-hidden rounded-card bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border">
          {box.members.map((member) => {
            const { facts, eta } = memberFacts(member);
            return (
              <li
                key={member.memberId}
                className="flex items-start gap-3 px-4 py-3"
              >
                <UserAvatar name={member.name} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <p className="text-callout text-fg-2">
                    <strong className="font-semibold text-fg">
                      {member.isMe ? "Você" : member.name}
                    </strong>
                    {box.targetSplit === "percent" &&
                    box.targetCents !== null ? (
                      <span className="text-fg-3">
                        {" "}
                        ({percentText(member.weight)}%)
                      </span>
                    ) : null}
                    {eta ? (
                      <>
                        {" "}
                        · {member.isMe ? "você chega" : "chega"} em{" "}
                        <strong className="font-bold text-fg">{eta}</strong>
                      </>
                    ) : null}
                  </p>
                  <dl className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-4 gap-y-2">
                    {facts.map((fact) => (
                      <div key={fact.label} className="min-w-0">
                        <dt className="text-caption text-fg-3">{fact.label}</dt>
                        <dd className="text-callout font-semibold text-fg tabular-nums whitespace-nowrap">
                          {fact.money ? (
                            <Masked mask="R$ ••••">{fact.text}</Masked>
                          ) : (
                            fact.text
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </li>
            );
          })}
        </ul>
        {box.departed.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1 px-1 text-caption text-fg-3">
            {box.departed.map((member) => (
              <li key={member.memberId}>
                {member.name} guardou{" "}
                <Money
                  cents={member.savedCents}
                  variant="caption"
                  tone="neutral"
                  sign="never"
                  className="text-fg-3"
                />
                ; não conta mais no total.
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="caixinha-historico" className="flex flex-col">
        <SectionHeader id="caixinha-historico" title="Histórico" />
        {months.length === 0 ? (
          <EmptyState
            icon={<PiggyBank />}
            title="Ninguém guardou ainda"
            description="Quando alguém guardar ou resgatar, aparece aqui."
            className="py-6"
          />
        ) : (
          months.map(({ month, entries }) => (
            <section key={month} aria-label={monthLabel(month)}>
              <h3 className="px-1 pt-2 pb-1 text-caption font-bold text-fg-2 first-letter:uppercase">
                {monthLabel(month)}
              </h3>
              <ul className="overflow-hidden rounded-card bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border">
                {entries.map((item) => {
                  const line = entryLine(item);
                  return (
                    <li
                      key={item.id}
                      className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
                    >
                      <span className="min-w-0 flex-[1_1_10rem] text-callout text-fg-2">
                        {line.before}
                        <Money
                          cents={line.amountCents}
                          variant="callout"
                          tone={item.amountCents > 0 ? "income" : "neutral"}
                          sign="never"
                          className="font-semibold"
                        />
                        {item.withTransfer ? (
                          <span className="block text-caption text-fg-3">
                            No seu extrato
                          </span>
                        ) : null}
                      </span>
                      <span className="ml-auto flex items-center gap-2 text-caption text-fg-3 tabular-nums">
                        {shortDateLabel(
                          item.occurredOn,
                          item.occurredOn.slice(0, 4) !== todayIso.slice(0, 4),
                        )}
                        {item.mine ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 text-fg-2"
                            aria-label={`Desfazer: ${line.before}${formatMoneyShort(line.amountCents)}`}
                            onClick={() =>
                              undo.show({
                                id: item.id,
                                text: `${line.before}${formatMoneyShort(line.amountCents)}`,
                              })
                            }
                          >
                            Desfazer
                          </Button>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </section>

      <Sheet open={entry.isOpen} onOpenChange={entry.onOpenChange}>
        {entry.target ? (
          <BoxEntrySheet
            key={entry.key}
            mode={entry.target}
            box={{ id: box.id, name: box.name }}
            mySavedCents={box.mySavedCents}
            accounts={accounts}
            lastBoxAccountId={box.lastBoxAccountId}
            todayIso={todayIso}
            onDone={entry.close}
          />
        ) : null}
      </Sheet>
      <Sheet open={plan.isOpen} onOpenChange={plan.onOpenChange}>
        <BoxPlanSheet
          key={plan.key}
          box={{ id: box.id, name: box.name }}
          monthlyPlanCents={me?.monthlyPlanCents ?? 0}
          requiredMonthlyCents={me?.projection?.requiredMonthlyCents ?? null}
          onDone={plan.close}
        />
      </Sheet>
      <Sheet open={undo.isOpen} onOpenChange={undo.onOpenChange}>
        {undo.target ? (
          <BoxUndoSheet
            key={undo.key}
            entry={undo.target}
            onDone={undo.close}
          />
        ) : null}
      </Sheet>
      <Sheet open={parts.isOpen} onOpenChange={parts.onOpenChange}>
        <BoxPartsSheet
          key={parts.key}
          box={{ id: box.id, name: box.name }}
          method={box.targetSplit}
          members={box.members.map((member) => ({
            memberId: member.memberId,
            name: member.name,
            isMe: member.isMe,
            weight: member.weight,
          }))}
          onDone={parts.close}
        />
      </Sheet>
      <Sheet
        open={editing.open}
        onOpenChange={(open) => setEditing((state) => ({ ...state, open }))}
      >
        <BoxSheet
          key={editing.key}
          groupId={box.groupId}
          box={box}
          today={today}
          onDone={() => setEditing((state) => ({ ...state, open: false }))}
        />
      </Sheet>
    </>
  );
}
