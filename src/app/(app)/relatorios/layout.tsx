import { type ReactNode, Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  PeriodSelectorView,
  ReportPeriodFilter,
  ReportTabs,
  ReportTabsFallback,
  ReportTabsPlain,
} from "@/components/reports/report-nav";

/**
 * Relatórios (doc 02 §6.12): the views as scrollable tabs, then the filter of
 * the view on screen — the period chips on Visão geral, Categorias and
 * Patrimônio (here), the month switcher on Fluxo and Calendário (in their
 * pages, which know the user's financial month). The tabs keep their place
 * when the filter changes. Whatever reads the query sits in <Suspense> with a
 * same-size fallback; the layout itself prerenders.
 */
export default function RelatoriosLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Relatórios" />
      {/* The outer boundaries only matter on a page whose pathname is known
          on the request (a category's detail): they show the tabs and the
          chips without a current one until the real ones stream in. */}
      <Suspense fallback={<ReportTabsPlain />}>
        <Suspense fallback={<ReportTabsFallback />}>
          <ReportTabs />
        </Suspense>
      </Suspense>
      <Suspense fallback={<PeriodSelectorView active={null} />}>
        <ReportPeriodFilter />
      </Suspense>
      {children}
    </div>
  );
}
