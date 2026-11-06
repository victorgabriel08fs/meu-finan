import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { PrivacyToggle } from "@/components/app/privacy-toggle";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { NewsDot } from "@/components/tips/news";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { HOME_BLOCKS, type HomeBlockId } from "@/lib/home/blocks";
import {
  defaultHomeLayout,
  type HomeSection,
  packHomeLayout,
  visibleHomeBlocks,
} from "@/lib/home/layout";
import { cn } from "@/lib/utils";
import type { ReportPhase } from "@/server/domain/reports";
import { HomeBlockBoundary } from "./block-error";
import { firstName, initials } from "./labels";

type HomeHeaderProps = {
  name: string;
  /** "Boa tarde". */
  greeting: string;
  /** "quarta, 14 de outubro". */
  dateLabel: string;
};

/**
 * Top bar of the Início (doc 02 §4.2): avatar, greeting and date; on the
 * right the theme toggle (below lg, where the sidebar has its own) and the
 * privacy eye. The avatar leads to Ajustes and carries the dot of unread
 * novidades.
 */
export function HomeHeader({ name, greeting, dateLabel }: HomeHeaderProps) {
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 pt-2">
      <Link
        href="/ajustes"
        className="relative flex size-(--avatar) shrink-0 items-center justify-center rounded-full bg-primary-soft text-caption font-bold text-on-primary-soft transition-transform duration-100 after:absolute after:-inset-1 active:scale-94"
      >
        <span aria-hidden="true">{initials(name)}</span>
        <span className="sr-only">Perfil e ajustes</span>
        <NewsDot className="-top-0.5 -right-0.5" />
      </Link>
      <div className="min-w-0 flex-[1_1_10rem]">
        <h1 className="text-title-3 text-fg">
          {greeting}, {firstName(name)}
        </h1>
        <p className="text-caption text-fg-3">{dateLabel}</p>
      </div>
      <div className="-mr-2 ml-auto flex items-center">
        <ThemeToggle className="lg:hidden" />
        <PrivacyToggle />
      </div>
    </header>
  );
}

export function HomeHeaderSkeleton() {
  return (
    <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 pt-2">
      <h1 className="sr-only">Início</h1>
      <Skeleton className="size-(--avatar) rounded-full" />
      <div className="flex flex-[1_1_10rem] flex-col gap-1.5">
        <Skeleton className="h-5 w-44 rounded-chip" />
        <Skeleton className="h-3.5 w-32 rounded-chip" />
      </div>
    </div>
  );
}

type HomeGridProps = {
  /** The visible blocks, laid out by packHomeLayout. */
  sections: HomeSection[];
  /** The block itself (streamed) or its skeleton. */
  renderBlock: (id: HomeBlockId) => ReactNode;
};

/**
 * Blocks of the Início (doc 02 §4.5), in the person's order. One column on
 * phones. From md a wide block takes a row of its own and the narrow ones
 * between wide blocks share up to 3 columns: with 3, the first spans the
 * width at md over the other two, and from xl the three sit side by side.
 *
 * Columns are a wrapping flex row, not a grid, and a column or a row whose
 * blocks all render nothing (an insight-only column most months, or one
 * dismissed) is hidden: the others take its width and no gap is left.
 *
 * The Saldo followed by a wide block shares the row with it from xl (a third
 * and two thirds, the columns of the default Início); below xl they stack.
 * Wide blocks are size containers: they lay themselves out by the width
 * they get (`@` variants), not by the screen's.
 */
export function HomeGrid({ sections, renderBlock }: HomeGridProps) {
  return (
    <div className="flex flex-col gap-7">
      {sections.map((section) =>
        section.kind === "wide" ? (
          <HomeBlockSlot
            key={section.id}
            id={section.id}
            className="@container"
          >
            {renderBlock(section.id)}
          </HomeBlockSlot>
        ) : section.kind === "hero-wide" ? (
          <div
            key={section.hero}
            className="flex flex-col gap-7 xl:grid xl:grid-cols-3 xl:items-start"
          >
            <HomeBlockSlot id={section.hero}>
              {renderBlock(section.hero)}
            </HomeBlockSlot>
            <HomeBlockSlot id={section.id} className="@container xl:col-span-2">
              {renderBlock(section.id)}
            </HomeBlockSlot>
          </div>
        ) : (
          <div
            key={section.groups[0]?.[0]}
            className="flex flex-col gap-7 not-has-[>div>[data-home-block]>:not(template)]:hidden md:flex-row md:flex-wrap md:items-start"
          >
            {section.groups.map((group, index) => (
              <div
                key={group[0]}
                className={cn(
                  "flex min-w-0 flex-col gap-7 not-has-[>[data-home-block]>:not(template)]:hidden",
                  index === 0 && section.groups.length === 3
                    ? "md:basis-full xl:basis-0 xl:grow"
                    : "md:flex-1",
                )}
              >
                {group.map((id, position) => (
                  <HomeBlockSlot
                    key={id}
                    id={id}
                    // The tiles sit 12px under the Saldo, as one summary.
                    tight={
                      id === "month-totals" && group[position - 1] === "balance"
                    }
                  >
                    {renderBlock(id)}
                  </HomeBlockSlot>
                ))}
              </div>
            ))}
          </div>
        ),
      )}
    </div>
  );
}

