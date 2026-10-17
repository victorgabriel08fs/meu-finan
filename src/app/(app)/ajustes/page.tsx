import {
  BookOpen,
  CalendarRange,
  FileUp,
  Info,
  Lightbulb,
  Shapes,
  ShieldCheck,
  Sparkles,
  SunMoon,
} from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { InsetList, InsetListItem } from "@/components/app/inset-list";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeader } from "@/components/app/section-header";
import { ThemeLabel } from "@/components/app/theme-switcher";
import { ExportListItem } from "@/components/imports/export-list-item";
import { NewsBadge, TipsStateLabel } from "@/components/tips/news";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/dal";
import { listCategories } from "@/server/domain/categories";
import { getUserContext } from "@/server/domain/context";
import { getThemePreference } from "@/server/domain/preferences";
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
  const [ctx, categories, theme] = await Promise.all([
    getUserContext(user.id),
    listCategories(user.id),
    getThemePreference(user.id),
  ]);
  const expenses = categories.filter(
    (category) => category.kind === "expense",
  ).length;
  const incomes = categories.length - expenses;

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

      <section aria-labelledby="ajustes-novidades">
        <SectionHeader id="ajustes-novidades" title="Novidades" />
        <InsetList aria-labelledby="ajustes-novidades">
          <InsetListItem
            icon={<Sparkles />}
            label="Novidades"
            description="O que mudou no app"
            trailing={<NewsBadge />}
            href="/ajustes/novidades"
            data-tip="news"
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
            data-tip="security"
          />
        </InsetList>
      </section>

      <section aria-labelledby="ajustes-preferencias">
        <SectionHeader id="ajustes-preferencias" title="Preferências" />
        <InsetList aria-labelledby="ajustes-preferencias">
          <InsetListItem
            icon={<SunMoon />}
            label="Aparência"
            trailing={<ThemeLabel fallback={theme} />}
            href="/ajustes/preferencias"
          />
          <InsetListItem
            icon={<CalendarRange />}
            label="Mês financeiro"
            trailing={`Começa no dia ${ctx.monthStartDay}`}
            href="/ajustes/preferencias"
          />
          <InsetListItem
            icon={<Lightbulb />}
            label="Dicas de uso"
            trailing={<TipsStateLabel />}
            href="/ajustes/preferencias#preferencias-dicas"
            data-tip="preferences"
          />
        </InsetList>
      </section>

      <section aria-labelledby="ajustes-organizacao">
        <SectionHeader id="ajustes-organizacao" title="Organização" />
        <InsetList aria-labelledby="ajustes-organizacao">
          <InsetListItem
            icon={<Shapes />}
            label="Categorias"
            description={`${expenses} de despesa · ${incomes} de receita`}
            href="/ajustes/categorias"
          />
        </InsetList>
      </section>

      <section aria-labelledby="ajustes-dados">
        <SectionHeader id="ajustes-dados" title="Dados" />
        <InsetList aria-labelledby="ajustes-dados">
          <InsetListItem
            icon={<FileUp />}
            label="Importar extrato"
            description="Arquivo OFX ou CSV do seu banco"
            href="/importar"
            data-tip="import"
          />
          <ExportListItem />
        </InsetList>
      </section>

      <section aria-labelledby="ajustes-sobre">
        <SectionHeader id="ajustes-sobre" title="Sobre" />
        <InsetList aria-labelledby="ajustes-sobre">
          <InsetListItem
            icon={<BookOpen />}
            label="Como o app calcula"
            description="Juros, CDI, IR, metas e orçamentos"
            href="/ajustes/sobre"
          />
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
      <Skeleton className="h-48.25 rounded-2xl" />
      <Skeleton className="h-25 rounded-2xl" />
      <Skeleton className="h-25 rounded-2xl" />
      <Skeleton className="h-41 rounded-2xl" />
      <Skeleton className="h-36 rounded-2xl" />
    </LoadingRegion>
  );
}
