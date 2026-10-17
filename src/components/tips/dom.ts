import { type Box, intersect } from "@/lib/tips";

/**
 * What the tip balloon reads from the page (browser only): where the anchors
 * are, how much of the viewport is usable, and whether this is a good moment
 * to show a tip at all.
 */

/** Root of the balloon and its spotlight: ignored by every check below. */
export const COACH_MARK_ATTRIBUTE = "data-coach-mark";

const TAB_BAR = '[data-slot="tab-bar"]';

function viewport(): Box {
  return {
    left: 0,
    top: 0,
    width: document.documentElement.clientWidth,
    height: window.innerHeight,
  };
}

type Insets = { top: number; bottom: number; key: string };
let insetsCache: Insets | null = null;

/**
 * Top and bottom insets of the device (notch, home indicator), in px. They
 * only change with the viewport (rotation), so they are measured once per
 * size: this runs on every scroll frame.
 */
function safeAreaInsets(): Insets {
  const key = `${window.innerWidth}x${window.innerHeight}`;
  if (insetsCache?.key === key) return insetsCache;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
  document.body.append(probe);
  const style = getComputedStyle(probe);
  insetsCache = {
    top: Number.parseFloat(style.paddingTop) || 0,
    bottom: Number.parseFloat(style.paddingBottom) || 0,
    key,
  };
  probe.remove();
  return insetsCache;
}

/**
 * The part of the viewport the balloon may use: below the status bar and the
 * collapsed page header, above the tab bar (phones and tablets).
 */
export function usableBounds(): Box {
  const area = viewport();
  const insets = safeAreaInsets();
  let top = insets.top;
  let bottom = area.height - insets.bottom;
  const bar = document.querySelector(
    '[data-slot="page-header"] [data-collapsed]',
  );
  if (bar) top = Math.max(top, bar.getBoundingClientRect().bottom);
  const tabBar = document.querySelector(TAB_BAR);
  if (tabBar) {
    const rect = tabBar.getBoundingClientRect();
    if (rect.height > 0 && rect.top < area.height) {
      bottom = Math.min(bottom, rect.top);
    }
  }
  return { left: 0, top, width: area.width, height: Math.max(0, bottom - top) };
}

/** Topmost element at a point, looking through the balloon and spotlight. */
function hitAt(x: number, y: number): Element | null {
  return (
    document
      .elementsFromPoint(x, y)
      .find((node) => !node.closest(`[${COACH_MARK_ATTRIBUTE}]`)) ?? null
  );
}

/**
 * The part of an anchor on screen, or null when it is hidden, mostly off
 * screen or covered (by the tab bar, the collapsed header, anything). An
 * anchor inside the tab bar counts against the whole viewport.
 */
export function visibleBox(element: Element): Box | null {
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const area = element.closest(TAB_BAR) ? viewport() : usableBounds();
  const visible = intersect(rect, area);
  if (
    !visible ||
    visible.width * visible.height < 0.6 * rect.width * rect.height
  )
    return null;
  const hit = hitAt(
    visible.left + visible.width / 2,
    visible.top + visible.height / 2,
  );
  return hit && (hit === element || element.contains(hit)) ? visible : null;
}

export type FoundAnchor = { element: HTMLElement; box: Box };

/** The first element with `data-tip="<name>"` that is on screen. */
export function findAnchor(name: string): FoundAnchor | null {
  const candidates = document.querySelectorAll<HTMLElement>(
    `[data-tip="${CSS.escape(name)}"]`,
  );
  for (const element of candidates) {
    const box = visibleBox(element);
    if (box) return { element, box };
  }
  return null;
}

/** Corner radius of the anchor in px (for a hole that hugs its shape). */
export function cornerRadius(element: Element): number {
  const value = getComputedStyle(element).borderTopLeftRadius;
  const rect = element.getBoundingClientRect();
  if (value.endsWith("%")) {
    return (Number.parseFloat(value) / 100) * Math.min(rect.width, rect.height);
  }
  return Number.parseFloat(value) || 0;
}

/** A dialog or sheet of the app is open (not the balloon itself). */
export function dialogOpen(): boolean {
  const dialogs = document.querySelectorAll(
    '[role="dialog"], [role="alertdialog"], dialog[open]',
  );
  for (const dialog of dialogs) {
    if (dialog.closest(`[${COACH_MARK_ATTRIBUTE}]`)) continue;
    if (dialog.getAttribute("data-state") === "closed") continue;
    if (dialog.getClientRects().length > 0) return true;
  }
  return false;
}

/** The user is typing somewhere: never pull the focus away. */
function typing(): boolean {
  const active = document.activeElement;
  if (!active || active.closest(`[${COACH_MARK_ATTRIBUTE}]`)) return false;
  return Boolean(
    active.closest('input, textarea, select, [contenteditable="true"]'),
  );
}

/**
 * A tip may show: the tab is visible, the page finished streaming (no
 * skeleton left), the fonts are in (anchors stop moving), no sheet, dialog or
 * toast is on screen and nobody is typing.
 */
export function readyForTips(): boolean {
  if (document.visibilityState !== "visible") return false;
  if (document.fonts && document.fonts.status !== "loaded") return false;
  const main = document.getElementById("conteudo");
  if (!main || main.querySelector('[data-slot="skeleton"]')) return false;
  if (dialogOpen() || typing()) return false;
  return !document.querySelector(
    '[data-sonner-toast]:not([data-removed="true"])',
  );
}
