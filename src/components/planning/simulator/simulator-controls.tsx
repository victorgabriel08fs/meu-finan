"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { formatMoneyShort } from "@/components/charts/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { durationLabel } from "@/lib/format/date";
import { formatRate } from "@/lib/format/number";
import { cn } from "@/lib/utils";
import { DecimalField } from "../form/decimal-field";
import { MoneyField } from "../form/money-field";
import { ChoiceChips } from "../form/pickers";
import {
  type MarketRatesView,
  marketRateLabel,
  marketSourceSuffix,
} from "../market";
import {
  indexes,
  LIMITS,
  MAX_MONTHS,
  rateConversion,
  rateInput,
  type SimError,
  type SimRateKind,
  type SimulatorState,
  type TaxChoice,
} from "./model";
import { sliderIndex, sliderMaxIndex, sliderValue } from "./slider-scale";

type ControlsProps = {
  state: SimulatorState;
  update: (patch: Partial<SimulatorState>) => void;
  market: MarketRatesView;
  error: SimError | null;
  className?: string;
};

const RATE_KINDS: { value: SimRateKind; label: string; ariaLabel: string }[] = [
  { value: "annual", label: "% a.a.", ariaLabel: "Percentual ao ano" },
  { value: "monthly", label: "% a.m.", ariaLabel: "Percentual ao mês" },
  { value: "cdi", label: "% do CDI", ariaLabel: "Percentual do CDI" },
  { value: "ipca", label: "IPCA +", ariaLabel: "IPCA mais juro" },
];

const RATE_SUFFIX: Record<SimRateKind, string> = {
  annual: "% a.a.",
  monthly: "% a.m.",
  cdi: "% do CDI",
  ipca: "% a.a.",
};

const TAX_HINT: Record<TaxChoice, string> = {
  regressive:
    "Renda fixa (CDB, Tesouro): quanto mais tempo investido, menor o imposto (22,5% → 15%).",
  exempt: "LCI, LCA e poupança não pagam IR.",
  none: "Mostra os valores brutos, sem descontar imposto.",
};

/** Slider ceilings, in reais (the fields accept more). */
const SLIDER_MAX = { initial: 1_000_000, monthly: 50_000, target: 10_000_000 };

