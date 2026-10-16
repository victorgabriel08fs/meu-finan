import { describe, expect, it } from "vitest";
import {
  dueLabel,
  firstName,
  greetingFor,
  initials,
  monthName,
  splitInsight,
  weekdayDateLabel,
} from "./labels";

const SP = "America/Sao_Paulo";

describe("greetingFor", () => {
  it("follows the clock in the given time zone", () => {
    // 14/out/2026 08:00 in São Paulo (UTC−3) = 11:00 UTC.
    expect(greetingFor(Date.UTC(2026, 9, 14, 11), SP)).toBe("Bom dia");
    expect(greetingFor(Date.UTC(2026, 9, 14, 15), SP)).toBe("Boa tarde");
    expect(greetingFor(Date.UTC(2026, 9, 14, 23), SP)).toBe("Boa noite");
    // 02:00 in São Paulo is still night.
    expect(greetingFor(Date.UTC(2026, 9, 14, 5), SP)).toBe("Boa noite");
  });

  it("switches exactly at 5h, 12h and 18h", () => {
    expect(greetingFor(Date.UTC(2026, 9, 14, 8), SP)).toBe("Bom dia");
    expect(greetingFor(Date.UTC(2026, 9, 14, 15), SP)).toBe("Boa tarde");
    expect(greetingFor(Date.UTC(2026, 9, 14, 21), SP)).toBe("Boa noite");
  });
});

describe("weekdayDateLabel", () => {
  it("names the weekday and the day without the year", () => {
    expect(weekdayDateLabel("2026-10-14")).toBe("quarta, 14 de outubro");
    expect(weekdayDateLabel("2026-10-13")).toBe("terça, 13 de outubro");
    expect(weekdayDateLabel("2026-03-01")).toBe("domingo, 1º de março");
  });
});

describe("initials and firstName", () => {
  it("takes the first and last words", () => {
    expect(initials("Ana Nunes")).toBe("AN");
    expect(initials("  ana maria  nunes ")).toBe("AN");
    expect(initials("Ana")).toBe("A");
    expect(initials("   ")).toBe("?");
    expect(firstName("Ana Nunes")).toBe("Ana");
    expect(firstName("")).toBe("você");
  });
});

describe("monthName", () => {
  it("drops the year", () => {
    expect(monthName("2026-10")).toBe("outubro");
    expect(monthName("2027-03")).toBe("março");
  });
});

describe("dueLabel", () => {
  const today = "2026-10-14";

  it("flags overdue bills in red", () => {
    expect(dueLabel("2026-10-13", today)).toEqual({
      text: "Venceu ontem",
      tone: "danger",
      days: -1,
    });
    expect(dueLabel("2026-10-10", today).text).toBe("Venceu há 4 dias");
    expect(dueLabel("2026-10-10", today).tone).toBe("danger");
  });

  it("is amber up to 3 days ahead", () => {
    expect(dueLabel("2026-10-14", today).text).toBe("Vence hoje");
    expect(dueLabel("2026-10-15", today).text).toBe("Vence amanhã");
    expect(dueLabel("2026-10-17", today)).toEqual({
      text: "Vence em 3 dias",
      tone: "warning",
      days: 3,
    });
  });

  it("shows the short date further ahead", () => {
    expect(dueLabel("2026-10-20", today)).toEqual({
      text: "Vence 20/out",
      tone: "neutral",
      days: 6,
    });
  });
});

describe("splitInsight", () => {
  it("isolates the figure to highlight", () => {
    expect(
      splitInsight(
        "Até hoje, você gastou 32% menos com Transporte do que a média dos últimos 3 meses.",
      ),
    ).toEqual([
      "Até hoje, você gastou ",
      "32% menos",
      " com Transporte do que a média dos últimos 3 meses.",
    ]);
    expect(
      splitInsight("Mercado está 45% acima do seu normal para esta altura."),
    ).toEqual([
      "Mercado está ",
      "45% acima",
      " do seu normal para esta altura.",
    ]);
  });

  it("keeps texts without a figure whole", () => {
    expect(splitInsight("Tudo certo.")).toEqual(["Tudo certo.", "", ""]);
  });
});
