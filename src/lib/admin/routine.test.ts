import { describe, expect, it } from "vitest";
import {
  cronHealth,
  describeReminders,
  describeRun,
  describeStep,
  durationLabel,
  type RunInput,
} from "./routine";

const NOW = new Date("2026-11-10T12:00:00Z");
const hoursAgo = (hours: number) =>
  new Date(NOW.getTime() - hours * 3_600_000).toISOString();

const run = (
  patch: Partial<RunInput> & { trigger?: "cron" | "manual" | "admin" } = {},
): RunInput => {
  const { trigger, ...rest } = patch;
  return {
    status: "ok",
    startedAt: hoursAgo(2),
    finishedAt: hoursAgo(2),
    report: { durationMs: 12_000, steps: [], ...(trigger ? { trigger } : {}) },
    ...rest,
  };
};

describe("durationLabel", () => {
  it("writes seconds and minutes", () => {
    expect(durationLabel(12_000)).toBe("12 s");
    expect(durationLabel(64_000)).toBe("1 min 4 s");
    expect(durationLabel(120_000)).toBe("2 min");
    expect(durationLabel(0)).toBe("0 s");
  });
});

describe("describeReminders", () => {
  const base = {
    recipients: 2,
    sent: {
      daily_summary: 1,
      bills_due: 2,
      income_countdown: 0,
      weekly_summary: 1,
      monthly_summary: 0,
    },
    alreadySent: 1,
    nothingToSend: 3,
    undelivered: 2,
    devicesRemoved: 1,
    notReached: 1,
    errors: 2,
  };

  it("counts what went out and what did not, with plurals", () => {
    expect(describeReminders(base)).toEqual([
      "2 pessoas com avisos ligados",
      "1 Resumo do dia enviado",
      "2 Contas a vencer enviadas",
      "1 Resumo semanal enviado",
      "1 aviso já tinha saído hoje",
      "3 sem nada a dizer hoje",
      "2 não entregues em nenhum aparelho (ficam para a próxima execução)",
      "1 aparelho removido (o serviço de push disse que não existe mais)",
      "1 pessoa ficou para a próxima execução (acabou o prazo)",
      "2 erros",
    ]);
  });

  it("says so when nobody had notices on and nothing went out", () => {
    expect(describeReminders({ recipients: 0, sent: {}, errors: 0 })).toEqual([
      "Ninguém tinha aviso ligado e aparelho inscrito.",
      "Nenhum aviso enviado nesta execução.",
    ]);
    expect(describeReminders({ recipients: 1 })).toEqual([
      "1 pessoa com avisos ligados",
      "Nenhum aviso enviado nesta execução.",
    ]);
  });

  it("gives nothing for missing or malformed details", () => {
    expect(describeReminders(undefined)).toEqual([]);
    expect(describeReminders("x")).toEqual([]);
    expect(describeReminders([1, 2])).toEqual([]);
    expect(
      describeReminders({ recipients: "muitas", sent: [1], errors: null }),
    ).toEqual([
      "Ninguém tinha aviso ligado e aparelho inscrito.",
      "Nenhum aviso enviado nesta execução.",
    ]);
  });
});

describe("describeStep", () => {
  it("names known steps and falls back to the raw name", () => {
    const step = { status: "ok", durationMs: 1000 } as const;
    expect(describeStep({ name: "purgeDeleted", ...step }).label).toBe(
      "Limpeza de excluídos",
    );
    expect(describeStep({ name: "novoPasso", ...step }).label).toBe(
      "novoPasso",
    );
  });

  it("shows the reason of a skipped step and the error apart", () => {
    const skipped = describeStep({
      name: "sendReminders",
      status: "skipped",
      durationMs: 3,
      reason: "Chaves VAPID não configuradas.",
    });
    expect(skipped.statusLabel).toBe("Pulado");
    expect(skipped.notes).toEqual(["Chaves VAPID não configuradas."]);
    const failed = describeStep({
      name: "syncMarketRates",
      status: "failed",
      durationMs: 3000,
      error: "Error: offline",
    });
    expect(failed.error).toBe("Error: offline");
    expect(failed.tone).toBe("danger");
  });

  it("puts the counters of the other steps in words, never raw keys", () => {
    const notes = (name: string, details: Record<string, unknown>) =>
      describeStep({ name, status: "ok", durationMs: 5, details }).notes;
    expect(
      notes("materializeRecurrences", { recurrences: 4, created: 0 }),
    ).toEqual(["Nenhum lançamento recorrente criado"]);
    expect(notes("materializeRecurrences", { created: 1 })).toEqual([
      "1 lançamento recorrente criado",
    ]);
    expect(notes("materializeRecurrences", { created: 3 })).toEqual([
      "3 lançamentos recorrentes criados",
    ]);
    expect(
      notes("syncMarketRates", {
        series: [],
        changedRows: 60,
        revalidated: true,
      }),
    ).toEqual(["60 índices atualizados"]);
    expect(notes("syncMarketRates", { changedRows: 0 })).toEqual([
      "Nenhum índice mudou",
    ]);
    expect(
      notes("purgeDeleted", {
        purgedTransactions: 0,
        retentionDays: 30,
        purgedNotifications: 2,
        notificationRetentionDays: 90,
      }),
    ).toEqual([
      "Nenhum lançamento excluído apagado (guardados por 30 dias)",
      "2 avisos lidos apagados (guardados por 90 dias)",
    ]);
    expect(notes("rollInvoices", { rows: 3, nested: { a: 1 } })).toEqual([]);
    expect(notes("syncMarketRates", { changedRows: "x" })).toEqual([]);
  });
});

