import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CalendarHeatmap,
  type HeatmapDay,
  HeatmapLegend,
} from "./calendar-heatmap";
import { niceTicks } from "./scale";
import { SeriesChart } from "./series-chart";

describe("SeriesChart", () => {
  const ticks = niceTicks(0, 300, 3);

  it("is an image with a summary when it has no scrub", () => {
    const html = renderToStaticMarkup(
      <SeriesChart
        segments={[{ key: "a", values: [100, 200, 300], area: true }]}
        ticks={ticks}
        formatTick={(value) => String(value)}
        xLabels={[
          { position: 0, label: "set/25" },
          { position: 1, label: "hoje" },
        ]}
        summary="Patrimônio subiu"
        highlight={1}
      />,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Patrimônio subiu"');
    // The area wash and the highlighted point.
    expect(html).toContain('fill-opacity="0.12"');
    expect(html).toContain("left:50%");
    expect(html).toContain("hoje");
    expect(html).not.toContain('type="range"');
  });

  it("draws the projection dashed, from the realized value of the same day", () => {
    const html = renderToStaticMarkup(
      <SeriesChart
        segments={[
          { key: "realizado", values: [300, 200, null, null, null] },
          {
            key: "previsto",
            values: [null, 150, 150, 100, 120],
            dashed: true,
            joinFrom: 200,
          },
        ]}
        ticks={ticks}
        formatTick={(value) => String(value)}
        xLabels={[]}
        markers={[
          { index: 3, value: 100, label: "Aluguel", placement: "below" },
        ]}
        summary="Resumo"
        scrub={{
          selected: 3,
          onSelectedChange: () => {},
          label: "Percorrer o saldo",
          valueText: (index) => `dia ${index + 1}`,
        }}
      />,
    );
    expect(html.match(/stroke-dasharray="5 4"/g)).toHaveLength(1);
    // x = 1/4 of the width: the vertical join from 200 down to 150.
    expect(html).toContain("M250 333.33 L250 500 L500 500");
    expect(html).toContain("Aluguel");
    expect(html).toContain("translate(-50%, 8px)");
    expect(html).toContain('type="range"');
    expect(html).toContain('aria-valuetext="dia 4"');
    expect(html).toContain('aria-label="Percorrer o saldo"');
    expect(html).toMatch(/aria-describedby="[^"]+"/);
    expect(html).not.toContain('role="img"');
  });

  it("clamps the scrub and survives a single point", () => {
    const html = renderToStaticMarkup(
      <SeriesChart
        segments={[{ key: "a", values: [42] }]}
        ticks={niceTicks(0, 42)}
        formatTick={(value) => String(value)}
        xLabels={[{ position: 0, label: "hoje" }]}
        summary="Um ponto"
        scrub={{
          selected: 9,
          onSelectedChange: () => {},
          label: "Percorrer",
          valueText: (index) => `ponto ${index}`,
        }}
      />,
    );
    expect(html).toContain('aria-valuetext="ponto 0"');
    expect(html).toContain("left:50%");
  });
});

describe("CalendarHeatmap", () => {
  // 1/out/2026 is a Thursday: four padding cells before it.
  const days: HeatmapDay[] = [
    {
      date: "2026-10-01",
      label: "1",
      level: 0,
      description: "1º de outubro: sem despesas",
    },
    {
      date: "2026-10-02",
      label: "2",
      level: 3,
      description: "2 de outubro: R$ 50 em 1 despesa",
    },
    {
      date: "2026-10-03",
      label: "3",
      level: 5,
      description: "3 de outubro, hoje: R$ 90 em 2 despesas",
      today: true,
    },
    {
      date: "2026-10-04",
      label: "4",
      level: 0,
      description: "4 de outubro: 1 despesa agendada, R$ 120",
      future: true,
      marked: true,
    },
  ];

  const render = (selected: string | null) =>
    renderToStaticMarkup(
      <CalendarHeatmap
        days={days}
        selected={selected}
        onSelect={() => {}}
        caption="Gastos por dia em outubro de 2026"
      />,
    );

  it("lays the days out under the weekday headers, Sunday first", () => {
    const html = render(null);
    expect(html).toContain("<caption");
    expect(html).toContain('abbr="domingo"');
    expect(html.indexOf(">dom<")).toBeLessThan(html.indexOf(">sáb<"));
    // 4 empty cells before Thursday the 1st; Sunday the 4th starts a second
    // week, completed with 6 more.
    expect(html.match(/<td class="p-0"><\/td>/g)).toHaveLength(10);
    expect(html.match(/<tr>/g)).toHaveLength(3);
  });

  it("names every day and keeps only one in the tab order", () => {
    const html = render("2026-10-02");
    expect(html).toContain('aria-label="2 de outubro: R$ 50 em 1 despesa"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toMatch(/tabindex="0"[^>]*aria-label="2 de outubro/);
    expect(html).toContain('aria-current="date"');
    expect(html).toContain(">hoje<");
  });

  it("fills spending days, outlines empty ones and hatches the days to come", () => {
    const html = render(null);
    expect(html).toContain("background-color:var(--primary)");
    expect(html).toContain("color-mix(in oklab, var(--primary) 50%");
    expect(html).toContain("bg-hatch");
    expect(html).toContain("border border-border");
    // Today is outlined, and the tab stop when nothing is selected.
    expect(html).toMatch(
      /aria-label="3 de outubro[^"]*"[^>]*class="[^"]*ring-border-strong/,
    );
    expect(html).toMatch(/tabindex="0"[^>]*aria-label="3 de outubro/);
  });

  it("rings the selected day over today's outline", () => {
    const html = render("2026-10-03");
    expect(html).toMatch(
      /aria-label="3 de outubro[^"]*"[^>]*class="[^"]*ring-fg ring-offset-2/,
    );
    expect(html).not.toContain("ring-border-strong");
  });

  it("has a legend from less to more", () => {
    const html = renderToStaticMarkup(<HeatmapLegend />);
    expect(html).toContain("menos");
    expect(html).toContain("mais");
    expect(html).toContain("sem gastos");
    expect(html).toContain("a vir");
  });
});
