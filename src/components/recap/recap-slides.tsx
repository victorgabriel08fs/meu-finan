"use client";

import {
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  CalendarDays,
  Repeat,
  TriangleAlert,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { useCountUp } from "@/components/money/use-count-up";
import { SaveLeftoverButton } from "@/components/reports/save-leftover-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePrivacyStore } from "@/stores/privacy";
import type { RecapSlide } from "./model";
import { EASE_ENTER, RECAP_COUNT_MS, stagger } from "./motion";
import { RecapBar, RecapDayStrip, RecapRing } from "./recap-charts";

type SlideOf<Id extends RecapSlide["id"]> = Extract<RecapSlide, { id: Id }>;

/**
 * One component per part of the Retrospectiva (doc 02 §6.12). Each has a
 * focusable title, one hero figure at most and elements that come in one
 * after the other (60 ms apart, five at most). Every value goes through
 * <Money>, so privacy mode hides it here as everywhere.
 */

/** Fade and rise of the nth element of a part. */
function Reveal({
  index = 0,
  as = "div",
  className,
  children,
}: {
  index?: number;
  as?: "div" | "li";
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const Tag = as === "li" ? motion.li : motion.div;
  return (
    <Tag
      className={className}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.36,
        ease: EASE_ENTER,
        delay: reduce ? 0 : stagger(index, 0.08),
      }}
    >
      {children}
    </Tag>
  );
}

/** The part's heading; the player moves the focus here on every change. */
function SlideTitle({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <h2
      id={id}
      tabIndex={-1}
      data-recap-title=""
      className={cn(
        "text-balance hyphens-auto text-[length:min(1.75rem,8vw)] leading-tight font-bold tracking-tight text-fg outline-none",
        className,
      )}
    >
      {children}
    </h2>
  );
}

const Body = ({ children }: { children: ReactNode }) => (
  <p className="text-body text-fg-2">{children}</p>
);

/** The shared layout: content centred in the height that is left. */
function Column({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto my-auto flex w-full max-w-110 flex-col gap-6 py-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The hero figure: counts up from zero when its part comes in, skipping the
 * count with reduced motion or privacy mode. Screen readers hear the final
 * value once.
 */
function RecapMoney({
  cents,
  negative = false,
  size = "3.5rem",
}: {
  cents: number;
  negative?: boolean;
  size?: string;
}) {
  const hidden = usePrivacyStore((state) => state.hidden);
  const value = useCountUp(cents, {
    initial: 0,
    durationMs: RECAP_COUNT_MS,
    skip: hidden,
    ease: (p) => 1 - (1 - p) ** 4,
  });
  const sign = negative ? -1 : 1;
  return (
    <div className="@container w-full">
      <span aria-hidden="true">
        <Money
          cents={sign * value}
          variant="display"
          sign={negative ? "auto" : "never"}
          tone="neutral"
          size={size}
          className="leading-none"
        />
      </span>
      <span className="sr-only">
        <Money
          cents={sign * cents}
          variant="display"
          sign={negative ? "auto" : "never"}
          tone="neutral"
        />
      </span>
    </div>
  );
}

const money = (cents: number, variant: "headline" | "callout" = "headline") => (
  <Money cents={cents} variant={variant} sign="never" tone="neutral" />
);

export function IntroSlide({ slide }: { slide: SlideOf<"intro"> }) {
  const reduce = useReducedMotion();
  return (
    <Column className="items-center text-center">
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.36, ease: EASE_ENTER }}
      >
        <RecapRing value={1} size={96} stroke={3}>
          <CalendarCheck
            aria-hidden="true"
            className="size-8 text-primary"
            strokeWidth={1.75}
          />
        </RecapRing>
      </motion.div>
      <div className="flex flex-col items-center gap-3">
        <Reveal index={1}>
          <p className="text-overline text-primary">RETROSPECTIVA</p>
        </Reveal>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: EASE_ENTER, delay: 0.12 }}
        >
          <SlideTitle className="text-[length:min(2.5rem,11vw)] leading-tight">
            {slide.title}
          </SlideTitle>
        </motion.div>
        <Reveal index={3}>
          <p className="text-headline text-fg-2">{slide.range}</p>
        </Reveal>
      </div>
      <Reveal index={4} className="flex flex-col items-center gap-6">
        <Body>{slide.lead}</Body>
        <p className="text-caption text-fg-3">
          <span className="md:hidden">Toque para avançar</span>
          <span className="hidden md:inline">Use as setas para avançar</span>
        </p>
      </Reveal>
    </Column>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-3 shrink-0 rounded-[4px]"
      style={{ background: color }}
    />
  );
}

