"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Segmented control (doc 02 §5.13): 40px track in --surface-2; the thumb
 * (--thumb + shadow-thumb: --surface in light, lighter than the track in dark)
 * slides between options (selection spring, motion `layoutId`).
 * 2–4 options; labels in callout 600.
 */

const SELECTION_SPRING = {
  type: "spring",
  stiffness: 500,
  damping: 38,
} as const;

const trackClass = "flex h-10 w-full rounded-xl bg-surface-2 p-1";
const segmentClass =
  "relative flex h-full min-w-0 flex-1 items-center justify-center gap-1.5 rounded-chip px-3 text-callout font-semibold transition-colors duration-150 ease-standard [&_svg]:size-4 [&_svg]:shrink-0";
const thumbClass = "absolute inset-0 rounded-chip bg-thumb shadow-thumb";

export type SegmentedOption = {
  value: string;
  label: string;
  icon?: ReactNode;
};

type SegmentedControlProps = {
  options: SegmentedOption[];
  /** Selected value; `undefined` while it is unknown (e.g. before hydration). */
  value: string | undefined;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  /**
   * Icons only (each option needs one): a 36px track for toolbars and the
   * sidebar. The label stays the accessible name and the tooltip.
   */
  iconOnly?: boolean;
  className?: string;
};

/** Value picker with radiogroup semantics; arrow keys, Home and End move it. */
export function SegmentedControl({
  options,
  value,
  onValueChange,
  ariaLabel,
  iconOnly = false,
  className,
}: SegmentedControlProps) {
  const layoutId = `segmented-thumb-${useId()}`;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const focusIndex = selectedIndex === -1 ? 0 : selectedIndex;

  function select(index: number) {
    const option = options[index];
    if (!option) return;
    onValueChange(option.value);
    buttons.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = options.length - 1;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        select(focusIndex === last ? 0 : focusIndex + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        select(focusIndex === 0 ? last : focusIndex - 1);
        break;
      case "Home":
        select(0);
        break;
      case "End":
        select(last);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(trackClass, iconOnly && "h-9 w-auto", className)}
    >
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a styled radio with a sliding thumb; keyboard handled by the group
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === focusIndex ? 0 : -1}
            title={iconOnly ? option.label : undefined}
            onClick={() => onValueChange(option.value)}
            className={cn(
              segmentClass,
              iconOnly && "w-9 flex-none px-0",
              selected ? "text-fg" : "text-fg-2 hover:text-fg",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={layoutId}
                transition={SELECTION_SPRING}
                className={thumbClass}
              />
            ) : null}
            <span className="relative flex min-w-0 items-center gap-1.5">
              {option.icon}
              <span className={iconOnly ? "sr-only" : "truncate"}>
                {option.label}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export type SegmentedLink = { href: string; label: string };

type SegmentedLinksProps = {
  items: SegmentedLink[];
  /** href of the current section; `null` renders no selection. */
  activeHref: string | null;
  ariaLabel: string;
  className?: string;
};

/**
 * Route-based tabs with the same look (e.g. Orçamentos · Metas · Simulador).
 * Render it from a shared layout so the thumb slides between pages; see
 * RouteTabs for the variant that reads the pathname itself.
 */
export function SegmentedLinks({
  items,
  activeHref,
  ariaLabel,
  className,
}: SegmentedLinksProps) {
  const layoutId = `segmented-links-thumb-${useId()}`;
  return (
    <nav aria-label={ariaLabel} className={className}>
      <ul className={trackClass}>
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <li key={item.href} className="flex min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  segmentClass,
                  active ? "text-fg" : "text-fg-2 hover:text-fg",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId={layoutId}
                    transition={SELECTION_SPRING}
                    className={thumbClass}
                  />
                ) : null}
                <span className="relative truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
