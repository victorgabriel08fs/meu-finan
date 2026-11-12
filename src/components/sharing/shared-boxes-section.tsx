import { SectionHeader } from "@/components/app/section-header";
import type { BoxSummary } from "@/server/domain/sharing/boxes";
import { BoxCard } from "./box-card";

/**
 * Planejar › Metas, after the person's own goals: the shared boxes of their
 * groups (financas_compartilhadas), each one opening in its group.
 */
export function SharedBoxesSection({ boxes }: { boxes: BoxSummary[] }) {
  if (boxes.length === 0) return null;
  return (
    <section
      aria-labelledby="metas-compartilhadas"
      className="flex flex-col gap-3"
    >
      <SectionHeader
        id="metas-compartilhadas"
        title="Caixinhas compartilhadas"
        className="mt-2 mb-0"
      />
      {boxes.map((box) => (
        <BoxCard key={box.id} box={box} showGroup />
      ))}
    </section>
  );
}
