"use client";

import { Lightbulb, Sparkles } from "lucide-react";
import {
  AnimatePresence,
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  type Box,
  inflate,
  placeBubble,
  roundedRectPath,
  type Tip,
  type TipSide,
} from "@/lib/tips";
import { cn } from "@/lib/utils";
import {
  COACH_MARK_ATTRIBUTE,
  cornerRadius,
  dialogOpen,
  usableBounds,
  visibleBox,
} from "./dom";

/** Room around the anchor inside the spotlight's hole. */
const PADDING = 6;
/** Height of the arrow (its base is twice as wide). */
const ARROW = 9;
/** From the hole's edge to the balloon's: the arrow plus a breath. */
const GAP = ARROW + 3;
/** Least distance from the balloon to the edges of the usable area. */
const MARGIN = 12;
/** Least distance from the arrow's centre to a corner of the balloon. */
const ARROW_INSET = 26;
const HOLE_SPRING = { type: "spring", stiffness: 420, damping: 40 } as const;
const DESKTOP_QUERY = "(min-width: 64rem)";

type CoachMarkProps = {
  tip: Tip;
  anchor: HTMLElement;
  /** Position in the sequence, from 1. */
  step: number;
  total: number;
  /** "Próxima"/"Entendi", a tap outside the balloon, Esc. */
  onNext: () => void;
  /** A tap on the anchor itself: seen, and the anchor does its job. */
  onAnchor: () => void;
  /** "Pular dicas": this one and the rest of the sequence. */
  onSkip: () => void;
  /** The anchor left the screen (scrolled away, covered, removed). */
  onLost: () => void;
};

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The desktop layout (sidebar, keyboard shortcuts) is on screen. */
function useDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/** "Dica 1 de 3", "Novidade", "Dica": the balloon's overline. */
export function tipLabel(tip: Tip, step: number, total: number): string {
  const kind = tip.kind === "novidade" ? "Novidade" : "Dica";
  return total > 1 ? `${kind} ${step} de ${total}` : kind;
}

/** Where the balloon starts its entrance: a few px towards the anchor. */
const ENTER_OFFSET: Record<TipSide, { x?: number; y?: number }> = {
  top: { y: 6 },
  bottom: { y: -6 },
  left: { x: 6 },
  right: { x: -6 },
};

/**
 * Coach mark (doc 02 §6.2, §6.16): a soft spotlight on the anchor and a
 * balloon whose arrow points at it. The dimmed area takes taps (a tap there
 * dismisses the tip); the hole lets them through to the anchor, which also
 * counts as "got it". The balloon follows the anchor on scroll, resize and
 * rotation, stays clear of the tab bar and the collapsed header, moves the
 * focus in and keeps Tab inside while open.
 */
