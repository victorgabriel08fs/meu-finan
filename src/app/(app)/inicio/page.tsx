import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HomeCustomizeButton } from "@/components/dashboard/customize-sheet";
import {
  DashboardSkeleton,
  HomeBlockFrame,
  HomeGrid,
  HomeHeader,
  HomeHeaderSkeleton,
} from "@/components/dashboard/dashboard-layout";
import { FirstRunChecklist } from "@/components/dashboard/first-run-checklist";
import { greetingFor, weekdayDateLabel } from "@/components/dashboard/labels";
import { DEFAULT_TIME_ZONE } from "@/lib/finance/dates";
import { isBenefitAccount, isSpendableAccount } from "@/lib/finance/spendable";
import { monthLabel, todayInTimeZone } from "@/lib/format/date";
import {
  dailySpendChooserIds,
  dailySpendLineIds,
} from "@/lib/home/block-settings";
import {
  defaultHomeLayout,
  packHomeLayout,
  visibleHomeBlocks,
} from "@/lib/home/layout";
import { requireUser } from "@/server/dal";
import { getUserContext, resolvePeriod } from "@/server/domain/context";
import { getHomeLayout } from "@/server/domain/preferences";
import { reportPhase } from "@/server/domain/reports";
import { accountsOf, homeBlockSettingsOf } from "@/server/domain/request-reads";
import { sharingCounts } from "@/server/domain/sharing/groups";
import { isFlagEnabled } from "@/server/flags";
import { HomeBlock } from "./blocks";

export const metadata: Metadata = { title: "Início" };

/**
 * Início (doc 02 §6.3): "quanto tenho?", "como está o mês?", "o que vence
 * logo?". The greeting and the summary stream in separate boundaries, and
 * inside the summary each block streams on its own; with no account yet,
 * the summary becomes the "Comece por aqui" checklist.
 */
export default function InicioPage({ searchParams }: PageProps<"/inicio">) {
  return (
    <div className="flex flex-col gap-4 pt-[env(safe-area-inset-top)]">
      <Suspense fallback={<HomeHeaderSkeleton />}>
        <Greeting />
      </Suspense>
      <Suspense fallback={<DashboardSkeleton />}>
        <Summary searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Greeting() {
  const user = await requireUser();
  // Request time from here on (after the session read), so the clock is fine.
  const now = new Date();
  return (
    <HomeHeader
      name={user.name}
      greeting={greetingFor(now, DEFAULT_TIME_ZONE)}
      dateLabel={weekdayDateLabel(todayInTimeZone(DEFAULT_TIME_ZONE))}
    />
  );
}

async function Summary({
  searchParams,
}: {
  searchParams: PageProps<"/inicio">["searchParams"];
}) {
  const user = await requireUser();
  const [ctx, params] = await Promise.all([
    getUserContext(user.id),
    searchParams,
  ]);
  const range = resolvePeriod(
    ctx,
    typeof params.mes === "string" ? params.mes : null,
  );
  // With the flag off the Início is the app's default, whatever was saved.
  const [accounts, custom, sharing] = await Promise.all([
    accountsOf(ctx),
    isFlagEnabled("inicio_personalizavel", user.id).then((enabled) =>
      enabled
        ? Promise.all([
            getHomeLayout(user.id, { today: ctx.todayIso }),
            homeBlockSettingsOf(ctx),
          ])
        : null,
    ),
    // Compartilhado only takes a place with the flag and a group or invite,
    // so the desktop columns stay as they were for everyone else.
    isFlagEnabled("financas_compartilhadas", user.id).then((enabled) =>
      enabled ? sharingCounts(user.id) : null,
    ),
  ]);
  if (accounts.length === 0) return <FirstRunChecklist />;
  const [layout, blockSettings] = custom ?? [null, null];
  // The skeleton of Quanto dá para gastar por dia, as tall as its lines.
  const spendableIds = accounts
    .filter(isSpendableAccount)
    .map((account) => account.id);
  // Without an account to spend from the block is an invite, benefícios or not.
  const benefitIds =
    spendableIds.length > 0
      ? accounts.filter(isBenefitAccount).map((account) => account.id)
      : [];
  const lineIds = dailySpendLineIds(blockSettings, spendableIds, benefitIds);
  const benefitLines = lineIds.filter((id) => benefitIds.includes(id)).length;
  const dailySpend = {
    lines: lineIds.length - benefitLines,
    benefitLines,
    chooser: dailySpendChooserIds(spendableIds, benefitIds).length > 0,
  };

  const showShared = sharing !== null && sharing.groups + sharing.invites > 0;
  const sections = packHomeLayout(
    visibleHomeBlocks(layout?.entries ?? defaultHomeLayout()).filter(
      (id) => id !== "shared" || showShared,
    ),
  );
  const phase = reportPhase(ctx, range);

  return (
    <>
      {range.isCurrent ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-2 py-1.5 pr-1.5 pl-4">
          <p className="text-callout text-fg-2">
            Mostrando{" "}
            <strong className="font-semibold text-fg">
              {monthLabel(range.month)}
            </strong>
          </p>
          <Link
            href="/inicio"
            className="inline-flex h-11 items-center rounded-control px-3 text-callout font-semibold text-on-primary-soft active:bg-surface-3"
          >
            Voltar para hoje
          </Link>
        </div>
      )}

      <HomeGrid
        sections={sections}
        renderBlock={(id) => (
          <HomeBlockFrame
            id={id}
            phase={phase}
            dailySpend={id === "daily-spend" ? dailySpend : undefined}
          >
            <HomeBlock id={id} ctx={ctx} range={range} />
          </HomeBlockFrame>
        )}
      />

      {layout ? (
        <div className="flex justify-center pt-3">
          <HomeCustomizeButton
            entries={layout.entries}
            customized={layout.customized}
          />
        </div>
      ) : null}
    </>
  );
}
