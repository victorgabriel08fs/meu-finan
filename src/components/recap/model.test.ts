import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MonthRecap } from "@/server/domain/month-recap";
import {
  buildRecapSlides,
  nextIndex,
  percentLabel,
  readSeenMonth,
  recapKicker,
  recapRange,
  recapStorageKey,
  tapAction,
  writeSeenMonth,
} from "./model";

type Overrides = {
  closing?: Partial<MonthRecap["closing"]>;
  categories?: Partial<MonthRecap["categories"]>;
  biggest?: MonthRecap["biggest"];
  days?: MonthRecap["days"];
};

const OCTOBER = Array.from({ length: 31 }, (_, index) => ({
  date: `2026-10-${String(index + 1).padStart(2, "0")}`,
  paidCents: index % 3 === 0 ? 0 : 1_000 * (index + 1),
}));

const change = (current: number, baseline: number) => ({
  currentCents: current,
  baselineCents: baseline,
  diffCents: current - baseline,
  ratio: baseline === 0 ? null : (current - baseline) / baseline,
  direction:
    current === baseline
      ? ("same" as const)
      : current > baseline
        ? ("up" as const)
        : ("down" as const),
});

function recap(over: Overrides = {}): MonthRecap {
  return {
    closing: {
      month: "2026-10",
      previousMonth: "2026-09",
      currentMonth: "2026-11",
      start: "2026-10-01",
      end: "2026-10-31",
      latest: true,
      incomeCents: 500_000,
      expenseCents: 317_040,
      leftCents: 182_960,
      hasPending: false,
      previous: { leftCents: 120_000 },
      comparison: {
        month: "2026-10",
        previousMonth: "2026-09",
        current: { start: "2026-10-01", end: "2026-10-31" },
        previous: { start: "2026-09-01", end: "2026-09-30" },
        complete: true,
        total: change(317_040, 400_000),
        categories: [
          {
            key: "c1",
            categoryId: "c1",
            name: "Mercado",
            icon: "shopping-cart",
            color: "cat-1",
            ...change(90_000, 60_000),
          },
        ],
      },
      budgets: {
        metCount: 2,
        over: [
          {
            categoryId: "c2",
            categoryName: "Restaurantes",
            categoryIcon: "utensils",
            categoryColor: "cat-2",
            budgetCents: 60_000,
            spentCents: 75_000,
            averageCents: null,
            nextBudgetCents: null,
          },
        ],
      },
      next: {
        subscriptions: {
          items: [{}] as never,
          totalCount: 3,
          monthlyCents: 12_000,
          increasedCount: 0,
          hiddenIncreasedCount: 0,
        },
        installments: {
          items: [{}] as never,
          totalPlans: 2,
          monthlyCents: 30_000,
        },
        savings: {
          boxes: [{ id: "box-1", name: "Reserva" }],
          spendableId: "acc-1",
          savedCents: 0,
        },
      },
      ...over.closing,
    },
    categories: {
      items: [
        {
          categoryId: "c1",
          name: "Moradia",
          icon: "house",
          color: "cat-1",
          cents: 100_000,
          share: 0.31,
        },
        {
          categoryId: "c3",
          name: "Lazer",
          icon: "film",
          color: "cat-3",
          cents: 3_000,
          share: 0.004,
        },
      ],
      totalCents: 317_040,
      othersCount: 0,
      othersCents: 0,
      ...over.categories,
    },
    biggest:
      "biggest" in over
        ? (over.biggest ?? null)
        : {
            id: "t1",
            description: "Aluguel",
            amountCents: -120_000,
            occurredOn: "2026-10-05",
            accountId: "acc-1",
            accountName: "Nubank",
            categoryName: "Moradia",
            categoryIcon: "house",
            categoryColor: "cat-1",
            installment: null,
            recurring: false,
          },
    days: over.days ?? OCTOBER,
  };
}

const build = (over: Overrides = {}) =>
  buildRecapSlides(recap(over), { minComparisonDiffCents: 1_000 });
