import { CalendarOff } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { monthLabel } from "@/lib/format/date";
import { BlockInvite } from "./block-invite";

/**
 * The texts of a month that ends before the person's first record (doc 02
 * §6.12): the report and the block say the same thing. `month` and
 * `firstMonth` are `YYYY-MM`.
 */
/** "Seus registros começam em novembro de 2025." */
export function recordsBeginCopy(firstMonth: string) {
  return `Seus registros começam em ${monthLabel(firstMonth)}.`;
}

export function noRecordsCopy(month: string, firstMonth: string) {
  return {
    title: `Sem registros em ${monthLabel(month)}`,
    description: recordsBeginCopy(firstMonth),
    actionLabel: `Ir para ${monthLabel(firstMonth)}`,
  };
}

type BlockNoRecordsProps = {
  month: string;
  firstMonth: string;
  /** Where the first month is: `/inicio?mes=…` on the Início. */
  href: string;
};

/**
 * A block of the Início for a month before the first record: a compact
 * invite that names the month and leads to where the records begin, with
 * no "add entry" button (nobody adds to a month that has long passed).
 */
export function BlockNoRecords({
  month,
  firstMonth,
  href,
}: BlockNoRecordsProps) {
  const copy = noRecordsCopy(month, firstMonth);
  return (
    <BlockInvite
      icon={<CalendarOff />}
      title={copy.title}
      description={copy.description}
      action={
        <Button asChild variant="tonal" size="sm">
          <Link href={href}>{copy.actionLabel}</Link>
        </Button>
      }
    />
  );
}
