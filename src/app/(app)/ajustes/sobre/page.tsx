import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/charts/data-table";
import { marketRateLabel } from "@/components/planning/market";
import { Card } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { toAnnualRate } from "@/lib/finance";
import { formatRate } from "@/lib/format/number";
import { requireUser } from "@/server/dal";
import { getMarketRates } from "@/server/domain/rates";
import packageJson from "../../../../../package.json";

export const metadata: Metadata = { title: "Como o app calcula" };

export default function SobrePage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Como o app calcula"
        back={{ href: "/ajustes", label: "Ajustes" }}
      />
      <Suspense fallback={<AboutSkeleton />}>
        <About />
      </Suspense>
    </div>
  );
}

function Topic({ title, children }: { title: string; children: ReactNode }) {
  const id = `sobre-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <Card asChild className="flex flex-col gap-2">
      <section aria-labelledby={id}>
        <h2 id={id} className="text-headline text-fg">
          {title}
        </h2>
        <div className="flex flex-col gap-2 text-callout text-fg-2">
          {children}
        </div>
      </section>
    </Card>
  );
}

async function About() {
  await requireUser();
  const market = await getMarketRates();
  const cdi102 = toAnnualRate({
    kind: "cdi",
    pct: 1.02,
    cdiAnnual: market.cdiAnnual,
  });

  return (
    <>
      <p className="text-body text-fg-2">
        As contas seguem regras fixas e conferidas por testes. Projeções são
        estimativas com taxa constante — não são recomendação de investimento.
      </p>

      <Topic title="Índices de mercado">
        <p>
          {marketRateLabel("cdi", market)}
          <br />
          {marketRateLabel("selic", market)}
          <br />
          {marketRateLabel("ipca", market)} (acumulado em 12 meses)
        </p>
        <p>
          Os valores vêm do Banco Central (SGS) uma vez por dia. Enquanto não há
          dados, usamos estimativas — sempre indicadas como tal. No simulador,
          você pode trocar o índice usado.
        </p>
      </Topic>

      <Topic title="Taxas">
        <p>
          Taxa anual vira mensal por equivalência composta, (1 + a)^(1/12) − 1 —
          nunca dividindo por 12. 12% ao ano são ≈ 0,95% ao mês.
        </p>
        <p>
          O percentual do CDI incide sobre a taxa diária: 102% de um CDI de{" "}
          {formatRate({ kind: "annual", value: market.cdiAnnual })} rendem{" "}
          {formatRate({ kind: "annual", value: cdi102 })}, um pouco mais que a
          conta simples.
        </p>
        <p>IPCA + x% compõe os dois: (1 + IPCA) × (1 + x) − 1.</p>
      </Topic>

      <Topic title="Imposto de renda">
        <p>
          Na renda fixa (CDB, Tesouro) o IR incide só sobre o rendimento, pela
          tabela regressiva. Cada aporte paga a alíquota do próprio prazo.
        </p>
        <DataTable
          caption="Tabela regressiva do imposto de renda"
          columns={[
            { key: "term", header: "Prazo", align: "start" },
            { key: "rate", header: "Alíquota", align: "end" },
          ]}
          rows={[
            { key: "180", header: "Até 180 dias", cells: ["22,5%"] },
            { key: "360", header: "181 a 360 dias", cells: ["20%"] },
            { key: "720", header: "361 a 720 dias", cells: ["17,5%"] },
            { key: "more", header: "Acima de 720 dias", cells: ["15%"] },
          ]}
        />
        <p>
          LCI, LCA e poupança são isentas. IOF (resgates em menos de 30 dias) e
          come-cotas ficam de fora.
        </p>
      </Topic>

      <Topic title="Valores de hoje">
        <p>
          Descontamos a inflação esperada mês a mês: o valor mostra quanto
          aquele dinheiro futuro compraria hoje. A renda “sem consumir o
          capital” usa a taxa real (acima da inflação).
        </p>
      </Topic>

      <Topic title="Metas">
        <p>
          A projeção começa no mês seguinte e usa valores brutos, antes do IR. O
          aporte necessário para cumprir um prazo é arredondado para cima, ao
          real inteiro.
        </p>
      </Topic>

      <Topic title="Orçamentos">
        <p>
          O ritmo compara o que você gastou com o esperado até hoje. “Acima do
          ritmo” aparece quando o gasto passa 10% do esperado e já chegou a 25%
          do orçamento — para não alarmar no começo do mês. O “por dia” divide o
          que sobra pelos dias que faltam.
        </p>
      </Topic>

      <p className="px-1 text-caption text-fg-3">
        Meu Finan · versão {packageJson.version}
      </p>
    </>
  );
}

function AboutSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-5">
      <Skeleton className="h-12 rounded-control" />
      <Skeleton className="h-40 rounded-card" />
      <Skeleton className="h-48 rounded-card" />
      <Skeleton className="h-72 rounded-card" />
    </LoadingRegion>
  );
}