const ids = (over: Overrides = {}) => build(over).map((slide) => slide.id);
const find = <Id extends string>(
  slides: ReturnType<typeof build>,
  id: Id,
): Extract<ReturnType<typeof build>[number], { id: Id }> => {
  const slide = slides.find((item) => item.id === id);
  if (!slide) throw new Error(`sem a parte ${id}`);
  return slide as never;
};

describe("buildRecapSlides: order and omission", () => {
  it("tells the full month in ten parts", () => {
    expect(ids()).toEqual([
      "intro",
      "flow",
      "left",
      "days",
      "categories",
      "biggest",
      "comparison",
      "budgets",
      "next",
      "outro",
    ]);
  });

  it("drops the parts without data and keeps the three that always stay", () => {
    expect(
      ids({
        closing: { comparison: null, budgets: null, next: null },
        categories: { items: [] },
        biggest: null,
        days: OCTOBER.map((day) => ({ ...day, paidCents: 0 })),
      }),
    ).toEqual(["intro", "flow", "left", "outro"]);
  });

  it("needs 3 days with spending for the day by day part", () => {
    const two = OCTOBER.map((day, index) => ({
      ...day,
      paidCents: index < 2 ? 5_000 : 0,
    }));
    expect(ids({ days: two })).not.toContain("days");
    const three = OCTOBER.map((day, index) => ({
      ...day,
      paidCents: index < 3 ? 5_000 : 0,
    }));
    expect(ids({ days: three })).toContain("days");
  });

  it("has no day by day part without expenses", () => {
    expect(ids({ closing: { expenseCents: 0 } })).not.toContain("days");
  });

  it("skips the comparison when there was nothing to compare with", () => {
    const base = recap().closing.comparison;
    if (!base) throw new Error("sem comparação");
    const none = { ...base, total: change(317_040, 0) };
    expect(ids({ closing: { comparison: none } })).not.toContain("comparison");
  });

  it("skips what continues in an old month (no next)", () => {
    const slides = build({ closing: { next: null, latest: false } });
    expect(slides.map((slide) => slide.id)).not.toContain("next");
    expect(find(slides, "outro").offer).toEqual({ kind: "none" });
  });

  it("skips what continues when there is no subscription nor installment", () => {
    const base = recap().closing.next;
    if (!base) throw new Error("sem próximo");
    const empty = {
      ...base,
      subscriptions: { ...base.subscriptions, items: [] },
      installments: { ...base.installments, items: [] },
    };
    expect(ids({ closing: { next: empty } })).not.toContain("next");
  });

  it("keeps only the line that has something in the part that continues", () => {
    const base = recap().closing.next;
    if (!base) throw new Error("sem próximo");
    const only = {
      ...base,
      installments: { ...base.installments, items: [] },
    };
    const slide = find(build({ closing: { next: only } }), "next");
    expect(slide.installments).toBeNull();
    expect(slide.subscriptions).toEqual({ count: 3, cents: 12_000 });
    expect(slide.title).toBe("O que continua em novembro");
  });
});

