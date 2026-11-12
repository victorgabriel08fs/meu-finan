import { SegmentedLinks } from "@/components/ui/segmented-control";
import { boxesHref } from "./box-model";

/** "Despesas · Caixinhas" of a group (doc 02 §6.18). */
export function GroupTabs({
  groupId,
  active,
}: {
  groupId: string;
  active: "expenses" | "boxes";
}) {
  const items = [
    { href: `/compartilhado/${groupId}`, label: "Despesas" },
    { href: boxesHref(groupId), label: "Caixinhas" },
  ];
  return (
    <SegmentedLinks
      items={items}
      activeHref={items[active === "expenses" ? 0 : 1]?.href ?? null}
      ariaLabel="Seções do grupo"
    />
  );
}
