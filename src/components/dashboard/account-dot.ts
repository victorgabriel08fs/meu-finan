import type { ColorToken } from "@/server/db/schema";

/**
 * The dot of an account's color beside its name (Quanto dá para gastar por
 * dia, "Contas no bloco"): the category color's foreground, which reads on
 * the surfaces of both themes. Full class names so Tailwind finds them.
 */
export const ACCOUNT_DOT: Record<ColorToken, string> = {
  "cat-1": "bg-cat-1-fg",
  "cat-2": "bg-cat-2-fg",
  "cat-3": "bg-cat-3-fg",
  "cat-4": "bg-cat-4-fg",
  "cat-5": "bg-cat-5-fg",
  "cat-6": "bg-cat-6-fg",
  "cat-7": "bg-cat-7-fg",
  "cat-8": "bg-cat-8-fg",
  neutral: "bg-cat-neutral-fg",
};
