import { describe, expect, it } from "vitest";
import { switchedLabel } from "./labels";
import { FLAG_KEYS, FLAGS } from "./registry";

describe("switchedLabel", () => {
  it("agrees with the gender and the number of the flag", () => {
    const masculine = { gender: "masculine", plural: false } as const;
    const feminine = { gender: "feminine", plural: false } as const;
    expect(switchedLabel(masculine, true)).toBe("ligado");
    expect(switchedLabel(masculine, false)).toBe("desligado");
    expect(switchedLabel(feminine, true)).toBe("ligada");
    expect(switchedLabel({ ...feminine, plural: true }, true)).toBe("ligadas");
    expect(switchedLabel({ ...feminine, plural: true }, false)).toBe(
      "desligadas",
    );
    expect(switchedLabel({ ...masculine, plural: true }, true)).toBe("ligados");
  });

  it("reads right for the flags of the registry", () => {
    expect(switchedLabel(FLAGS.notificacoes_push.grammar, true)).toBe(
      "ligadas",
    );
    expect(switchedLabel(FLAGS.importar_extrato.grammar, false)).toBe(
      "desligado",
    );
  });

  it("every flag declares its grammar", () => {
    for (const key of FLAG_KEYS) {
      expect(FLAGS[key].grammar.gender).toMatch(/^(masculine|feminine)$/);
      expect(typeof FLAGS[key].grammar.plural).toBe("boolean");
    }
  });
});
