import { describe, expect, it } from "vitest";
import { THEMES } from "@/server/db/schema/enums";
import {
  DEFAULT_THEME,
  isThemeChoice,
  shouldAdoptAccountTheme,
  THEME_BOOT_SCRIPT,
  THEME_CHOICES,
  THEME_COLORS,
  THEME_LABELS,
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
  it("adopts the account's theme on a device that never synced", () => {
    expect(
      shouldAdoptAccountTheme({ saved: "light", synced: null, pending: false }),
    ).toBe(true);
  });

  it("adopts a change made on another device", () => {
    expect(
      shouldAdoptAccountTheme({
        saved: "light",
        synced: "dark",
        pending: false,
      }),
    ).toBe(true);
  });

  it("leaves the device alone when the account did not change", () => {
    expect(
      shouldAdoptAccountTheme({
        saved: "dark",
        synced: "dark",
        pending: false,
      }),
    ).toBe(false);
  });

  it("never fights a save that is still on its way", () => {
    expect(
      shouldAdoptAccountTheme({
        saved: "dark",
        synced: "light",
        pending: true,
      }),
    ).toBe(false);
  });
});

/** Runs the boot script against a minimal document. */
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
  const document = {
    querySelectorAll: (selector: string) =>
      selector.includes("theme-color") ? themeColors : [],
    querySelector: (selector: string) =>
      selector.includes("color-scheme") ? colorScheme : null,
  };
  new Function("localStorage", "matchMedia", "document", THEME_BOOT_SCRIPT)(
    localStorage,
    matchMedia,
    document,
  );
  return {
    themeColors: themeColors.map((meta) => meta.content),
    colorScheme: colorScheme.content,
  };
}

describe("THEME_BOOT_SCRIPT", () => {
  it("points the bars at dark on a first visit, whatever the system says", () => {
    expect(boot({})).toEqual({
      themeColors: [THEME_COLORS.dark, THEME_COLORS.dark],
      colorScheme: "dark",
    });
  });

  it("follows the saved choice", () => {
    expect(boot({ stored: "light", prefersDark: true })).toEqual({
      themeColors: [THEME_COLORS.light, THEME_COLORS.light],
      colorScheme: "light",
    });
    expect(boot({ stored: "dark" }).colorScheme).toBe("dark");
  });

  it("resolves Sistema through prefers-color-scheme", () => {
    expect(boot({ stored: "system", prefersDark: false }).colorScheme).toBe(
      "light",
    );
    expect(boot({ stored: "system", prefersDark: true }).colorScheme).toBe(
      "dark",
    );
  });

  it("falls back to dark on an unknown value and never throws", () => {
    expect(boot({ stored: "sepia" }).colorScheme).toBe("dark");
    expect(() => boot({ storageThrows: true })).not.toThrow();
    expect(boot({ storageThrows: true }).colorScheme).toBe("");
  });
});
