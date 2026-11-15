/** Pure measures behind the sheet's keyboard handling (no DOM). */

/** Above this the page is pinch-zoomed: the visual viewport is not the keyboard. */
const ZOOMED = 1.01;

/**
 * Height the on-screen keyboard covers of the layout viewport, from the visual
 * viewport. Safari on iOS keeps the layout viewport and lays the keyboard over
 * it (and may scroll the page: `offsetTop`), so the inset is what lies below
 * the visual viewport. Where the layout shrinks with the keyboard (Android
 * `resizes-content`) both heights match: 0, so nothing is counted twice.
 */
export function keyboardInset({
  layoutHeight,
  viewportHeight,
  offsetTop,
  scale,
}: {
  layoutHeight: number;
  viewportHeight: number;
  offsetTop: number;
  scale: number;
}): number {
  if (scale > ZOOMED) return 0;
  const inset = layoutHeight - (viewportHeight + offsetTop);
  return inset < 1 ? 0 : Math.round(inset);
}

/** Changing mode needs more than this many px beyond the limit (no flicker). */
const HYSTERESIS = 8;

/**
 * Whether the on-screen keypad fits in the footer: the panel keeps `minMiddle`
 * px for the scrolling middle after header, fixed top and footer. Between 8 px
 * short and exactly enough the previous answer stands.
 */
export function keypadFits({
  panel,
  header,
  top,
  footer,
  minMiddle,
  wasFitting,
}: {
  panel: number;
  header: number;
  top: number;
  footer: number;
  minMiddle: number;
  wasFitting: boolean;
}): boolean {
  const slack = panel - header - top - footer - minMiddle;
  if (slack >= 0) return true;
  if (slack < -HYSTERESIS) return false;
  return wasFitting;
}
