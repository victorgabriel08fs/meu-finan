import { type ReactNode, Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  PeriodSelector,
  PeriodSelectorView,
  ReportTabs,
  ReportTabsFallback,
} from "@/components/reports/report-nav";

/**
 * Relatórios (doc 02 §6.12): one period filter above everything, then the
 * views. Both read the URL, so each sits in its own <Suspense> with a
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
      <Suspense fallback={<PeriodSelectorView active={null} />}>
        <PeriodSelector />
      </Suspense>
      <Suspense fallback={<ReportTabsFallback />}>
        <ReportTabs />
      </Suspense>
      {children}
    </div>
  );
}
