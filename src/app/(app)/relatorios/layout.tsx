import { type ReactNode, Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  ReportPeriodFilter,
  ReportTabs,
  ReportTabsFallback,
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
      <Suspense fallback={<ReportTabsFallback />}>
        <ReportTabs />
      </Suspense>
      <ReportPeriodFilter />
      {children}
    </div>
  );
}
