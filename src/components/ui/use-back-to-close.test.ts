import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A browser history: `back()` moves the index and fires `popstate` in a
 * later task, as browsers do, so a push made before it lands is undone.
 */
function fakeWindow(start: string) {
  const entries = [start];
  let index = 0;
  const listeners: (() => void)[] = [];
  const window = {
    setTimeout: (run: () => void, ms: number) => setTimeout(run, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    addEventListener: (_type: "popstate", listener: () => void) => {
      listeners.push(listener);
    },
    location: {
      get href() {
        return entries[index];
      },
    },
    history: {
      pushState: (_state: unknown, _title: string, url?: string) => {
        entries.splice(index + 1, Infinity, url ?? entries[index]);
        index += 1;
      },
      back: () => {
        if (index === 0) return;
        index -= 1;
        setTimeout(() => {
          for (const listener of listeners) listener();
        }, 0);
      },
    },
  };
  return {
    window,
    /** The entries up to the current one: what Back walks through. */
    stack: () => entries.slice(0, index + 1),
  };
}

async function load() {
  vi.resetModules();
  return import("./use-back-to-close");
}

describe("afterSheetsClose", () => {
  let browser: ReturnType<typeof fakeWindow>;

  beforeEach(() => {
    vi.useFakeTimers();
    browser = fakeWindow("/extrato");
    vi.stubGlobal("window", browser.window);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("runs right away when no sheet is stepping back", async () => {
    const { afterSheetsClose } = await load();
    const run = vi.fn();
    afterSheetsClose(run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("waits for the step back of a sheet closed from the UI", async () => {
    const { afterSheetsClose, holdSheetEntry } = await load();
    const release = holdSheetEntry(vi.fn());
    await vi.runAllTimersAsync();
    expect(browser.stack()).toEqual(["/extrato", "/extrato"]);

    release();
    const push = vi.fn(() =>
      browser.window.history.pushState(null, "", "/extrato?conta=1"),
    );
    afterSheetsClose(push);
    expect(push).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(push).toHaveBeenCalledTimes(1);
    // Back now undoes the filter instead of reopening the sheet.
    expect(browser.stack()).toEqual(["/extrato", "/extrato?conta=1"]);
  });

  it("waits for every sheet closed at once, then runs each queued step once", async () => {
    const { afterSheetsClose, holdSheetEntry } = await load();
    const releaseOuter = holdSheetEntry(vi.fn());
    await vi.runAllTimersAsync();
    const releaseInner = holdSheetEntry(vi.fn());
    await vi.runAllTimersAsync();
    expect(browser.stack()).toHaveLength(3);

    releaseInner();
    releaseOuter();
    const first = vi.fn();
    const second = vi.fn();
    afterSheetsClose(first);
    afterSheetsClose(second);
    await vi.runAllTimersAsync();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(browser.stack()).toEqual(["/extrato"]);

    // The queue is empty again: the next step runs right away, only once.
    afterSheetsClose(first);
    expect(first).toHaveBeenCalledTimes(2);
  });

  it("runs right away when the sheet left its entry behind a navigation", async () => {
    const { afterSheetsClose, holdSheetEntry } = await load();
    const release = holdSheetEntry(vi.fn());
    await vi.runAllTimersAsync();
    browser.window.history.pushState(null, "", "/contas");

    release();
    const run = vi.fn();
    afterSheetsClose(run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(browser.stack()).toEqual(["/extrato", "/extrato", "/contas"]);
  });

  it("runs right away when the sheet closed before its entry was pushed", async () => {
    const { afterSheetsClose, holdSheetEntry } = await load();
    const release = holdSheetEntry(vi.fn());
    release();
    const run = vi.fn();
    afterSheetsClose(run);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(browser.stack()).toEqual(["/extrato"]);
  });

  it("closes the topmost sheet on Back, without waiting for anything", async () => {
    const { afterSheetsClose, holdSheetEntry } = await load();
    const close = vi.fn();
    holdSheetEntry(close);
    await vi.runAllTimersAsync();

    browser.window.history.back();
    await vi.runAllTimersAsync();
    expect(close).toHaveBeenCalledTimes(1);
    const run = vi.fn();
    afterSheetsClose(run);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
