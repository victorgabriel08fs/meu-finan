import { describe, expect, it } from "vitest";
import * as motion from "./motion";
import {
  RECAP_CONTENT_DELAY_MS,
  RECAP_COUNT_MS,
  RECAP_REVEAL_MS,
  RECAP_STAGGER_MS,
  revealEnd,
  stagger,
  weekEnd,
} from "./motion";

describe("tempos da retrospectiva", () => {
  it("nenhuma animação passa de 1 s (doc 02 §3.8), fora a troca de fundo", () => {
    for (const [name, value] of Object.entries(motion)) {
      if (!name.endsWith("_MS") || name === "RECAP_DRIFT_MS") continue;
      expect(value as number, name).toBeLessThanOrEqual(1000);
    }
    expect(RECAP_COUNT_MS).toBeLessThanOrEqual(1000);
  });

  it("o movimento reduzido é só um fade curto", () => {
    expect(motion.RECAP_REDUCED_FADE_MS).toBeLessThanOrEqual(150);
  });
});

describe("stagger", () => {
  it("começa depois do atraso do conteúdo, em segundos", () => {
    expect(stagger(0)).toBeCloseTo(RECAP_CONTENT_DELAY_MS / 1000);
  });

  it("soma o intervalo por elemento", () => {
    expect(stagger(2) - stagger(1)).toBeCloseTo(RECAP_STAGGER_MS / 1000);
  });

  it("para de crescer no quinto elemento", () => {
    expect(stagger(5)).toBe(stagger(50));
    expect(stagger(4)).toBeLessThan(stagger(5));
  });

  it("aceita outra base", () => {
    expect(stagger(0, 1)).toBe(1);
  });
});

describe("revealEnd e weekEnd", () => {
  it("o fim da entrada é o início mais a duração do Reveal", () => {
    expect(revealEnd(1)).toBeCloseTo(stagger(1) + RECAP_REVEAL_MS / 1000);
  });

  it("weekEnd não passa da última semana nem do teto de 6", () => {
    expect(weekEnd(10, 3)).toBe(weekEnd(2, 3));
    expect(weekEnd(10, 9)).toBe(weekEnd(5, 9));
    expect(weekEnd(1, 4)).toBeGreaterThan(weekEnd(0, 4));
  });
});
