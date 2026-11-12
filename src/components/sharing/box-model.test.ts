import { describe, expect, it } from "vitest";
import {
  boxProjectionSentence,
  entriesByMonth,
  entryLine,
  heroSaved,
  memberFacts,
  segmentsText,
} from "./box-model";

const text = (segments: Parameters<typeof segmentsText>[0]) =>
  segmentsText(segments).replace(/\s/g, " ");

describe("boxProjectionSentence", () => {
  it("speaks in the plural, for everyone together", () => {
    expect(
      text(
        boxProjectionSentence({
          projection: {
            status: "on_track",
            eta: { year: 2027, month: 8 },
            requiredMonthlyCents: null,
            slackMonths: null,
          },
          monthlyCents: 70_000,
          savedCents: 290_000,
          targetDate: null,
        }),
      ),
    ).toBe("No ritmo de vocês, chegam lá em ago/2027.");
    expect(
      text(
        boxProjectionSentence({
          projection: {
            status: "behind",
            eta: { year: 2027, month: 7 },
            requiredMonthlyCents: 64_000,
            slackMonths: -1,
          },
          monthlyCents: 70_000,
          savedCents: 290_000,
          targetDate: "2027-06-30",
        }),
      ),
    ).toBe(
      "Para chegar em jun/2027, vocês precisam guardar R$ 640/mês (hoje: R$ 700).",
    );
    expect(
      text(
        boxProjectionSentence({
          projection: {
            status: "ahead",
            eta: { year: 2027, month: 3 },
            requiredMonthlyCents: 30_000,
            slackMonths: 3,
          },
          monthlyCents: 70_000,
          savedCents: 0,
          targetDate: "2027-06-30",
        }),
      ),
    ).toBe("Chegam em mar/2027, 3 meses antes do prazo.");
    expect(
      text(
        boxProjectionSentence({
          projection: {
            status: "no_plan",
            eta: null,
            requiredMonthlyCents: null,
            slackMonths: null,
          },
          monthlyCents: 0,
          savedCents: 0,
          targetDate: null,
        }),
      ),
    ).toBe("Definam quanto cada um guarda por mês para ver quando chegam lá.");
  });

  it("marks the amounts, so the privacy mode hides them", () => {
    const segments = boxProjectionSentence({
      projection: null,
      monthlyCents: 70_000,
      savedCents: 0,
      targetDate: null,
    });
    expect(segments.filter((segment) => segment.money)).toHaveLength(1);
    expect(text(segments)).toBe(
      "Sem objetivo. Juntos, vocês guardam R$ 700/mês.",
    );
  });
});

describe("memberFacts", () => {
  it("lists what one saved, plans, owes of the target and when they get there", () => {
    expect(
      memberFacts({
        name: "Ana",
        isMe: true,
        savedCents: 180_000,
        monthlyPlanCents: 40_000,
        shareCents: 400_000,
        missingCents: 220_000,
        projection: {
          status: "on_track",
          eta: { year: 2027, month: 5 },
          requiredMonthlyCents: null,
          slackMonths: null,
        },
      }),
    ).toEqual({
      facts: [
        { label: "Guardou", text: "R$ 1.800", money: true },
        { label: "Por mês", text: "R$ 400", money: true },
        { label: "Sua parte", text: "R$ 4.000", money: true },
        { label: "Falta", text: "R$ 2.200", money: true },
      ],
      eta: "mai/2027",
    });
    expect(
      memberFacts({
        name: "Bruno",
        isMe: false,
        savedCents: 0,
        monthlyPlanCents: 0,
        shareCents: null,
        missingCents: null,
        projection: null,
      }),
    ).toEqual({
      facts: [
        { label: "Guardou", text: "R$ 0", money: true },
        { label: "Por mês", text: "sem plano", money: false },
      ],
      eta: null,
    });
  });
});

describe("history", () => {
  it("groups the entries by month and says who saved or took out", () => {
    const months = entriesByMonth([
      { id: "c", occurredOn: "2026-11-05" },
      { id: "b", occurredOn: "2026-10-28" },
      { id: "a", occurredOn: "2026-10-05" },
    ]);
    expect(months.map((month) => [month.month, month.entries.length])).toEqual([
      ["2026-11", 1],
      ["2026-10", 2],
    ]);
    expect(
      entryLine({ name: "Ana", mine: true, amountCents: -20_000 }),
    ).toEqual({ before: "Você resgatou ", amountCents: 20_000 });
    expect(text(heroSaved(290_000, 800_000))).toBe(
      "R$ 2.900 guardados de R$ 8.000",
    );
  });
});
