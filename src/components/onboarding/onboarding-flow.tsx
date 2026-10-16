"use client";

import {
  CalendarRange,
  Check,
  ChevronLeft,
  Landmark,
  PiggyBank,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand/brand-mark";
import { CategoryIcon } from "@/components/finance/category-icon";
import { MoneyField } from "@/components/planning/form/money-field";
import { NativeSelect } from "@/components/planning/form/native-select";
import {
  ChoiceChips,
  type ChoiceOption,
} from "@/components/planning/form/pickers";
import { actionErrorMessage } from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { iso, parseMonth, periodForMonth } from "@/lib/finance";
import { monthLabel, periodLabel } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import { setCategoryArchivedAction } from "@/server/actions/categories";
import {
  createAccountAction,
  updatePreferencesAction,
} from "@/server/actions/planning";

export type OnboardingCategory = {
  id: string;
  name: string;
  kind: "expense" | "income";
  icon: string;
  color: string;
};

type OnboardingFlowProps = {
  firstName: string;
  hasAccounts: boolean;
  monthStartDay: number;
  /** YYYY-MM of today, for the period example. */
  currentMonth: string;
  categories: OnboardingCategory[];
};

type Step = 1 | 2 | 3 | 4;
type AccountType = "checking" | "savings" | "cash";

const ACCOUNT_TYPES: ChoiceOption<AccountType>[] = [
  {
    value: "checking",
    label: "Corrente",
    icon: <Landmark aria-hidden="true" />,
  },
  {
    value: "savings",
    label: "Poupança",
    icon: <PiggyBank aria-hidden="true" />,
  },
  { value: "cash", label: "Dinheiro", icon: <Wallet aria-hidden="true" /> },
];

const START_DAYS = ["1", "5", "10", "15", "20"] as const;
const OTHER_DAY = "outro";

/** 1–28: later days would not exist in every month. */
const ALL_DAYS = Array.from({ length: 28 }, (_, index) => index + 1);

const NETWORK_ERROR = "Sem conexão. Tente de novo.";

/** "Outubro vai de 5/out a 4/nov." for the current month and a start day. */
function periodExample(month: string, startDay: number): string {
  const period = periodForMonth(parseMonth(month), startDay);
  const name = monthLabel(month).split(" de ")[0] ?? month;
  const range = periodLabel(iso(period.start), iso(period.end)).replace(
    " – ",
    " a ",
  );
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} vai de ${range}.`;
}

/**
 * Onboarding (doc 02 §6.2): four steps with a progress indicator and "Pular".
 * Each step saves as it goes (account, archived categories, month start), so
 * leaving halfway keeps what was done; finishing or skipping marks the
 * onboarding as done and opens the Início.
 */
export function OnboardingFlow({
  firstName,
  hasAccounts: initiallyHasAccounts,
  monthStartDay,
  currentMonth,
  categories,
}: OnboardingFlowProps) {
  const router = useRouter();
  const ids = useId();
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasAccounts, setHasAccounts] = useState(initiallyHasAccounts);
  const [accountName, setAccountName] = useState("Conta principal");
  const [accountType, setAccountType] = useState<AccountType>("checking");
  const [balance, setBalance] = useState<number | null>(null);

  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
  const [archived, setArchived] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const preset = START_DAYS.find((day) => Number(day) === monthStartDay);
  const [startChoice, setStartChoice] = useState<string>(preset ?? OTHER_DAY);
  const [otherDay, setOtherDay] = useState(monthStartDay);
  const startDay = startChoice === OTHER_DAY ? otherDay : Number(startChoice);

  function go(next: Step) {
    setError(null);
    setStep(next);
  }

  async function run(task: () => Promise<string | null>, next?: Step) {
    setBusy(true);
    setError(null);
    try {
      const message = await task();
      if (message) {
        setError(message);
        return false;
      }
      if (next) setStep(next);
      return true;
    } catch {
      setError(NETWORK_ERROR);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function finish(withMonthStart: boolean) {
    const done = await run(async () =>
      actionErrorMessage(
        await updatePreferencesAction({
          onboardingDone: true,
          ...(withMonthStart ? { monthStartDay: startDay } : {}),
        }),
      ),
    );
    if (!done) return;
    if (withMonthStart) toast("Tudo pronto. Bom começo!");
    // Leaving the page: no sheet is open here, a plain navigation.
    router.push("/inicio");
  }

  function saveAccount() {
    if (hasAccounts) {
      go(3);
      return;
    }
    const name = accountName.trim();
    if (!name) {
      setError("Dê um nome para a conta.");
      return;
    }
    void run(async () => {
      const result = await createAccountAction({
        name,
        type: accountType,
        initialBalanceCents: balance ?? 0,
      });
      const message = actionErrorMessage(result);
      if (!message) setHasAccounts(true);
      return message;
    }, 3);
  }

  function saveCategories() {
    // Archive what was switched off and bring back what was switched on again.
    const toArchive = [...off].filter((id) => !archived.has(id));
    const toRestore = [...archived].filter((id) => !off.has(id));
    if (toArchive.length === 0 && toRestore.length === 0) {
      go(4);
      return;
    }
    void run(async () => {
      for (const [list, value] of [
        [toArchive, true],
        [toRestore, false],
      ] as const) {
        for (const id of list) {
          const message = actionErrorMessage(
            await setCategoryArchivedAction({ id, archived: value }),
          );
          if (message) return message;
        }
      }
      setArchived(new Set(off));
      return null;
    }, 4);
  }

  function toggle(id: string) {
    setOff((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  let body: ReactNode;
  let primary: ReactNode;
  if (step === 1) {
    body = (
      <>
        <BrandMark className="size-14" />
        <div className="flex flex-col gap-2">
          <p className="text-callout font-semibold text-fg-2">
            Olá, {firstName}
          </p>
          <h1 className="text-title-1 text-fg text-balance">
            Seu dinheiro, claro como deveria ser
          </h1>
        </div>
        <ul className="flex flex-col gap-4">
          <Benefit
            icon={<Zap />}
            title="Registre um gasto em segundos"
            text="Valor, categoria e pronto. O resto o app completa."
          />
          <Benefit
            icon={<CalendarRange />}
            title="Veja o mês inteiro numa tela"
            text="Quanto entrou, quanto saiu e o que ainda vai vencer."
          />
          <Benefit
            icon={<TrendingUp />}
            title="Planeje e veja o dinheiro render"
            text="Orçamentos, metas e simulador com CDI, IPCA e IR."
          />
        </ul>
      </>
    );
    primary = (
      <Button size="lg" className="w-full" onClick={() => go(2)}>
        Começar
      </Button>
    );
  } else if (step === 2) {
    body = (
      <>
        <StepTitle
          title="Sua primeira conta"
          text={
            hasAccounts
              ? "Você já tem conta cadastrada. Dá para criar outras em Contas."
              : "Onde fica o dinheiro do dia a dia. Cartões entram depois, em Contas."
          }
        />
        {hasAccounts ? (
          <p className="flex items-center gap-2 rounded-card bg-primary-soft px-4 py-3 text-callout font-semibold text-on-primary-soft">
            <Check aria-hidden="true" className="size-5 shrink-0" />
            Conta pronta
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-name`}>Nome</Label>
              <Input
                id={`${ids}-name`}
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                maxLength={40}
                autoComplete="off"
                enterKeyHint="next"
              />
            </div>
            <div className="flex flex-col gap-2">
              <span
                id={`${ids}-type`}
                className="text-callout font-semibold text-fg"
              >
                Tipo
              </span>
              <ChoiceChips
                options={ACCOUNT_TYPES}
                value={accountType}
                onChange={setAccountType}
                label="Tipo"
                labelledBy={`${ids}-type`}
                layout="grid"
              />
            </div>
            <MoneyField
              id={`${ids}-balance`}
              label="Saldo atual"
              value={balance}
              onValueChange={setBalance}
              hint="Não precisa ser exato — você ajusta depois."
            />
          </div>
        )}
      </>
    );
    primary = (
      <Button size="lg" className="w-full" loading={busy} onClick={saveAccount}>
        Continuar
      </Button>
    );
  } else if (step === 3) {
    const expense = categories.filter((item) => item.kind === "expense");
    const income = categories.filter((item) => item.kind === "income");
    body = (
      <>
        <StepTitle
          title="Categorias"
          text="Já deixamos estas prontas. Toque para desligar as que não servem — dá para criar e editar depois."
        />
        <CategoryGroup
          title="Despesas"
          items={expense}
          off={off}
          onToggle={toggle}
        />
        <CategoryGroup
          title="Receitas"
          items={income}
          off={off}
          onToggle={toggle}
        />
      </>
    );
    primary = (
      <Button
        size="lg"
        className="w-full"
        loading={busy}
        onClick={saveCategories}
      >
        Continuar
      </Button>
    );
  } else {
    body = (
      <>
        <StepTitle
          title="Seu mês"
          text="Use o dia em que costuma receber o salário: orçamentos e relatórios contam o mês a partir dele."
        />
        <div className="flex flex-col gap-3">
          <span
            id={`${ids}-start`}
            className="text-callout font-semibold text-fg"
          >
            Seu mês financeiro começa no dia
          </span>
          <ChoiceChips
            options={[
              ...START_DAYS.map((day) => ({ value: day, label: day })),
              { value: OTHER_DAY, label: "Outro" },
            ]}
            value={startChoice}
            onChange={setStartChoice}
            label="Dia de início do mês"
            labelledBy={`${ids}-start`}
            layout="grid"
          />
          {startChoice === OTHER_DAY ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-other`}>Dia</Label>
              <NativeSelect
                id={`${ids}-other`}
                value={String(otherDay)}
                onChange={(event) => setOtherDay(Number(event.target.value))}
              >
                {ALL_DAYS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <p className="text-caption text-fg-3">
            {periodExample(currentMonth, startDay)}
          </p>
        </div>
      </>
    );
    primary = (
      <Button
        size="lg"
        className="w-full"
        loading={busy}
        onClick={() => void finish(true)}
      >
        Concluir
      </Button>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8">
      <header className="flex h-11 items-center justify-between gap-3">
        {step > 1 ? (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            disabled={busy}
            onClick={() => go((step - 1) as Step)}
          >
            <ChevronLeft aria-hidden="true" />
            Voltar
          </Button>
        ) : (
          <span />
        )}
        <Progress step={step} />
        <Button
          variant="ghost"
          size="sm"
          className="-mr-2"
          disabled={busy}
          onClick={() => void finish(false)}
        >
          Pular
        </Button>
      </header>

      <section aria-live="polite" className="flex flex-col gap-6" key={step}>
        {body}
      </section>

      <div className="mt-auto flex flex-col gap-3 pt-4">
        {error ? <FieldError id={`${ids}-error`}>{error}</FieldError> : null}
        {primary}
      </div>
    </div>
  );
}

function Progress({ step }: { step: Step }) {
  return (
    <div
      role="progressbar"
      aria-label="Progresso"
      aria-valuemin={1}
      aria-valuemax={4}
      aria-valuenow={step}
      aria-valuetext={`Passo ${step} de 4`}
      className="flex items-center gap-1.5"
    >
      {[1, 2, 3, 4].map((dot) => (
        <span
          key={dot}
          className={cn(
            "h-1.5 rounded-full transition-[width,background-color] duration-200 ease-standard",
            dot === step ? "w-6 bg-primary" : "w-1.5",
            dot < step ? "bg-primary/60" : dot > step ? "bg-border-strong" : "",
          )}
        />
      ))}
    </div>
  );
}

function StepTitle({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-title-1 text-fg">{title}</h1>
      <p className="text-body text-fg-2">{text}</p>
    </div>
  );
}

function Benefit({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft [&_svg]:size-5"
      >
        {icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-body font-semibold text-fg">{title}</span>
        <span className="text-callout text-fg-2">{text}</span>
      </span>
    </li>
  );
}

function CategoryGroup({
  title,
  items,
  off,
  onToggle,
}: {
  title: string;
  items: OnboardingCategory[];
  off: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-overline text-fg-3 uppercase">
        {title}
      </legend>
      <ul className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const on = !off.has(item.id);
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(item.id)}
                className={cn(
                  "flex min-h-13 w-full items-center gap-2.5 rounded-control border px-2.5 py-2 text-left transition-[background-color,border-color,opacity,scale] duration-100 ease-standard active:scale-97",
                  on
                    ? "border-border bg-surface"
                    : "border-dashed border-border-strong/60 bg-transparent opacity-55",
                )}
              >
                <CategoryIcon icon={item.icon} color={item.color} size="sm" />
                <span className="line-clamp-2 min-w-0 flex-1 text-callout leading-tight font-semibold text-fg">
                  {item.name}
                </span>
                {on ? (
                  <Check
                    aria-hidden="true"
                    className="size-4 shrink-0 text-primary"
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
