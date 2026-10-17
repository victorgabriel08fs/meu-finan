"use client";

import { AnimatePresence } from "motion/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  selectTips,
  type Tip,
  type TipState,
  type TipsSnapshot,
} from "@/lib/tips";
import { useQuickAddStore } from "@/stores/quick-add";
import { useTipsStore } from "@/stores/tips";
import { CoachMark, tipLabel } from "./coach-mark";
import { COACH_MARK_ATTRIBUTE, findAnchor, readyForTips } from "./dom";

/** Calm before the first tip once the page settled: the page comes first. */
const SETTLE_MS = 700;
/** No structural change in the content for this long counts as settled… */
const QUIET_MS = 400;
/** …unless it never stops changing: then this much calm is enough. */
const MAX_WAIT_MS = 4_000;
/** An anchor that vanished mid-sequence gets this long to come back. */
const LOST_MS = 1_500;
/** Steps closer than this are one tap counted twice. */
const STEP_GUARD_MS = 250;
const TICK_MS = 150;

type Run = { path: string; tips: Tip[]; index: number };
type Shown = { tip: Tip; anchor: HTMLElement };

/**
 * Tips of the signed-in user (doc 02 §6.2, §6.16), mounted once in the app
 * layout. Hands the server's snapshot to the tips store, then plays the
 * sequence of the screen on screen: only after the page finished streaming,
 * never over a sheet, dialog or toast, skipping tips whose anchor is not on
 * screen. A new screen, "Pular dicas" or "Não mostrar mais dicas" ends it.
 */
export function TipsHost({ snapshot }: { snapshot: TipsSnapshot }) {
  const hydrate = useTipsStore((state) => state.hydrate);
  useEffect(() => {
    hydrate(snapshot);
  }, [hydrate, snapshot]);
  return <CoachMarks />;
}