describe("buildRecapSlides: copy", () => {
  it("opens with the month and its days", () => {
    const intro = find(build(), "intro");
    expect(intro.title).toBe("Outubro fechou");
    expect(intro.lead).toBe("Veja em 1 minuto como foi o seu mês.");
    expect(intro.range).toBe(recapRange("2026-10-01", "2026-10-31"));
  });

  it("tells what the month left, never a negative number", () => {
    const up = find(build(), "left");
    expect(up).toMatchObject({
      title: "Você fechou outubro no azul.",
      label: "Sobrou",
      mood: "up",
      cents: 182_960,
    });
    expect(up.previous).toEqual({
      lead: "Em setembro, sobraram",
      cents: 120_000,
    });

    const down = find(build({ closing: { leftCents: -4_500 } }), "left");
    expect(down).toMatchObject({
      title: "As despesas passaram das receitas.",
      label: "Faltou",
      mood: "down",
      cents: 4_500,
    });

    const even = find(build({ closing: { leftCents: 0 } }), "left");
    expect(even).toMatchObject({
      title: "Receitas e despesas empataram.",
      label: "Empatou",
      mood: "even",
      cents: 0,
    });
  });

  it("says how the month before went", () => {
    const fell = find(
      build({ closing: { previous: { leftCents: -2_000 } } }),
      "left",
    );
    expect(fell.previous).toEqual({
      lead: "Em setembro, faltaram",
      cents: 2_000,
    });
    const tie = find(
      build({ closing: { previous: { leftCents: 0 } } }),
      "left",
    );
    expect(tie.previous).toEqual({
      lead: "Em setembro, empatou.",
      cents: null,
    });
    expect(
      find(build({ closing: { previous: null } }), "left").previous,
    ).toBeNull();
  });

  it("warns that pending entries do not count", () => {
    expect(find(build(), "flow").note).toBeNull();
    expect(find(build({ closing: { hasPending: true } }), "flow").note).toBe(
      "Lançamentos pendentes não entram nesta conta.",
    );
  });

  it("names the category that took the most", () => {
    const slide = find(build(), "categories");
    expect(slide.sentence).toBe("Moradia levou 31% das despesas.");
    expect(slide.items.map((item) => item.percentLabel)).toEqual([
      "31%",
      "menos de 1%",
    ]);
    expect(slide.others).toBeNull();
  });

  it("sums the other categories in one line", () => {
    const one = find(
      build({ categories: { othersCount: 1, othersCents: 500 } }),
      "categories",
    );
    expect(one.others).toEqual({ label: "Outras 1 categoria", cents: 500 });
    const many = find(
      build({ categories: { othersCount: 4, othersCents: 9_000 } }),
      "categories",
    );
    expect(many.others).toEqual({ label: "Outras 4 categorias", cents: 9_000 });
  });

  it("describes the biggest expense, installments and recurrences included", () => {
    const base = recap().biggest;
    if (!base) throw new Error("sem maior gasto");
    const plain = find(build(), "biggest");
    expect(plain).toMatchObject({
      title: "O maior gasto",
      description: "Aluguel",
      cents: 120_000,
      meta: "5/out · Nubank",
      extras: [],
    });
    const both = find(
      build({
        biggest: {
          ...base,
          description: "  ",
          installment: { number: 3, count: 10 },
          recurring: true,
        },
      }),
      "biggest",
    );
    expect(both.description).toBe("Sem descrição");
    expect(both.extras).toEqual(["Parcela 3 de 10", "Repete todo mês"]);
  });

  it("compares with the month before: less, more, or about the same", () => {
    const base = recap().closing.comparison;
    if (!base) throw new Error("sem comparação");
    const less = find(build(), "comparison");
    expect(less).toMatchObject({
      title: "Comparado a setembro",
      lead: "Você gastou",
      cents: 82_960,
      tail: "a menos que em setembro.",
    });
    expect(less.items).toMatchObject([
      { name: "Mercado", cents: 30_000, direction: "up" },
    ]);

    const more = find(
      build({
        closing: { comparison: { ...base, total: change(450_000, 400_000) } },
      }),
      "comparison",
    );
    expect(more).toMatchObject({
      cents: 50_000,
      tail: "a mais que em setembro.",
    });

    // R$ 10,00 is the limit: below it reads "quase o mesmo", at it does not.
    const near = find(
      build({
        closing: { comparison: { ...base, total: change(400_999, 400_000) } },
      }),
      "comparison",
    );
    expect(near).toMatchObject({
      lead: "Você gastou quase o mesmo que em setembro.",
      cents: null,
      tail: "",
    });
    const edge = find(
      build({
        closing: { comparison: { ...base, total: change(401_000, 400_000) } },
      }),
      "comparison",
    );
    expect(edge).toMatchObject({
      cents: 1_000,
      tail: "a mais que em setembro.",
    });
  });

  it("leaves unchanged categories out of the comparison", () => {
    const base = recap().closing.comparison;
    if (!base) throw new Error("sem comparação");
    const same = {
      ...base,
      categories: [
        {
          key: "c9",
          categoryId: "c9",
          name: "Igual",
          icon: "house",
          color: "cat-1",
          ...change(5_000, 5_000),
        },
      ],
    };
    expect(
      find(build({ closing: { comparison: same } }), "comparison").items,
    ).toEqual([]);
  });

  it("summarizes the budgets", () => {
    const slide = find(build(), "budgets");
    expect(slide).toMatchObject({
      title: "Orçamentos de outubro",
      sentence: "2 cumpridos e 1 estourado.",
      met: 2,
      total: 3,
      allMet: false,
    });
    expect(slide.over[0]).toMatchObject({
      name: "Restaurantes",
      excessCents: 15_000,
      ratio: 1.25,
    });
    expect(
      find(
        build({ closing: { budgets: { metCount: 3, over: [] } } }),
        "budgets",
      ).sentence,
    ).toBe("Todos dentro do combinado.");
    const over = recap().closing.budgets?.over ?? [];
    expect(
      find(build({ closing: { budgets: { metCount: 0, over } } }), "budgets")
        .sentence,
    ).toBe("1 estourado.");
    expect(
      find(
        build({
          closing: { budgets: { metCount: 1, over: [...over, ...over] } },
        }),
        "budgets",
      ).sentence,
    ).toBe("1 cumprido e 2 estourados.");
  });

  it("shows at most 3 exceeded budgets", () => {
    const one = recap().closing.budgets?.over[0];
    if (!one) throw new Error("sem orçamento");
    const slide = find(
      build({
        closing: { budgets: { metCount: 0, over: [one, one, one, one, one] } },
      }),
      "budgets",
    );
    expect(slide.over).toHaveLength(3);
    expect(slide.total).toBe(5);
  });
});

