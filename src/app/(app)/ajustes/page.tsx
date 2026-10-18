import {
  BookOpen,
  CalendarRange,
  FileUp,
  History,
  Info,
  Lightbulb,
  Shapes,
  ShieldCheck,
  Sparkles,
  SunMoon,
  ToggleRight,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { plural } from "@/components/admin/labels";
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
import { flagsOverview } from "@/server/domain/flag-admin";
import { getThemePreference } from "@/server/domain/preferences";
import { getTipsOff } from "@/server/domain/tips";
import { usersOverview } from "@/server/domain/users";
import { getFlags } from "@/server/flags";
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
  const [ctx, categories, theme, tipsOff, flags, admin] = await Promise.all([
    getUserContext(user.id),
    listCategories(user.id),
    getThemePreference(user.id),
    getTipsOff(user.id),
    getFlags(user.id),
    user.role === "admin"
      ? Promise.all([usersOverview(), flagsOverview()])
      : null,
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
            trailing={`Dia ${ctx.monthStartDay}`}
            href="/ajustes/preferencias"
          />
          <InsetListItem
            icon={<Lightbulb />}
            label="Dicas de uso"
            trailing={<TipsStateLabel fallback={tipsOff} />}
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
          {flags.importar_extrato ? (
            <InsetListItem
              icon={<FileUp />}
              label="Importar extrato"
              description="Arquivo OFX ou CSV do seu banco"
              href="/importar"
            />
          ) : null}
          <ExportListItem />
        </InsetList>
      </section>

      {admin ? (
        <section aria-labelledby="ajustes-administracao">
          <SectionHeader id="ajustes-administracao" title="Administração" />
          <InsetList aria-labelledby="ajustes-administracao">
            <InsetListItem
              icon={<UsersRound />}
              label="Usuários"
              description={[
                plural(admin[0].accounts, "pessoa", "pessoas"),
                admin[0].pendingInvites > 0
                  ? plural(
                      admin[0].pendingInvites,
                      "convite pendente",
                      "convites pendentes",
                    )
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              href="/admin/usuarios"
            />
            <InsetListItem
              icon={<ToggleRight />}
              label="Flags"
              description={
                admin[1].changed === 0
                  ? "Todas no padrão"
                  : plural(admin[1].changed, "flag ajustada", "flags ajustadas")
              }
              href="/admin/flags"
            />
            <InsetListItem
              icon={<History />}
              label="Atividade"
              description="Quem fez o quê na administração"
              href="/admin/atividade"
            />
          </InsetList>
        </section>
      ) : null}

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

/**
 * One block per section, in page order, each with its section's height
 * (header 36px, rows of 52 or 64px, 1px hairlines between rows).
 * Administração is left out: the role is unknown here, and it streams in
 * below the fold.
 */
function SettingsSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-7">
      {/* Perfil */}
      <Skeleton className="h-25 rounded-2xl" />
      {/* Novidades */}
      <Skeleton className="h-25 rounded-2xl" />
      {/* Segurança */}
      <Skeleton className="h-25 rounded-2xl" />
      {/* Preferências: 36 + 3 × 52 + 2 hairlines = 194 */}
      <Skeleton className="h-48.5 rounded-2xl" />
      {/* Organização */}
      <Skeleton className="h-25 rounded-2xl" />
      {/* Dados, with importar_extrato on (the default): 36 + 64 + 1 + 64 = 165 */}
      <Skeleton className="h-41.25 rounded-2xl" />
      {/* Sobre: 36 + 64 + 1 + 52 = 153 */}
      <Skeleton className="h-38.25 rounded-2xl" />
    </LoadingRegion>
  );
}
