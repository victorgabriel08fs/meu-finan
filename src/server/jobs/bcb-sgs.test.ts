import { describe, expect, it, vi } from "vitest";
import {
  fetchSgsSeries,
  parseSgsDate,
  parseSgsPayload,
  parseSgsValue,
  SGS_SERIES,
  SgsError,
  sgsLatestUrl,
} from "./bcb-sgs";

// Captured from api.bcb.gov.br on 14/10/2026 (series 4389 and 433).
const CDI_PAYLOAD = [
  { data: "13/10/2026", valor: "13.65" },
  { data: "09/10/2026", valor: "13.65" },
  { data: "08/10/2026", valor: "13.65" },
];
const IPCA_PAYLOAD = [
  { data: "01/07/2026", valor: "0.07" },
  { data: "01/08/2026", valor: "-0.32" },
  { data: "01/09/2026", valor: "0.82" },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("parseSgsDate", () => {
  it("converts dd/MM/yyyy to an ISO date", () => {
    expect(parseSgsDate("13/10/2026")).toBe("2026-10-13");
    expect(parseSgsDate("01/01/2000")).toBe("2000-01-01");
    expect(parseSgsDate(" 31/12/1999 ")).toBe("1999-12-31");
  });

  it("follows the Gregorian leap-year rules", () => {
    expect(parseSgsDate("29/02/2024")).toBe("2024-02-29");
    expect(parseSgsDate("29/02/2000")).toBe("2000-02-29");
    expect(parseSgsDate("29/02/2025")).toBeNull();
    expect(parseSgsDate("29/02/1900")).toBeNull();
  });

  it("rejects impossible dates and other formats", () => {
    for (const input of [
      "31/02/2026",
      "31/04/2026",
      "00/10/2026",
      "13/13/2026",
      "13/00/2026",
      "2026-10-13",
      "13/10/26",
      "1/10/2026",
      "13-10-2026",
      "",
    ]) {
      expect(parseSgsDate(input), input).toBeNull();
    }
  });
});

describe("parseSgsValue", () => {
  it("keeps decimal strings exact", () => {
    expect(parseSgsValue("13.65")).toBe("13.65");
    expect(parseSgsValue("0.07")).toBe("0.07");
    expect(parseSgsValue("-0.32")).toBe("-0.32");
    expect(parseSgsValue("0.04392400")).toBe("0.04392400");
    expect(parseSgsValue("15")).toBe("15");
  });

  it("accepts a comma separator, padding and plain numbers", () => {
    expect(parseSgsValue("0,56")).toBe("0.56");
    expect(parseSgsValue(" 13.65 ")).toBe("13.65");
    expect(parseSgsValue(14.9)).toBe("14.9");
  });

  it("rejects blanks, garbage and values beyond numeric(12,8)", () => {
    for (const input of [
      "",
      " ",
      "abc",
      "1e3",
      "NaN",
      "1.2.3",
      "1,234.56",
      "+1.5",
      "12345.6",
    ]) {
      expect(parseSgsValue(input), input).toBeNull();
    }
    expect(parseSgsValue(null)).toBeNull();
    expect(parseSgsValue(undefined)).toBeNull();
    expect(parseSgsValue(Number.NaN)).toBeNull();
    expect(parseSgsValue(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("parseSgsPayload", () => {
  it("parses real responses and sorts them oldest first", () => {
    expect(parseSgsPayload(CDI_PAYLOAD)).toEqual({
      points: [
        { refDate: "2026-10-08", value: "13.65" },
        { refDate: "2026-10-09", value: "13.65" },
        { refDate: "2026-10-13", value: "13.65" },
      ],
      rejected: 0,
    });
    expect(parseSgsPayload(IPCA_PAYLOAD).points).toEqual([
      { refDate: "2026-07-01", value: "0.07" },
      { refDate: "2026-08-01", value: "-0.32" },
      { refDate: "2026-09-01", value: "0.82" },
    ]);
  });

  it("skips and counts malformed entries", () => {
    const result = parseSgsPayload([
      { data: "13/10/2026", valor: "13.65" },
      { data: "31/02/2026", valor: "13.65" },
      { data: "14/10/2026", valor: "" },
      { data: 20261015, valor: "13.65" },
      { valor: "13.65" },
      null,
      "13/10/2026",
    ]);
    expect(result).toEqual({
      points: [{ refDate: "2026-10-13", value: "13.65" }],
      rejected: 6,
    });
  });

  it("keeps the last value when a date repeats", () => {
    const result = parseSgsPayload([
      { data: "13/10/2026", valor: "13.65" },
      { data: "13/10/2026", valor: "13.40" },
    ]);
    expect(result.points).toEqual([{ refDate: "2026-10-13", value: "13.40" }]);
  });

  it("accepts an empty array", () => {
    expect(parseSgsPayload([])).toEqual({ points: [], rejected: 0 });
  });

  it("throws on a payload that is not an array, or has no valid entry", () => {
    const apiError = {
      erro: {
        statusCode: 400,
        detail: "A quantidade máxima de valores deve ser 20",
      },
    };
    expect(() => parseSgsPayload(apiError)).toThrow(SgsError);
    expect(() => parseSgsPayload(null)).toThrow(SgsError);
    expect(() => parseSgsPayload([{ data: "x", valor: "y" }])).toThrow(
      /none were valid/,
    );
  });
});

describe("SGS series", () => {
  it("maps the indexes to the documented SGS codes", () => {
    expect(SGS_SERIES.map(({ index, code }) => [index, code])).toEqual([
      ["cdi", 4389],
      ["selic", 432],
      ["ipca", 433],
    ]);
  });

  it("stays within the API cap of 20 observations", () => {
    for (const series of SGS_SERIES)
      expect(series.lastN).toBeLessThanOrEqual(20);
  });

  it("builds the 'ultimos' URL", () => {
    expect(sgsLatestUrl(4389, 20)).toBe(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/20?formato=json",
    );
  });
});

describe("fetchSgsSeries", () => {
  it("requests JSON and returns the parsed series", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(CDI_PAYLOAD),
    );

    const result = await fetchSgsSeries(4389, 20, { fetchImpl });

    expect(result.points).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(sgsLatestUrl(4389, 20));
    expect(new Headers(init?.headers).get("accept")).toBe("application/json");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries 5xx, 429, network errors and non-JSON bodies, then succeeds", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ message: "unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse({ message: "slow down" }, 429))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        new Response("<html>manutenção</html>", { status: 200 }),
      )
      .mockResolvedValueOnce(jsonResponse(IPCA_PAYLOAD));

    const result = await fetchSgsSeries(433, 20, {
      fetchImpl,
      retries: 4,
      retryDelayMs: 0,
    });

    expect(result.points).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("gives up after the configured retries", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}, 502));

    await expect(
      fetchSgsSeries(432, 20, { fetchImpl, retries: 2, retryDelayMs: 0 }),
    ).rejects.toThrow("SGS answered HTTP 502");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry client errors or invalid payloads", async () => {
    const badRequest = vi.fn<typeof fetch>(async () =>
      jsonResponse({ erro: {} }, 400),
    );
    await expect(
      fetchSgsSeries(4389, 25, { fetchImpl: badRequest, retryDelayMs: 0 }),
    ).rejects.toThrow("SGS answered HTTP 400");
    expect(badRequest).toHaveBeenCalledTimes(1);

    const notArray = vi.fn<typeof fetch>(async () =>
      jsonResponse({ erro: {} }),
    );
    await expect(
      fetchSgsSeries(4389, 20, { fetchImpl: notArray, retryDelayMs: 0 }),
    ).rejects.toThrow(SgsError);
    expect(notArray).toHaveBeenCalledTimes(1);
  });

  it("times out a hanging attempt and retries it", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = (_input, init) => {
      calls += 1;
      if (calls > 1) return Promise.resolve(jsonResponse(CDI_PAYLOAD));
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    };

    const result = await fetchSgsSeries(4389, 20, {
      fetchImpl,
      timeoutMs: 20,
      retryDelayMs: 0,
    });

    expect(result.points).toHaveLength(3);
    expect(calls).toBe(2);
  });

  it("stops at once when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort(new Error("time budget exhausted"));
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(CDI_PAYLOAD),
    );

    await expect(
      fetchSgsSeries(4389, 20, { fetchImpl, signal: controller.signal }),
    ).rejects.toThrow("time budget exhausted");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not retry after the caller aborts mid-request", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      controller.abort(new Error("time budget exhausted"));
      throw new TypeError("fetch failed");
    });

    await expect(
      fetchSgsSeries(4389, 20, {
        fetchImpl,
        signal: controller.signal,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow("fetch failed");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
