import { cn } from "@/lib/utils";
import { initials } from "./labels";

/** Initials on --primary-soft (doc 02 §4.2 avatar); muted when deactivated. */
export function UserAvatar({
  name,
  muted = false,
  size = "md",
  className,
}: {
  name: string;
  muted?: boolean;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums",
        size === "lg" ? "size-14 text-title-3" : "size-10 text-callout",
        muted
          ? "bg-surface-2 text-fg-3"
          : "bg-primary-soft text-on-primary-soft",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
