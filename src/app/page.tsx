import { Eye, FileDown, KeyRound } from "lucide-react";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { AuthorCredit } from "@/components/brand/author-credit";
import { Wordmark } from "@/components/brand/wordmark";
import { DemoInstall } from "@/components/home/demo-install";
import { DemoKeypad } from "@/components/home/demo-keypad";
import { DemoMonth } from "@/components/home/demo-month";
import { DemoPlan } from "@/components/home/demo-plan";
import { DemoPrivacy } from "@/components/home/demo-privacy";
import { EnterLink } from "@/components/home/enter-link";
import { HomeSection } from "@/components/home/home-section";
import {
  WORDMARK_CLOSING_SCALE,
  WORDMARK_HERO_SCALE,
} from "@/components/home/model";
import { HOME_MOTION_VARS } from "@/components/home/motion";
import { Reveal } from "@/components/home/reveal";
import { ScrollThread } from "@/components/home/scroll-thread";
import { ThemePreview } from "@/components/home/theme-preview";

export const metadata: Metadata = {
  title: { absolute: "Prumo · Seu dinheiro no prumo." },
  description: "Controle financeiro pessoal",
  openGraph: {
    title: "Prumo · Seu dinheiro no prumo.",
    description: "Controle financeiro pessoal",
    url: "/",
  },
};

const PAGE_VARS = {
  ...HOME_MOTION_VARS,
  "--k-hero": WORDMARK_HERO_SCALE,
  "--k-closing": WORDMARK_CLOSING_SCALE,
} as CSSProperties;

const FEATURES = [
  { icon: KeyRound, text: "Entrada com passkey ou senha." },
  { icon: Eye, text: "Um toque no olho esconde todos os valores." },
  { icon: FileDown, text: "Seus lançamentos saem em CSV quando você quiser." },
];

/**
 * Public homepage (docs/02 §6.19). Static: no session, no cookies, no
 * database. Whoever has a session cookie never sees it: src/proxy.ts sends
 * them to /inicio. The only action is "Entrar" (/entrar); there is no sign-up.
 *
 * All copy is server-rendered in its final state and reads without
 * JavaScript; the `h1` and the text under it never animate (LCP). Example
 * cards (`src/components/home/demo-*`) are decorative and hold made-up
 * values in cents (never `Money`: the device's privacy mode would turn the
 * examples into "••••").
 *
 * One thread runs down the page with the scroll (`ScrollThread`), from the
 * "p" of the hero wordmark to the "p" of the closing one. Its place comes
 * from CSS alone (globals.css, "Homepage"), which relies on this order: the
 * hero wordmark first in `.home-track` and the closing wordmark last.
 */
export default function Home() {
  return (
    <main
      style={PAGE_VARS}
      className="mx-auto w-full max-w-[1040px] overflow-x-clip pt-[max(2.5rem,env(safe-area-inset-top))] pr-[16px] pl-[48px] pb-[max(3.5rem,env(safe-area-inset-bottom))] md:px-[48px] lg:pt-16"
    >
      <div className="mx-auto max-w-xl lg:max-w-none">
        <div className="home-track">
          <ScrollThread />

          <section
            aria-labelledby="home-titulo"
            data-home-hero=""
            className="flex flex-col items-start gap-6 pb-16 lg:pb-28"
          >
            <Wordmark
              label="Prumo"
              className="home-wordmark mb-8 [--k:var(--k-hero)]"
            />
            <h1
              id="home-titulo"
              className="max-w-lg text-display text-fg text-balance break-words hyphens-auto lg:max-w-2xl lg:text-amount"
            >
              Seu dinheiro no prumo.
            </h1>
            <p className="max-w-md text-body text-fg-2 text-pretty">
              Registre o que entra e o que sai, veja o mês inteiro em uma tela e
              decida com calma.
            </p>
            <EnterLink className="home-rise [--i:1]" />
            <p className="home-rise max-w-md text-caption text-fg-2 [--i:2]">
              Só por convite. Recebeu um? Abra o link que chegou para você.
            </p>
          </section>

          <HomeSection
            id="registrar"
            label="Registrar"
            title="Um gasto, alguns toques."
            demo={<DemoKeypad />}
          >
            <p>
              O &ldquo;+&rdquo; está em toda tela. O teclado já abre no valor, a
              data é hoje e a conta é a última que você usou.
            </p>
            <p>
              Errou? <strong className="text-fg">Desfazer</strong> fica ali por
              alguns segundos.
            </p>
          </HomeSection>

          <HomeSection
            id="mes"
            label="Ver"
            title="O mês inteiro em uma tela."
            demo={<DemoMonth />}
          >
            <p>
              Saldo em contas, o previsto para o fim do mês, o que vence nos
              próximos dias e para onde o dinheiro foi.
            </p>
            <p className="text-caption">Valores de exemplo.</p>
          </HomeSection>

          <HomeSection
            id="planejar"
            label="Planejar"
            title="Planeje sem culpa."
            demo={<DemoPlan />}
          >
            <p>
              Orçamentos por categoria, metas com prazo e um simulador de juros
              compostos, já com CDI, IPCA e imposto de renda.
            </p>
            <p className="rounded-control bg-warning-soft px-4 py-3 text-callout text-warning">
              Mercado chegou a 80% do orçamento, e ainda faltam 18 dias.
            </p>
            <p className="text-caption">
              Simulação com taxa constante. Não é recomendação de investimento.
            </p>
          </HomeSection>

          <HomeSection
            id="privacidade"
            label="Privacidade"
            title="Cada pessoa com as próprias finanças."
            demo={<DemoPrivacy />}
          >
            <p>
              O Prumo é de uso pessoal e familiar. Não existe cadastro aberto:
              quem administra convida, e cada conta vê só o próprio dinheiro.
              Nem quem administra vê o seu.
            </p>
            <ul className="flex flex-col gap-3 pt-1 text-fg">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <Icon
                    aria-hidden="true"
                    className="size-5 shrink-0 text-primary"
                  />
                  {text}
                </li>
              ))}
            </ul>
          </HomeSection>

          <HomeSection
            id="instalar"
            label="Instalar"
            title="Abre como um app."
            demo={<DemoInstall />}
          >
            <p>
              Adicione o Prumo à tela de início do celular. Escuro por padrão,
              claro se você preferir.
            </p>
            <ThemePreview />
          </HomeSection>

          <div data-home-closing-mark="" className="pt-16 lg:pt-24">
            <Wordmark className="home-wordmark [--k:var(--k-closing)]" />
          </div>
        </div>

        <section
          aria-labelledby="home-fecho"
          data-home-closing=""
          className="flex flex-col items-start gap-6 pt-10 pb-6"
        >
          <Reveal>
            <h2
              id="home-fecho"
              className="text-title-1 text-fg text-balance lg:text-display"
            >
              Pronto quando você estiver.
            </h2>
          </Reveal>
          <Reveal index={1}>
            <EnterLink />
          </Reveal>
          <Reveal index={2}>
            <p className="text-caption text-fg-2">
              Só por convite. Sem convite, fale com quem administra o seu Prumo.
            </p>
          </Reveal>
        </section>

        <footer className="border-t border-border pt-6">
          <AuthorCredit />
        </footer>
      </div>
    </main>
  );
}
