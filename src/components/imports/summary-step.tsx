"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { entriesLabel, importPeriodLabel } from "./labels";
import type { ConfirmData } from "./types";

type SummaryStepProps = {
  result: ConfirmData;
  accountId: string;
  accountName: string;
  undoing: boolean;
  /** Set after "Desfazer importação". */
  undone: boolean;
  onUndo: () => void;
  onAnother: () => void;
};

const formatInt = new Intl.NumberFormat("pt-BR");

/**
 * Step 4's result (doc 02 §6.13): how many entries came in, a way to see
 * them in the statement of the account and "Desfazer importação", which stays
 * available for 24 hours (also from "Importações recentes").
 */
export function SummaryStep({
  result,
  accountId,
  accountName,
  undoing,
  undone,
  onUndo,
  onAnother,
}: SummaryStepProps) {
  const period = importPeriodLabel(result.start, result.end);
  const href = `/extrato?conta=${accountId}${result.month ? `&mes=${result.month}` : ""}`;
  const count = result.imported;

  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center">
      <span
        aria-hidden="true"
        className="flex size-20 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft [&_svg]:size-10"
      >
        <CircleCheck />
      </span>
      <h2 className="mt-5 text-title-2 text-balance text-fg" aria-live="polite">
        {undone
          ? "Importação desfeita"
          : count === 0
            ? "Nada novo para importar"
            : `${entriesLabel(count)} ${count === 1 ? "importado" : "importados"}`}
      </h2>
      <p className="mt-2 max-w-md text-body text-pretty text-fg-2">
        {undone
          ? `Os lançamentos saíram de ${accountName}. Você pode importar o arquivo de novo.`
          : count === 0
            ? `Tudo o que você marcou já estava em ${accountName}.`
            : `Em ${accountName}${period ? `, de ${period}` : ""}.`}
        {!undone && result.skipped > 0
          ? ` ${formatInt.format(result.skipped)} já ${result.skipped === 1 ? "existia e ficou" : "existiam e ficaram"} de fora.`
          : null}
      </p>

      <div className="mt-7 flex w-full max-w-md flex-col gap-2">
        {!undone && count > 0 ? (
          <>
            <Button asChild size="lg" className="w-full">
              <Link href={href}>Ver no extrato</Link>
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              loading={undoing}
              onClick={onUndo}
            >
              Desfazer importação
            </Button>
          </>
        ) : null}
        <Button
          variant={undone || count === 0 ? "primary" : "ghost"}
          size="lg"
          className="w-full"
          disabled={undoing}
          onClick={onAnother}
        >
          Importar outro arquivo
        </Button>
      </div>
      {!undone && count > 0 ? (
        <p className="mt-4 text-caption text-fg-3">
          Dá para desfazer por 24 horas, também em Importações recentes.
        </p>
      ) : null}
    </Card>
  );
}
