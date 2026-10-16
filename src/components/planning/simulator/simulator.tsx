"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { YearMonth } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { ChoiceChips } from "../form/pickers";
import type { MarketRatesView } from "../market";
import {
  computeSimulation,
  DEFAULT_STATE,
  restoreState,
  type SimulatorMode,
  type SimulatorState,
} from "./model";
import { SimulatorControls } from "./simulator-controls";
import {
  EvolutionCard,
  HeroCard,
  InsightsCard,
  StickySummary,
  YearTableCard,
} from "./simulator-results";

/** The last inputs, per device (doc 02 §6.11); never shared, never required. */
const STORAGE_KEY = "meu-finan:simulador:v1";

const MODES: { value: SimulatorMode; label: string }[] = [
  { value: "future", label: "Quanto terei" },
  { value: "monthly", label: "Quanto investir" },
  { value: "time", label: "Em quanto tempo" },
];

const MODE_SUMMARY: Record<SimulatorMode, string> = {
  future: "Você terá",
  monthly: "Invista",
  time: "Você chega lá em",
};

type CompoundSimulatorProps = {
  market: MarketRatesView;
  /** The owner's current month (server clock, in their time zone). */
  today: YearMonth;
};

/**
 * Planejar › Simulador de juros compostos (doc 02 §6.11). Runs the engine of
 * doc 03 in the browser on every change — no network after the page loads.
 * Invalid inputs show an inline error and keep the last valid result, dimmed.
 */
export function CompoundSimulator({ market, today }: CompoundSimulatorProps) {
  const [state, setState] = useState<SimulatorState>(DEFAULT_STATE);
  const [lastValid, setLastValid] = useState<SimulatorState>(DEFAULT_STATE);
  const [selected, setSelected] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const [heroHidden, setHeroHidden] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const restoring = useRef(false);

  // Restore the last inputs once, after hydration (localStorage is per device).
  useEffect(() => {
    if (restoring.current) return;
    restoring.current = true;
    let saved: SimulatorState | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      saved = raw ? restoreState(JSON.parse(raw)) : null;
    } catch {
      saved = null;
    }
    if (saved) {
      setState(saved);
      if (computeSimulation(saved, market, today).ok) setLastValid(saved);
    }
    setRestored(true);
  }, [market, today]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private mode or blocked storage: the simulation still works.
    }
  }, [restored, state]);

  useEffect(() => {
    const node = heroRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setHeroHidden(
          entry
            ? !entry.isIntersecting && entry.boundingClientRect.top < 0
            : false,
        ),
      { rootMargin: "-52px 0px 0px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function update(patch: Partial<SimulatorState>) {
    const next = { ...state, ...patch };
    setState(next);
    setSelected(null);
    if (computeSimulation(next, market, today).ok) setLastValid(next);
  }

  const current = useMemo(
    () => computeSimulation(state, market, today),
    [state, market, today],
  );
  const fallback = useMemo(
    () => (current.ok ? null : computeSimulation(lastValid, market, today)),
    [current, lastValid, market, today],
  );
  const view = current.ok ? current.view : fallback?.ok ? fallback.view : null;
  const error = current.ok ? null : current.error;
  const stale = !current.ok;

  // The notice waits for a pause, so clearing a field to retype it does not
  // flash a warning (doc 02 §7.3: never validate while typing).
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!error) {
      setNotice(null);
      return;
    }
    const timer = setTimeout(() => setNotice(error.message), 900);
    return () => clearTimeout(timer);
  }, [error]);

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[22.5rem_minmax(0,1fr)] lg:items-start lg:gap-x-6">
      <ChoiceChips
        label="O que você quer saber"
        layout="grid"
        options={MODES}
        value={state.mode}
        onChange={(mode) => update({ mode })}
        className="lg:col-start-1 lg:row-start-1"
      />

      <div className="flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        {error && notice ? (
          // The field shows the same message; this also covers fields in a
          // closed section and explains why the result is dimmed.
          <output className="flex items-start gap-2 rounded-chip bg-warning-soft px-3 py-2.5 text-caption font-semibold text-warning">
            <TriangleAlert
              aria-hidden="true"
              className="mt-px size-4 shrink-0"
            />
            <span>{notice} Mostrando o último resultado válido.</span>
          </output>
        ) : null}
        {view ? (
          <div
            className={cn(
              "flex flex-col gap-4 transition-opacity duration-150",
              stale && "opacity-50",
            )}
          >
            <HeroCard view={view} heroRef={heroRef} />
            <EvolutionCard
              view={view}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
        ) : null}
      </div>

      <SimulatorControls
        state={state}
        update={update}
        market={market}
        error={error}
        className="lg:col-start-1 lg:row-start-2"
      />

      {view ? (
        <div
          className={cn(
            "flex flex-col gap-4 transition-opacity duration-150 lg:col-start-2",
            stale && "opacity-50",
          )}
        >
          <InsightsCard insights={view.insights} />
          <YearTableCard view={view} />
          <p className="px-1 text-caption text-fg-3">
            Simulação com taxa constante. Não é recomendação de investimento. O
            IR segue a tabela regressiva da renda fixa; IOF e come-cotas ficam
            de fora.
          </p>
        </div>
      ) : null}

      {view ? (
        <StickySummary
          visible={heroHidden}
          label={MODE_SUMMARY[state.mode]}
          summary={view.summary}
        />
      ) : null}
    </div>
  );
}
