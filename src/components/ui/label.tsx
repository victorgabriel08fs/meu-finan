import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Field label (doc 02 §5.18): always visible above the field, callout 600. */
export function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "text-callout font-semibold text-fg peer-disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
