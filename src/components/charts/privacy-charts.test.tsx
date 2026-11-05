import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { niceTicks } from "./scale";
import { SeriesChart } from "./series-chart";

// Privacy mode on, as after the store rehydrates on a device that hid the
// values (the server always renders it off).
vi.mock("@/stores/privacy", () => ({
  usePrivacyStore: (select: (state: { hidden: boolean }) => unknown) =>
    select({ hidden: true }),
}));

describe("SeriesChart in privacy mode", () => {
  it("speaks the scrub's position without amounts", () => {
    const html = renderToStaticMarkup(
      <SeriesChart
        segments={[{ key: "a", values: [100, 200, 300] }]}
        ticks={niceTicks(0, 300, 3)}
        formatTick={(value) => String(value)}
        xLabels={[]}
        summary="Saldo de R$ 3 hoje"
        hiddenSummary="Saldo de valor oculto hoje"
        scrub={{
          selected: 1,
          onSelectedChange: () => {},
          label: "Percorrer o saldo",
          valueText: (index) => `dia ${index + 1}: saldo R$ 2`,
          hiddenValueText: (index) => `dia ${index + 1}: saldo valor oculto`,
        }}
      />,
    );
    // An attribute CSS cannot swap: chosen by the privacy store.
    expect(html).toContain('aria-valuetext="dia 2: saldo valor oculto"');
    expect(html).not.toContain("saldo R$ 2");
    // The summary is a CSS pair either way.
    expect(html).toContain(
      '<span data-privacy-mask="">Saldo de valor oculto hoje</span>',
    );
  });
});
