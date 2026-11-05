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
    <header className="flex min-h-14 items-center gap-3 pt-2">
      <Link
        href="/ajustes"
        className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-caption font-bold text-on-primary-soft transition-transform duration-100 after:absolute after:-inset-1 active:scale-94"
      >
        <span aria-hidden="true">{initials(name)}</span>
        <span className="sr-only">Perfil e ajustes</span>
        <NewsDot className="-top-0.5 -right-0.5" />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-title-3 text-fg">
          {greeting}, {firstName(name)}
        </h1>
        <p className="truncate text-caption text-fg-3">{dateLabel}</p>
      </div>
      <div className="-mr-2 flex items-center">
        <ThemeToggle className="lg:hidden" />
        <PrivacyToggle />
      </div>
    </header>
  );
}

export function HomeHeaderSkeleton() {
  return (
    <div className="flex min-h-14 items-center gap-3 pt-2">
      <h1 className="sr-only">Início</h1>
      <Skeleton className="size-9 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
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

/**
 * In an @container around the tiles: their support text wraps a line more
 * when the block is under 23rem (measured: 357px wraps, 368px does not).
 */
const TILE_SKELETON = "h-37 rounded-card @min-[23rem]:h-32.5";

/** Fluxo de caixa by the phase of the month (heights measured in the app). */
const CASH_FLOW_SKELETON: Record<ReportPhase, string> = {
  past: "h-129.75 rounded-card @2xl:h-102.75",
  current: "h-137.25 rounded-card @2xl:h-110.25",
  // The footnote takes three lines under 24rem, two under 27.5rem.
  future:
    "h-146.25 rounded-card @sm:h-141.75 @min-[27.5rem]:h-137.25 @2xl:h-110.25",
};

/** A SectionHeader (36px: a 24px line and 12px under it) over the content. */
function SectionSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="mb-3 flex h-6 items-center">
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
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className={TILE_SKELETON} />
            <Skeleton className={TILE_SKELETON} />
          </div>
        </div>
      );
    case "budget":
      return (
        <div className="@container">
          <Skeleton className="h-99.75 rounded-card @min-[21rem]:h-94.75" />
        </div>
      );
    case "upcoming-bills":
      return (
        <SectionSkeleton>
          <Skeleton className="h-54 rounded-card" />
        </SectionSkeleton>
      );
    case "accounts":
      return (
        <SectionSkeleton>
          <div className="flex gap-2.5 overflow-hidden py-1">
            <Skeleton className="h-28 w-39 shrink-0 rounded-card" />
            <Skeleton className="h-28 w-39 shrink-0 rounded-card" />
            <Skeleton className="h-28 w-39 shrink-0 rounded-card" />
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
    // Patrimônio its change under 21.75rem. The ranking with its five
    // categories and "Outras", a month's usual shape.
    case "category-breakdown":
      return (
        <div className="@container">
          <Skeleton className="h-146.25 rounded-card @xs:h-136.25" />
        </div>
      );
    case "income-expense":
      return (
        <div className="@container">
          <Skeleton className="h-131.25 rounded-card @xs:h-116.75 @min-[22.25rem]:h-111.25 @lg:h-105.75" />
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
