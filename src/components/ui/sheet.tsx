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
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";
import { titleFit } from "./title-fit";
import { useBackToClose } from "./use-back-to-close";

/**
 * Sheet (doc 02 §4.4, §5.14) on a Radix Dialog: a bottom sheet on phones
 * (28px top radius, drag handle, at most 92dvh, inner scroll, footer above the
 * safe area) and a centred 560px dialog from `md` up. Radix traps focus and
 * closes on Esc or a tap on the scrim; the focus goes back to what opened the
 * sheet, a SheetTrigger or not. On phones the sheet also closes when dragged
 * down by the handle/header, and the back button closes it instead of
 * leaving the page.
 */

type SheetContextValue = {
  setOpen: (open: boolean) => void;
  /** onCloseAutoFocus for the content: the focus back to the opener. */
  returnFocus: (event: Event) => void;
  /**
   * onPointerDownOutside for the content: ignores a tap that started before
   * the sheet (re)opened.
   */
  keepIfReopened: (event: PointerDownOutsideEvent) => void;
};

type PointerDownOutsideEvent = CustomEvent<{ originalEvent: PointerEvent }>;

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
  // What had the focus when the sheet opened gets it back on close. Radix
  // only knows its own trigger, and many sheets open from a row, a menu or a
  // shortcut. Read in a layout effect: the sheet moves the focus in later.
  const opener = useRef<HTMLElement | null>(null);
  const isOpen = useRef(open);
  const openedAt = useRef(Number.NEGATIVE_INFINITY);
  useLayoutEffect(() => {
    isOpen.current = open;
    if (!open) return;
    openedAt.current = performance.now();
    const active = document.activeElement;
    opener.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
  }, [open]);
  const returnFocus = useCallback((event: Event) => {
    // Still open: another step of the sheet replaced its content, and that
    // step takes the focus itself.
    if (isOpen.current) {
      event.preventDefault();
      return;
    }
    const target = opener.current;
    if (!target?.isConnected) return; // Radix: its trigger, if there is one.
    event.preventDefault();
    target.focus({ preventScroll: true });
  }, []);
  // A tap on the next row while this sheet still slides out lands outside it
  // (the scrim fades out first), and Radix acts on it only at the click that
  // follows. By then the row has opened this same sheet again, and that late
  // "tap outside" would close it at once. So a tap outside counts only when
  // it started while the sheet was open.
  const keepIfReopened = useCallback((event: PointerDownOutsideEvent) => {
    // A toast's action (Desfazer) sits outside the sheet but belongs to it.
    const target = event.detail.originalEvent.target;
    if (target instanceof Element && target.closest("[data-sonner-toaster]")) {
      event.preventDefault();
      return;
    }
    if (
      !isOpen.current ||
      event.detail.originalEvent.timeStamp < openedAt.current
    ) {
      event.preventDefault();
    }
  }, []);
  const context = useMemo(
    () => ({ setOpen, returnFocus, keepIfReopened }),
    [setOpen, returnFocus, keepIfReopened],
  );
  useBackToClose(open, () => setOpen(false));

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
  /**
   * Another step of a sheet that is already open (a confirmation, the link
   * that was just made): it replaces the previous step without sliding or
   * fading in again.
   */
  swap?: boolean;
  /**
   * The sheet fills the screen (its `className` sets the height) and body and
   * footer scroll together: the footer stays at the bottom while the sheet is
   * tall enough (32rem) and, with large text, goes along with the content so
   * it never hides it. The panel becomes a `sheet` container, measured by its
   * height (`@max-[32rem]/sheet`); only meaningful with a definite height.
   */
  fullHeight?: boolean;
  /**
   * For a sheet as tall as its content: the footer stays at the bottom only
   * while the sheet can be 32rem tall. With large text (rem grows) or a short
   * screen the whole sheet, header and footer included, scrolls as one, so the
   * buttons never take the screen.
   */
  flowFooter?: boolean;
  /**
   * On opening, the focus goes to the title (not the first control): for a
   * step that replaces another inside an open sheet, where the title says what
   * changed.
   */
  focusTitle?: boolean;
};

