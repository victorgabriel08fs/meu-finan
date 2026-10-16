"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AddFab } from "./add-fab";
import { isNavActive, PRIMARY_NAV } from "./nav-items";

const SELECTION_SPRING = {
  type: "spring",
  stiffness: 500,
  damping: 38,
} as const;

type BottomNavProps = {
  /** The centre "+" slot; defaults to a placeholder until quick-add exists. */
  addButton?: ReactNode;
};

/**
 * Phone and tablet tab bar (doc 02 §4.2): five equal slots, 24px icons with
 * always-visible labels, a --primary-soft pill that slides to the active tab,
 * and the "+" in the centre. Translucent, never hides on scroll, hidden on lg
 * (the sidebar takes over). Reads the pathname, so render it inside
 * <Suspense> with <BottomNavView pathname={null} /> as the fallback.
 */
export function BottomNav({ addButton }: BottomNavProps) {
  return <BottomNavView pathname={usePathname()} addButton={addButton} />;
}

export function BottomNavView({
  pathname,
  addButton,
}: BottomNavProps & { pathname: string | null }) {
  const reduceMotion = useReducedMotion();
  const [first, second, third, fourth] = PRIMARY_NAV.map((item) => {
    const active = isNavActive(pathname, item.match);
    const Icon = item.icon;

    function onClick(event: MouseEvent<HTMLAnchorElement>) {
      // Tapping the tab you are on scrolls back to the top (§4.2).
      if (pathname !== item.href) return;
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    }

    return (
      <li key={item.href} className="flex min-w-0">
        <Link
          href={item.href}
          onClick={onClick}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-16 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-control text-micro transition-colors duration-150",
            active ? "text-primary" : "text-fg-3 hover:text-fg-2",
          )}
        >
          <span className="relative flex h-7.5 w-14 items-center justify-center">
            {active ? (
              <motion.span
                layoutId="bottom-nav-pill"
                transition={SELECTION_SPRING}
                className="absolute inset-0 rounded-full bg-primary-soft"
              />
            ) : null}
            <Icon
              aria-hidden="true"
              className="relative size-6"
              strokeWidth={1.75}
            />
          </span>
          <span className="max-w-full truncate px-0.5">{item.label}</span>
        </Link>
      </li>
    );
  });

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bar pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
    >
      <ul className="mx-auto grid h-(--tab-bar-h) max-w-lg grid-cols-5 items-center px-1">
        {first}
        {second}
        <li className="flex items-center justify-center">
          {addButton ?? <PlaceholderAddButton />}
        </li>
        {third}
        {fourth}
      </ul>
    </nav>
  );
}

function PlaceholderAddButton() {
  return <AddFab onClick={() => toast("Em breve: registrar lançamentos")} />;
}
