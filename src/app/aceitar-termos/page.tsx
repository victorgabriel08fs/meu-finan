import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { needsLegalAcceptance } from "@/lib/legal/version";
import { requireSignedIn } from "@/server/dal";
import { AcceptTermsForm } from "./accept-terms-form";

export const metadata: Metadata = { title: "Termos de uso e privacidade" };

/**
 * Where the DAL sends anyone who has not accepted the current version of the
 * terms and privacy policy (doc 01 §11.8): existing accounts once, and
 * everyone again after a relevant change. Signed out goes to /entrar (the
 * proxy, then requireSignedIn); already accepted goes to Início.
 */
export default function AcceptTermsPage() {
  return (
    <>
      <div className="mb-8 flex items-center gap-3">
        <BrandMark />
        <span className="font-bold text-[17px] text-fg">Prumo</span>
      </div>
      <h1 className="text-title-1 text-fg">Antes de continuar</h1>
      <Suspense fallback={<AcceptTermsSkeleton />}>
        <AcceptTerms />
      </Suspense>
    </>
  );
}

async function AcceptTerms() {
  const user = await requireSignedIn();
  if (!needsLegalAcceptance(user.legalVersion)) redirect("/inicio");
  return <AcceptTermsForm hasPrevious={user.legalVersion !== null} />;
}

function AcceptTermsSkeleton() {
  return (
    <LoadingRegion className="mt-3 flex flex-col gap-6">
      <Skeleton className="h-11 rounded-chip" />
      <Skeleton className="h-36 rounded-card" />
      <Skeleton className="h-11 rounded-chip" />
      <Skeleton className="h-12 rounded-control" />
      <Skeleton className="h-12 rounded-control" />
    </LoadingRegion>
  );
}
