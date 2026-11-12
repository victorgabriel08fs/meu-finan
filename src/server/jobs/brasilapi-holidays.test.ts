import { describe, expect, it, vi } from "vitest";
import {
  diffHolidays,
  fetchHolidays,
  HolidaysApiError,
  holidaysUrl,
  MIN_HOLIDAYS_PER_YEAR,
  parseHolidaysPayload,
} from "./brasilapi-holidays";

// Captured from brasilapi.com.br/api/feriados/v1/2026 on 12/11/2026.
const holiday = (date: string, name: string, weekday: string) => ({
  date,
  name,
  type: "national",
  weekday,
});
const PAYLOAD_2026 = [
  holiday("2026-01-01", "Confraternização mundial", "quinta-feira"),
  holiday("2026-02-16", "Carnaval", "segunda-feira"),
  holiday("2026-02-17", "Carnaval", "terça-feira"),
  holiday("2026-04-03", "Sexta-feira Santa", "sexta-feira"),
  holiday("2026-04-05", "Páscoa", "domingo"),
  holiday("2026-04-21", "Tiradentes", "terça-feira"),
  holiday("2026-05-01", "Dia do trabalho", "sexta-feira"),
  holiday("2026-06-04", "Corpus Christi", "quinta-feira"),
  holiday("2026-09-07", "Independência do Brasil", "segunda-feira"),
  holiday("2026-10-12", "Nossa Senhora Aparecida", "segunda-feira"),
  holiday("2026-11-02", "Finados", "segunda-feira"),
  holiday("2026-11-15", "Proclamação da República", "domingo"),
  holiday("2026-11-20", "Dia da consciência negra", "sexta-feira"),
  holiday("2026-12-25", "Natal", "sexta-feira"),
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("holidaysUrl", () => {
  it("carries only the year", () => {
    expect(holidaysUrl(2027)).toBe(
      "https://brasilapi.com.br/api/feriados/v1/2027",
    );
  });
});

describe("parseHolidaysPayload", () => {
  it("accepts the real payload, sorted, with the extra fields dropped", () => {
    const { holidays, rejected } = parseHolidaysPayload(PAYLOAD_2026, 2026);
    expect(rejected).toBe(0);
    expect(holidays).toHaveLength(14);
    expect(holidays[0]).toEqual({
      date: "2026-01-01",
      name: "Confraternização mundial",
    });
    expect(holidays.map((h) => h.date)).toEqual(
      [...holidays.map((h) => h.date)].sort(),
    );
  });

  it("counts and skips dates outside the year or impossible, names empty or too long, other types", () => {
    const bad = [
      { date: "2025-12-25", name: "Ano errado", type: "national" },
      { date: "2026-02-30", name: "Impossível", type: "national" },
      { date: "26-01-01", name: "Formato", type: "national" },
      { date: "2026-03-01", name: "   ", type: "national" },
      { date: "2026-03-02", name: "x".repeat(81), type: "national" },
      { date: "2026-03-03", name: "Estadual", type: "state" },
      { date: "2026-03-04" },
      null,
      "texto",
    ];
    const { holidays, rejected } = parseHolidaysPayload(
      [...PAYLOAD_2026, ...bad],
      2026,
    );
    expect(holidays).toHaveLength(14);
    expect(rejected).toBe(bad.length);
  });

  it("trims names, accepts a missing type and keeps the first of a repeated date", () => {
    const { holidays } = parseHolidaysPayload(
      [
        ...PAYLOAD_2026,
        { date: "2026-07-09", name: "  Novo  " },
        { date: "2026-01-01", name: "Repetido", type: "national" },
      ],
      2026,
    );
    expect(holidays.find((h) => h.date === "2026-07-09")?.name).toBe("Novo");
    expect(holidays.find((h) => h.date === "2026-01-01")?.name).toBe(
      "Confraternização mundial",
    );
    expect(holidays).toHaveLength(15);
  });

  it("is an error under the minimum, never an empty list", () => {
    expect(MIN_HOLIDAYS_PER_YEAR).toBe(9);
    expect(() => parseHolidaysPayload(PAYLOAD_2026.slice(0, 8), 2026)).toThrow(
      HolidaysApiError,
    );
    expect(() => parseHolidaysPayload([], 2026)).toThrow(/valid holidays/);
    // 9 is enough.
    expect(
      parseHolidaysPayload(PAYLOAD_2026.slice(0, 9), 2026).holidays,
    ).toHaveLength(9);
  });

  it("refuses what is not an array", () => {
    for (const payload of [{ message: "x" }, "<html>", null, 42]) {
      expect(() => parseHolidaysPayload(payload, 2026)).toThrow(
        HolidaysApiError,
      );
    }
  });
});

describe("diffHolidays", () => {
  const stored = [
    { date: "2026-01-01", name: "A" },
    { date: "2026-02-02", name: "B" },
    { date: "2026-03-03", name: "C" },
  ];

  it("splits inserts, renames and deletes", () => {
    expect(
      diffHolidays(stored, [
        { date: "2026-01-01", name: "A" },
        { date: "2026-02-02", name: "B2" },
        { date: "2026-04-04", name: "D" },
      ]),
    ).toEqual({
      inserts: [{ date: "2026-04-04", name: "D" }],
      renames: [{ date: "2026-02-02", name: "B2" }],
      deletes: ["2026-03-03"],
    });
  });

  it("is empty when nothing changed", () => {
    expect(diffHolidays(stored, stored)).toEqual({
      inserts: [],
      renames: [],
      deletes: [],
    });
  });
});

describe("fetchHolidays", () => {
  it("requests JSON with a user agent and returns the parsed list", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(PAYLOAD_2026),
    );
    const result = await fetchHolidays(2026, { fetchImpl });
    expect(result.holidays).toHaveLength(14);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(holidaysUrl(2026));
    const headers = new Headers(init?.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("user-agent")).toBe("meu-finan-cron/1.0");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("repeats a 500 once, then succeeds", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ message: "down" }, 500))
      .mockResolvedValueOnce(jsonResponse(PAYLOAD_2026));
    const result = await fetchHolidays(2026, { fetchImpl, retryDelayMs: 0 });
    expect(result.holidays).toHaveLength(14);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("repeats 429, a network error and an HTML body with 200, one extra attempt only", async () => {
    for (const first of [
      () => jsonResponse({}, 429),
      () => {
        throw new TypeError("fetch failed");
      },
      () => new Response("<html>manutenção</html>", { status: 200 }),
    ]) {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(async () => first())
        .mockResolvedValueOnce(jsonResponse(PAYLOAD_2026));
      await fetchHolidays(2026, { fetchImpl, retryDelayMs: 0 });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }

    const always = vi.fn<typeof fetch>(async () => jsonResponse({}, 502));
    await expect(
      fetchHolidays(2026, { fetchImpl: always, retryDelayMs: 0 }),
    ).rejects.toThrow("BrasilAPI answered HTTP 502");
    expect(always).toHaveBeenCalledTimes(2);
  });

  it("does not repeat a 404 or a bad payload", async () => {
    const notFound = vi.fn<typeof fetch>(async () =>
      jsonResponse({ message: "Ano fora do intervalo" }, 404),
    );
    await expect(
      fetchHolidays(2300, { fetchImpl: notFound, retryDelayMs: 0 }),
    ).rejects.toThrow("HTTP 404");
    expect(notFound).toHaveBeenCalledTimes(1);

    const tooFew = vi.fn<typeof fetch>(async () =>
      jsonResponse(PAYLOAD_2026.slice(0, 3)),
    );
    await expect(
      fetchHolidays(2026, { fetchImpl: tooFew, retryDelayMs: 0 }),
    ).rejects.toThrow(HolidaysApiError);
    expect(tooFew).toHaveBeenCalledTimes(1);
  });

  it("times out a hanging attempt and retries it", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = (_input, init) => {
      calls += 1;
      if (calls > 1) return Promise.resolve(jsonResponse(PAYLOAD_2026));
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    };
    const result = await fetchHolidays(2026, {
      fetchImpl,
      timeoutMs: 20,
      retryDelayMs: 0,
    });
    expect(result.holidays).toHaveLength(14);
    expect(calls).toBe(2);
  });

  it("stops at once when the job aborts, and does not retry after a mid-request abort", async () => {
    const controller = new AbortController();
    controller.abort(new Error("time budget exhausted"));
    const never = vi.fn<typeof fetch>(async () => jsonResponse(PAYLOAD_2026));
    await expect(
      fetchHolidays(2026, { fetchImpl: never, signal: controller.signal }),
    ).rejects.toThrow("time budget exhausted");
    expect(never).not.toHaveBeenCalled();

    const mid = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      mid.abort(new Error("time budget exhausted"));
      throw new TypeError("fetch failed");
    });
    await expect(
      fetchHolidays(2026, {
        fetchImpl,
        signal: mid.signal,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow("fetch failed");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
