import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/dal";
import { listCategoriesForAdmin } from "@/server/domain/category-admin";
import { CategoriesManager } from "./categories-manager";

export const metadata: Metadata = { title: "Categorias" };

export default function CategoriasPage() {
  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Categorias"
        back={{ href: "/ajustes", label: "Ajustes" }}
      />
      <Suspense fallback={<CategoriesSkeleton />}>
        <Categories />
      </Suspense>
    </div>
  );
}

async function Categories() {
  const user = await requireUser();
  const categories = await listCategoriesForAdmin(user.id);
  return <CategoriesManager categories={categories} />;
}

function CategoriesSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-7">
      <Skeleton className="h-150 rounded-2xl" />
      <Skeleton className="h-60 rounded-2xl" />
    </LoadingRegion>
  );
}
