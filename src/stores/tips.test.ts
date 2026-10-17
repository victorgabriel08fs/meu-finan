import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TipsSnapshot } from "@/lib/tips";
import { useTipsStore } from "./tips";

// Server Actions are not importable outside Next: the store only needs their
// results, which each test sets.
const actions = vi.hoisted(() => ({
  markTipsSeenAction: vi.fn(),
  setTipsOffAction: vi.fn(),
  resetTipsAction: vi.fn(),
}));
vi.mock("@/server/actions/tips", () => actions);

const snapshot = (patch: Partial<TipsSnapshot> = {}): TipsSnapshot => ({
  seen: [],
  off: false,
  createdOn: "2026-01-01",
  context: { hasAccounts: true, hasPasskey: false, role: null, flags: [] },
  ...patch,
});

const store = () => useTipsStore.getState();
const seen = () => [...store().seen].sort();

beforeEach(() => {
  vi.useRealTimers();
  for (const action of Object.values(actions)) action.mockReset();
  actions.markTipsSeenAction.mockResolvedValue({});
  actions.setTipsOffAction.mockResolvedValue({});
  actions.resetTipsAction.mockResolvedValue({});
  useTipsStore.setState(useTipsStore.getInitialState(), true);
});

describe("tips store", () => {
  it("starts empty and takes the server's snapshot", () => {
    expect(store().loaded).toBe(false);
    store().hydrate(snapshot({ seen: ["extrato-busca"], off: true }));
    expect(store().loaded).toBe(true);
    expect(seen()).toEqual(["extrato-busca"]);
    expect(store().off).toBe(true);
    expect(store().createdOn).toBe("2026-01-01");
  });

  it("marks seen at once and saves in the background, once per id", async () => {
    store().hydrate(snapshot());
    store().markSeen(["inicio-previsao"]);
    store().markSeen(["inicio-previsao"]);
    expect(seen()).toEqual(["inicio-previsao"]);
    await vi.waitFor(() =>
      expect(actions.markTipsSeenAction).toHaveBeenCalledWith({
        ids: ["inicio-previsao"],
      }),
    );
    expect(actions.markTipsSeenAction).toHaveBeenCalledTimes(1);
  });

  it("keeps what the browser saw when an older snapshot arrives", () => {
    store().hydrate(snapshot());
    store().markSeen(["inicio-modo-discreto"]);
    store().hydrate(snapshot({ seen: ["extrato-busca"] }));
    expect(seen()).toEqual(["extrato-busca", "inicio-modo-discreto"]);
  });

  it("retries a failed save with the next one", async () => {
    vi.useFakeTimers();
    actions.markTipsSeenAction
      .mockResolvedValueOnce({ serverError: "Algo deu errado." })
      .mockResolvedValue({});
    store().hydrate(snapshot());
    store().markSeen(["inicio-previsao"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(actions.markTipsSeenAction).toHaveBeenCalledTimes(1);
    // The tip stays dismissed meanwhile.
    expect(store().seen.has("inicio-previsao")).toBe(true);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(actions.markTipsSeenAction).toHaveBeenCalledTimes(2);
    expect(actions.markTipsSeenAction).toHaveBeenLastCalledWith({
      ids: ["inicio-previsao"],
    });
  });

  it("turns tips off optimistically and reverts when the server refuses", async () => {
    store().hydrate(snapshot());
    let resolve: (value: unknown) => void = () => {};
    actions.setTipsOffAction.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const saving = store().setOff(true);
    expect(store().off).toBe(true);
    // A snapshot rendered before the change does not undo it meanwhile.
    store().hydrate(snapshot({ off: false }));
    expect(store().off).toBe(true);
    resolve({});
    await expect(saving).resolves.toBe(true);

    actions.setTipsOffAction.mockResolvedValueOnce({ serverError: "Erro." });
    await expect(store().setOff(false)).resolves.toBe(false);
    expect(store().off).toBe(true);
  });

  it("“Rever dicas” clears the basics, keeps novidades read and turns tips on", async () => {
    store().hydrate(
      snapshot({
        seen: ["inicio-previsao", "novidade-relatorios"],
        off: true,
      }),
    );
    await expect(store().reset()).resolves.toBe(true);
    expect(seen()).toEqual(["novidade-relatorios"]);
    expect(store().off).toBe(false);
  });

  it("leaves everything as it was when “Rever dicas” fails", async () => {
    store().hydrate(snapshot({ seen: ["inicio-previsao"], off: true }));
    actions.resetTipsAction.mockRejectedValueOnce(new Error("offline"));
    await expect(store().reset()).resolves.toBe(false);
    expect(seen()).toEqual(["inicio-previsao"]);
    expect(store().off).toBe(true);
  });
});
