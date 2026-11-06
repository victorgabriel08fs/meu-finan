import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type SettingRowProps = {
  icon?: LucideIcon;
  label: ReactNode;
  description?: ReactNode;
  /** Switch, loader, chevron… It drops below the text when there is no room. */
  control?: ReactNode;
  /** Prefix of the ids of the label (`-label`) and the description (`-hint`). */
  id: string;
  /** A tag next to the label. */
  badge?: ReactNode;
  className?: string;
};

const ROW =
  "flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 py-2 pr-2 pl-4";

/**
 * A line of Ajustes (doc 02 §5.17, §6.14): icon, label, description and a
 * control on the right. The text takes at least 11rem; with large system
 * text the control drops below it instead of squeezing it into a sliver, and
 * the label and the description wrap whole.
 */
export function SettingRow({
  icon,
  label,
  description,
  control,
  id,
  badge,
  className,
}: SettingRowProps) {
  return (
    <div className={cn(ROW, className)}>
      <SettingRowText
        icon={icon}
        label={label}
        description={description}
        id={id}
        badge={badge}
      />
      {control ? <span className="ml-auto shrink-0">{control}</span> : null}
    </div>
  );
}

/**
 * The whole line is a button (an action, not a setting): same layout as
 * {@link SettingRow}, with the loader or the chevron as the control.
 */
export function SettingRowButton({
  icon,
  label,
  description,
  control,
  id,
  badge,
  className,
  ...rest
}: SettingRowProps & Omit<ComponentProps<"button">, keyof SettingRowProps>) {
  return (
    <button
      type="button"
      className={cn(
        ROW,
        "w-full border-t border-border px-4 text-left -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2 disabled:cursor-progress",
        className,
      )}
      {...rest}
    >
      <SettingRowText
        icon={icon}
        label={label}
        description={description}
        id={id}
        badge={badge}
      />
      {control ? <span className="ml-auto shrink-0">{control}</span> : null}
    </button>
  );
}

function SettingRowText({
  icon: Icon,
  label,
  description,
  id,
  badge,
}: Pick<SettingRowProps, "icon" | "label" | "description" | "id" | "badge">) {
  return (
    <span className="flex min-w-0 flex-[1_1_11rem] items-center gap-3">
      {Icon ? (
        <span
          aria-hidden="true"
          className="flex size-[min(2rem,40px)] shrink-0 items-center justify-center rounded-chip bg-surface-2 text-fg-2 [&_svg]:size-[min(1.25rem,24px)]"
        >
          <Icon />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-x-2">
          <span id={`${id}-label`} className="text-body font-semibold text-fg">
            {label}
          </span>
          {badge}
        </span>
        {description ? (
          <span
            id={`${id}-hint`}
            className="text-caption text-pretty text-fg-3"
          >
            {description}
          </span>
        ) : null}
      </span>
    </span>
  );
}
