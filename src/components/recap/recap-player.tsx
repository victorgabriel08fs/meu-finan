"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import {
  Fragment,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import {
  nextIndex,
  type RecapAction,
  type RecapSlide,
  tapAction,
  writeSeenMonth,
} from "./model";
import {
  EASE_ENTER,
  EASE_EXIT,
  EASE_STANDARD,
  RECAP_DRIFT_MS,
  RECAP_EXIT_MS,
  RECAP_REDUCED_FADE_MS,
  RECAP_SHIFT_PX,
  RECAP_SLIDE_MS,
} from "./motion";
import { RecapFrame } from "./recap-frame";
import {
  BiggestSlide,
  BudgetsSlide,
  CategoriesSlide,
  ComparisonSlide,
  DaysSlide,
  FlowSlide,
  IntroSlide,
  LeftSlide,
  NextSlide,
  OutroSlide,
} from "./recap-slides";

type RecapPlayerProps = {
  userId: string;
  /** "2026-10": the month on screen. */
  month: string;
  kicker: string;
  slides: RecapSlide[];
  /** Where Esc and the close button go. */
  closeHref: string;
};

const SWIPE_PX = 56;
const TAP_SLOP_PX = 10;
const noopSubscribe = () => () => {};

/**
 * False in the server HTML and while hydrating. The part mounts only after
 * it, so its entrance runs (the presence context would otherwise block the
 * first part's animations) and server and client markup never differ.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

const INTERACTIVE = "a,button,[role=button],input,textarea,select,label";

/**
 * The Retrospectiva (doc 02 §6.12): the parts one at a time, advanced by tap,
 * swipe, keys or buttons, never by a timer. The page stays mounted (hidden)
 * when the person leaves it, so a new visit starts over on the first part
 * through the router's `bfcacheId` and the browser's back button restores
 * where it was.
 */
export function RecapPlayer(props: RecapPlayerProps) {
  const { bfcacheId } = useRouter();
  return (
    <Fragment key={bfcacheId}>
      <Player {...props} />
    </Fragment>
  );
}

/**
 * Two soft shapes that peek in from the top and bottom edges, above the
 * progress bar and below the buttons where nothing sits, and move a little on every part: x as a
 * share of the shape, scale and how far each one shows.
 */
const DRIFT = [
  { a: [-10, -82, 1], b: [-100, 82, 1] },
  { a: [-120, -78, 0.85], b: [100, 84, 1.05] },
  { a: [-60, -84, 1.1], b: [-40, 80, 0.9] },
  { a: [-200, -80, 0.9], b: [140, 82, 1] },
  { a: [-30, -76, 1.05], b: [-160, 84, 0.95] },
] as const;

function Backdrop({ index }: { index: number }) {
  const drift = DRIFT[index % DRIFT.length] ?? DRIFT[0];
  const transition = { duration: RECAP_DRIFT_MS / 1000, ease: EASE_STANDARD };
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <m.div
        className="absolute top-0 right-0 size-28 rounded-full bg-primary-soft opacity-70"
        animate={{
          x: `${drift.a[0]}%`,
          y: `${drift.a[1]}%`,
          scale: drift.a[2],
        }}
        transition={transition}
      />
      <m.div
        className="absolute bottom-0 left-1/2 -ml-14 size-28 rounded-full bg-surface-2"
        animate={{
          x: `${drift.b[0]}%`,
          y: `${drift.b[1]}%`,
          scale: drift.b[2],
        }}
        transition={transition}
      />
    </div>
  );
}

function Progress({ index, total }: { index: number; total: number }) {
  return (
    <div aria-hidden="true" className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed segments
          key={i}
          className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3"
        >
          <m.div
            className="h-full origin-left rounded-full bg-primary"
            initial={false}
            animate={{ scaleX: i <= index ? 1 : 0 }}
            transition={{ duration: RECAP_SLIDE_MS / 1000, ease: EASE_ENTER }}
          />
        </div>
      ))}
    </div>
  );
}

function SlideView({
  slide,
  onRestart,
}: {
  slide: RecapSlide;
  onRestart: () => void;
}) {
  switch (slide.id) {
    case "intro":
      return <IntroSlide slide={slide} />;
    case "flow":
      return <FlowSlide slide={slide} />;
    case "left":
      return <LeftSlide slide={slide} />;
    case "days":
      return <DaysSlide slide={slide} />;
    case "categories":
      return <CategoriesSlide slide={slide} />;
    case "biggest":
      return <BiggestSlide slide={slide} />;
    case "comparison":
      return <ComparisonSlide slide={slide} />;
    case "budgets":
      return <BudgetsSlide slide={slide} />;
    case "next":
      return <NextSlide slide={slide} />;
    case "outro":
      return <OutroSlide slide={slide} onRestart={onRestart} />;
  }
}

