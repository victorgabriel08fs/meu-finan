import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's default scales. The design tokens from
 * globals.css (doc 02 §3.11) must be registered, or `cn("text-fg",
 * "text-headline")` would treat the font size as a color and drop `text-fg`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "amount",
        "display",
        "title-1",
        "title-2",
        "title-3",
        "headline",
        "body",
        "input",
        "callout",
        "caption",
        "overline",
        "micro",
      ],
      radius: ["badge", "chip", "control", "card", "sheet"],
      shadow: ["card", "fab", "sheet", "dialog", "thumb"],
      ease: ["standard", "enter", "exit"],
      spacing: ["gutter"],
    },
  },
});

/** Joins class names (clsx) and resolves Tailwind conflicts (last one wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
