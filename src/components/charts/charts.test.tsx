import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable } from "./data-table";
import { GroupedColumnChart } from "./grouped-column-chart";
import { LineChart } from "./line-chart";
import { niceTicks } from "./scale";
import { Sparkline } from "./sparkline";
import { SplitBar } from "./split-bar";
import { StackedAreaChart } from "./stacked-area-chart";

describe("StackedAreaChart", () => {
  const render = (selected: number) =>
    renderToStaticMarkup(
      <StackedAreaChart
        layers={[
          {
            key: "a",
            label: "Investido",
            color: "var(--chart-1)",
            values: [0, 10, 20, 30],
          },
          {
            key: "b",
            label: "Juros",
            color: "var(--chart-3)",
            values: [0, 1, 3, 6],
          },
        ]}
        stops={[0, 3]}
        selected={selected}
        onSelectedChange={() => {}}
        scrubLabel="Percorrer o gráfico"
        valueText={(index) => `ponto ${index}`}
        ticks={niceTicks(0, 36, 3)}
        formatTick={(value) => String(value)}
        xLabels={[
          { position: 0, label: "hoje" },
          { position: 1, label: "3 meses" },
        ]}
        marker={{ index: 2, label: "juros > aporte" }}
      />,
    );

  it("scrubs with a range input that speaks the selected point", () => {
    const html = render(1);
    expect(html).toContain('type="range"');
    expect(html).toContain('aria-valuetext="ponto 1"');
    expect(html).toContain('max="1"');
    expect(html).toContain("juros &gt; aporte");
    expect(html).toContain("vector-effect");
  });

  it("clamps an out-of-range selection", () => {
    expect(render(9)).toContain('aria-valuetext="ponto 1"');
  });
});

describe("GroupedColumnChart", () => {
  it("renders one pressed button per group and marks the partial month", () => {
    const html = renderToStaticMarkup(
      <GroupedColumnChart
        label="Receitas e despesas"
        series={[
          { key: "i", label: "Receitas", color: "var(--chart-3)" },
          { key: "e", label: "Despesas", color: "var(--chart-2)" },
        ]}
        groups={[
          { key: "09", label: "set", values: [100, 80] },
          { key: "10", label: "out", partial: true, values: [100, 10] },
        ]}
        selected={0}
        onSelect={() => {}}
        ticks={niceTicks(0, 100)}
        formatTick={(value) => String(value)}
        describeGroup={(index) => `grupo ${index}`}
      />,
    );
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="grupo 1"');
    expect(html).toContain("out*");
    expect(html).toContain('role="toolbar"');
  });
});

describe("LineChart", () => {
  it("is an image with a summary and labels only the chosen points", () => {
    const html = renderToStaticMarkup(
      <LineChart
        values={[0.1, null, 0.3]}
        ticks={niceTicks(0, 0.3, 2)}
        formatTick={(value) => `${value}`}
        labels={[{ index: 2, text: "set 30%" }]}
        xLabels={[{ position: 0, label: "jul" }]}
        summary="Resumo"
      />,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Resumo"');
    expect(html).toContain("set 30%");
  });
});

describe("Sparkline and SplitBar", () => {
  it("draws a sparkline with an end dot", () => {
    const html = renderToStaticMarkup(
      <Sparkline values={[1, 3, 2]} summary="Subiu" />,
    );
    expect(html).toContain('aria-label="Subiu"');
    expect(html).toContain("left:100%");
  });

  it("splits a bar by share and skips empty segments", () => {
    const html = renderToStaticMarkup(
      <SplitBar
        summary="Investido 75%; juros 25%"
        segments={[
          { key: "a", value: 75, color: "var(--chart-1)" },
          { key: "b", value: 25, color: "var(--chart-3)" },
          { key: "c", value: 0, color: "var(--chart-2)" },
        ]}
      />,
    );
    expect(html).toContain("width:75%");
    expect(html).toContain("width:25%");
    expect(html).not.toContain("width:0%");
  });
});

describe("DataTable", () => {
  it("renders row headers and a caption", () => {
    const html = renderToStaticMarkup(
      <DataTable
        caption="Tabela"
        columns={[
          { key: "m", header: "Mês", align: "start" },
          { key: "v", header: "Valor", align: "end" },
        ]}
        rows={[{ key: "1", header: "out", cells: ["R$ 1"], strongLast: true }]}
      />,
    );
    expect(html).toContain("<caption");
    expect(html).toContain('scope="row"');
    expect(html).toContain("font-bold");
  });
});