/** The simulator inputs (doc 02 §6.11 "Controle" table). */
export function SimulatorControls({
  state,
  update,
  market,
  error,
  className,
}: ControlsProps) {
  const ids = useId();
  const [advanced, setAdvanced] = useState(false);
  const [editIndex, setEditIndex] = useState(false);
  const fieldError = (field: SimError["field"]) =>
    error?.field === field ? error.message : undefined;
  const rate = rateInput(state, market);
  const { inflation, cdi } = indexes(state, market);
  const showMonthly = state.mode !== "monthly";
  const showTarget = state.mode !== "future";
  const showTerm = state.mode !== "time";

  return (
    <Card
      asChild
      className={cn(
        "flex flex-col px-4 py-1 [&>*+*]:border-t [&>*+*]:border-border",
        className,
      )}
    >
      <section aria-label="Parâmetros da simulação">
        <MoneyControl
          id={`${ids}-initial`}
          label="Valor inicial"
          cents={state.initialCents}
          onChange={(initialCents) => update({ initialCents })}
          sliderMax={SLIDER_MAX.initial}
          error={fieldError("initial")}
        />

        {showMonthly ? (
          <MoneyControl
            id={`${ids}-monthly`}
            label="Aporte mensal"
            cents={state.monthlyCents}
            onChange={(monthlyCents) => update({ monthlyCents })}
            sliderMax={SLIDER_MAX.monthly}
            error={fieldError("monthly")}
          />
        ) : null}

        {showTarget ? (
          <MoneyControl
            id={`${ids}-target`}
            label="Quero chegar a"
            cents={state.targetCents}
            onChange={(targetCents) => update({ targetCents })}
            sliderMax={SLIDER_MAX.target}
            error={fieldError("target")}
            hint={
              state.tax === "regressive"
                ? "Valor líquido, já descontado o IR."
                : undefined
            }
          />
        ) : null}

        <div className="flex flex-col gap-3 py-4">
          <span
            id={`${ids}-rate-label`}
            className="text-callout font-semibold text-fg-2"
          >
            Rentabilidade
          </span>
          <ChoiceChips
            labelledBy={`${ids}-rate-label`}
            label="Tipo de taxa"
            options={RATE_KINDS}
            value={state.rateKind}
            onChange={(rateKind) => {
              update({ rateKind });
              setEditIndex(false);
            }}
          />
          <DecimalField
            id={`${ids}-rate`}
            label={
              RATE_KINDS.find((kind) => kind.value === state.rateKind)
                ?.ariaLabel ?? "Taxa"
            }
            hideLabel
            value={state.rates[state.rateKind]}
            onValueChange={(value) =>
              update({ rates: { ...state.rates, [state.rateKind]: value } })
            }
            prefix={state.rateKind === "ipca" ? "IPCA +" : undefined}
            suffix={RATE_SUFFIX[state.rateKind]}
            step={state.rateKind === "cdi" ? 1 : 0.25}
            min={LIMITS[state.rateKind].min}
            max={LIMITS[state.rateKind].max}
            allowNegative={state.rateKind === "ipca"}
            size="sm"
            quietWhileTyping
            error={fieldError("rate")}
            hint={`${
              state.rateKind === "cdi"
                ? `${state.cdiPct === null ? marketRateLabel("cdi", market) : `CDI ${formatRate({ kind: "annual", value: cdi })} · editado`} · `
                : state.rateKind === "ipca"
                  ? `${state.inflationPct === null ? marketRateLabel("ipca", market) : `IPCA ${formatRate({ kind: "annual", value: inflation })} · editado`} · `
                  : ""
            }${rate.ok ? rateConversion(rate.rate) : "—"}`}
          />
          {state.rateKind === "cdi" || state.rateKind === "ipca" ? (
            <Button
              variant="ghost"
              size="sm"
              className="-mt-2 -ml-3.5 self-start"
              aria-expanded={editIndex}
              onClick={() => setEditIndex((open) => !open)}
            >
              {editIndex
                ? "Fechar edição do índice"
                : state.rateKind === "cdi"
                  ? "Editar o CDI usado"
                  : "Editar o IPCA usado"}
            </Button>
          ) : null}
          {editIndex && state.rateKind === "cdi" ? (
            <IndexField
              id={`${ids}-cdi`}
              label="CDI usado na simulação"
              value={state.cdiPct}
              marketValue={market.cdiAnnual}
              source={marketSourceSuffix(market)}
              onChange={(cdiPct) => update({ cdiPct })}
              limit={LIMITS.cdiIndex}
              error={fieldError("cdi")}
            />
          ) : null}
          {editIndex && state.rateKind === "ipca" ? (
            <IndexField
              id={`${ids}-ipca`}
              label="IPCA esperado"
              value={state.inflationPct}
              marketValue={market.ipcaAnnual}
              source={marketSourceSuffix(market)}
              onChange={(inflationPct) => update({ inflationPct })}
              limit={LIMITS.inflation}
              error={fieldError("inflation")}
              allowNegative
            />
          ) : null}
        </div>

        {showTerm ? (
          <TermControl
            id={`${ids}-term`}
            months={state.months}
            unit={state.termUnit}
            onMonths={(months) => update({ months })}
            onUnit={(termUnit) => update({ termUnit })}
            error={fieldError("term")}
          />
        ) : null}

        <div className="py-2">
          <button
            type="button"
            aria-expanded={advanced}
            aria-controls={`${ids}-advanced`}
            onClick={() => setAdvanced((open) => !open)}
            className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-chip px-2 text-left transition-colors duration-100 hover:bg-surface-2/60"
          >
            <span className="flex flex-col">
              <span className="text-callout font-semibold text-fg">
                Avançado
              </span>
              <span className="text-caption text-fg-3">
                IR, inflação, reajuste e momento do aporte
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-5 shrink-0 text-fg-3 transition-transform duration-150",
                advanced && "rotate-180",
              )}
            />
          </button>
          <div
            id={`${ids}-advanced`}
            hidden={!advanced}
            className="flex flex-col gap-5 pt-3 pb-3"
          >
            <div className="flex flex-col gap-2">
              <span
                id={`${ids}-timing`}
                className="text-callout font-semibold text-fg-2"
              >
                Aporte no
              </span>
              <SegmentedControl
                ariaLabel="Momento do aporte"
                options={[
                  { value: "end", label: "Fim do mês" },
                  { value: "start", label: "Início do mês" },
                ]}
                value={state.timing}
                onValueChange={(timing) =>
                  update({ timing: timing as SimulatorState["timing"] })
                }
              />
            </div>

            <DecimalField
              id={`${ids}-growth`}
              label="Reajuste anual do aporte"
              value={state.growthPct}
              onValueChange={(growthPct) => update({ growthPct })}
              suffix="% ao ano"
              step={1}
              min={LIMITS.growth.min}
              max={LIMITS.growth.max}
              size="sm"
              quietWhileTyping
              error={fieldError("growth")}
              hint="O aporte sobe esse percentual a cada 12 meses."
            />

            <div className="flex flex-col gap-2">
              <span
                id={`${ids}-tax`}
                className="text-callout font-semibold text-fg-2"
              >
                Imposto de renda
              </span>
              <SegmentedControl
                ariaLabel="Imposto de renda"
                options={[
                  { value: "regressive", label: "Regressivo" },
                  { value: "exempt", label: "Isento" },
                  { value: "none", label: "Sem IR" },
                ]}
                value={state.tax}
                onValueChange={(tax) => update({ tax: tax as TaxChoice })}
              />
              <p className="text-caption text-fg-3">{TAX_HINT[state.tax]}</p>
            </div>

            <IndexField
              id={`${ids}-inflation`}
              label="Inflação esperada (IPCA)"
              value={state.inflationPct}
              marketValue={market.ipcaAnnual}
              source={marketSourceSuffix(market)}
              onChange={(inflationPct) => update({ inflationPct })}
              limit={LIMITS.inflation}
              error={fieldError("inflation")}
              allowNegative
              note="Usada nos valores “em valores de hoje”."
            />
          </div>
        </div>
      </section>
    </Card>
  );
}

