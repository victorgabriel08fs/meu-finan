import Link from "next/link";
import { Money } from "@/components/money/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { shortDateLabel } from "@/lib/format/date";
import { leftoverToSave } from "./closing-model";
import { SaveLeftoverButton } from "./save-leftover-button";

type SaveLeftoverCardProps = {
  /** "outubro". */
  monthName: string;
  /** The month's first day, `YYYY-MM-DD`. */
  start: string;
  leftCents: number;
  /** Net moved to the person's caixinhas since `start`. */
  savedCents: number;
  boxes: { id: string; name: string }[];
  spendableId: string | null;
};

const money = (cents: number) => (
  <Money cents={cents} variant="callout" sign="never" tone="neutral" />
);

/**
 * "Guardar a sobra" (doc 02 §6.12): only for the last closed month, when
 * something was left. Offers the leftover less what already went to
 * caixinhas since the month began, and opens the transfer sheet filled in.
 */
export function SaveLeftoverCard({
  monthName,
  start,
  leftCents,
  savedCents,
  boxes,
  spendableId,
}: SaveLeftoverCardProps) {
  const toSave = leftoverToSave(leftCents, savedCents);
  const saved = Math.max(0, savedCents);
  const box = boxes[0];
  return (
    <Card asChild className="flex flex-col items-start gap-3 self-start">
      <section aria-labelledby="fechamento-guardar">
        <h2 id="fechamento-guardar" className="text-headline text-fg">
          Guardar a sobra
        </h2>
        {!box ? (
          <>
            <p className="text-callout text-fg-2">
              Crie uma caixinha para separar o que sobrou.
            </p>
            <Button asChild variant="tonal">
              <Link href="/contas/nova?tipo=caixinha">Criar caixinha</Link>
            </Button>
          </>
        ) : toSave === 0 ? (
          <p className="text-callout text-fg-2">
            A sobra de {monthName} já está nas caixinhas.
          </p>
        ) : (
          <>
            <p className="text-callout text-fg-2">
              Sobraram {money(leftCents)} em {monthName}.
              {saved > 0 ? (
                <>
                  {" "}
                  Desde {shortDateLabel(start)}, você já guardou {money(saved)}{" "}
                  em caixinhas. Falta guardar {money(toSave)}.
                </>
              ) : null}
            </p>
            <SaveLeftoverButton
              spendableId={spendableId}
              boxId={box.id}
              amountCents={toSave}
              description={`Sobra de ${monthName}`}
            />
          </>
        )}
      </section>
    </Card>
  );
}