describe("describeRun", () => {
  it("labels the origin", () => {
    expect(describeRun(run({ trigger: "cron" }), NOW).origin).toBe(
      "Automática (Vercel)",
    );
    expect(describeRun(run({ trigger: "manual" }), NOW).origin).toBe(
      "Manual (curl)",
    );
    expect(describeRun(run({ trigger: "admin" }), NOW).origin).toBe(
      "Botão Rodar agora",
    );
    expect(describeRun(run(), NOW).origin).toBe("Origem não registrada");
  });

  it("shows the duration of a finished run only", () => {
    expect(describeRun(run(), NOW).durationLabel).toBe("12 s");
    expect(
      describeRun(run({ status: "running", finishedAt: null }), NOW)
        .durationLabel,
    ).toBeNull();
  });

  it("tells running from interrupted at 6 minutes", () => {
    const at = (minutes: number) =>
      describeRun(
        run({
          status: "running",
          finishedAt: null,
          startedAt: new Date(NOW.getTime() - minutes * 60_000).toISOString(),
        }),
        NOW,
      );
    expect(at(5).statusLabel).toBe("Em andamento");
    expect(at(6).statusLabel).toBe("Em andamento");
    expect(at(7).statusLabel).toBe("Interrompida");
    expect(at(7).tone).toBe("danger");
  });

  it("maps the finished statuses and the refused call", () => {
    expect(describeRun(run({ status: "partial" }), NOW).statusLabel).toBe(
      "Parcial",
    );
    expect(describeRun(run({ status: "failed" }), NOW).statusLabel).toBe(
      "Falhou",
    );
    const refused = describeRun(
      run({
        status: "failed",
        report: {
          durationMs: 0,
          steps: [],
          trigger: "cron",
          rejected: "unauthorized",
        },
      }),
      NOW,
    );
    expect(refused.statusLabel).toBe("Recusada (segredo)");
    expect(refused.durationLabel).toBeNull();
  });

  it("copes with a run without a report", () => {
    const line = describeRun(run({ report: null }), NOW);
    expect(line.steps).toEqual([]);
    expect(line.origin).toBe("Origem não registrada");
  });
});

describe("cronHealth", () => {
  it("is never without automatic runs", () => {
    expect(cronHealth([], NOW)).toEqual({ state: "never" });
    expect(
      cronHealth([run({ trigger: "manual" }), run({ trigger: "admin" })], NOW),
    ).toEqual({ state: "never" });
  });

  it("is ok under 26 hours and stale from 26 hours", () => {
    expect(
      cronHealth([run({ trigger: "cron", startedAt: hoursAgo(25.9) })], NOW)
        .state,
    ).toBe("ok");
    expect(
      cronHealth([run({ trigger: "cron", startedAt: hoursAgo(26) })], NOW)
        .state,
    ).toBe("stale");
  });

  it("counts a legacy run without origin, not manual ones", () => {
    expect(cronHealth([run({ startedAt: hoursAgo(3) })], NOW).state).toBe("ok");
    expect(
      cronHealth(
        [
          run({ trigger: "admin", startedAt: hoursAgo(1) }),
          run({ trigger: "cron", startedAt: hoursAgo(30) }),
        ],
        NOW,
      ),
    ).toEqual({ state: "stale", at: hoursAgo(30) });
  });

  it("flags a failed or interrupted newest automatic run", () => {
    expect(
      cronHealth(
        [run({ trigger: "cron", status: "failed", startedAt: hoursAgo(5) })],
        NOW,
      ),
    ).toEqual({ state: "failed", at: hoursAgo(5) });
    // Partial still counts as the cron being alive; stale wins over failed.
    expect(
      cronHealth([run({ trigger: "cron", status: "partial" })], NOW).state,
    ).toBe("ok");
    expect(
      cronHealth(
        [run({ trigger: "cron", status: "failed", startedAt: hoursAgo(40) })],
        NOW,
      ).state,
    ).toBe("stale");
  });

  it("flags a refused call as the newest automatic one", () => {
    const refused = run({
      status: "failed",
      startedAt: hoursAgo(5),
      report: {
        durationMs: 0,
        steps: [],
        trigger: "cron",
        rejected: "unauthorized",
      },
    });
    expect(cronHealth([refused], NOW)).toEqual({
      state: "rejected",
      at: hoursAgo(5),
    });
    // A later good run clears it.
    expect(
      cronHealth(
        [refused, run({ trigger: "cron", startedAt: hoursAgo(1) })],
        NOW,
      ).state,
    ).toBe("ok");
  });
});
