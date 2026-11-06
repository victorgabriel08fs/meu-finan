"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";

type FitLabelsProps = {
  className?: string;
  ariaHidden?: boolean;
  children: ReactNode;
};

/**
 * Hides the labels that would run into another one (axis and point labels
 * sit at fixed positions in %, but their width follows the text size and the
 * chart's width). Children mark a label with `data-fit` and a `data-priority`
 * (higher stays first); the survivors are chosen greedily by priority, then by
 * order, from the real boxes, so it holds at any width and text size. Hidden
 * with `visibility`, so nothing moves. The chart itself stays static markup.
 */
export function FitLabels({ className, ariaHidden, children }: FitLabelsProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const fit = () => {
      const labels = [...root.querySelectorAll<HTMLElement>("[data-fit]")];
      for (const label of labels) label.style.visibility = "";
      const ordered = labels
        .map((label, order) => ({
          label,
          order,
          priority: Number(label.dataset.priority ?? 0),
        }))
        .sort((a, b) => b.priority - a.priority || a.order - b.order);
      const kept: DOMRect[] = [];
      const gap = 4;
      for (const { label } of ordered) {
        const box = label.getBoundingClientRect();
        const clash = kept.some(
          (other) =>
            box.left < other.right + gap &&
            box.right + gap > other.left &&
            box.top < other.bottom &&
            box.bottom > other.top,
        );
        if (clash) label.style.visibility = "hidden";
        else kept.push(box);
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      aria-hidden={ariaHidden ? "true" : undefined}
    >
      {children}
    </div>
  );
}
