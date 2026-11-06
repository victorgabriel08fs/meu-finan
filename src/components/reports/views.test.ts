import { describe, expect, it } from "vitest";
import {
  calendarDayLabel,
  dayMonthLabel,
  weekdayDateLabel,
} from "./day-labels";
import {
  clampReportMonth,
  monthViewHref,
  parseMonthParam,
  periodHref,
  periodViewHref,
  REPORT_VIEWS,
  reportViewAt,
  reportViewHref,
} from "./views";

const view = (label: string) => {
  const found = REPORT_VIEWS.find((item) => item.label === label);
  if (!found) throw new Error(label);
  return found;
};

describe("report views", () => {
  it("lists the five views of doc 02 §6.12 in order", () => {
    expect(REPORT_VIEWS.map((item) => item.label)).toEqual([
      "Visão geral",
      "Categorias",
      "Fluxo",
      "Patrimônio",
      "Calendário",
    ]);
    expect(
      REPORT_VIEWS.filter((item) => item.filter === "month").map(
        (item) => item.path,
      ),
    ).toEqual(["/relatorios/fluxo", "/relatorios/calendario"]);
  });

  it("finds the view on screen", () => {
    expect(reportViewAt("/relatorios/fluxo")?.label).toBe("Fluxo");
    expect(reportViewAt("/relatorios/categorias/abc")?.label).toBe(
      "Categorias",
    );
    expect(reportViewAt("/relatorios")).toBeNull();
    expect(reportViewAt("/relatorios/fluxo-extra")).toBeNull();
  });

  it("keeps ?periodo= between period views and ?mes= in every view", () => {
    const current = { periodo: "3", mes: "2026-09" };
    expect(reportViewHref(view("Patrimônio"), current)).toBe(
      "/relatorios/patrimonio?periodo=3&mes=2026-09",
    );
    expect(reportViewHref(view("Visão geral"), { mes: "2026-09" })).toBe(
      "/relatorios/visao-geral?mes=2026-09",
    );
    expect(reportViewHref(view("Calendário"), current)).toBe(
      "/relatorios/calendario?mes=2026-09",
    );
    // The default period and a missing or malformed month leave the URL bare.
    expect(reportViewHref(view("Visão geral"), { periodo: "12" })).toBe(
      "/relatorios/visao-geral",
    );
    expect(reportViewHref(view("Categorias"), { periodo: "7" })).toBe(
      "/relatorios/categorias",
    );
    expect(reportViewHref(view("Fluxo"), { mes: "2026-13" })).toBe(
      "/relatorios/fluxo",
    );
    expect(reportViewHref(view("Fluxo"), {})).toBe("/relatorios/fluxo");
  });

  it("clamps the month a window ends at to today", () => {
    expect(clampReportMonth("2026-08", "2026-10")).toBe("2026-08");
    expect(clampReportMonth("2026-10", "2026-10")).toBe("2026-10");
    expect(clampReportMonth("2027-01", "2026-10")).toBe("2026-10");
    expect(clampReportMonth(null, "2026-10")).toBe("2026-10");
    expect(clampReportMonth(parseMonthParam("lixo"), "2026-10")).toBe(
      "2026-10",
    );
    expect(clampReportMonth("2000-01", "2026-10")).toBe("2000-01");
  });

  it("builds the links of blocks and notices to a window ending in a month", () => {
    const path = "/relatorios/visao-geral";
    expect(periodViewHref(path, 6, "2026-10", "2026-10")).toBe(
      "/relatorios/visao-geral?periodo=6",
    );
    expect(periodViewHref(path, 1, "2026-09", "2026-10")).toBe(
      "/relatorios/visao-geral?periodo=1&mes=2026-09",
    );
    expect(periodHref(path, 12, null)).toBe(path);
    expect(periodHref(path, 12, "2026-09")).toBe(`${path}?mes=2026-09`);
    expect(periodHref(path, 3, "2026-09")).toBe(
      `${path}?periodo=3&mes=2026-09`,
    );
  });

  it("links months of a month view, the current one without the query", () => {
    expect(monthViewHref("/relatorios/fluxo", "2026-09", "2026-10")).toBe(
      "/relatorios/fluxo?mes=2026-09",
    );
    expect(monthViewHref("/relatorios/fluxo", "2026-10", "2026-10")).toBe(
      "/relatorios/fluxo",
    );
  });

  it("reads ?mes= only when well formed", () => {
    expect(parseMonthParam("2026-10")).toBe("2026-10");
    expect(parseMonthParam(["2026-01", "2026-02"])).toBe("2026-01");
    expect(parseMonthParam("2026-1")).toBeNull();
    expect(parseMonthParam("2026-00")).toBeNull();
    expect(parseMonthParam(undefined)).toBeNull();
    expect(parseMonthParam(null)).toBeNull();
  });
});

describe("day labels", () => {
  it("names days for tables, summaries and calendar cells", () => {
    expect(dayMonthLabel("2026-10-14")).toBe("14 de outubro");
    expect(dayMonthLabel("2026-11-01")).toBe("1º de novembro");
    expect(weekdayDateLabel("2026-10-01")).toBe("qui, 1/out");
    expect(weekdayDateLabel("2026-10-04")).toBe("dom, 4/out");
    expect(calendarDayLabel("2026-10-14", false)).toBe("14");
    expect(calendarDayLabel("2026-11-01", false)).toBe("1 nov");
    expect(calendarDayLabel("2026-10-01", true)).toBe("1");
  });
});
