import { Calculator } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { requireUser } from "@/server/dal";
import { SectionSkeleton } from "../section-skeleton";

export const metadata: Metadata = { title: "Simulador" };

export default function SimuladorPage() {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <Simulator />
    </Suspense>
  );
}

async function Simulator() {
  await requireUser();
  return (
    <EmptyState
      icon={<Calculator />}
      title="Simulador de juros compostos"
      description="Veja quanto um aporte por mês pode render com o tempo. Chega em breve."
    />
  );
}
