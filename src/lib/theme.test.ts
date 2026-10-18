import { describe, expect, it } from "vitest";
import { THEMES } from "@/server/db/schema/enums";
import {
  DEFAULT_THEME,
  isThemeChoice,
  shouldAdoptAccountTheme,
  syncedTheme,
  THEME_CHOICES,
  THEME_COLORS,
  THEME_HEAD_SCRIPT,
  THEME_LABELS,
  THEME_META_SCRIPT,
  THEME_STORAGE_KEY,
} from "./theme";

describe("theme choices", () => {
  it("are the database's themes, dark first and by default", () => {
    expect([...THEME_CHOICES].sort()).toEqual([...THEMES].sort());
    expect(THEME_CHOICES).toEqual(["dark", "light", "system"]);
    expect(DEFAULT_THEME).toBe("dark");
    expect(THEME_CHOICES.map((choice) => THEME_LABELS[choice])).toEqual([
      "Escuro",
      "Claro",
      "Sistema",
    ]);
  });

  it("recognises only known choices", () => {
    expect(isThemeChoice("dark")).toBe(true);
    expect(isThemeChoice("system")).toBe(true);
    expect(isThemeChoice("sepia")).toBe(false);
    expect(isThemeChoice(null)).toBe(false);
    expect(isThemeChoice(undefined)).toBe(false);
  });
});

describe("shouldAdoptAccountTheme", () => {
  it("marks the synced value with the account", () => {
    expect(syncedTheme("ana", "dark")).toBe("ana:dark");
  });

  it("adopts the account's theme on a device that never synced", () => {
    expect(
      shouldAdoptAccountTheme({
        userId: "ana",
        saved: "light",
        synced: null,
        pending: false,
      }),
    ).toBe(true);
  });

  it("adopts a change made on another device", () => {
    expect(
      shouldAdoptAccountTheme({
        userId: "ana",
        saved: "light",
        synced: "ana:dark",
        pending: false,
      }),
    ).toBe(true);
  });

  it("leaves the device alone when the account did not change", () => {
    expect(
      shouldAdoptAccountTheme({
        userId: "ana",
        saved: "dark",
        synced: "ana:dark",
        pending: false,
      }),
    ).toBe(false);
  });

  it("adopts when another account synced the device last, even with the same theme", () => {
    expect(
      shouldAdoptAccountTheme({
        userId: "bruno",
        saved: "dark",
        synced: "ana:dark",
        pending: false,
      }),
    ).toBe(true);
  });

  it("never fights a save that is still on its way", () => {
    expect(
      shouldAdoptAccountTheme({
        userId: "ana",
        saved: "dark",
        synced: "ana:light",
        pending: true,
      }),
    ).toBe(false);
  });
});

/**
 * Runs the two inline theme scripts against a minimal document whose <html>
 * comes from the server with the default theme.
 */
function boot({
  stored,
  prefersDark = false,
  storageThrows = false,
}: {
  stored?: string;
  prefersDark?: boolean;
  storageThrows?: boolean;
}) {
  const meta = () => {
    const element = {
      content: "",
      setAttribute(name: string, value: string) {
        if (name === "content") element.content = value;
      },
    };
    return element;
  };
  const themeColors = [meta(), meta()];
  const colorScheme = meta();
  const localStorage = {
    getItem(key: string) {
      if (storageThrows) throw new Error("SecurityError");
      return key === THEME_STORAGE_KEY ? (stored ?? null) : null;
    },
  };
  const matchMedia = (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && prefersDark,
  });
  const documentElement = {
    dataset: { theme: DEFAULT_THEME } as Record<string, string>,
    style: { colorScheme: "" },
  };
  const document = {
    documentElement,
    querySelectorAll: (selector: string) =>
      selector.includes("theme-color") ? themeColors : [],
    querySelector: (selector: string) =>
      selector.includes("color-scheme") ? colorScheme : null,
  };
  for (const script of [THEME_HEAD_SCRIPT, THEME_META_SCRIPT]) {
    new Function("localStorage", "matchMedia", "document", script)(
      localStorage,
      matchMedia,
      document,
    );
  }
  return {
    theme: documentElement.dataset.theme,
    colorSchemeStyle: documentElement.style.colorScheme,
    themeColors: themeColors.map((element) => element.content),
    colorScheme: colorScheme.content,
  };
}

describe("theme scripts", () => {
  it("keep a first visit dark, whatever the system says", () => {
    expect(boot({ prefersDark: false })).toEqual({
      theme: "dark",
      colorSchemeStyle: "dark",
      themeColors: [THEME_COLORS.dark, THEME_COLORS.dark],
      colorScheme: "dark",
    });
  });

  it("put the saved choice on <html> and on the bars", () => {
    expect(boot({ stored: "light", prefersDark: true })).toEqual({
      theme: "light",
      colorSchemeStyle: "light",
      themeColors: [THEME_COLORS.light, THEME_COLORS.light],
      colorScheme: "light",
    });
    expect(boot({ stored: "dark" }).theme).toBe("dark");
  });

  it("resolve Sistema through prefers-color-scheme", () => {
    expect(boot({ stored: "system", prefersDark: false })).toMatchObject({
      theme: "light",
      colorScheme: "light",
    });
    expect(boot({ stored: "system", prefersDark: true })).toMatchObject({
      theme: "dark",
      colorScheme: "dark",
    });
  });

  it("fall back to dark on an unknown value", () => {
    expect(boot({ stored: "sepia" })).toMatchObject({
      theme: "dark",
      colorScheme: "dark",
    });
  });

  it("never throw and leave the server's dark in place without storage", () => {
    expect(() => boot({ storageThrows: true })).not.toThrow();
    expect(boot({ storageThrows: true })).toEqual({
      theme: "dark",
      colorSchemeStyle: "",
      themeColors: ["", ""],
      colorScheme: "",
    });
  });
});
