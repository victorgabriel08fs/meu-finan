import type { ReactNode } from "react";
import { fullDateLabel } from "@/lib/format/date";
import { LEGAL_VERSION } from "@/lib/legal/version";

export type LegalTopic = { id: string; title: string };

/**
 * The frame of /termos and /privacidade (doc 02 §6.20): title, the version
 * date, a table of contents with anchors, then the sections in reading width.
 */
export function LegalDocument({
  title,
  intro,
  topics,
  children,
}: {
  title: string;
  intro: ReactNode;
  topics: readonly LegalTopic[];
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-title-1 text-balance text-fg">{title}</h1>
        <p className="text-caption text-fg-3">
          Versão de {fullDateLabel(LEGAL_VERSION)}
        </p>
        <div className="mt-2 max-w-prose text-body text-fg-2">{intro}</div>
      </header>
      <nav
        aria-labelledby="legal-toc"
        className="rounded-card bg-surface px-4 py-3"
      >
        <h2 id="legal-toc" className="text-callout font-semibold text-fg">
          Nesta página
        </h2>
        <ol className="mt-1 flex flex-col">
          {topics.map((topic, index) => (
            <li key={topic.id}>
              <a
                href={`#${topic.id}`}
                className="flex min-h-11 items-center gap-2 text-body text-fg-2 underline-offset-2 hover:text-primary hover:underline"
              >
                <span className="w-6 shrink-0 text-fg-3 tabular-nums">
                  {index + 1}.
                </span>
                {topic.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {children}
    </article>
  );
}

/** One numbered section; `topic` must be one of the document's topics. */
export function LegalSection({
  topic,
  number,
  children,
}: {
  topic: LegalTopic;
  number: number;
  children: ReactNode;
}) {
  return (
    <section
      id={topic.id}
      aria-labelledby={`${topic.id}-title`}
      className="flex scroll-mt-6 flex-col gap-3"
    >
      <h2 id={`${topic.id}-title`} className="text-headline text-fg">
        {number}. {topic.title}
      </h2>
      <div className="flex max-w-prose flex-col gap-3 text-body text-fg-2 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-fg [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
