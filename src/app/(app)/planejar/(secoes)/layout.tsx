import { type ReactNode, Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { RouteTabs } from "@/components/app/route-tabs";
import { SegmentedLinks } from "@/components/ui/segmented-control";

const SECTIONS = [
  { href: "/planejar/orcamentos", label: "Orçamentos" },
  { href: "/planejar/metas", label: "Metas" },
  { href: "/planejar/simulador", label: "Simulador" },
];

/**
 * Planejar (doc 02 §4.1): one title and a segmented control that switches
 * between the three sections; kept in the layout so the thumb slides. The
 * route group leaves out stacked screens such as a goal's detail
 * (/planejar/metas/[id]), which have their own back + title header.
 */
export default function PlanejarLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Planejar" />
      <Suspense
        fallback={
          <SegmentedLinks
            items={SECTIONS}
            activeHref={null}
            ariaLabel="Seções de Planejar"
          />
        }
      >
        <RouteTabs items={SECTIONS} ariaLabel="Seções de Planejar" />
      </Suspense>
      {children}
    </div>
  );
}
