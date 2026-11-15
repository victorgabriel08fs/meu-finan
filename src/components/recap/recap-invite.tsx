"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";
import { readyForTips } from "@/components/tips/dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { readSeenMonth, writeSeenMonth } from "./model";

type RecapInviteProps = {
  userId: string;
  /** "2026-10": the month that closed. */
  month: string;
  /** "outubro". */
  monthName: string;
  /** The Retrospectiva of that month. */
  href: string;
};

const POLL_MS = 400;
const OPEN_DELAY_MS = 700;

/**
 * The invite to the Retrospectiva (doc 02 §6.3), once per person on the
 * device in the first days of a month: a sheet that opens when the Início has
 * settled and no tip is on screen. Any way out (the button, "Agora não", Esc,
 * a drag, a tap outside) counts the month as seen. Kept apart from the Início
 * on purpose: the way the first day announces the month may change.
 */
export function RecapInvite({
  userId,
  month,
  monthName,
  href,
}: RecapInviteProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const seen = readSeenMonth(userId);
    if (seen && seen >= month) return;
    let opening: ReturnType<typeof setTimeout> | undefined;
    const poll = setInterval(() => {
      if (!readyForTips()) return;
      clearInterval(poll);
      opening = setTimeout(() => {
        // Something may have opened meanwhile (a tip, a sheet).
        if (readyForTips()) setOpen(true);
      }, OPEN_DELAY_MS);
    }, POLL_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(opening);
    };
  }, [userId, month]);

  // The page stays mounted, hidden, when the person leaves it: close the
  // sheet then, so it does not wait open behind another screen.
  useLayoutEffect(() => () => setOpen(false), []);

  const close = () => {
    writeSeenMonth(userId, month);
    setOpen(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <SheetContent
        title={`${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} fechou`}
        description="Veja em 1 minuto como foi o mês: o que entrou e saiu, para onde foi o dinheiro e o maior gasto."
        flowFooter
        footer={
          <div className="flex flex-col gap-2">
            <Button asChild size="lg" className="w-full">
              <Link href={href} onClick={close}>
                Ver a retrospectiva
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="w-full"
              onClick={close}
            >
              Agora não
            </Button>
          </div>
        }
      >
        <div className="flex justify-center py-2">
          <span
            aria-hidden="true"
            className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft"
          >
            <Sparkles className="size-8" strokeWidth={1.75} />
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
