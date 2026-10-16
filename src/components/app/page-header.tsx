"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type BackTarget = { href: string; label: string };

type PageHeaderProps = {
  title: string;
  /** Up to two secondary actions (IconButtons or small buttons), top right. */
  actions?: ReactNode;
  /** Stacked screens: chevron (+ the previous screen's name on wide screens). */
  back?: BackTarget;
  className?: string;
};

/**
 * Page header (doc 02 §4.2): large title (title-1) that, once scrolled under
 * the top edge, collapses into a 52px translucent bar with the title centred
 * in headline and a hairline. The compact bar is a fixed overlay, so the
 * header works in any parent layout (flex gaps included).
 */
export function PageHeader({
  title,
  actions,
  back,
  className,
}: PageHeaderProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const heading = titleRef.current;
    const bar = barRef.current;
    if (!heading || !bar || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(entry ? !entry.isIntersecting : false),
      { rootMargin: `-${bar.offsetHeight}px 0px 0px 0px` },
    );
    observer.observe(heading);
    return () => observer.disconnect();
  }, []);

  return (
    <header
      data-slot="page-header"
      className={cn("pt-[env(safe-area-inset-top)]", className)}
    >
      {back || actions ? (
        <div className="flex h-13 items-center justify-between gap-2">
          {back ? <BackLink target={back} /> : <span />}
          {actions ? (
            <div className="-mr-2 flex items-center gap-1">{actions}</div>
          ) : null}
        </div>
      ) : (
        <div aria-hidden="true" className="h-5 lg:h-10" />
      )}
      <h1 ref={titleRef} className="text-title-1 text-fg">
        {title}
      </h1>

      <div
        ref={barRef}
        aria-hidden="true"
        data-collapsed={collapsed ? "" : undefined}
        className={cn(
          "invisible fixed inset-x-0 top-0 z-10 border-b border-border bg-bar pt-[env(safe-area-inset-top)] opacity-0 backdrop-blur-lg lg:left-62",
          "transition-[opacity,visibility] duration-150 ease-standard data-collapsed:visible data-collapsed:opacity-100",
        )}
      >
        <div className="mx-auto grid h-13 max-w-300 grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2 px-gutter">
          <div className="flex min-w-0">
            {back ? <BackLink target={back} tabIndex={-1} /> : null}
          </div>
          <p className="truncate text-headline text-fg">{title}</p>
          <div />
        </div>
      </div>
    </header>
  );
}

function BackLink({
  target,
  tabIndex,
}: {
  target: BackTarget;
  tabIndex?: number;
}) {
  return (
    <Link
      href={target.href}
      tabIndex={tabIndex}
      className="-ml-2.5 inline-flex h-11 min-w-11 items-center gap-0.5 rounded-full pr-2 pl-1 text-headline text-primary transition-opacity duration-100 active:opacity-60"
    >
      <ChevronLeft aria-hidden="true" className="size-6 shrink-0" />
      <span className="sr-only">Voltar para </span>
      <span className="truncate max-sm:sr-only">{target.label}</span>
    </Link>
  );
}
