import {
  CalendarClock,
  CircleCheck,
  CircleX,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { InsetList } from "@/components/app/inset-list";
import { SectionHeader } from "@/components/app/section-header";
import { SettingRow } from "@/components/app/setting-row";
import { Badge } from "@/components/ui/badge";
import { cronHealth, describeRun } from "@/lib/admin/routine";
import { deadlineLabel } from "@/lib/format/datetime";
import type { RoutineConfig, RoutineRunItem } from "@/server/domain/job-runs";
import { plural } from "./labels";
import { RunsPanel } from "./runs-panel";

/**
 * Administração › Rotina diária (doc 02 §6.17): the verdict on the cron, the
 * setup (never a secret's value: only "Definido" or "Não definido") and the
 * latest runs with "Rodar agora".
 */
export function RoutineView({
  runs,
  config,
  now,
}: {
  runs: RoutineRunItem[];
  config: RoutineConfig;
  /** ISO time of the render. */
  now: string;
}) {
  const health = cronHealth(runs, now);
  const items = runs.map((run) => ({
    id: run.id,
    line: describeRun(run, now),
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-headline text-fg">Rotina diária</h2>
        <p className="text-caption text-fg-3">
          Todo dia entre 6h e 7h (Brasília) o app cria lançamentos recorrentes,
          atualiza índices, envia avisos e limpa o que foi apagado.
        </p>
      </header>

      <CronNotice health={health} now={now} />

      <section aria-labelledby="rotina-config">
        <SectionHeader id="rotina-config" title="Configuração" />
        <InsetList aria-labelledby="rotina-config">
          <li>
            <SettingRow
              id="rotina-segredo"
              label="Segredo do cron (CRON_SECRET)"
              description={
                config.cronSecretSet ? undefined : "Sem ele, o cron é recusado."
              }
              control={
                <SetBadge
                  set={config.cronSecretSet}
                  on="Definido"
                  off="Não definido"
                />
              }
            />
          </li>
          <li>
            <SettingRow
              id="rotina-vapid"
              label="Chaves de notificação (VAPID)"
              description={
                config.vapidSet
                  ? undefined
                  : "Sem elas, o passo de avisos é pulado."
              }
              control={
                <SetBadge
                  set={config.vapidSet}
                  on="Definidas"
                  off="Não definidas"
                />
              }
            />
          </li>
          <li>
            <SettingRow
              id="rotina-pessoas"
              label="Pessoas que recebem avisos"
              description={
                config.recipients === 0
                  ? "Ninguém ainda. Ligue a flag em Flags e peça para inscreverem o aparelho em Ajustes › Notificações."
                  : undefined
              }
              control={
                config.recipients === 0 ? null : (
                  <span className="text-callout text-fg-2">
                    {plural(config.recipients, "pessoa", "pessoas")}
                  </span>
                )
              }
            />
          </li>
        </InsetList>
      </section>

      <RunsPanel items={items} />
    </div>
  );
}

function SetBadge({ set, on, off }: { set: boolean; on: string; off: string }) {
  return set ? (
    <Badge tone="primary">
      <CircleCheck aria-hidden="true" />
      {on}
    </Badge>
  ) : (
    <Badge tone="danger">
      <CircleX aria-hidden="true" />
      {off}
    </Badge>
  );
}

function CronNotice({
  health,
  now,
}: {
  health: ReturnType<typeof cronHealth>;
  now: string;
}) {
  if (health.state === "ok") {
    return (
      <p className="flex items-center gap-2 text-callout text-fg-2">
        <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
        <span>
          Última execução automática: {deadlineLabel(health.at, now)}.
        </span>
      </p>
    );
  }
  let title: string;
  let body: ReactNode;
  if (health.state === "failed") {
    title = `A última execução automática, ${deadlineLabel(health.at, now)}, falhou.`;
    body = "Veja os detalhes abaixo.";
  } else if (health.state === "never") {
    title = "Ainda não houve nenhuma execução automática.";
    body =
      "O cron só roda no deploy de produção. Confira Settings › Cron Jobs na Vercel.";
  } else if (health.state === "stale") {
    title = `O cron da Vercel não rodou desde ${deadlineLabel(health.at, now)}.`;
    body = (
      <>
        Confira na Vercel: Settings › Cron Jobs (se o job aparece e está ativo)
        e Settings › Environment Variables (<code>CRON_SECRET</code> em
        Production). Depois de mexer nas variáveis, faça um novo deploy de
        produção.
      </>
    );
  } else {
    title = `A Vercel chamou a rotina em ${deadlineLabel(health.at, now)}, mas ela foi recusada.`;
    body = (
      <>
        O <code>CRON_SECRET</code> não está definido em Production ou não
        confere. Defina em Settings › Environment Variables e faça um novo
        deploy.
      </>
    );
  }
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-control bg-warning-soft px-4 py-3 text-warning"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-callout font-semibold">{title}</p>
        <p className="text-callout break-words">{body}</p>
      </div>
    </div>
  );
}