export function FlowSlide({ slide }: { slide: SlideOf<"flow"> }) {
  const largest = Math.max(slide.incomeCents, slide.expenseCents, 1);
  const rows = [
    { label: "Entrou", cents: slide.incomeCents, color: "var(--chart-3)" },
    { label: "Saiu", cents: slide.expenseCents, color: "var(--chart-2)" },
  ];
  return (
    <Column>
      <Reveal className="flex flex-col gap-2">
        <SlideTitle>{slide.title}</SlideTitle>
        <Body>O que foi pago no mês, sem contar pendências.</Body>
      </Reveal>
      <div className="flex flex-col gap-6">
        {rows.map((row, index) => (
          <Reveal
            key={row.label}
            index={index + 1}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <Swatch color={row.color} />
              <span className="text-callout font-semibold text-fg-2">
                {row.label}
              </span>
            </div>
            <Money
              cents={row.cents}
              variant="title"
              sign="never"
              tone="neutral"
              size="2rem"
            />
            <RecapBar
              share={row.cents / largest}
              color={row.color}
              delay={0.3 + index * 0.12}
            />
          </Reveal>
        ))}
      </div>
      {slide.note ? (
        <Reveal index={3}>
          <p className="text-caption text-fg-3">{slide.note}</p>
        </Reveal>
      ) : null}
    </Column>
  );
}

export function LeftSlide({ slide }: { slide: SlideOf<"left"> }) {
  const reduce = useReducedMotion();
  const up = slide.mood === "up";
  return (
    <Column>
      <motion.div
        className={cn(
          "flex flex-col gap-6 text-center",
          up && "rounded-[2.5rem] bg-primary-soft px-5 py-10",
        )}
        initial={reduce ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: EASE_ENTER }}
      >
        <Reveal index={0} className="flex flex-col items-center gap-3">
          <p
            className={cn(
              "text-overline uppercase",
              up ? "text-on-primary-soft" : "text-fg-2",
            )}
          >
            {slide.label}
          </p>
          <RecapMoney cents={slide.cents} />
        </Reveal>
        <Reveal index={2}>
          <SlideTitle className="mx-auto text-[length:max(1rem,min(1.375rem,6.5vw))]">
            {slide.title}
          </SlideTitle>
        </Reveal>
        {slide.previous ? (
          <Reveal index={3}>
            <p className="text-callout text-fg-2">
              {slide.previous.lead}
              {slide.previous.cents !== null ? (
                <> {money(slide.previous.cents, "callout")}.</>
              ) : null}
            </p>
          </Reveal>
        ) : null}
      </motion.div>
    </Column>
  );
}

export function DaysSlide({ slide }: { slide: SlideOf<"days"> }) {
  return (
    <Column>
      <Reveal className="flex flex-col gap-2">
        <SlideTitle>{slide.title}</SlideTitle>
        <Body>Quanto mais forte a cor, mais você gastou no dia.</Body>
      </Reveal>
      <RecapDayStrip weeks={slide.weeks} />
      <Reveal index={4} className="flex flex-col gap-1">
        {slide.topLine ? (
          <p className="text-callout text-fg-2">
            {slide.topLine.lead} {money(slide.topLine.cents, "callout")}.
          </p>
        ) : null}
        {slide.withoutLabel ? (
          <p className="text-callout text-fg-2">{slide.withoutLabel}</p>
        ) : null}
        <Button asChild variant="ghost" size="sm" className="mt-1 self-start">
          <Link href={slide.href}>
            <CalendarDays aria-hidden="true" />
            Ver no Calendário
          </Link>
        </Button>
      </Reveal>
    </Column>
  );
}

