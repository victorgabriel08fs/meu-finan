import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Masked } from "@/components/charts/masked";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Ring } from "@/components/finance/ring";
import type { Segment } from "@/components/planning/goals/model";
import { Card } from "@/components/ui/card";
import { CLAMP_TITLE } from "@/components/ui/clamp";
import { cn } from "@/lib/utils";
import type { BoxSummary } from "@/server/domain/sharing/boxes";
import { boxHref, boxProjectionSentence, savedOfTarget } from "./box-model";

/** Sentence segments, with the amounts hidden in the privacy mode. */
export function Sentence({ segments }: { segments: readonly Segment[] }) {
  return (
    <>
      {segments.map((segment, index) => {
        const Tag = segment.strong ? "strong" : "span";
        return (
          <Tag
            // biome-ignore lint/suspicious/noArrayIndexKey: static sentence parts
            key={index}
            className={segment.strong ? "font-bold text-fg" : undefined}
          >
            {segment.money ? (
              <Masked mask="R$ ••••">{segment.text}</Masked>
            ) : (
              segment.text
            )}
          </Tag>
        );
      })}
    </>
  );
}

/**
 * A shared box in a list (the group's Caixinhas, Planejar › Metas): the
 * ring (or the icon, without a target), how much of the target and the
 * projection line. The name is a link stretched over the card.
 */
export function BoxCard({
  box,
  showGroup = false,
  headingLevel = 3,
}: {
  box: Pick<
    BoxSummary,
    | "id"
    | "groupId"
    | "groupName"
    | "name"
    | "icon"
    | "color"
    | "targetCents"
    | "targetDate"
    | "savedCents"
    | "monthlyCents"
    | "progress"
    | "projection"
  >;
  /** Planejar › Metas: which group the box is in. */
  showGroup?: boolean;
  /** Under the page title (h1) the cards are h2; under a section, h3. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const titleId = `caixinha-${box.id}`;
  return (
    <Card
      asChild
      className="relative flex flex-col gap-3 transition-colors duration-100 has-[a:active]:bg-surface-2"
    >
      <article aria-labelledby={titleId}>
        <div className="flex items-center gap-3.5">
          {box.progress === null ? (
            <CategoryIcon icon={box.icon} color={box.color} size="lg" />
          ) : (
            <Ring value={box.progress} size={56} label={box.name} />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <Heading
              id={titleId}
              className={cn("text-headline text-fg", CLAMP_TITLE)}
            >
              <Link
                href={boxHref(box.groupId, box.id)}
                className="outline-0 after:absolute after:inset-0 after:rounded-card focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus focus-visible:after:outline-solid"
              >
                {box.name}
              </Link>
            </Heading>
            <p className="text-caption text-fg-3 tabular-nums">
              {showGroup ? `${box.groupName} · ` : null}
              <Sentence
                segments={savedOfTarget(box.savedCents, box.targetCents)}
              />
            </p>
          </div>
          <ChevronRight
            aria-hidden="true"
            className="-mr-1 size-5 shrink-0 text-fg-3"
          />
        </div>
        <p className="border-t border-border pt-3 text-callout text-fg-2">
          <Sentence
            segments={boxProjectionSentence({
              projection: box.projection,
              monthlyCents: box.monthlyCents,
              savedCents: box.savedCents,
              targetDate: box.targetDate,
            })}
          />
        </p>
      </article>
    </Card>
  );
}
