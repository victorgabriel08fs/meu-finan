import { X } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode, Ref } from "react";
import { PrivacyToggle } from "@/components/app/privacy-toggle";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

type RecapFrameProps = Omit<ComponentProps<"section">, "ref"> & {
  ref?: Ref<HTMLElement>;
  /** "Retrospectiva · Outubro de 2026". */
  kicker: string;
  /** Where the close button goes. */
  closeHref: string;
  /** Segments of the progress bar. */
  progress?: ReactNode;
  /** Soft shapes behind the content. */
  backdrop?: ReactNode;
  /** Buttons of the desktop sides, from md up. */
  sidePrev?: ReactNode;
  sideNext?: ReactNode;
  /** The bottom row: Voltar and Próximo. */
  footer?: ReactNode;
  /** Ref of the scrolling area (the player reads its box for taps). */
  stageRef?: Ref<HTMLDivElement>;
  stageProps?: ComponentProps<"div">;
};

/**
 * The stage of the Retrospectiva (doc 02 §6.12): the whole screen on phones,
 * a centred card from md up with the previous and next buttons beside it.
 * Progress and the close button sit on top, the part scrolls in the middle
 * and the buttons stay at the bottom, so large text never hides them. The
 * player, the skeleton and the empty states all draw on it.
 */
export function RecapFrame({
  ref,
  kicker,
  closeHref,
  progress,
  backdrop,
  sidePrev,
  sideNext,
  footer,
  stageRef,
  stageProps,
  children,
  className,
  ...props
}: RecapFrameProps) {
  const { className: stageClass, ...stageRest } = stageProps ?? {};
  return (
    <section
      ref={ref}
      className={cn(
        "flex h-dvh w-full items-stretch justify-center outline-none md:items-center md:gap-4",
        className,
      )}
      {...props}
    >
      <div className="hidden w-11 shrink-0 items-center justify-center md:flex">
        {sidePrev}
      </div>
      <div className="relative flex w-full max-w-110 min-w-0 flex-col overflow-hidden bg-bg md:h-[min(860px,calc(100dvh-48px))] md:w-105 md:max-w-none md:rounded-card md:border md:border-border md:bg-surface md:shadow-dialog">
        {backdrop}
        <header className="relative z-10 flex flex-col gap-2 px-gutter pt-[max(12px,env(safe-area-inset-top))] md:pt-4">
          {progress ?? <div className="h-1" />}
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-caption text-fg-2">{kicker}</p>
            <div className="-mr-2 flex shrink-0 items-center">
              <PrivacyToggle />
              <IconButton asChild label="Fechar retrospectiva">
                <Link href={closeHref}>
                  <X aria-hidden="true" />
                </Link>
              </IconButton>
            </div>
          </div>
        </header>
        <div
          ref={stageRef}
          {...stageRest}
          className={cn(
            "relative z-10 flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto overscroll-contain px-gutter",
            stageClass,
          )}
        >
          {children}
        </div>
        <footer className="relative z-10 flex min-h-13 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-gutter pt-2 pb-[max(16px,env(safe-area-inset-bottom))] md:pb-5">
          {footer}
        </footer>
      </div>
      <div className="hidden w-11 shrink-0 items-center justify-center md:flex">
        {sideNext}
      </div>
    </section>
  );
}
