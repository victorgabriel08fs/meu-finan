import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FieldErrorProps = {
  /** Referenced by the field's `aria-describedby`. */
  id: string;
  children?: ReactNode;
  className?: string;
};

/**
 * Error under a field (doc 02 §5.18): icon + caption in --danger, announced
 * with role="alert". Renders nothing while there is no message.
 */
export function FieldError({ id, children, className }: FieldErrorProps) {
  if (
    children === undefined ||
    children === null ||
    children === false ||
    children === ""
  ) {
    return null;
  }
  return (
    <p
      id={id}
      role="alert"
      data-slot="field-error"
      className={cn(
        "flex items-start gap-1.5 text-caption text-danger",
        className,
      )}
    >
      <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
