import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("./quick-add-form");
  vi.resetModules();
});

describe("loadQuickAddForm", () => {
  it("fetches the form's module once, however many times it is asked", async () => {
    const factory = vi.fn(() => ({ QuickAddContent: () => null }));
    vi.doMock("./quick-add-form", factory);
    const { loadQuickAddForm, preloadQuickAddForm } = await import("./preload");
    await preloadQuickAddForm();
    const [first, second] = await Promise.all([
      loadQuickAddForm(),
      loadQuickAddForm(),
    ]);
    expect(first).toBe(second);
    expect(first.QuickAddContent).toBeTypeOf("function");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("tries again after a failed fetch, and the preload never throws", async () => {
    let fail = true;
    vi.doMock("./quick-add-form", () => {
      if (fail) throw new Error("offline");
      return { QuickAddContent: () => null };
    });
    const { loadQuickAddForm, preloadQuickAddForm } = await import("./preload");
    await expect(preloadQuickAddForm()).resolves.toBeUndefined();
    await expect(loadQuickAddForm()).rejects.toThrow();
    fail = false;
    vi.resetModules();
    await expect(loadQuickAddForm()).resolves.toHaveProperty("QuickAddContent");
  });
});
