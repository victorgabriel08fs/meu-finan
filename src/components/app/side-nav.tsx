"use client";

import { Plus } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand/brand-mark";
import { NewsDot } from "@/components/tips/news";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  isNavActive,
  type NavItem,
  PRIMARY_NAV,
  SETTINGS_NAV,
} from "./nav-items";
import { ThemeSwitcher } from "./theme-switcher";

const SELECTION_SPRING = {
  type: "spring",
  stiffness: 500,
  damping: 38,
} as const;

type SideNavProps = {
  /** Replaces the "Nova transação" placeholder once quick-add exists. */
  addButton?: ReactNode;
};

/**
 * Desktop sidebar (doc 02 §4.5): 248px from lg up, with labels, the
 * "Nova transação" button and the same areas as the tab bar plus Ajustes;
 * the theme switch sits at the foot. Reads the pathname, so render it inside
 * <Suspense> with <SideNavView pathname={null} /> as the fallback.
 */
export function SideNav({ addButton }: SideNavProps) {
  return <SideNavView pathname={usePathname()} addButton={addButton} />;
}

export function SideNavView({
  pathname,
  addButton,
}: SideNavProps & { pathname: string | null }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-62 shrink-0 flex-col border-r border-border bg-surface px-3 pt-6 pb-4 lg:flex">
      <Link
        href="/inicio"
        className="mb-6 flex items-center gap-2.5 self-start rounded-control px-3 py-1"
      >
        <BrandMark className="size-8" />
        <span className="text-title-3 text-fg">Meu Finan</span>
      </Link>
      <div className="mb-5 px-1">{addButton ?? <PlaceholderAddButton />}</div>
      <nav aria-label="Navegação principal" className="flex flex-1 flex-col">
        <ul className="flex flex-col gap-1">
          {PRIMARY_NAV.map((item) => (
            <SideNavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </ul>
        <ul className="mt-auto flex flex-col gap-1 border-t border-border pt-3">
          <SideNavLink
            item={SETTINGS_NAV}
            pathname={pathname}
            trailing={<NewsDot className="static ring-0" />}
          />
        </ul>
      </nav>
      <div className="mt-2 flex h-11 items-center justify-between gap-3 pr-1 pl-3">
        <span aria-hidden="true" className="text-callout text-fg-3">
          Tema
        </span>
        <ThemeSwitcher compact />
      </div>
    </aside>
  );
}

function SideNavLink({
  item,
  pathname,
  trailing,
}: {
  item: NavItem;
  pathname: string | null;
  /** At the right end of the row (e.g. the dot of unread novidades). */
  trailing?: ReactNode;
}) {
  const active = isNavActive(pathname, item.match);
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex h-11 items-center gap-3 rounded-control px-3 text-headline transition-colors duration-150",
          active
            ? "text-on-primary-soft"
            : "text-fg-2 hover:bg-surface-2 hover:text-fg",
        )}
      >
        {active ? (
          <motion.span
            layoutId="side-nav-pill"
            transition={SELECTION_SPRING}
            className="absolute inset-0 rounded-control bg-primary-soft"
          />
        ) : null}
        <Icon
          aria-hidden="true"
          className="relative size-5"
          strokeWidth={1.75}
        />
        <span className="relative">{item.label}</span>
        {trailing ? (
          <span className="relative ml-auto flex items-center">{trailing}</span>
        ) : null}
      </Link>
    </li>
  );
}

function PlaceholderAddButton() {
  return (
    <Button
      className="w-full"
      onClick={() => toast("Em breve: registrar lançamentos")}
    >
      <Plus aria-hidden="true" />
      Nova transação
    </Button>
  );
}
