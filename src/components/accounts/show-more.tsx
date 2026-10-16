"use client";

import { Children, type ReactNode, useState } from "react";

type ShowMoreProps = {
  /** List items (<li>), already rendered on the server. */
  children: ReactNode;
  /** How many show before "Ver mais". */
  initial?: number;
  /** Plural noun for the button: "Ver mais 5 lançamentos". */
  noun: string;
  className?: string;
};

/** A list that shows its first items and expands in place. */
export function ShowMore({
  children,
  initial = 8,
  noun,
  className,
}: ShowMoreProps) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const hidden = items.length - initial;
  const visible = expanded || hidden <= 0 ? items : items.slice(0, initial);

  return (
    <>
      <ul className={className}>{visible}</ul>
      {hidden > 0 ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="h-13 w-full border-t border-border text-callout font-bold text-primary transition-colors duration-100 hover:bg-primary-soft/40 active:bg-primary-soft"
        >
          {expanded ? "Mostrar menos" : `Ver mais ${hidden} ${noun}`}
        </button>
      ) : null}
    </>
  );
}