export function CategoriesSlide({ slide }: { slide: SlideOf<"categories"> }) {
  const top = slide.items[0]?.share || 1;
  return (
    <Column>
      <Reveal className="flex flex-col gap-2">
        <SlideTitle>{slide.title}</SlideTitle>
        <Body>{slide.sentence}</Body>
      </Reveal>
      <ul className="flex flex-col gap-4">
        {slide.items.map((item, index) => (
          <Reveal
            as="li"
            key={item.name}
            index={index + 1}
            className="flex items-center gap-3"
          >
            <CategoryIcon icon={item.icon} color={item.color} size="sm" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <span className="min-w-32 flex-1 break-words text-callout font-semibold text-fg">
                  {item.name}
                </span>
                <span className="flex max-w-full flex-wrap items-baseline gap-x-2">
                  {money(item.cents, "callout")}
                  <span className="min-w-9 text-right text-caption text-fg-3 tabular-nums">
                    {item.percentLabel}
                  </span>
                </span>
              </div>
              <RecapBar
                share={item.share / top}
                color="var(--primary)"
                height={8}
                delay={0.25 + index * 0.06}
              />
            </div>
          </Reveal>
        ))}
        {slide.others ? (
          <Reveal
            as="li"
            index={slide.items.length + 1}
            className="flex items-center gap-3"
          >
            <span className="size-7 shrink-0" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
              <span className="text-callout text-fg-2">
                {slide.others.label}
              </span>
              {money(slide.others.cents, "callout")}
            </div>
          </Reveal>
        ) : null}
      </ul>
      <Reveal index={6}>
        <Button asChild variant="ghost" size="sm" className="self-start">
          <Link href={slide.href}>Ver categorias</Link>
        </Button>
      </Reveal>
    </Column>
  );
}

export function BiggestSlide({ slide }: { slide: SlideOf<"biggest"> }) {
  const reduce = useReducedMotion();
  return (
    <Column className="items-center text-center">
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.36, ease: EASE_ENTER }}
      >
        <CategoryIcon icon={slide.icon} color={slide.color} size="lg" />
      </motion.div>
      <Reveal index={1} className="flex flex-col items-center gap-2">
        <SlideTitle className="text-title-3 text-fg-2">
          {slide.title}
        </SlideTitle>
        <p className="text-title-2 break-words text-fg">{slide.description}</p>
      </Reveal>
      <Reveal index={2} className="w-full">
        <RecapMoney cents={-slide.cents} negative />
      </Reveal>
      <Reveal index={3} className="flex flex-col items-center gap-1">
        <p className="text-callout text-fg-2">{slide.meta}</p>
        {slide.extras.map((extra) => (
          <p
            key={extra}
            className="inline-flex items-center gap-1.5 text-callout text-fg-2"
          >
            {extra === "Repete todo mês" ? (
              <Repeat aria-hidden="true" className="size-4" />
            ) : null}
            {extra}
          </p>
        ))}
        <Button asChild variant="ghost" size="sm" className="mt-2">
          <Link href={slide.href}>Ver no extrato</Link>
        </Button>
      </Reveal>
    </Column>
  );
}

export function ComparisonSlide({ slide }: { slide: SlideOf<"comparison"> }) {
  return (
    <Column>
      <Reveal className="flex flex-col gap-3">
        <SlideTitle>{slide.title}</SlideTitle>
        <p className="text-title-3 text-fg">
          {slide.lead}
          {slide.cents !== null ? (
            <>
              {" "}
              <Money
                cents={slide.cents}
                variant="headline"
                sign="never"
                tone="neutral"
                className="text-title-3"
              />{" "}
              {slide.tail}
            </>
          ) : null}
        </p>
      </Reveal>
      {slide.items.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {slide.items.map((item, index) => (
            <Reveal
              as="li"
              key={item.name}
              index={index + 1}
              className="flex items-center gap-3"
            >
              <CategoryIcon icon={item.icon} color={item.color} size="md" />
              <span className="min-w-0 flex-1 break-words text-body font-semibold text-fg">
                {item.name}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-callout text-fg-2">
                {item.direction === "up" ? (
                  <ArrowUp aria-hidden="true" className="size-4" />
                ) : (
                  <ArrowDown aria-hidden="true" className="size-4" />
                )}
                {money(item.cents, "callout")}{" "}
                {item.direction === "up" ? "a mais" : "a menos"}
              </span>
            </Reveal>
          ))}
        </ul>
      ) : null}
    </Column>
  );
}