describe("buildRecapSlides: day by day", () => {
  it("lays the month in weeks of 7, Sunday first, padded", () => {
    // 1/out/2026 is a Thursday: 4 empty cells, 31 days, 0 trailing → 5 weeks.
    const slide = find(build(), "days");
    expect(slide.weeks).toHaveLength(5);
    expect(slide.weeks.every((week) => week.length === 7)).toBe(true);
    expect(slide.weeks[0]?.slice(0, 4)).toEqual([null, null, null, null]);
    expect(slide.weeks[0]?.[4]?.date).toBe("2026-10-01");
    const cells = slide.weeks.flat().filter((cell) => cell !== null);
    expect(cells).toHaveLength(31);
  });

  it("marks the biggest day and counts the days without spending", () => {
    const slide = find(build(), "days");
    const tops = slide.weeks.flat().filter((cell) => cell?.top);
    expect(tops).toHaveLength(1);
    expect(tops[0]?.date).toBe("2026-10-30");
    expect(slide.topLine).toEqual({
      lead: "O dia de maior gasto foi 30 de outubro:",
      cents: 30_000,
    });
    // Days 1, 4, 7, …, 31 have none: 11 days.
    expect(slide.withoutLabel).toBe("11 dias sem gastos.");
  });

  it("has no label when every day had spending", () => {
    const all = OCTOBER.map((day) => ({ ...day, paidCents: 1_000 }));
    expect(find(build({ days: all }), "days").withoutLabel).toBeNull();
  });
});

describe("buildRecapSlides: closing part", () => {
  const base = () => {
    const next = recap().closing.next;
    if (!next) throw new Error("sem próximo");
    return next;
  };

  it("offers to save what is left when there is a caixinha", () => {
    const outro = find(build(), "outro");
    expect(outro.title).toBe("Que tal guardar a sobra?");
    expect(outro.offer).toEqual({
      kind: "save",
      cents: 182_960,
      description: "Sobra de outubro",
    });
    expect(outro).toMatchObject({
      boxId: "box-1",
      spendableId: "acc-1",
      closingHref: "/relatorios/fechamento?mes=2026-10",
    });
  });

  it("only offers what is still to save", () => {
    const next = {
      ...base(),
      savings: { ...base().savings, savedCents: 100_000 },
    };
    const outro = find(build({ closing: { next } }), "outro");
    expect(outro.offer).toMatchObject({ kind: "save", cents: 82_960 });
  });

  it("thanks when it was all saved", () => {
    const next = {
      ...base(),
      savings: { ...base().savings, savedCents: 182_960 },
    };
    const outro = find(build({ closing: { next } }), "outro");
    expect(outro.title).toBe("A sobra de outubro já está nas caixinhas.");
    expect(outro.offer.kind).toBe("saved");
  });

  it("suggests creating a caixinha when there is none", () => {
    const next = { ...base(), savings: { ...base().savings, boxes: [] } };
    const outro = find(build({ closing: { next } }), "outro");
    expect(outro.title).toBe("Que tal guardar a sobra?");
    expect(outro.offer).toEqual({ kind: "create-box" });
    expect(outro.boxId).toBeNull();
  });

  it("starts a new month when nothing was left", () => {
    for (const leftCents of [0, -1_000]) {
      const outro = find(build({ closing: { leftCents } }), "outro");
      expect(outro.title).toBe("Um mês novo começou");
      expect(outro.offer).toEqual({ kind: "none" });
    }
  });
});

