// Flag resolution (doc 01 §11.10), pure: the server reads the stored values and
// hands them here. A person's own value wins over the global value, which wins
// over the registry default. Stored keys that are not in the registry (a flag
// removed from the code) are ignored.
import { FLAG_KEYS, FLAGS, type FlagKey, type Flags } from "./registry";

/** A stored value as read from the database; the key may be unknown. */
export type StoredFlag = { key: string; enabled: boolean };

/** Where an effective value comes from. */
export type FlagSource = "user" | "global" | "default";

/** The three choices of Administração › Flags: Padrão · Ligado · Desligado. */
export type FlagSetting = "default" | "on" | "off";

export function resolveFlags(
  globals: readonly StoredFlag[],
  overrides: readonly StoredFlag[] = [],
): Flags {
  const global = new Map(globals.map((row) => [row.key, row.enabled]));
  const own = new Map(overrides.map((row) => [row.key, row.enabled]));
  return Object.fromEntries(
    FLAG_KEYS.map((key) => [
      key,
      own.get(key) ?? global.get(key) ?? FLAGS[key].defaultValue,
    ]),
  ) as Flags;
}

/** One flag's effective value and its source. `null` means "not set". */
export function resolveFlag(
  key: FlagKey,
  global: boolean | null,
  own: boolean | null = null,
): { enabled: boolean; source: FlagSource } {
  if (own !== null) return { enabled: own, source: "user" };
  if (global !== null) return { enabled: global, source: "global" };
  return { enabled: FLAGS[key].defaultValue, source: "default" };
}

/** Stored value (or its absence) as a setting, and back. */
export function toFlagSetting(value: boolean | null | undefined): FlagSetting {
  if (value === true) return "on";
  if (value === false) return "off";
  return "default";
}

export function fromFlagSetting(setting: FlagSetting): boolean | null {
  if (setting === "on") return true;
  if (setting === "off") return false;
  return null;
}
