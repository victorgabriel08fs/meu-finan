import { Goal } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ComingSoonButton } from "@/components/app/coming-soon-button";
import { EmptyState } from "@/components/app/empty-state";
import { requireUser } from "@/server/dal";
import { SectionSkeleton } from "../section-skeleton";

export const metadata: Metadata = { title: "Metas" };

export default function MetasPage() {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <Goals />
    </Suspense>
  );
}

async function Goals() {
  await requireUser();
  return (
    <EmptyState
      icon={<Goal />}
      title="Qual é o próximo sonho?"
      description="Uma reserva, uma viagem, um carro… a gente calcula o caminho."
      action={
        <ComingSoonButton message="Em breve: metas">
          Criar meta
        </ComingSoonButton>
      }
    />
  );
}
