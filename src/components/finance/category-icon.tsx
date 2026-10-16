import {
  ArrowLeftRight,
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  Cat,
  Circle,
  Coffee,
  Coins,
  CreditCard,
  Dog,
  Dumbbell,
  Ellipsis,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  Heart,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  type LucideIcon,
  Music,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  Plus,
  Receipt,
  Repeat,
  RotateCcw,
  Scale,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sofa,
  Sprout,
  Store,
  Ticket,
  TrendingUp,
  Tv,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Allow-list of icons a category or account may use (Lucide names, as stored
 * in the database). Explicit imports keep the bundle to these icons; anything
 * else falls back to `circle`. Covers every default of doc 02 §3.2, the
 * account types of §3.9 and a few common extras for custom categories.
 */
export const CATEGORY_ICONS = {
  // Default expense categories
  house: House,
  "shopping-cart": ShoppingCart,
  utensils: Utensils,
  car: Car,
  "heart-pulse": HeartPulse,
  ticket: Ticket,
  "graduation-cap": GraduationCap,
  "shopping-bag": ShoppingBag,
  zap: Zap,
  repeat: Repeat,
  scissors: Scissors,
  "paw-print": PawPrint,
  plane: Plane,
  landmark: Landmark,
  gift: Gift,
  ellipsis: Ellipsis,
  // Default income categories
  briefcase: Briefcase,
  laptop: Laptop,
  "trending-up": TrendingUp,
  "rotate-ccw": RotateCcw,
  plus: Plus,
  // Transfer and balance adjustment
  "arrow-left-right": ArrowLeftRight,
  scale: Scale,
  // Account types
  "piggy-bank": PiggyBank,
  wallet: Wallet,
  "credit-card": CreditCard,
  // Extras for custom categories
  baby: Baby,
  banknote: Banknote,
  "book-open": BookOpen,
  bus: Bus,
  cat: Cat,
  coffee: Coffee,
  coins: Coins,
  dog: Dog,
  dumbbell: Dumbbell,
  fuel: Fuel,
  "gamepad-2": Gamepad2,
  "hand-coins": HandCoins,
  heart: Heart,
  music: Music,
  pill: Pill,
  receipt: Receipt,
  shirt: Shirt,
  smartphone: Smartphone,
  sofa: Sofa,
  sprout: Sprout,
  store: Store,
  tv: Tv,
  wifi: Wifi,
  wrench: Wrench,
  circle: Circle,
} satisfies Record<string, LucideIcon>;

export type CategoryIconName = keyof typeof CATEGORY_ICONS;

/** `cat-1`…`cat-8`, `neutral` (Outros, Ajuste) and `transfer`. */
export type CategoryColor =
  | "cat-1"
  | "cat-2"
  | "cat-3"
  | "cat-4"
  | "cat-5"
  | "cat-6"
  | "cat-7"
  | "cat-8"
  | "neutral"
  | "transfer";

// Full class names so Tailwind finds them in the source.
const FILLED: Record<CategoryColor, string> = {
  "cat-1": "bg-cat-1-bg text-cat-1-fg",
  "cat-2": "bg-cat-2-bg text-cat-2-fg",
  "cat-3": "bg-cat-3-bg text-cat-3-fg",
  "cat-4": "bg-cat-4-bg text-cat-4-fg",
  "cat-5": "bg-cat-5-bg text-cat-5-fg",
  "cat-6": "bg-cat-6-bg text-cat-6-fg",
  "cat-7": "bg-cat-7-bg text-cat-7-fg",
  "cat-8": "bg-cat-8-bg text-cat-8-fg",
  neutral: "bg-cat-neutral-bg text-cat-neutral-fg",
  transfer: "bg-cat-transfer-bg text-cat-transfer-fg",
};

const DASHED: Record<CategoryColor, string> = {
  "cat-1": "border-cat-1-fg text-cat-1-fg",
  "cat-2": "border-cat-2-fg text-cat-2-fg",
  "cat-3": "border-cat-3-fg text-cat-3-fg",
  "cat-4": "border-cat-4-fg text-cat-4-fg",
  "cat-5": "border-cat-5-fg text-cat-5-fg",
  "cat-6": "border-cat-6-fg text-cat-6-fg",
  "cat-7": "border-cat-7-fg text-cat-7-fg",
  "cat-8": "border-cat-8-fg text-cat-8-fg",
  neutral: "border-cat-neutral-fg text-cat-neutral-fg",
  transfer: "border-cat-transfer-fg text-cat-transfer-fg",
};

const SIZES = {
  sm: { box: "size-7", glyph: "size-4", stroke: 2 },
  md: { box: "size-10", glyph: "size-5", stroke: 1.75 },
  lg: { box: "size-14", glyph: "size-7", stroke: 1.75 },
} as const;

export function isCategoryIconName(name: string): name is CategoryIconName {
  return Object.hasOwn(CATEGORY_ICONS, name);
}

function isCategoryColor(color: string): color is CategoryColor {
  return Object.hasOwn(FILLED, color);
}

type CategoryIconProps = {
  /** Lucide icon name from the allow-list, e.g. `shopping-cart`. */
  icon: string;
  /** `cat-1`…`cat-8`, `neutral` or `transfer`; unknown values render neutral. */
  color: string;
  /** sm 28px (chips) · md 40px (lists) · lg 56px. */
  size?: keyof typeof SIZES;
  /** Dashed outline instead of a fill: pending / scheduled entries (§5.7). */
  dashed?: boolean;
  /** Rounded square (14px) instead of a circle, for accounts (§5.6). */
  shape?: "circle" | "square";
  className?: string;
};

/** Category or account icon (doc 02 §5.6). Decorative: the row text names it. */
export function CategoryIcon({
  icon,
  color,
  size = "md",
  dashed = false,
  shape = "circle",
  className,
}: CategoryIconProps) {
  const Icon = isCategoryIconName(icon) ? CATEGORY_ICONS[icon] : Circle;
  const tone = isCategoryColor(color) ? color : "neutral";
  const metrics = SIZES[size];

  return (
    <span
      aria-hidden="true"
      data-slot="category-icon"
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        shape === "circle" ? "rounded-full" : "rounded-control",
        metrics.box,
        dashed
          ? cn("border-[1.5px] border-dashed bg-transparent", DASHED[tone])
          : FILLED[tone],
        className,
      )}
    >
      <Icon className={metrics.glyph} strokeWidth={metrics.stroke} />
    </span>
  );
}