export function BudgetsSlide({ slide }: { slide: SlideOf<"budgets"> }) {
  return (
    <Column>
      <Reveal className="flex flex-col gap-2">
        <SlideTitle>{slide.title}</SlideTitle>
        <Body>{slide.sentence}</Body>
      </Reveal>
      <Reveal index={1} className="flex justify-center">
        <RecapRing
          value={slide.total > 0 ? slide.met / slide.total : 0}
          delay={0.2}
        >
          <span className="text-title-1 text-fg tabular-nums">
            {slide.met} de {slide.total}
          </span>
          <span className="text-caption text-fg-2">cumpridos</span>
        </RecapRing>
      </Reveal>
      {slide.over.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {slide.over.map((item, index) => (
            <Reveal
              as="li"
              key={item.name}
              index={index + 2}
              className="flex items-center gap-3"
            >
              <CategoryIcon icon={item.icon} color={item.color} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span className="min-w-0 break-words text-callout font-semibold text-fg">
                    {item.name}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-callout text-danger">
                    <TriangleAlert aria-hidden="true" className="size-4" />
                    {money(item.excessCents, "callout")} acima
                  </span>
                </div>
                <div className="relative">
                  <RecapBar
                    share={1}
                    color="var(--danger-fill)"
                    height={8}
                    delay={0.3}
                  />
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-fg"
                    style={{ left: `${(1 / Math.max(item.ratio, 1)) * 100}%` }}
                  />
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
      ) : null}
      <Reveal index={5}>
        <Button asChild variant="ghost" size="sm" className="self-start">
          <Link href={slide.href}>Ver orçamentos</Link>
        </Button>
      </Reveal>
    </Column>
  );
}

export function NextSlide({ slide }: { slide: SlideOf<"next"> }) {
  const rows = [
    slide.subscriptions && {
      label: "Assinaturas",
      count: `${slide.subscriptions.count} ${slide.subscriptions.count === 1 ? "ativa" : "ativas"}`,
      cents: slide.subscriptions.cents,
    },
    slide.installments && {
      label: "Parcelas",
      count: `${slide.installments.count} ${slide.installments.count === 1 ? "compra" : "compras"}`,
      cents: slide.installments.cents,
    },
  ].filter((row) => row !== null && row !== undefined);
  return (
    <Column>
      <Reveal className="flex flex-col gap-2">
        <SlideTitle>{slide.title}</SlideTitle>
        <Body>{slide.lead}</Body>
      </Reveal>
      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <Reveal
            key={row.label}
            index={index + 1}
            className="flex flex-col gap-1 rounded-card bg-surface-2 p-4"
          >
            <p className="text-callout font-semibold text-fg-2">
              {row.label} · {row.count}
            </p>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <Money
                cents={row.cents}
                variant="title"
                sign="never"
                tone="neutral"
              />
              <span className="text-callout text-fg-2">por mês</span>
            </p>
          </Reveal>
        ))}
      </div>
    </Column>
  );
}

export function OutroSlide({
  slide,
  onRestart,
}: {
  slide: SlideOf<"outro">;
  onRestart: () => void;
}) {
  const { offer } = slide;
  return (
    <Column>
      <Reveal className="flex flex-col gap-3">
        <SlideTitle>{slide.title}</SlideTitle>
        {offer.kind === "save" ? (
          <Body>Ainda dá para separar {money(offer.cents)}.</Body>
        ) : offer.kind === "create-box" ? (
          <Body>Crie uma caixinha para separar o que sobrou.</Body>
        ) : offer.kind === "saved" ? (
          <Body>{offer.text}</Body>
        ) : (
          <Body>O fechamento completo tem o resto da história.</Body>
        )}
      </Reveal>
      <Reveal index={2} className="flex flex-col gap-3">
        {offer.kind === "save" && slide.boxId ? (
          <SaveLeftoverButton
            spendableId={slide.spendableId}
            boxId={slide.boxId}
            amountCents={offer.cents}
            description={offer.description}
          />
        ) : null}
        {offer.kind === "create-box" ? (
          <Button asChild variant="tonal">
            <Link href="/contas/nova?tipo=caixinha">Criar caixinha</Link>
          </Button>
        ) : null}
        <Button
          asChild
          variant={
            offer.kind === "save" || offer.kind === "create-box"
              ? "secondary"
              : "primary"
          }
        >
          <Link href={slide.closingHref}>Ver o fechamento completo</Link>
        </Button>
        <Button variant="ghost" onClick={onRestart}>
          Ver de novo
        </Button>
      </Reveal>
    </Column>
  );
}
