"use client";

import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

type ComingSoonButtonProps = Omit<ButtonProps, "onClick" | "asChild"> & {
  /** Toast shown on tap. */
  message?: string;
};

/** Placeholder CTA for features that are not built yet: shows a toast. */
export function ComingSoonButton({
  message = "Em breve por aqui.",
  ...props
}: ComingSoonButtonProps) {
  return <Button {...props} onClick={() => toast(message)} />;
}
