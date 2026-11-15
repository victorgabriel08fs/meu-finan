"use client";

import { useEffect } from "react";
import { keyboardInset } from "./viewport-inset";

/** Phone sheets lift above the keyboard; from md up they are dialogs. */
const DIALOG_QUERY = "(min-width: 48rem)";
/** Fields that bring up the system keyboard. */
const KEYBOARD_FIELDS =
  "input:not([type='checkbox']):not([type='radio']):not([type='date']), textarea, [contenteditable='true']";

/**
 * Lifts a bottom sheet above the iOS keyboard (doc 02 §5.14, §7.4). Safari does
 * not shrink the layout for the keyboard (it ignores `interactive-widget`), so
 * the sheet reads `visualViewport` and, only while a keyboard covers the page,
 * sets `--sheet-kb` (inset), `--sheet-vvh` (visible height) and `data-keyboard`
 * on the element. Where the layout shrinks itself (Android) the inset is 0 and
 * nothing is set. Written to the element, not to React state: no re-render.
 */
export function useKeyboardInset(element: HTMLElement | null) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!element || !vv) return;
    let frame = 0;
    let had = false;

    const apply = () => {
      frame = 0;
      const inset = window.matchMedia(DIALOG_QUERY).matches
        ? 0
        : keyboardInset({
            layoutHeight: document.documentElement.clientHeight,
            viewportHeight: vv.height,
            offsetTop: vv.offsetTop,
            scale: vv.scale,
          });
      if (inset > 0) {
        element.style.setProperty("--sheet-kb", `${inset}px`);
        element.style.setProperty("--sheet-vvh", `${Math.round(vv.height)}px`);
        element.setAttribute("data-keyboard", "");
        if (!had) {
          const active = document.activeElement;
          if (
            active instanceof HTMLElement &&
            element.contains(active) &&
            active.matches(KEYBOARD_FIELDS)
          ) {
            requestAnimationFrame(() =>
              active.scrollIntoView({ block: "nearest" }),
            );
          }
        }
      } else {
        clear();
      }
      had = inset > 0;
    };
    const clear = () => {
      element.style.removeProperty("--sheet-kb");
      element.style.removeProperty("--sheet-vvh");
      element.removeAttribute("data-keyboard");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    apply();
    return () => {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
      clear();
    };
  }, [element]);
}
