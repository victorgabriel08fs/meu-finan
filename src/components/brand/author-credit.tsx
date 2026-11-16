import { cn } from "@/lib/utils";

export const AUTHOR_NAME = "Victor Gabriel";
export const AUTHOR_URL = "https://github.com/victorgabriel08fs";

/**
 * "Feito por Victor Gabriel", with a link to the author's GitHub (owner's
 * request, 16/11/2026). On the homepage and in Ajustes › Sobre. Opens in a
 * new tab, so leaving never loses the app's place.
 */
export function AuthorCredit({ className }: { className?: string }) {
  return (
    <p className={cn("text-caption text-fg-2", className)}>
      Feito por{" "}
      <a
        href={AUTHOR_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-fg underline underline-offset-2 hover:text-primary"
      >
        {AUTHOR_NAME}
        <span className="sr-only"> (GitHub, abre em nova aba)</span>
      </a>
    </p>
  );
}