describe("labels", () => {
  it("writes percentages in pt-BR", () => {
    expect(percentLabel(0.31)).toBe("31%");
    expect(percentLabel(1)).toBe("100%");
    expect(percentLabel(0.004)).toBe("menos de 1%");
    expect(percentLabel(0)).toBe("0%");
  });

  it("writes the range of the month and of a month that starts on the 5th", () => {
    expect(recapRange("2026-10-01", "2026-10-31")).toBe("1º a 31 de outubro");
    expect(recapRange("2026-10-05", "2026-11-04")).toBe(
      "5 de outubro a 4 de novembro",
    );
  });

  it("writes the kicker", () => {
    expect(recapKicker("2026-10")).toBe("Retrospectiva · Outubro de 2026");
  });
});

describe("navigation", () => {
  it("moves one part and stops at the ends", () => {
    expect(nextIndex(0, 5, "next")).toBe(1);
    expect(nextIndex(4, 5, "next")).toBe(4);
    expect(nextIndex(2, 5, "prev")).toBe(1);
    expect(nextIndex(0, 5, "prev")).toBe(0);
    expect(nextIndex(3, 5, "first")).toBe(0);
    expect(nextIndex(1, 5, "last")).toBe(4);
    expect(nextIndex(0, 0, "last")).toBe(0);
  });

  it("goes back on the left third and forward anywhere else", () => {
    expect(tapAction(0, 300)).toBe("prev");
    expect(tapAction(99, 300)).toBe("prev");
    expect(tapAction(100, 300)).toBe("next");
    expect(tapAction(299, 300)).toBe("next");
    expect(tapAction(10, 0)).toBe("next");
  });
});

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}

describe("seen month, one per person", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keys the storage by the user id", () => {
    expect(recapStorageKey("u1")).toBe("meu-finan:retrospectiva-vista:u1");
  });

  it("remembers per person and never goes back", () => {
    expect(readSeenMonth("u1")).toBeNull();
    writeSeenMonth("u1", "2026-10");
    expect(readSeenMonth("u1")).toBe("2026-10");
    expect(readSeenMonth("u2")).toBeNull();
    writeSeenMonth("u1", "2026-09");
    expect(readSeenMonth("u1")).toBe("2026-10");
    writeSeenMonth("u1", "2026-11");
    expect(readSeenMonth("u1")).toBe("2026-11");
  });

  it("shows the invite only for a month newer than the seen one", () => {
    // The rule of RecapInvite: skip when seen >= month.
    const shows = (user: string, month: string) => {
      const seen = readSeenMonth(user);
      return !(seen && seen >= month);
    };
    expect(shows("u1", "2026-10")).toBe(true);
    writeSeenMonth("u1", "2026-10");
    expect(shows("u1", "2026-10")).toBe(false);
    expect(shows("u2", "2026-10")).toBe(true);
    expect(shows("u1", "2026-11")).toBe(true);
  });

  it("ignores a value that is not a month", () => {
    storage.items.set(recapStorageKey("u1"), "lixo");
    expect(readSeenMonth("u1")).toBeNull();
  });

  it("does not break when the storage is blocked", () => {
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new Error("bloqueado");
      },
    });
    expect(readSeenMonth("u1")).toBeNull();
    expect(() => writeSeenMonth("u1", "2026-10")).not.toThrow();
  });
});
