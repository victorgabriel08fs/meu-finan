import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/lib/notifications/preferences";
import { previewMessage } from "./push-settings";
import {
  devicesNote,
  persistNotificationPreferences,
  ReminderList,
} from "./reminder-settings";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));
// Server Actions are not available outside Next.
vi.mock("@/server/actions/notifications", () => ({
  saveNotificationPreferencesAction: mocks.save,
  previewRemindersAction: vi.fn(),
}));
vi.mock("@/server/actions/push", () => ({}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const render = (
  preferences: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES,
  { monthStartDay = 1, devices = 1, nonBusinessDue = false } = {},
) =>
  renderToStaticMarkup(
    <ReminderList
      preferences={preferences}
      monthStartDay={monthStartDay}
      devices={devices}
      nonBusinessDue={nonBusinessDue}
      onChange={vi.fn()}
    />,
  );

/** The <li> of one notice. */
const row = (html: string, event: string) =>
  new RegExp(`<li[^>]*data-event="${event}"[^>]*>(.*?)</li>`).exec(html)?.[1] ??
  "";

const switchOn = (html: string) =>
  /role="switch" aria-checked="true"/.test(html);

describe("ReminderList", () => {
  it("shows the five notices with the owner's defaults", () => {
    const html = render();
    const expected = {
      daily_summary: false,
      bills_due: true,
      income_countdown: false,
      weekly_summary: true,
      monthly_summary: true,
    };
    for (const [event, on] of Object.entries(expected)) {
      expect(switchOn(row(html, event)), event).toBe(on);
    }
    expect(html).toContain("Resumo do dia");
    expect(html).toContain("Toda segunda, como foi a semana.");
    // Amounts off by default.
    const privacy = html.slice(html.indexOf("Privacidade"));
    expect(privacy).toContain("Mostrar valores nas notificações");
    expect(switchOn(privacy)).toBe(false);
  });

  it("shows Vencimento em dia não útil only with the flag, right after Contas a vencer, on by default", () => {
    const off = render();
    expect(off).not.toContain("Vencimento em dia não útil");
    expect(off).not.toContain('data-event="non_business_due"');
    const on = render(undefined, { nonBusinessDue: true });
    expect(on).toContain("Vencimento em dia não útil");
    expect(on).toContain(
      "No último dia útil antes, quando uma conta vence no fim de semana ou num feriado.",
    );
    expect(on.indexOf('data-event="bills_due"')).toBeLessThan(
      on.indexOf('data-event="non_business_due"'),
    );
    expect(on.indexOf('data-event="non_business_due"')).toBeLessThan(
      on.indexOf('data-event="income_countdown"'),
    );
    expect(switchOn(row(on, "non_business_due"))).toBe(true);
  });

  it("counts only the visible rows for 'Todos os avisos estão desligados'", () => {
    const hiddenOnly = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      events: {
        daily_summary: false,
        bills_due: false,
        non_business_due: true,
        income_countdown: false,
        weekly_summary: false,
        monthly_summary: false,
      },
    };
    expect(render(hiddenOnly)).toContain("Todos os avisos estão desligados.");
    expect(render(hiddenOnly, { nonBusinessDue: true })).not.toContain(
      "Todos os avisos estão desligados.",
    );
  });

  it("shows the lead time only while Contas a vencer is on", () => {
    const bills = row(render(), "bills_due");
    expect(bills).toContain('role="radiogroup"');
    expect(bills).toContain('aria-label="Avisar com antecedência"');
    expect(bills).toMatch(/aria-checked="true"[^>]*>.*?1 dia/);
    const off = render({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      events: { ...DEFAULT_NOTIFICATION_PREFERENCES.events, bills_due: false },
    });
    expect(off).not.toContain('role="radiogroup"');
  });

  it("names the first day of the financial month", () => {
    expect(row(render(), "monthly_summary")).toContain(
      "No dia 1º, como foi o mês que fechou.",
    );
    expect(
      row(render(undefined, { monthStartDay: 5 }), "monthly_summary"),
    ).toContain("No dia 5, como foi o mês que fechou.");
  });

  it("says when and where the notices arrive", () => {
    const defaults = DEFAULT_NOTIFICATION_PREFERENCES;
    expect(devicesNote(1, defaults)).toBe(
      "Chegam uma vez por dia, entre 6h e 7h (horário de Brasília), em 1 aparelho.",
    );
    expect(devicesNote(2, defaults)).toContain("em 2 aparelhos.");
    expect(devicesNote(0, defaults)).toBe(
      "Chegam uma vez por dia, entre 6h e 7h (horário de Brasília). Nenhum aparelho recebe ainda: ligue “Receber notificações” acima.",
    );
    expect(render(undefined, { devices: 0 })).toContain(
      "Nenhum aparelho recebe ainda",
    );
    const allOff = {
      ...defaults,
      events: {
        daily_summary: false,
        bills_due: false,
        non_business_due: false,
        income_countdown: false,
        weekly_summary: false,
        monthly_summary: false,
      },
    };
    expect(devicesNote(1, allOff)).toBe("Todos os avisos estão desligados.");
    expect(devicesNote(0, allOff)).toBe("Todos os avisos estão desligados.");
  });

  it("with the bell on, the notices also stay in the sino, device or not", () => {
    const defaults = DEFAULT_NOTIFICATION_PREFERENCES;
    const events = ["bills_due", "weekly_summary"] as const;
    expect(devicesNote(1, defaults, events, true)).toBe(
      "Chegam uma vez por dia, entre 6h e 7h (horário de Brasília), no sino e em 1 aparelho.",
    );
    expect(devicesNote(3, defaults, events, true)).toContain(
      "no sino e em 3 aparelhos.",
    );
    expect(devicesNote(0, defaults, events, true)).toBe(
      "Chegam uma vez por dia, entre 6h e 7h (horário de Brasília), no sino do app. Para receber também no celular, ligue “Receber notificações” acima.",
    );
  });

  it("lets the lead time wrap instead of cutting it", () => {
    const bills = row(render(), "bills_due");
    expect(bills).toContain("break-words");
    expect(bills).not.toContain("truncate");
  });
});

describe("persistNotificationPreferences", () => {
  const retry = vi.fn();

  it("sends the whole choice", async () => {
    mocks.save.mockResolvedValue({});
    expect(
      await persistNotificationPreferences(
        DEFAULT_NOTIFICATION_PREFERENCES,
        retry,
      ),
    ).toBe(true);
    expect(mocks.save).toHaveBeenCalledWith(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("explains what went wrong and reports nothing saved", async () => {
    mocks.save.mockResolvedValue({
      serverError: "As notificações não estão disponíveis.",
    });
    expect(
      await persistNotificationPreferences(
        DEFAULT_NOTIFICATION_PREFERENCES,
        retry,
      ),
    ).toBe(false);
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "As notificações não estão disponíveis.",
      { action: { label: "Tentar de novo", onClick: retry } },
    );
    mocks.save.mockRejectedValue(new Error("offline"));
    expect(
      await persistNotificationPreferences(
        DEFAULT_NOTIFICATION_PREFERENCES,
        retry,
      ),
    ).toBe(false);
    expect(mocks.toast.error).toHaveBeenLastCalledWith(
      "Não conseguimos salvar. Verifique a conexão.",
      { action: { label: "Tentar de novo", onClick: retry } },
    );
  });
});

describe("previewMessage", () => {
  it("counts the previews sent", () => {
    expect(previewMessage(0)).toBe(
      "Nada para mostrar hoje nos avisos ligados.",
    );
    expect(previewMessage(1)).toBe("Enviamos 1 prévia para este aparelho.");
    expect(previewMessage(3)).toBe("Enviamos 3 prévias para este aparelho.");
  });
});
