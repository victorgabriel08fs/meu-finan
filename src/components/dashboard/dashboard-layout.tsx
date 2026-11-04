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

/** Grid classes of a row of narrow blocks, by its number of columns. */
const COLUMNS: Record<number, string> = {
  1: "",
  2: "md:grid-cols-2",
  3: "md:grid-cols-2 xl:grid-cols-3",
};

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
 */
export function HomeGrid({ sections, renderBlock }: HomeGridProps) {
  return (
    <div className="flex flex-col gap-7">
      {sections.map((section) =>
        section.kind === "wide" ? (
          <HomeBlockSlot key={section.id} id={section.id}>
            {renderBlock(section.id)}
          </HomeBlockSlot>
        ) : (
          <div
            key={section.groups[0]?.[0]}
            className={cn(
              "grid gap-7 md:items-start",
              COLUMNS[section.groups.length],
            )}
          >
            {section.groups.map((group, index) => (
              <div
                key={group[0]}
                className={cn(
                  "flex min-w-0 flex-col gap-7",
                  index === 0 &&
                    section.groups.length === 3 &&
                    "md:col-span-2 xl:col-span-1",
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
  children,
}: {
  id: HomeBlockId;
  tight?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-home-block={id}
      className={cn(
        "min-w-0 not-has-[>:not(template)]:hidden",
        tight && "-mt-4",
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
  children,
}: {
  id: HomeBlockId;
  children: ReactNode;
}) {
  return (
    <HomeBlockBoundary title={HOME_BLOCKS[id].errorTitle}>
      <Suspense fallback={<HomeBlockSkeleton id={id} />}>{children}</Suspense>
    </HomeBlockBoundary>
  );
}

function SectionSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <Skeleton className="mb-3 h-4 w-28 rounded-chip" />
      {children}
    </div>
  );
}

/** Same shape, same height as the loaded block (zero layout shift, §5.17). */
export function HomeBlockSkeleton({ id }: { id: HomeBlockId }) {
  switch (id) {
    case "balance":
      return <Skeleton className="h-59 rounded-card" />;
    case "month-totals":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-31.5 rounded-card" />
          <Skeleton className="h-31.5 rounded-card" />
        </div>
      );
    case "budget":
      return <Skeleton className="h-95 rounded-card" />;
    case "upcoming-bills":
      return (
        <SectionSkeleton>
          <Skeleton className="h-56 rounded-card" />
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
