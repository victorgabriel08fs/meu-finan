import type { FlagGrammar } from "./registry";

/**
 * "ligado", "ligada", "ligados" or "ligadas" (and the "des-" forms): the word
 * that agrees with the flag's label, e.g. "Notificações ligadas para todos."
 * Pure, so it is tested without the interface.
 */
export function switchedLabel(grammar: FlagGrammar, enabled: boolean): string {
  const ending = `${grammar.gender === "feminine" ? "a" : "o"}${grammar.plural ? "s" : ""}`;
  return `${enabled ? "ligad" : "desligad"}${ending}`;
}
