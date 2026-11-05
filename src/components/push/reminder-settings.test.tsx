import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/lib/notifications/preferences";
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
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

beforeEach(() => {
  vi.clearAllMocks();
});

const render = (
  preferences: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES,
  { monthStartDay = 1, devices = 1 } = {},
) =>
  renderToStaticMarkup(
    <ReminderList
      preferences={preferences}
      monthStartDay={monthStartDay}
      devices={devices}
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
        income_countdown: false,
        weekly_summary: false,
        monthly_summary: false,
      },
    };
    expect(devicesNote(1, allOff)).toBe("Todos os avisos estão desligados.");
    expect(devicesNote(0, allOff)).toBe("Todos os avisos estão desligados.");
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
