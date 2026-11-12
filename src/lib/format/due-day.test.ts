import { describe, expect, it } from "vitest";
import { holidayCalendar, nonBusinessDue } from "@/lib/finance";
import {
  graceLabel,
  nonBusinessDetail,
  nonBusinessShort,
  nonBusinessSpoken,
} from "./due-day";

const calendar = holidayCalendar([2026, 2027]);
const nb = (due: string) => {
  const value = nonBusinessDue(due, calendar);
  if (!value) throw new Error(`${due} is a business day`);
  return value;
};

describe("nonBusinessShort and nonBusinessSpoken", () => {
  it("shortens for the row", () => {
    expect(nonBusinessShort(nb("2026-11-14"))).toBe(
      "Dia não útil · passa para seg, 16 nov",
    );
  });

  it("spells it out for screen readers", () => {
    expect(nonBusinessSpoken(nb("2026-11-14"))).toBe(
      "vence em dia não útil, passa para segunda, 16 de novembro",
    );
    expect(nonBusinessSpoken(nb("2026-11-20"))).toBe(
      "vence em dia não útil, passa para segunda, 23 de novembro",
    );
  });
});

describe("nonBusinessDetail", () => {
  it("weekend, with time to pay before", () => {
    expect(
      nonBusinessDetail(nb("2026-11-14"), "2026-11-14", "2026-11-11"),
    ).toBe(
      "Vence num sábado, dia não útil. O pagamento costuma passar para o próximo dia útil, segunda, 16 de novembro. Se preferir não esperar, pague até sexta, 13 de novembro.",
    );
    expect(
      nonBusinessDetail(nb("2026-11-15"), "2026-11-15", "2026-11-11"),
    ).toMatch(/^Vence num domingo, dia não útil\./);
  });

  it("holiday, with its name", () => {
    expect(
      nonBusinessDetail(nb("2026-11-20"), "2026-11-20", "2026-11-12"),
    ).toBe(
      "Vence num feriado (Consciência Negra). O pagamento costuma passar para o próximo dia útil, segunda, 23 de novembro. Se preferir não esperar, pague até quinta, 19 de novembro.",
    );
  });

  it("31/dez, a day without banking", () => {
    expect(
      nonBusinessDetail(nb("2026-12-31"), "2026-12-31", "2026-12-20"),
    ).toBe(
      "Vence num dia sem expediente bancário (31/dez). O pagamento costuma passar para o próximo dia útil, segunda, 4 de janeiro. Se preferir não esperar, pague até quarta, 30 de dezembro.",
    );
  });

  it("says 'pague hoje' on the last business day", () => {
    expect(
      nonBusinessDetail(nb("2026-11-14"), "2026-11-14", "2026-11-13"),
    ).toMatch(/Se preferir não esperar, pague hoje\.$/);
  });

  it("drops the last sentence once the last business day has passed", () => {
    const text = nonBusinessDetail(
      nb("2026-11-14"),
      "2026-11-14",
      "2026-11-14",
    );
    expect(text).not.toMatch(/Se preferir/);
    expect(text).toMatch(/^Vence num sábado/);
  });

  it("uses 'Venceu' after the due date", () => {
    expect(
      nonBusinessDetail(nb("2026-11-14"), "2026-11-14", "2026-11-15"),
    ).toMatch(/^Venceu num sábado, dia não útil\./);
  });
});

describe("graceLabel (D2, fixed today)", () => {
  it("today, tomorrow, and a named day", () => {
    expect(graceLabel("2026-11-16", "2026-11-16")).toBe("Prazo até hoje");
    expect(graceLabel("2026-11-16", "2026-11-15")).toBe("Prazo até amanhã");
    expect(graceLabel("2026-11-16", "2026-11-14")).toBe(
      "Prazo até seg, 16 nov",
    );
  });
});
