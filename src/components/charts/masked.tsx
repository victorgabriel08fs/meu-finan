import type { ReactNode } from "react";

/**
 * A value drawn outside <Money> (axis ticks, direct labels) that privacy mode
 * hides like <Money> does: CSS swaps it for dots through <html data-privacy>.
 */
export function Masked({
  children,
  mask = "••••",
}: {
  children: ReactNode;
  mask?: string;
}) {
  return (
    <>
      <span data-privacy-value="">{children}</span>
      <span data-privacy-mask="" aria-label="valor oculto" role="img">
        <span aria-hidden="true">{mask}</span>
      </span>
    </>
  );
}