/** Phone sheets follow the finger; from md up they are dialogs. */
const DIALOG_QUERY = "(min-width: 48rem)";
/** Close when dragged past 25% of the height or flicked faster than 500px/s. */
const DISMISS_RATIO = 0.25;
const DISMISS_VELOCITY = 500;
const SHEET_SPRING = { type: "spring", stiffness: 420, damping: 40 } as const;

/**
 * True while the sheet (at most 92dvh) is under 32rem tall: the same measure
 * as `@max-[32rem]/sheet`, in rem of the page's own font size (a media query
 * would use the browser's default size, not the one text is zoomed to).
 */
function useShortScreen(enabled: boolean): boolean {
  const [short, setShort] = useState(false);
  useLayoutEffect(() => {
    if (!enabled) return;
    const measure = () => {
      const rem = Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      setShort(window.innerHeight * 0.92 < 32 * rem);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [enabled]);
  return short;
}

export function SheetContent({
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
  swap = false,
  fullHeight = false,
  flowFooter = false,
  focusTitle = false,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onPointerDownOutside,
  ...props
}: SheetContentProps) {
  const sheet = use(SheetContext);
  const together = fullHeight || flowFooter;
  // Short (large text): the whole sheet scrolls, header and footer included.
  const flow = useShortScreen(flowFooter);
  const fit = typeof title === "string" ? titleFit(title, "title-2") : null;
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dragControls = useDragControls();
  const y = useMotionValue(0);

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || window.matchMedia(DIALOG_QUERY).matches) return;
    if (flow) return; // the finger scrolls the sheet
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
        data-swap={swap || undefined}
        className="fixed inset-0 z-50 bg-scrim"
      />
      <Dialog.Content
        data-slot="sheet-content"
        data-swap={swap || undefined}
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event);
          if (focusTitle && titleRef.current) {
            event.preventDefault();
            titleRef.current.focus({ preventScroll: true });
          }
        }}
        onCloseAutoFocus={onCloseAutoFocus ?? sheet?.returnFocus}
        onPointerDownOutside={(event) => {
          sheet?.keepIfReopened(event);
          onPointerDownOutside?.(event);
        }}
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col outline-none data-[state=closed]:pointer-events-none",
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
          className={cn(
            "flex min-h-0 flex-1 flex-col rounded-t-sheet bg-surface text-fg shadow-sheet md:rounded-card md:shadow-dialog",
            fullHeight &&
              "max-md:[container-name:sheet] max-md:[container-type:size]",
            flow && "overflow-y-auto overscroll-contain",
          )}
        >
          {/* Drag-to-close is a pointer shortcut; the close button and Esc do the same. */}
          <div
            onPointerDown={startDrag}
            className={cn(
              "shrink-0 select-none md:touch-auto",
              flow ? "touch-auto" : "touch-none",
            )}
          >
            <div
              aria-hidden="true"
              className="mx-auto mt-2 h-1 w-9 rounded-full bg-border-strong/50 md:hidden"
            />
            <div className="flex items-start gap-2 pt-3 pr-2 pb-2 pl-5 md:pt-4">
              <div className="@container min-w-0 flex-1 pt-2">
                <Dialog.Title
                  ref={titleRef}
                  tabIndex={focusTitle ? -1 : undefined}
                  className={cn(
                    "text-title-2 text-fg",
                    focusTitle && "outline-none",
                    fit?.className,
                  )}
                  style={fit?.style}
                >
                  {title}
                </Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-1 text-callout [overflow-wrap:anywhere] text-fg-2">
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
            data-slot={together ? "sheet-scroll" : undefined}
            className={
              together && !flow
                ? "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
                : "contents"
            }
          >
            <div
              data-slot="sheet-body"
              className={cn(
                "@container px-5 pt-2",
                together
                  ? "flex-1"
                  : "min-h-0 flex-1 overflow-y-auto overscroll-contain",
                footer
                  ? "pb-4"
                  : "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
                bodyClassName,
              )}
            >
              {children}
            </div>
            {footer ? (
              <div
                data-slot="sheet-footer"
                className={cn(
                  "flex flex-col gap-2 border-t border-border px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-5",
                  together
                    ? cn(
                        "sticky bottom-0 mt-auto bg-surface",
                        fullHeight
                          ? "@max-[32rem]/sheet:static"
                          : flow && "static",
                      )
                    : "shrink-0",
                )}
              >
                {footer}
              </div>
            ) : null}
          </div>
        </motion.div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
