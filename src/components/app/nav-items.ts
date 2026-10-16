import {
  ChartColumn,
  House,
  type LucideIcon,
  ReceiptText,
  Settings,
  Target,
} from "lucide-react";

export type NavItem = {
  /** Where the tab goes (the root of its area). */
  href: string;
  /** The tab is active on this path and everything below it. */
  match: string;
  label: string;
  icon: LucideIcon;
};

/** The four areas of the tab bar (doc 02 §4.1, §4.2), in order. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/inicio", match: "/inicio", label: "Início", icon: House },
  { href: "/extrato", match: "/extrato", label: "Extrato", icon: ReceiptText },
  {
    href: "/planejar/orcamentos",
    match: "/planejar",
    label: "Planejar",
    icon: Target,
  },
  {
    href: "/relatorios/visao-geral",
    match: "/relatorios",
    label: "Relatórios",
    icon: ChartColumn,
  },
];

/** Reached from the avatar on phones; listed in the sidebar on desktop. */
export const SETTINGS_NAV: NavItem = {
  href: "/ajustes",
  match: "/ajustes",
  label: "Ajustes",
  icon: Settings,
};

export function isNavActive(pathname: string | null, match: string): boolean {
  if (!pathname) return false;
  return pathname === match || pathname.startsWith(`${match}/`);
}