function Player({
  userId,
  month,
  kicker,
  slides,
  closeHref,
}: RecapPlayerProps) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const hydrated = useHydrated();
  const changed = useRef(false);
  const [index, setIndex] = useState(0);
  const direction = useRef<1 | -1>(1);
  const frameRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const total = slides.length;
  const slide = slides[index] ?? slides[0];

  useEffect(() => {
    writeSeenMonth(userId, month);
    frameRef.current?.focus({ preventScroll: true });
  }, [userId, month]);

  const go = (action: RecapAction) => {
    const next = nextIndex(index, total, action);
    if (next === index) return;
    direction.current = next > index ? 1 : -1;
    changed.current = true;
    setIndex(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.closest("input,textarea,select") ||
      document.querySelector('[role="dialog"]') ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    const keys: Record<string, RecapAction> = {
      ArrowRight: "next",
      ArrowDown: "next",
      PageDown: "next",
      ArrowLeft: "prev",
      ArrowUp: "prev",
      PageUp: "prev",
      Home: "first",
      End: "last",
    };
    if (event.key === "Escape") {
      event.preventDefault();
      router.push(closeHref);
      return;
    }
    // Space and Enter keep their job on a button or a link.
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    go(action);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointer.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointer.current;
    pointer.current = null;
    if (!start || event.button > 0) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      go(dx < 0 ? "next" : "prev");
      return;
    }
    if (Math.hypot(dx, dy) >= TAP_SLOP_PX) return;
    const target = event.target as HTMLElement;
    if (target.closest(INTERACTIVE)) return;
    if (window.getSelection()?.toString()) return;
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    go(tapAction(event.clientX - box.left, box.width));
  };

  const fade = { duration: RECAP_REDUCED_FADE_MS / 1000 };
  const variants = {
    enter: (dir: number) => ({
      opacity: 0,
      x: reduce ? 0 : dir * RECAP_SHIFT_PX,
    }),
    center: {
      opacity: 1,
      x: 0,
      transition: reduce
        ? fade
        : { duration: RECAP_SLIDE_MS / 1000, ease: EASE_ENTER },
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: reduce ? 0 : dir * -RECAP_SHIFT_PX,
      transition: reduce
        ? fade
        : { duration: RECAP_EXIT_MS / 1000, ease: EASE_EXIT },
    }),
  };

  const first = index === 0;
  const last = index === total - 1;

  return (
    <RecapFrame
      ref={frameRef}
      tabIndex={-1}
      aria-roledescription="retrospectiva"
      aria-label={kicker}
      onKeyDown={onKeyDown}
      kicker={kicker}
      closeHref={closeHref}
      progress={<Progress index={index} total={total} />}
      backdrop={<Backdrop index={index} />}
      stageRef={stageRef}
      stageProps={{ onPointerDown, onPointerUp }}
      sidePrev={
        <IconButton
          label="Parte anterior"
          onClick={() => go("prev")}
          disabled={first}
          className="bg-surface-2"
        >
          <ChevronLeft aria-hidden="true" />
        </IconButton>
      }
      sideNext={
        <IconButton
          label="Próxima parte"
          onClick={() => go("next")}
          disabled={last}
          className="bg-surface-2"
        >
          <ChevronRight aria-hidden="true" />
        </IconButton>
      }
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => go("prev")}
            aria-hidden={first || undefined}
            tabIndex={first ? -1 : undefined}
            className={cn(first && "invisible")}
          >
            Voltar
          </Button>
          {last ? null : <Button onClick={() => go("next")}>Próximo</Button>}
        </>
      }
    >
      <h1 className="sr-only">{kicker}</h1>
      <AnimatePresence mode="wait" custom={direction.current}>
        {hydrated && slide ? (
          <m.div
            key={slide.id}
            custom={direction.current}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            role="group"
            aria-roledescription="parte"
            aria-label={`${index + 1} de ${total}: ${slide.title}`}
            data-slide={slide.id}
            className="flex flex-1 flex-col"
            onAnimationStart={(definition) => {
              if (definition !== "center" || !changed.current) return;
              stageRef.current
                ?.querySelector<HTMLElement>("[data-recap-title]")
                ?.focus({ preventScroll: true });
            }}
          >
            <SlideView slide={slide} onRestart={() => go("first")} />
          </m.div>
        ) : null}
      </AnimatePresence>
    </RecapFrame>
  );
}
