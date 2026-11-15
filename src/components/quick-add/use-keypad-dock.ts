"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { keypadFits } from "@/components/ui/viewport-inset";

/** Space the scrolling middle keeps (3rem) for the keypad to count as fitting. */
const MIN_MIDDLE_REM = 3;
/** The system keyboard closing must not switch mode mid-animation. */
const DEBOUNCE_MS = 200;

/**
 * Whether the on-screen keypad fits docked in the footer (true) or must sit
 * under the amount with the whole sheet scrolling (false). Measured only while
 * the keypad shows, then the last answer stands. `topRef` goes on the sheet's
 * `top` block; the panel, header and footer are found from it. Elements are
 * state, not refs: the sheet content mounts after this component.
 */
export function useKeypadDock(active: boolean) {
  const [top, setTop] = useState<HTMLDivElement | null>(null);
  const [docked, setDocked] = useState(true);
  const dockedRef = useRef(true);
  const topRef = useCallback((element: HTMLDivElement | null) => {
    if (element) setTop(element);
  }, []);

  useLayoutEffect(() => {
    if (!active || !top) return;
    const panel = top.closest<HTMLElement>('[data-slot="sheet-panel"]');
    const header = panel?.querySelector<HTMLElement>(
      '[data-slot="sheet-header"]',
    );
    const footer = panel?.querySelector<HTMLElement>(
      '[data-slot="sheet-footer"]',
    );
    if (!panel || !header || !footer) return;

    const measure = () => {
      const rem = Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      const fits = keypadFits({
        panel: panel.clientHeight,
        header: header.offsetHeight,
        top: top.offsetHeight,
        footer: footer.offsetHeight,
        minMiddle: MIN_MIDDLE_REM * rem,
        wasFitting: dockedRef.current,
      });
      dockedRef.current = fits;
      setDocked(fits);
    };
    measure();

    let timer: number | undefined;
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, DEBOUNCE_MS);
    };
    const observer = new ResizeObserver(later);
    for (const element of [panel, header, top, footer]) {
      observer.observe(element);
    }
    window.visualViewport?.addEventListener("resize", later);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", later);
    };
  }, [active, top]);

  return { docked, top, topRef };
}
