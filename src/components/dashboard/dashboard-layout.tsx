import Link from "next/link";
import type { ReactNode } from "react";
import { PrivacyToggle } from "@/components/app/privacy-toggle";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { NewsDot } from "@/components/tips/news";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { firstName, initials } from "./labels";

/**
 * Columns of the Início (doc 02 §4.5): one column on phones; from md the
 * hero and tiles span the width over [orçamento + próximas contas] and
 * [contas + metas]; from xl the three groups sit side by side.
 */
export function DashboardColumns({
  summary,
  planning,
  assets,
}: {
  summary: ReactNode;
  planning: ReactNode;
  assets: ReactNode;
}) {
  return (
    <div className="grid gap-7 md:grid-cols-2 md:items-start xl:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-3 md:col-span-2 xl:col-span-1">
        {summary}
      </div>
      <div className="flex min-w-0 flex-col gap-7">{planning}</div>
      <div className="flex min-w-0 flex-col gap-7">{assets}</div>
    </div>
  );
}

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

function SectionSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <Skeleton className="mb-3 h-4 w-28 rounded-chip" />
      {children}
    </div>
  );
}

/** Same blocks, same heights as the loaded Início (zero layout shift, §5.17). */
export function DashboardSkeleton() {
  return (
    <LoadingRegion label="Carregando o resumo…">
      <DashboardColumns
        summary={
          <>
            <Skeleton className="h-59 rounded-card" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-31.5 rounded-card" />
              <Skeleton className="h-31.5 rounded-card" />
            </div>
          </>
        }
        planning={
          <>
            <Skeleton className="h-95 rounded-card" />
            <SectionSkeleton>
              <Skeleton className="h-56 rounded-card" />
            </SectionSkeleton>
          </>
        }
        assets={
          <>
            <SectionSkeleton>
              <div className="flex gap-2.5 overflow-hidden py-1">
                <Skeleton className="h-28 w-39 shrink-0 rounded-card" />
                <Skeleton className="h-28 w-39 shrink-0 rounded-card" />
                <Skeleton className="h-28 w-39 shrink-0 rounded-card" />
              </div>
            </SectionSkeleton>
            <SectionSkeleton>
              <Skeleton className="h-38 rounded-card" />
            </SectionSkeleton>
          </>
        }
      />
    </LoadingRegion>
  );
}
