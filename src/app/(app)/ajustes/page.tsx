import { Info, Palette, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { InsetList, InsetListItem } from "@/components/app/inset-list";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeader } from "@/components/app/section-header";
import { ThemeSwitcher } from "@/components/app/theme-switcher";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/dal";
import packageJson from "../../../../package.json";

export const metadata: Metadata = { title: "Ajustes" };

export default function AjustesPage() {
  return (
    <div className="flex flex-col gap-7">
      <PageHeader title="Ajustes" />
      <Suspense fallback={<SettingsSkeleton />}>
        <Settings />
      </Suspense>
    </div>
  );
}

async function Settings() {
  const user = await requireUser();

  return (
    <>
      <section aria-labelledby="ajustes-perfil">
        <SectionHeader id="ajustes-perfil" title="Perfil" />
        <InsetList aria-labelledby="ajustes-perfil">
          <InsetListItem
            icon={
              <span className="text-callout font-bold">
                {user.name.trim().charAt(0).toUpperCase() || "?"}
              </span>
            }
            label={user.name}
            description={user.email}
          />
        </InsetList>
      </section>

      <section aria-labelledby="ajustes-seguranca">
        <SectionHeader id="ajustes-seguranca" title="Segurança" />
        <InsetList aria-labelledby="ajustes-seguranca">
          <InsetListItem
            icon={<ShieldCheck />}
            label="Segurança"
            description="Passkeys, senha e sessões ativas"
            href="/ajustes/seguranca"
          />
        </InsetList>
      </section>

      <section aria-labelledby="ajustes-aparencia">
        <SectionHeader id="ajustes-aparencia" title="Preferências" />
        <InsetList aria-labelledby="ajustes-aparencia">
          <li className="flex flex-col gap-3 px-4 py-3">
            <span className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-surface-2 text-fg-2 [&_svg]:size-5"
              >
                <Palette />
              </span>
              <span className="text-body font-semibold text-fg">Tema</span>
            </span>
            <ThemeSwitcher />
          </li>
        </InsetList>
      </section>

      <section aria-labelledby="ajustes-sobre">
        <SectionHeader id="ajustes-sobre" title="Sobre" />
        <InsetList aria-labelledby="ajustes-sobre">
          <InsetListItem
            icon={<Info />}
            label="Versão"
            trailing={
              <span className="tabular-nums">{packageJson.version}</span>
            }
          />
        </InsetList>
      </section>
    </>
  );
}

function SettingsSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-7">
      <Skeleton className="h-25 rounded-2xl" />
      <Skeleton className="h-25 rounded-2xl" />
      <Skeleton className="h-36 rounded-2xl" />
    </LoadingRegion>
  );
}
