import { type ReactNode, Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { RouteTabs } from "@/components/app/route-tabs";
import { SegmentedLinks } from "@/components/ui/segmented-control";

const SECTIONS = [
  { href: "/admin/usuarios", label: "Usuários" },
  { href: "/admin/flags", label: "Flags" },
  { href: "/admin/atividade", label: "Atividade" },
];

/**
 * Administração (doc 02 §6.16): reached from Ajustes (and the sidebar on
 * desktop) by administrators only. No session read here: each page checks the
 * role at its top and answers a real 404 to anyone else before this renders.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="Administração"
        back={{ href: "/ajustes", label: "Ajustes" }}
      />
      <Suspense
        fallback={
          <SegmentedLinks
            items={SECTIONS}
            activeHref={null}
            ariaLabel="Seções da administração"
          />
        }
      >
        <RouteTabs items={SECTIONS} ariaLabel="Seções da administração" />
      </Suspense>
      {children}
    </div>
  );
}
