"use client";

import { ChevronRight, Lightbulb, LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { SectionHeader } from "@/components/app/section-header";
import { Switch } from "@/components/planning/form/switch";
import { NETWORK_ERROR } from "@/components/transactions/action-result";
import { useTipsStore } from "@/stores/tips";

const iconClass =
  "flex size-8 shrink-0 items-center justify-center rounded-chip bg-surface-2 text-fg-2 [&_svg]:size-5";

/**
 * Ajustes › Preferências › Dicas de uso (doc 02 §6.16): the balloons' switch
 * ("Não mostrar mais dicas" turned around) and "Rever dicas", which shows the
 * basics again, starting from the Início. Novidades stay read.
 */
export function TipsPreferences({ initiallyOff }: { initiallyOff: boolean }) {
  const router = useRouter();
  const ids = useId();
  const loaded = useTipsStore((store) => store.loaded);
  const storeOff = useTipsStore((store) => store.off);
  const setOff = useTipsStore((store) => store.setOff);
  const reset = useTipsStore((store) => store.reset);
  const [resetting, setResetting] = useState(false);
  const off = loaded ? storeOff : initiallyOff;

  // Ajustes links here with #preferencias-dicas, but this section streams in
  // after the skeleton, and Next drops a hash whose target is missing (it
  // also skips its scroll to the top): scroll here once it is on the page.
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash === "#preferencias-dicas") {
      section.current?.scrollIntoView({ block: "start" });
    }
  }, []);

  async function toggle(show: boolean) {
    if (!(await setOff(!show))) toast(NETWORK_ERROR);
  }

  async function review() {
    setResetting(true);
    if (!(await reset())) {
      setResetting(false);
      toast(NETWORK_ERROR);
      return;
    }
    // Leaving the page: the Início starts the tips again.
    router.push("/inicio");
  }

  return (
    <section ref={section} aria-labelledby="preferencias-dicas">
      <SectionHeader id="preferencias-dicas" title="Dicas de uso" />
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
        <div className="flex min-h-16 items-center gap-3 py-2 pr-2 pl-4">
          <span aria-hidden="true" className={iconClass}>
            <Lightbulb />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              id={`${ids}-label`}
              className="text-body font-semibold text-fg"
            >
              Mostrar dicas nas telas
            </span>
            <span id={`${ids}-hint`} className="text-caption text-fg-3">
              Balões que apontam o que fazer na primeira visita a cada tela.
            </span>
          </span>
          <Switch
            checked={!off}
            onCheckedChange={(show) => void toggle(show)}
            labelledBy={`${ids}-label`}
            describedBy={`${ids}-hint`}
          />
        </div>
        <button
          type="button"
          aria-busy={resetting || undefined}
          disabled={resetting}
          onClick={() => void review()}
          className="flex min-h-16 w-full items-center gap-3 border-t border-border px-4 py-2 text-left -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2 disabled:cursor-progress"
        >
          <span aria-hidden="true" className={iconClass}>
            <RotateCcw />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body font-semibold text-fg">Rever dicas</span>
            <span className="text-caption text-fg-3">
              Mostra de novo as dicas de cada tela, a começar pelo Início.
            </span>
          </span>
          {resetting ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-5 shrink-0 animate-spin text-fg-3"
            />
          ) : (
            <ChevronRight
              aria-hidden="true"
              className="size-5 shrink-0 text-fg-3"
            />
          )}
        </button>
      </div>
    </section>
  );
}