export function CoachMark({
  tip,
  anchor,
  step,
  total,
  onNext,
  onAnchor,
  onSkip,
  onLost,
}: CoachMarkProps) {
  const reduceMotion = useReducedMotion();
  const desktop = useDesktop();
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onNext, onAnchor, onLost });
  useEffect(() => {
    callbacks.current = { onNext, onAnchor, onLost };
  });

  // Viewport size and the hole, as motion values: following the anchor on
  // scroll re-renders nothing.
  const viewWidth = useMotionValue(0);
  const viewHeight = useMotionValue(0);
  const holeX = useMotionValue(0);
  const holeY = useMotionValue(0);
  const holeWidth = useMotionValue(0);
  const holeHeight = useMotionValue(0);
  const holeRadius = useMotionValue(0);
  const bubbleX = useMotionValue(0);
  const bubbleY = useMotionValue(0);
  const arrowAt = useMotionValue(0);
  const [side, setSide] = useState<TipSide>("bottom");

  const hole = useMemo<HoleValues>(
    () => [holeX, holeY, holeWidth, holeHeight, holeRadius],
    [holeX, holeY, holeWidth, holeHeight, holeRadius],
  );
  const dimPath = useTransform(
    [viewWidth, viewHeight, ...hole],
    ([width, height, x, y, w, h, r]: number[]) =>
      `M0 0H${width}V${height}H0Z ${roundedRectPath(
        { left: x ?? 0, top: y ?? 0, width: w ?? 0, height: h ?? 0 },
        r ?? 0,
      )}`,
  );
  const ringPath = useTransform(hole, ([x, y, w, h, r]: number[]) =>
    roundedRectPath(
      { left: x ?? 0, top: y ?? 0, width: w ?? 0, height: h ?? 0 },
      r ?? 0,
    ),
  );

  // Track the anchor: a frame after any scroll, resize or size change, and a
  // few times a second for shifts nothing reports (content streaming above).
  const placed = useRef<HTMLElement | null>(null);
  const settling = useRef(0);
  useLayoutEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const dialog = dialogRef.current;
      const box = anchor.isConnected ? visibleBox(anchor) : null;
      if (!box || !dialog) {
        callbacks.current.onLost();
        return;
      }
      const target: Box = inflate(box, PADDING);
      const radius = Math.max(12, cornerRadius(anchor) + PADDING);
      viewWidth.set(document.documentElement.clientWidth);
      viewHeight.set(window.innerHeight);

      // A new anchor: the hole glides there (unless motion is reduced); the
      // same anchor moving (scroll) is followed exactly.
      const moved = placed.current !== null && placed.current !== anchor;
      placed.current = anchor;
      if (moved && !reduceMotion) settling.current = performance.now() + 450;
      const values = [
        [holeX, target.left],
        [holeY, target.top],
        [holeWidth, target.width],
        [holeHeight, target.height],
        [holeRadius, radius],
      ] as const;
      for (const [value, to] of values) {
        if (performance.now() < settling.current)
          animate(value, to, HOLE_SPRING);
        else value.jump(to);
      }

      const placement = placeBubble({
        anchor: target,
        bubble: { width: dialog.offsetWidth, height: dialog.offsetHeight },
        bounds: usableBounds(),
        gap: GAP,
        margin: MARGIN,
        arrowInset: ARROW_INSET,
        sides: tip.placement,
      });
      bubbleX.jump(Math.round(placement.left));
      bubbleY.jump(Math.round(placement.top));
      arrowAt.jump(Math.round(placement.arrow));
      setSide(placement.side);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    const viewport = window.visualViewport;
    window.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(anchor);
    if (dialogRef.current) observer.observe(dialogRef.current);
    const timer = window.setInterval(schedule, 300);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [
    anchor,
    tip.placement,
    reduceMotion,
    arrowAt,
    bubbleX,
    bubbleY,
    holeX,
    holeY,
    holeWidth,
    holeHeight,
    holeRadius,
    viewWidth,
    viewHeight,
  ]);

  // The focus moves into the balloon with each tip.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus when the tip changes
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, [tip.id]);

  // A tap on the anchor goes through the hole and counts as "got it"; Esc
  // dismisses; Tab from anywhere else comes back into the balloon. They
  // listen on the document, in the capture phase, so the anchor still does
  // what it does.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.target instanceof Node && anchor.contains(event.target)) {
        callbacks.current.onAnchor();
      }
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        callbacks.current.onNext();
        return;
      }
      const dialog = dialogRef.current;
      const active = document.activeElement;
      if (
        event.key !== "Tab" ||
        !dialog ||
        (active && dialog.contains(active)) ||
        dialogOpen()
      ) {
        return;
      }
      event.preventDefault();
      const buttons = dialog.querySelectorAll("button");
      (event.shiftKey ? buttons[buttons.length - 1] : buttons[0])?.focus();
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [anchor]);

  // Tab stays inside the balloon (its buttons), like in a dialog.
  function keepFocusInside(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const buttons = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>("button") ?? []),
    ];
    const first = buttons[0];
    const last = buttons.at(-1);
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const more = step < total;
  const Icon = tip.kind === "novidade" ? Sparkles : Lightbulb;
  const body = desktop && tip.desktopBody ? tip.desktopBody : tip.body;

  return createPortal(
    <div
      {...{ [COACH_MARK_ATTRIBUTE]: "" }}
      className="pointer-events-none fixed inset-0 z-40"
    >
      <motion.svg
        aria-hidden="true"
        className="absolute inset-0 size-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.16 } }}
        transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
      >
        {/* The dimmed area takes the tap; the hole (evenodd) lets it through. */}
        <motion.path
          d={dimPath}
          fillRule="evenodd"
          className="pointer-events-auto fill-[color-mix(in_srgb,var(--scrim)_72%,transparent)]"
          onClick={() => callbacks.current.onNext()}
        />
        <motion.path
          d={ringPath}
          fill="none"
          strokeWidth={2}
          className="stroke-primary/70"
        />
        {reduceMotion ? null : <Pulse key={tip.id} hole={hole} />}
      </motion.svg>

      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={keepFocusInside}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
        style={{ x: bubbleX, y: bubbleY }}
        className="pointer-events-auto absolute top-0 left-0 w-[min(21rem,calc(100vw-1.5rem))] outline-none"
      >
        <AnimatePresence mode="wait" initial>
          <motion.div
            key={tip.id}
            initial={{ opacity: 0, scale: 0.96, ...ENTER_OFFSET[side] }}
            animate={{
              opacity: 1,
              scale: 1,
              x: 0,
              y: 0,
              transition: { duration: 0.24, ease: [0.05, 0.7, 0.1, 1] },
            }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="relative rounded-card bg-surface px-4 pt-3.5 pb-3 text-fg shadow-dialog"
          >
            <Arrow side={side} at={arrowAt} />
            <p className="flex items-center gap-1.5 text-overline text-primary uppercase">
              <Icon
                aria-hidden="true"
                className="size-3.5"
                strokeWidth={2.25}
              />
              {tipLabel(tip, step, total)}
            </p>
            <h2 id={titleId} className="mt-1.5 text-headline text-fg">
              {tip.title}
            </h2>
            <p id={bodyId} className="mt-1 text-callout text-pretty text-fg-2">
              {body}
            </p>
            <div className="mt-3 flex items-center justify-end gap-2">
              {more ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mr-auto -ml-2 text-fg-2 hover:bg-surface-2"
                  onClick={onSkip}
                >
                  Pular dicas
                </Button>
              ) : null}
              <Button size="sm" className="min-w-24" onClick={onNext}>
                {more ? "Próxima" : "Entendi"}
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>,
    document.body,
  );
}

