import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type ScrubbableEvent,
  scrubBreadcrumb,
  scrubEvent,
  scrubText,
  scrubUrl,
} from "./scrub";

const sample = (): ScrubbableEvent => ({
  message: "falha para ana@exemplo.com",
  transaction: "/convite/abcdefghij1234567890xyz",
  exception: {
    values: [
      {
        value: "Failed query: insert into t params: Mercado,12345,x",
        stacktrace: { frames: [{ vars: { secret: 1 } }] },
      },
    ],
  },
  request: {
    url: "https://app.test/extrato?q=padaria",
    headers: {
      "User-Agent": "ua",
      referer: "r",
      Cookie: "c",
      authorization: "a",
    },
    cookies: { a: "b" },
    data: { x: 1 },
    query_string: "q=1",
    env: { a: 1 },
  },
  user: { id: "u", email: "a@b.com" },
  extra: { anything: 1 },
  contexts: {
    runtime: { name: "node", description: "d", notes: "n", amountCents: 1 },
    custom: { a: 1 },
    app: { email: "a@b.com", token: "t" },
  },
  tags: { email: "x@y.com", job: "daily" },
  breadcrumbs: [
    { category: "console", message: "x" },
    { category: "ui.input", message: "y" },
    {
      category: "fetch",
      data: {
        url: "https://app.test/convite/tokensecreto1234567890abc?x=1",
        method: "GET",
        status_code: 200,
        body: "nope",
      },
    },
  ],
});

describe("scrubText", () => {
  it("masks e-mails and money", () => {
    const out = scrubText("a@b.com R$ 1.234,56 -R$ 12,00 e 1.234,56");
    expect(out).not.toMatch(/@|1\.234|12,00/);
    expect(out).toContain("[email]");
    expect(out).toContain("[valor]");
  });

  it("drops Drizzle params", () => {
    const out = scrubText("Failed query: insert ... params: Mercado,12345,x");
    expect(out).not.toContain("Mercado");
    expect(out).not.toContain("12345");
  });

  it("masks bearer tokens and long secrets", () => {
    expect(scrubText("Bearer abc.def")).toBe("Bearer [segredo]");
    expect(scrubText(`k=${"a".repeat(40)}`)).toContain("[segredo]");
  });
});

describe("scrubUrl", () => {
  it("drops query and hash, masks invite tokens and ids", () => {
    expect(scrubUrl("https://app/extrato?q=padaria")).toBe(
      "https://app/extrato",
    );
    expect(scrubUrl("/convite/abcxyz?x=1")).toBe("/convite/[token]");
    expect(scrubUrl("/contas/0190c1d2-aaaa-7bbb-8ccc-123456789abc")).toBe(
      "/contas/:id",
    );
  });
});

describe("scrubEvent", () => {
  it("removes request data, user, extra and non-allowlisted headers", () => {
    const out = scrubEvent(sample());
    expect(out.user).toBeUndefined();
    expect(out.extra).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.query_string).toBeUndefined();
    expect(out.request?.env).toBeUndefined();
    expect(out.request?.headers).toEqual({ "User-Agent": "ua" });
    expect(out.request?.url).toBe("https://app.test/extrato");
    expect(out.transaction).toBe("/convite/[token]");
  });

  it("cleans texts, frame vars, contexts and tags", () => {
    const out = scrubEvent(sample());
    const text = JSON.stringify(out);
    expect(text).not.toContain("ana@exemplo.com");
    expect(text).not.toContain("Mercado");
    expect(text).not.toContain("x@y.com");
    expect(text).not.toContain("secret");
    expect(out.contexts?.custom).toBeUndefined();
    expect(out.contexts?.runtime).toEqual({
      name: "node",
      description: "[removido]",
      notes: "[removido]",
      amountCents: "[removido]",
    });
    expect(out.tags).toEqual({ email: "[removido]", job: "daily" });
  });

  it("drops console and input breadcrumbs and cleans fetch ones", () => {
    const out = scrubEvent(sample());
    expect(out.breadcrumbs).toHaveLength(1);
    expect(JSON.stringify(out.breadcrumbs)).not.toContain("tokensecreto");
    expect(out.breadcrumbs?.[0]?.data).toEqual({
      url: "https://app.test/convite/[token]",
      method: "GET",
      status_code: 200,
    });
  });

  it("is idempotent and does not mutate its input", () => {
    const input = sample();
    const snapshot = structuredClone(input);
    const once = scrubEvent(input);
    expect(input).toEqual(snapshot);
    expect(scrubEvent(once)).toEqual(once);
  });

  it("never lets generated e-mails or amounts through any text field", () => {
    const email = fc
      .tuple(
        fc.stringMatching(/^[a-z]{3,10}$/),
        fc.stringMatching(/^[a-z]{3,10}$/),
      )
      .map(([a, b]) => `${a}@${b}.com`);
    const amount = fc
      .tuple(fc.integer({ min: 1, max: 999 }), fc.integer({ min: 0, max: 99 }))
      .map(([r, c]) => `R$ ${r},${String(c).padStart(2, "0")}`);
    fc.assert(
      fc.property(email, amount, (mail, money) => {
        const out = scrubEvent({
          message: `erro ${mail} ${money}`,
          exception: { values: [{ value: `x ${money} y ${mail}` }] },
          transaction: `/rota ${mail}`,
          breadcrumbs: [{ category: "fetch", message: `${mail} ${money}` }],
          contexts: { app: { name: `${mail} ${money}` } },
          tags: { t: `${mail} ${money}` },
        });
        const json = JSON.stringify(out);
        expect(json).not.toContain(mail);
        expect(json).not.toContain(money);
      }),
    );
  });
});

describe("scrubBreadcrumb", () => {
  it("keeps navigation endpoints without query", () => {
    const out = scrubBreadcrumb({
      category: "navigation",
      data: { from: "/a?x=1", to: "/b?y=2", extra: "x" },
    });
    expect(out?.data).toEqual({ from: "/a", to: "/b" });
  });
});
