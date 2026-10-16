import { ReceiptText, Smartphone, Sprout, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ComingSoonButton } from "@/components/app/coming-soon-button";
import { EmptyState } from "@/components/app/empty-state";
import { InsetList, InsetListItem } from "@/components/app/inset-list";
import { PrivacyToggle } from "@/components/app/privacy-toggle";
import { SectionHeader } from "@/components/app/section-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { fullDateLabel, todayInTimeZone } from "@/lib/format/date";
import { requireUser } from "@/server/dal";

export const metadata: Metadata = { title: "Início" };

const TIME_ZONE = "America/Sao_Paulo";
const WEEKDAYS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

export default function InicioPage() {
  return (
    <div className="flex flex-col gap-7 pt-[env(safe-area-inset-top)]">
      <Suspense fallback={<HomeSkeleton />}>
        <Home />
      </Suspense>
    </div>
  );
}

async function Home() {
  const user = await requireUser();
  // Request time from here on (after the session read), so the clock is fine.
  const now = new Date();
  const today = todayInTimeZone(TIME_ZONE);
  const firstName = user.name.trim().split(/\s+/)[0] || "você";

  return (
    <>
      <header className="flex min-h-14 items-center gap-3 pt-2">
        <Link
          href="/ajustes"
          aria-label="Perfil e ajustes"
          className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-caption font-bold text-on-primary-soft after:absolute after:-inset-1"
        >
          <span aria-hidden="true">{initials(user.name)}</span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-title-3 text-fg">
            {greeting(now)}, {firstName}
          </h1>
          <p className="truncate text-caption text-fg-3">
            {weekdayDateLabel(today)}
          </p>
        </div>
        <PrivacyToggle className="-mr-2" />
      </header>

      <EmptyState
        icon={<Sprout />}
        title="Comece por aqui"
        description="Registre o primeiro gasto e acompanhe o mês sem planilha."
        action={
          <ComingSoonButton size="lg" message="Em breve: registrar lançamentos">
            Adicionar 1º gasto
          </ComingSoonButton>
        }
        className="py-6"
      />

      <section aria-labelledby="primeiros-passos">
        <SectionHeader id="primeiros-passos" title="Primeiros passos" />
        <InsetList aria-labelledby="primeiros-passos">
          <InsetListItem
            icon={<ReceiptText />}
            label="Adicionar o 1º gasto"
            description="Leva 5 segundos pelo botão +"
          />
          <InsetListItem
            icon={<Target />}
            label="Criar um orçamento"
            description="Quanto gastar por categoria no mês"
            href="/planejar/orcamentos"
          />
          <InsetListItem
            icon={<Smartphone />}
            label="Instalar o app"
            description="Compartilhar → Adicionar à Tela de Início"
          />
        </InsetList>
      </section>
    </>
  );
}

function HomeSkeleton() {
  return (
    <>
      <h1 className="sr-only">Início</h1>
      <LoadingRegion className="flex flex-col gap-7">
        <div className="flex min-h-14 items-center gap-3 pt-2">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-5 w-44 rounded-chip" />
            <Skeleton className="h-3.5 w-32 rounded-chip" />
          </div>
        </div>
        <Skeleton className="h-72 rounded-card" />
        <Skeleton className="h-52 rounded-2xl" />
      </LoadingRegion>
    </>
  );
}

/** "Bom dia" (5h–12h), "Boa tarde" (12h–18h), "Boa noite" — São Paulo time. */
function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

/** "terça, 14 de outubro" for "2026-10-14". */
function weekdayDateLabel(isoDate: string): string {
  const [year = 1970, month = 1, day = 1] = isoDate.split("-").map(Number);
  const weekday =
    WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${fullDateLabel(isoDate).replace(/ de \d+$/, "")}`;
}

/** "AN" for "Ana Nunes", "A" for "Ana". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}