/**
 * A block's place in the grid, hidden when the block renders nothing (the
 * insight most months), so it leaves no gap. A <template> is all a streaming
 * block with no skeleton leaves in the HTML, so it counts as nothing too.
 */
function HomeBlockSlot({
  id,
  tight = false,
  className,
  children,
}: {
  id: HomeBlockId;
  tight?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-home-block={id}
      className={cn(
        "min-w-0 not-has-[>:not(template)]:hidden",
        tight && "-mt-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * One block of the Início with its own error card and its own skeleton while
 * its data streams in (doc 02 §5.17, §8).
 */
export function HomeBlockFrame({
  id,
  phase,
  children,
}: {
  id: HomeBlockId;
  /** Where the month on screen stands: some blocks change shape with it. */
  phase?: ReportPhase;
  children: ReactNode;
}) {
  return (
    <HomeBlockBoundary title={HOME_BLOCKS[id].errorTitle}>
      <Suspense fallback={<HomeBlockSkeleton id={id} phase={phase} />}>
        {children}
      </Suspense>
    </HomeBlockBoundary>
  );
}

/*
 * The blocks that change shape with the month on screen (doc 02 §5.17), by
 * phase: heights measured in the app (Ana of the demo, a sweep of the slot's
 * width from 264 to 1136px, past = the month before today's, future = two
 * ahead). Where a phase measures like the current month it reuses its classes.
 * The wraps depend on the texts (dates, amounts), so they move a few px with
 * the data: measure again when a block's copy changes.
 */

/**
 * In an @container around the tiles: their support text wraps a line more
 * when the block is under 23rem (measured: 357px wraps, 368px does not). A
 * past month has no "até hoje" note: it no longer wraps from 272px.
 */
const TILE_CURRENT = "h-37 rounded-card @min-[23rem]:h-32.5";
const TILE_SKELETON: Record<ReportPhase, string> = {
  past: "h-32.5 rounded-card",
  current: TILE_CURRENT,
  future: TILE_CURRENT,
};

/**
 * Orçamento: 399px under the width where the pace line fits, 379px above it.
 * Without "N% do mês decorrido" the line breaks later in a past month (394px)
 * and in a month ahead (422px), against 336px in the current one.
 */
const BUDGET_SKELETON: Record<ReportPhase, string> = {
  past: "h-99.75 rounded-card @min-[24.5625rem]:h-94.75",
  current: "h-99.75 rounded-card @min-[21rem]:h-94.75",
  future: "h-99.75 rounded-card @min-[26.1875rem]:h-94.75",
};

/**
 * Para onde foi o dinheiro: the ranking with its five categories and
 * "Outras" in the current and past months (the ", até hoje" of the current
 * one wraps the title from 320px, a past month's from 312px). A month ahead
 * has nothing paid: the invite, which wraps its line as the slot narrows.
 */
const CATEGORY_SKELETON: Record<ReportPhase, string> = {
  past: "h-146.25 rounded-card @min-[19.5rem]:h-136.25",
  current: "h-146.25 rounded-card @xs:h-136.25",
  future:
    "h-40 rounded-card @min-[23.25rem]:h-34.5 @min-[27.25rem]:h-28 @min-[33.25rem]:h-22.5 @min-[37.25rem]:h-18",
};

/**
 * Receitas × despesas: the chart's footnote ("* novembro parcial, até o dia
 * 5 de 30") is only in the current month, and a month ahead ends at today's:
 * a past month wraps a line less in the narrow slots.
 */
const INCOME_EXPENSE_CURRENT =
  "h-132.25 rounded-card @xs:h-117.75 @min-[22.25rem]:h-112.25 @min-[33.75rem]:h-106.75";
const INCOME_EXPENSE_SKELETON: Record<ReportPhase, string> = {
  past: "h-127.75 rounded-card @min-[19.625rem]:h-123.25 @min-[20.4375rem]:h-117.75 @min-[22.0625rem]:h-112.25 @min-[33.75rem]:h-106.75",
  current: INCOME_EXPENSE_CURRENT,
  future: INCOME_EXPENSE_CURRENT,
};

/** Fluxo de caixa by the phase of the month (heights measured in the app). */
const CASH_FLOW_SKELETON: Record<ReportPhase, string> = {
  past: "h-129.75 rounded-card @2xl:h-102.75",
  current: "h-137.25 rounded-card @2xl:h-110.25",
  // The footnote takes three lines under 24rem, two under 27.5rem.
  future:
    "h-146.25 rounded-card @sm:h-141.75 @min-[27.5rem]:h-137.25 @2xl:h-110.25",
};

/**
 * A SectionHeader (36px: a 24px line and 12px under it) over the content;
 * `tight` is the one with 2px under it, for a caption that follows.
 */
function SectionSkeleton({
  children,
  tight = false,
}: {
  children: ReactNode;
  tight?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <div
        className={
          tight ? "mb-0.5 flex h-6 items-center" : "mb-3 flex h-6 items-center"
        }
      >
        <Skeleton className="h-4 w-28 rounded-chip" />
      </div>
      {children}
    </div>
  );
}

/** Same shape, same height as the loaded block (zero layout shift, §5.17). */
export function HomeBlockSkeleton({
  id,
  phase = "current",
}: {
  id: HomeBlockId;
  /** The month on screen: past, current (the default) or ahead. */
  phase?: ReportPhase;
}) {
  switch (id) {
    // Heights measured in the app (Ana of the demo, 360 to 1440px). Narrow
    // blocks (small phones, the xl columns) wrap a line more in the tiles'
    // support text and in the budget: measured by the block's own width (an
    // @container inside the skeleton), not the screen's.
    case "balance":
      return <Skeleton className="h-61.25 rounded-card" />;
    case "month-totals":
      return (
        <div className="@container">
          <div className="grid grid-cols-fit gap-3">
            <Skeleton className={TILE_SKELETON[phase]} />
            <Skeleton className={TILE_SKELETON[phase]} />
          </div>
        </div>
      );
    case "budget":
      return (
        <div className="@container">
          <Skeleton className={BUDGET_SKELETON[phase]} />
        </div>
      );
    // One bill (86px: the most common case; a month other than today's adds
    // the "A partir de hoje" caption, 18px and 12px under it, and 10px less
    // under the header).
    case "upcoming-bills":
      return (
        <SectionSkeleton tight={phase !== "current"}>
          {phase === "current" ? null : (
            <div className="mb-3 flex h-4.5 items-center">
              <Skeleton className="h-3.5 w-24 rounded-chip" />
            </div>
          )}
          <Skeleton className="h-21.5 rounded-card" />
        </SectionSkeleton>
      );
    case "accounts":
      return (
        <SectionSkeleton>
          <div className="flex gap-2.5 overflow-hidden py-1">
            <Skeleton className="h-28 w-[min(9.75rem,calc(100vw-5rem))] shrink-0 rounded-card" />
            <Skeleton className="h-28 w-[min(9.75rem,calc(100vw-5rem))] shrink-0 rounded-card" />
            <Skeleton className="h-28 w-[min(9.75rem,calc(100vw-5rem))] shrink-0 rounded-card" />
          </div>
        </SectionSkeleton>
      );
    case "goals":
      return (
        <SectionSkeleton>
          <Skeleton className="h-38 rounded-card" />
        </SectionSkeleton>
      );
    // Most months have no highlight: reserving room would leave a gap.
    case "insight":
      return null;
    case "spending-calendar":
      // By the width of its slot (an @container), like the block: the
      // heatmap over two rows of figures, over one row, or beside them.
      return (
        <Skeleton className="h-170.25 rounded-card @min-[34rem]:h-150.75 @2xl:h-123.75" />
      );
    case "cash-flow":
      // By the width of its slot, like the block (the lowest balance under
      // the chart, or beside it), and by the month: a past one has no
      // "Previsto" key, a month ahead a footnote more.
      return <Skeleton className={CASH_FLOW_SKELETON[phase]} />;
    // The narrow blocks of the reports wrap a line more in the xl columns
    // under 20rem; Receitas × despesas its title too under 22.25rem, and the
    // Patrimônio its change under 21.75rem (the same in every phase). The
    // others by phase, above.
    case "category-breakdown":
      return (
        <div className="@container">
          <Skeleton className={CATEGORY_SKELETON[phase]} />
        </div>
      );
    case "income-expense":
      return (
        <div className="@container">
          <Skeleton className={INCOME_EXPENSE_SKELETON[phase]} />
        </div>
      );
    case "net-worth":
      return (
        <div className="@container">
          <Skeleton className="h-51.25 rounded-card @min-[21.75rem]:h-46.75" />
        </div>
      );
  }
}

const DEFAULT_SECTIONS = packHomeLayout(visibleHomeBlocks(defaultHomeLayout()));

/** The default Início in skeletons, while the summary itself loads. */
export function DashboardSkeleton() {
  return (
    <LoadingRegion label="Carregando o resumo…">
      <HomeGrid
        sections={DEFAULT_SECTIONS}
        renderBlock={(id) => <HomeBlockSkeleton id={id} />}
      />
    </LoadingRegion>
  );
}
