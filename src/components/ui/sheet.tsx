"use client";

import { X } from "lucide-react";
import {
  animate,
  motion,
  type PanInfo,
  useDragControls,
  useMotionValue,
} from "motion/react";
import { Dialog } from "radix-ui";
import {
  type ComponentProps,
  createContext,
  type PointerEvent,
  type ReactNode,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";

/**
 * Sheet (doc 02 §4.4, §5.14) on a Radix Dialog: a bottom sheet on phones
 * (28px top radius, drag handle, at most 92dvh, inner scroll, footer above the
 * safe area) and a centred 560px dialog from `md` up. Radix traps focus,
 * returns it to the trigger and closes on Esc or a tap on the scrim; on
 * phones the sheet also closes when dragged down by the handle/header.
 */

type SheetContextValue = { setOpen: (open: boolean) => void };

const SheetContext = createContext<SheetContextValue | null>(null);

type SheetProps = Omit<
  ComponentProps<typeof Dialog.Root>,
  "open" | "defaultOpen" | "onOpenChange"
> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function Sheet({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: SheetProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  const context = useMemo(() => ({ setOpen }), [setOpen]);

  return (
    <SheetContext value={context}>
      <Dialog.Root open={open} onOpenChange={setOpen} {...props}>
        {children}
      </Dialog.Root>
    </SheetContext>
  );
}

export function SheetTrigger(props: ComponentProps<typeof Dialog.Trigger>) {
  return <Dialog.Trigger data-slot="sheet-trigger" {...props} />;
}

export function SheetClose(props: ComponentProps<typeof Dialog.Close>) {
  return <Dialog.Close data-slot="sheet-close" {...props} />;
}

type SheetContentProps = Omit<
  ComponentProps<typeof Dialog.Content>,
  "title" | "children"
> & {
  /** Sheet title (title-2), also its accessible name. */
  title: ReactNode;
  /** Optional line under the title, linked with aria-describedby. */
  description?: ReactNode;
  children?: ReactNode;
  /** Sticky actions at the bottom (e.g. a full-width lg primary Button). */
  footer?: ReactNode;
  /** Classes for the scrolling body. */
  bodyClassName?: string;
};

/** Phone sheets follow the finger; from md up they are dialogs. */
const DIALOG_QUERY = "(min-width: 48rem)";
/** Close when dragged past 25% of the height or flicked faster than 500px/s. */
const DISMISS_RATIO = 0.25;
const DISMISS_VELOCITY = 500;
const SHEET_SPRING = { type: "spring", stiffness: 420, damping: 40 } as const;

export function SheetContent({
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
  ...props
}: SheetContentProps) {
  const sheet = use(SheetContext);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const y = useMotionValue(0);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || window.matchMedia(DIALOG_QUERY).matches) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea")) return;
    dragControls.start(event);
  }

  function endDrag(_event: unknown, info: PanInfo) {
    const height = panelRef.current?.offsetHeight ?? 0;
    const farEnough = info.offset.y > height * DISMISS_RATIO;
    const fastEnough = info.velocity.y > DISMISS_VELOCITY;
    if (sheet && (farEnough || fastEnough)) {
      // The panel stays where the finger left it; the close animation of the
      // outer element carries it down from there.
      sheet.setOpen(false);
      return;
    }
    animate(y, 0, SHEET_SPRING);
  }

  return (
    <Dialog.Portal>
      <Dialog.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-scrim"
      />
      <Dialog.Content
        data-slot="sheet-content"
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col outline-none",
          "md:inset-0 md:m-auto md:h-fit md:max-h-[min(85dvh,48rem)] md:w-[calc(100%-2rem)] md:max-w-140",
          className,
        )}
        {...props}
      >
        <motion.div
          ref={panelRef}
          drag="y"
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0 }}
          dragElastic={0}
          dragMomentum={false}
          onDragEnd={endDrag}
          style={{ y }}
          className="flex min-h-0 flex-1 flex-col rounded-t-sheet bg-surface text-fg shadow-sheet md:rounded-card md:shadow-dialog"
        >
          {/* Drag-to-close is a pointer shortcut; the close button and Esc do the same. */}
          <div
            onPointerDown={startDrag}
            className="shrink-0 touch-none select-none md:touch-auto"
          >
            <div
              aria-hidden="true"
              className="mx-auto mt-2 h-1 w-9 rounded-full bg-border-strong/50 md:hidden"
            />
            <div className="flex items-start gap-2 pt-3 pr-2 pb-2 pl-5 md:pt-4">
              <div className="min-w-0 flex-1 pt-2">
                <Dialog.Title className="text-title-2 text-fg">
                  {title}
                </Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-1 text-callout text-fg-2">
                    {description}
                  </Dialog.Description>
                ) : null}
              </div>
              <Dialog.Close asChild>
                <IconButton label="Fechar">
                  <X />
                </IconButton>
              </Dialog.Close>
            </div>
          </div>
          <div
            data-slot="sheet-body"
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2",
              footer ? "pb-4" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
              bodyClassName,
            )}
          >
            {children}
          </div>
          {footer ? (
            <div
              data-slot="sheet-footer"
              className="flex shrink-0 flex-col gap-2 border-t border-border px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-5"
            >
              {footer}
            </div>
          ) : null}
        </motion.div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