function CoachMarks() {
  const pathname = usePathname();
  const loaded = useTipsStore((store) => store.loaded);
  const seen = useTipsStore((store) => store.seen);
  const off = useTipsStore((store) => store.off);
  const createdOn = useTipsStore((store) => store.createdOn);
  const context = useTipsStore((store) => store.context);
  const markSeen = useTipsStore((store) => store.markSeen);
  const setOff = useTipsStore((store) => store.setOff);
  const state = useMemo<TipState>(
    () => ({ seen, off, createdOn, context }),
    [seen, off, createdOn, context],
  );

  const [run, setRun] = useState<Run | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [finishedPath, setFinishedPath] = useState<string | null>(null);
  // Mirrors for the timer, which must not restart on every change.
  const runRef = useRef<Run | null>(null);
  const shownRef = useRef<Shown | null>(null);
  const stateRef = useRef(state);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const updateRun = useCallback((next: Run | null) => {
    runRef.current = next;
    setRun(next);
  }, []);
  const updateShown = useCallback((next: Shown | null) => {
    shownRef.current = next;
    setShown(next);
  }, []);

  /** Ends the sequence of this screen and gives the focus back. */
  const finish = useCallback(
    (path: string) => {
      updateRun(null);
      updateShown(null);
      setFinishedPath(path);
      const active = document.activeElement;
      const target = returnFocus.current;
      returnFocus.current = null;
      if (
        active instanceof HTMLElement &&
        active.closest(`[${COACH_MARK_ATTRIBUTE}]`)
      ) {
        if (target?.isConnected) target.focus({ preventScroll: true });
        else active.blur();
      }
    },
    [updateRun, updateShown],
  );

  /**
   * Moves to the next tip. `now`: straight there when its anchor is on screen
   * (the spotlight glides over); otherwise the timer shows it when ready. A
   * second call right after the first (a double tap on "Próxima" while the
   * balloon changes) is ignored, so no tip goes by unread.
   */
  const lastStep = useRef(0);
  const advance = useCallback(
    ({ mark, now }: { mark: boolean; now: boolean }) => {
      const current = runRef.current;
      if (!current) return;
      const at = performance.now();
      if (at - lastStep.current < STEP_GUARD_MS) return;
      lastStep.current = at;
      const tip = current.tips[current.index];
      if (mark && tip) markSeen([tip.id]);
      const index = current.index + 1;
      const nextTip = current.tips[index];
      if (!nextTip) {
        finish(current.path);
        return;
      }
      updateRun({ ...current, index });
      const found =
        now && nextTip.anchor && readyForTips()
          ? findAnchor(nextTip.anchor)
          : null;
      updateShown(found ? { tip: nextTip, anchor: found.element } : null);
    },
    [finish, markSeen, updateRun, updateShown],
  );

  const turnOff = useCallback(async () => {
    const saved = await setOff(true);
    toast(
      saved
        ? "Pronto, sem mais dicas. Para religar, vá em Ajustes › Preferências."
        : "Não conseguimos salvar. Verifique a conexão.",
    );
  }, [setOff]);

  const skip = useCallback(() => {
    const current = runRef.current;
    if (!current) return;
    markSeen(current.tips.slice(current.index).map((tip) => tip.id));
    finish(current.path);
    toast("Dicas desta tela puladas.", {
      duration: 5000,
      action: { label: "Não mostrar mais", onClick: () => void turnOff() },
    });
  }, [finish, markSeen, turnOff]);

  // A new screen starts from scratch: what was on belonged to the last one.
  useEffect(() => {
    if (runRef.current && runRef.current.path !== pathname) updateRun(null);
    updateShown(null);
    setFinishedPath(null);
  }, [pathname, updateRun, updateShown]);

  // "Não mostrar mais dicas" from anywhere closes what is open.
  useEffect(() => {
    if (!off) return;
    updateRun(null);
    updateShown(null);
  }, [off, updateRun, updateShown]);

  // The quick-add tip suggests N, R and T on desktop: opening the sheet by
  // keyboard while it shows is following it, so it counts as seen.
  const quickAddOpen = useQuickAddStore((store) => store.open);
  useEffect(() => {
    if (quickAddOpen && shownRef.current?.tip.anchor === "quick-add") {
      advance({ mark: true, now: false });
    }
  }, [quickAddOpen, advance]);

  const pending =
    loaded &&
    !off &&
    finishedPath !== pathname &&
    (run?.path === pathname || selectTips(pathname, state).length > 0);

  useEffect(() => {
    if (!pending) return;
    let readySince: number | null = null;
    let missingSince: number | null = null;
    let wasShowing = false;
    let lastChange = performance.now();
    const main = document.getElementById("conteudo");
    const observer = new MutationObserver(() => {
      lastChange = performance.now();
    });
    if (main) observer.observe(main, { childList: true, subtree: true });

    const tick = () => {
      const now = performance.now();
      const showing = shownRef.current !== null;
      // A balloon just closed (the anchor was tapped, it went off screen):
      // the next one waits for a calm moment again.
      if (wasShowing && !showing) readySince = null;
      wasShowing = showing;
      if (!readyForTips()) {
        readySince = null;
        if (showing) updateShown(null);
        return;
      }
      if (showing) return;
      readySince ??= now;
      const calm =
        now - lastChange >= QUIET_MS || now - readySince >= MAX_WAIT_MS;
      if (now - readySince < SETTLE_MS || !calm) return;

      let current = runRef.current;
      if (!current || current.path !== pathname) {
        const tips = selectTips(pathname, stateRef.current, {
          isVisible: (anchor) => findAnchor(anchor) !== null,
        });
        if (tips.length === 0) {
          setFinishedPath(pathname);
          return;
        }
        current = { path: pathname, tips, index: 0 };
        updateRun(current);
        const active = document.activeElement;
        returnFocus.current =
          active instanceof HTMLElement && active !== document.body
            ? active
            : null;
      }
      const tip = current.tips[current.index];
      const found = tip?.anchor ? findAnchor(tip.anchor) : null;
      if (!tip || !found) {
        // Gone for now (scrolled away, replaced): wait a little, then skip
        // it without marking it seen.
        missingSince ??= now;
        if (now - missingSince >= LOST_MS) {
          missingSince = null;
          advance({ mark: false, now: false });
        }
        return;
      }
      missingSince = null;
      updateShown({ tip, anchor: found.element });
    };
    const timer = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
    };
  }, [pending, pathname, advance, updateRun, updateShown]);

  const step = run ? run.index + 1 : 0;
  const total = run?.tips.length ?? 0;

  return (
    <>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {shown ? tipLabel(shown.tip, step, total) : ""}
      </p>
      <AnimatePresence>
        {shown && run ? (
          <CoachMark
            key="coach-mark"
            tip={shown.tip}
            anchor={shown.anchor}
            step={step}
            total={total}
            onNext={() => advance({ mark: true, now: true })}
            onAnchor={() => advance({ mark: true, now: false })}
            onSkip={skip}
            onLost={() => updateShown(null)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
