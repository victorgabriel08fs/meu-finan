import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

/**
 * One section of the public homepage: overline label, `h2`, text and an
 * example card. Server-rendered in its final state, readable without JS; the
 * `Reveal`s only bring in what is still below the fold after hydration.
 * From `lg` the text and the card sit side by side.
 *
 * The example card goes in `demo`, which is `aria-hidden`: the text beside it
 * says the same. Anchors: `data-home-section="<id>"`, `data-home-demo`.
 */
export function HomeSection({
  id,
  label,
  title,
  children,
  demo,
  className,
}: {
  id: string;
  label: string;
  title: string;
  children: ReactNode;
  demo?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={`home-${id}`}
      data-home-section={id}
      className={cn(
        "flex flex-col gap-8 py-14 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24",
        className,
      )}
    >
      <div className="flex flex-col gap-4">
        <Reveal className="flex flex-col gap-3">
          <p className="text-overline uppercase text-primary">{label}</p>
          <h2
            id={`home-${id}`}
            className="text-title-1 text-fg text-balance lg:text-display"
          >
            {title}
          </h2>
        </Reveal>
        <Reveal
          index={1}
          className="flex max-w-md flex-col gap-3 text-body text-fg-2 text-pretty"
        >
          {children}
        </Reveal>
      </div>
      {demo ? (
        <Reveal index={2} className="w-full max-w-md lg:justify-self-end">
          <div aria-hidden="true" data-home-demo={id}>
            {demo}
          </div>
        </Reveal>
      ) : null}
    </section>
  );
}

/** Surface of an example card: the app's card (doc 02 §5.3) with 20px padding. */
export function DemoCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col min-w-0 rounded-card bg-surface p-[20px] [overflow-wrap:anywhere] shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Small label inside an example card. */
export function DemoLabel({ children }: { children: ReactNode }) {
  return <p className="text-caption text-fg-2">{children}</p>;
}
