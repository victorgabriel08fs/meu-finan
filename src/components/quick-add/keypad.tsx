"use client";

import { Delete } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { CalcKey } from "./calculator";
import { HAPTIC, vibrate } from "./haptics";

type KeyDef = { key: CalcKey; label: string; spoken?: string };

// 4 × 4 layout of doc 02 §5.5.
const KEYS: KeyDef[] = [
  { key: "1", label: "1" },
  { key: "2", label: "2" },
  { key: "3", label: "3" },
  { key: "back", label: "⌫", spoken: "apagar" },
  { key: "4", label: "4" },
  { key: "5", label: "5" },
  { key: "6", label: "6" },
  { key: "+", label: "+", spoken: "mais" },
  { key: "7", label: "7" },
  { key: "8", label: "8" },
  { key: "9", label: "9" },
  { key: "−", label: "−", spoken: "menos" },
  { key: ",", label: ",", spoken: "vírgula" },
  { key: "0", label: "0" },
  { key: "00", label: "00", spoken: "zero zero" },
  { key: "=", label: "=", spoken: "igual" },
];

const OPERATOR_KEYS = new Set<CalcKey>(["back", "+", "−", "="]);
/** Holding ⌫ this long clears the whole amount. */
const CLEAR_HOLD_MS = 500;

type KeypadProps = {
  onKey: (key: CalcKey) => void;
  className?: string;
};

/**
 * On-screen calculator keypad (doc 02 §5.5): 52px keys with a 14px radius,
 * digits in title-2, operators on --primary-soft. Each key is a labelled
 * <button>; holding ⌫ clears everything.
 */
export function Keypad({ onKey, className }: KeypadProps) {
  const holdTimer = useRef<number | null>(null);
  const cleared = useRef(false);

  useEffect(
    () => () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    },
    [],
  );

  function startHold() {
    cleared.current = false;
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      cleared.current = true;
      vibrate(HAPTIC.success);
      onKey("clear");
    }, CLEAR_HOLD_MS);
  }

  function endHold() {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function press(key: CalcKey) {
    // The click that ends a long press on ⌫ must not delete once more.
    if (key === "back" && cleared.current) {
      cleared.current = false;
      return;
    }
    vibrate(HAPTIC.key);
    onKey(key);
  }

  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">Teclado numérico</legend>
      <div className="grid grid-cols-4 gap-2">
        {KEYS.map((item) => {
          const isOperator = OPERATOR_KEYS.has(item.key);
          const isBack = item.key === "back";
          return (
            <button
              key={item.key}
              type="button"
              aria-label={item.spoken}
              onClick={() => press(item.key)}
              onPointerDown={isBack ? startHold : undefined}
              onPointerUp={isBack ? endHold : undefined}
              onPointerLeave={isBack ? endHold : undefined}
              onPointerCancel={isBack ? endHold : undefined}
              onContextMenu={(event) => event.preventDefault()}
              className={cn(
                "flex h-13 items-center justify-center rounded-control text-title-2 select-none",
                "transition-[background-color,scale] duration-100 ease-standard active:scale-97",
                isOperator
                  ? "bg-primary-soft text-on-primary-soft active:brightness-95"
                  : "bg-surface-2 text-fg active:bg-surface-3",
              )}
            >
              {isBack ? (
                <Delete
                  aria-hidden="true"
                  className="size-6"
                  strokeWidth={1.9}
                />
              ) : (
                <span aria-hidden={item.spoken ? true : undefined}>
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