type HoleValues = [
  MotionValue<number>,
  MotionValue<number>,
  MotionValue<number>,
  MotionValue<number>,
  MotionValue<number>,
];

/** One ring that grows out of the hole and fades: "here". */
function Pulse({ hole }: { hole: HoleValues }) {
  const progress = useMotionValue(0);
  const d = useTransform([progress, ...hole], ([p, x, y, w, h, r]: number[]) =>
    roundedRectPath(
      inflate(
        { left: x ?? 0, top: y ?? 0, width: w ?? 0, height: h ?? 0 },
        (p ?? 0) * 10,
      ),
      (r ?? 0) + (p ?? 0) * 10,
    ),
  );
  const opacity = useTransform(progress, [0, 1], [0.55, 0]);
  useEffect(() => {
    const controls = animate(progress, 1, {
      duration: 0.9,
      delay: 0.25,
      ease: [0.2, 0, 0, 1],
    });
    return () => controls.stop();
  }, [progress]);
  return (
    <motion.path
      d={d}
      fill="none"
      strokeWidth={2}
      className="stroke-primary"
      style={{ opacity }}
    />
  );
}

/**
 * The balloon's arrow on the edge facing the anchor, `at` px along it. It
 * overlaps the balloon by a pixel to hide the seam of the dark-theme ring.
 */
function Arrow({ side, at }: { side: TipSide; at: MotionValue<number> }) {
  const offset = useTransform(at, (value) => value - ARROW);
  const vertical = side === "top" || side === "bottom";
  const shape = {
    top: {
      d: `M0 0L${ARROW} ${ARROW}L${2 * ARROW} 0`,
      place: "top-full -mt-px",
    },
    bottom: {
      d: `M0 ${ARROW}L${ARROW} 0L${2 * ARROW} ${ARROW}`,
      place: "bottom-full -mb-px",
    },
    left: {
      d: `M0 0L${ARROW} ${ARROW}L0 ${2 * ARROW}`,
      place: "left-full -ml-px",
    },
    right: {
      d: `M${ARROW} 0L0 ${ARROW}L${ARROW} ${2 * ARROW}`,
      place: "right-full -mr-px",
    },
  }[side];
  return (
    <motion.svg
      aria-hidden="true"
      width={vertical ? 2 * ARROW : ARROW}
      height={vertical ? ARROW : 2 * ARROW}
      style={vertical ? { left: offset } : { top: offset }}
      className={cn("absolute overflow-visible", shape.place)}
    >
      <path d={`${shape.d}Z`} className="fill-surface" />
      <path
        d={shape.d}
        fill="none"
        className="stroke-transparent dark:stroke-white/6"
      />
    </motion.svg>
  );
}
