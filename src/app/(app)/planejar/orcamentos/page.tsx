import { PiggyBank } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ComingSoonButton } from "@/components/app/coming-soon-button";
import { EmptyState } from "@/components/app/empty-state";
import { requireUser } from "@/server/dal";
import { SectionSkeleton } from "../section-skeleton";

export const metadata: Metadata = { title: "Orçamentos" };

export default function OrcamentosPage() {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <Budgets />
    </Suspense>
  );
}

async function Budgets() {
  await requireUser();
  return (
    <EmptyState
      icon={<PiggyBank />}
      title="Planeje o mês"
      description="Defina quanto quer gastar por categoria e acompanhe o ritmo."
      action={
        <ComingSoonButton variant="tonal" message="Em breve: orçamentos">
          Usar sugestão
        </ComingSoonButton>
      }
    />
  );
}
