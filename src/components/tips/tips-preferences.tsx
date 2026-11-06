"use client";

import { ChevronRight, Lightbulb, LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { SectionHeader } from "@/components/app/section-header";
import { SettingRow, SettingRowButton } from "@/components/app/setting-row";
import { NETWORK_ERROR } from "@/components/transactions/action-result";
import { Switch } from "@/components/ui/switch";
import { useTipsStore } from "@/stores/tips";

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
        <SettingRow
          id={ids}
          icon={Lightbulb}
          label="Mostrar dicas nas telas"
          description="Balões na primeira visita a cada tela e o ponto de novidades."
          control={
            <Switch
              checked={!off}
              onCheckedChange={(show) => void toggle(show)}
              labelledBy={`${ids}-label`}
              describedBy={`${ids}-hint`}
            />
          }
        />
        <SettingRowButton
          id={`${ids}-review`}
          icon={RotateCcw}
          label="Rever dicas"
          description="Mostra de novo as dicas de cada tela, a começar pelo Início."
          aria-busy={resetting || undefined}
          disabled={resetting}
          onClick={() => void review()}
          control={
            resetting ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-5 animate-spin text-fg-3"
              />
            ) : (
              <ChevronRight aria-hidden="true" className="size-5 text-fg-3" />
            )
          }
        />
      </div>
    </section>
  );
}