function MoneyControl({
  id,
  label,
  cents,
  onChange,
  sliderMax,
  error,
  hint,
}: {
  id: string;
  label: string;
  cents: number | null;
  onChange: (cents: number | null) => void;
  sliderMax: number;
  error?: string;
  hint?: string;
}) {
  const reais = (cents ?? 0) / 100;
  return (
    <div className="flex flex-col gap-1 py-4">
      <MoneyField
        id={id}
        label={label}
        value={cents}
        onValueChange={onChange}
        layout="inline"
        size="sm"
        quietWhileTyping
        error={error}
        hint={hint}
      />
      <input
        type="range"
        aria-label={`${label}: ajuste rápido`}
        aria-valuetext={formatMoneyShort(cents ?? 0)}
        min={0}
        max={sliderMaxIndex(sliderMax)}
        step={1}
        value={sliderIndex(reais, sliderMax)}
        onChange={(event) =>
          onChange(sliderValue(Number(event.target.value), sliderMax) * 100)
        }
        className="h-11 w-full cursor-pointer accent-primary"
      />
    </div>
  );
}

function TermControl({
  id,
  months,
  unit,
  onMonths,
  onUnit,
  error,
}: {
  id: string;
  months: number;
  unit: SimulatorState["termUnit"];
  onMonths: (months: number) => void;
  onUnit: (unit: SimulatorState["termUnit"]) => void;
  error?: string;
}) {
  const years = unit === "years";
  return (
    <div className="flex flex-col gap-1 py-4">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-callout font-semibold text-fg-2">
          Prazo
        </label>
        <output htmlFor={id} className="text-headline text-fg">
          {durationLabel(months)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={1}
        max={years ? MAX_MONTHS / 12 : MAX_MONTHS}
        step={1}
        value={years ? Math.max(1, Math.round(months / 12)) : months}
        aria-valuetext={durationLabel(months)}
        onChange={(event) => {
          const value = Number(event.target.value);
          onMonths(years ? value * 12 : value);
        }}
        className="h-11 w-full cursor-pointer accent-primary"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-caption text-fg-3">
          {years ? "De 1 a 50 anos" : "De 1 a 600 meses"}
        </span>
        <SegmentedControl
          ariaLabel="Unidade do prazo"
          className="w-44"
          options={[
            { value: "years", label: "Anos" },
            { value: "months", label: "Meses" },
          ]}
          value={unit}
          onValueChange={(value) => onUnit(value as SimulatorState["termUnit"])}
        />
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

function IndexField({
  id,
  label,
  value,
  marketValue,
  source,
  onChange,
  limit,
  error,
  allowNegative = false,
  note,
}: {
  id: string;
  label: string;
  value: number | null;
  marketValue: number;
  source: string;
  onChange: (value: number | null) => void;
  limit: { min: number; max: number };
  error?: string;
  allowNegative?: boolean;
  note?: string;
}) {
  const market = formatRate({ kind: "annual", value: marketValue });
  return (
    <div className="flex flex-col gap-1">
      <DecimalField
        id={id}
        label={label}
        value={value ?? Math.round(marketValue * 10_000) / 100}
        onValueChange={onChange}
        suffix="% a.a."
        step={0.25}
        min={limit.min}
        max={limit.max}
        allowNegative={allowNegative}
        size="sm"
        quietWhileTyping
        error={error}
        hint={`${value === null ? "Valor de mercado" : "Editado"}: ${market} · ${source}.${note ? ` ${note}` : ""}`}
      />
      {value === null ? null : (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3.5 self-start"
          onClick={() => onChange(null)}
        >
          Usar {market} ({source})
        </Button>
      )}
    </div>
  );
}
