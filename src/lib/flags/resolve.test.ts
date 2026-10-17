import { describe, expect, it } from "vitest";
import { defaultFlags, FLAG_KEYS, FLAGS, isFlagKey } from "./registry";
import {
  fromFlagSetting,
  resolveFlag,
  resolveFlags,
  toFlagSetting,
} from "./resolve";

describe("registry", () => {
  it("has snake_case keys, pt-BR copy and an ISO date for every flag", () => {
    expect(FLAG_KEYS.length).toBeGreaterThan(0);
    for (const key of FLAG_KEYS) {
      expect(key).toMatch(/^[a-z][a-z0-9_]{0,62}$/);
      const flag = FLAGS[key];
      expect(flag.label.length).toBeGreaterThan(0);
      expect(flag.description.length).toBeGreaterThan(0);
      expect(flag.owner.length).toBeGreaterThan(0);
      expect(flag.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("ships importar_extrato on by default", () => {
    expect(FLAGS.importar_extrato.defaultValue).toBe(true);
    expect(defaultFlags().importar_extrato).toBe(true);
  });

  it("knows its own keys only", () => {
    expect(isFlagKey("importar_extrato")).toBe(true);
    expect(isFlagKey("toString")).toBe(false);
    expect(isFlagKey("flag_que_nao_existe")).toBe(false);
  });
});

describe("resolveFlags", () => {
  it("uses the registry defaults when nothing is stored", () => {
    expect(resolveFlags([], [])).toEqual(defaultFlags());
  });

  it("lets the global value replace the default", () => {
    expect(
      resolveFlags([{ key: "importar_extrato", enabled: false }])
        .importar_extrato,
    ).toBe(false);
  });

  it("lets a person's own value win over the global one", () => {
    const flags = resolveFlags(
      [{ key: "importar_extrato", enabled: false }],
      [{ key: "importar_extrato", enabled: true }],
    );
    expect(flags.importar_extrato).toBe(true);
    const off = resolveFlags(
      [{ key: "importar_extrato", enabled: true }],
      [{ key: "importar_extrato", enabled: false }],
    );
    expect(off.importar_extrato).toBe(false);
  });

  it("ignores keys that are not in the registry", () => {
    const flags = resolveFlags(
      [{ key: "flag_removida", enabled: true }],
      [{ key: "outra_removida", enabled: false }],
    );
    expect(flags).toEqual(defaultFlags());
    expect(Object.keys(flags)).toEqual(FLAG_KEYS);
  });
});

describe("resolveFlag", () => {
  it("reports where the value comes from", () => {
    expect(resolveFlag("importar_extrato", null, null)).toEqual({
      enabled: true,
      source: "default",
    });
    expect(resolveFlag("importar_extrato", false, null)).toEqual({
      enabled: false,
      source: "global",
    });
    expect(resolveFlag("importar_extrato", false, true)).toEqual({
      enabled: true,
      source: "user",
    });
  });
});

describe("settings", () => {
  it("round-trips Padrão · Ligado · Desligado", () => {
    for (const value of [true, false, null]) {
      expect(fromFlagSetting(toFlagSetting(value))).toBe(value);
    }
    expect(toFlagSetting(undefined)).toBe("default");
  });
});
