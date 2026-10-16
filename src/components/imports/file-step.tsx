"use client";

import { ChevronDown, FileUp, LoaderCircle } from "lucide-react";
import { type DragEvent, useId, useState } from "react";
import { NativeSelect } from "@/components/planning/form/native-select";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { FILE_INPUT_ACCEPT } from "@/lib/import/files";
import { cn } from "@/lib/utils";
import type { ImportAccountOption } from "./types";

type FileStepProps = {
  accounts: ImportAccountOption[];
  accountId: string;
  onAccountChange: (id: string) => void;
  onFile: (file: File) => void;
  /** Name of the file being read, while the server parses it. */
  reading: string | null;
  error: string | null;
};

/**
 * Step 1 (doc 02 §6.13): the account that receives the entries and a large
 * tap area for the file, which also takes a drop on desktop. Choosing the
 * file starts the reading right away.
 */
export function FileStep({
  accounts,
  accountId,
  onAccountChange,
  onFile,
  reading,
  error,
}: FileStepProps) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const regular = accounts.filter((account) => account.type !== "credit_card");
  const cards = accounts.filter((account) => account.type === "credit_card");
  const busy = reading !== null;

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !busy) onFile(file);
  }

  return (
    <Card className="flex flex-col gap-6 p-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-account`}>Conta ou cartão</Label>
        <NativeSelect
          id={`${id}-account`}
          value={accountId}
          disabled={busy}
          aria-describedby={`${id}-account-help`}
          onChange={(event) => onAccountChange(event.target.value)}
        >
          {regular.length > 0 ? (
            <optgroup label="Contas">
              {regular.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {cards.length > 0 ? (
            <optgroup label="Cartões de crédito">
              {cards.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </NativeSelect>
        <p id={`${id}-account-help`} className="text-caption text-fg-3">
          Os lançamentos do arquivo entram aqui. Importe cada conta ou cartão
          com o seu próprio extrato.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor={`${id}-file`}
          data-dragging={dragging ? "" : undefined}
          aria-busy={busy || undefined}
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          className={cn(
            "flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-strong/50 bg-surface-2/50 px-6 py-8 text-center",
            "transition-colors duration-150 ease-standard hover:border-primary/60 hover:bg-primary-soft/30",
            "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
            "data-dragging:border-primary data-dragging:bg-primary-soft/50",
            busy && "pointer-events-none",
            error && "border-danger/60",
          )}
        >
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft [&_svg]:size-7"
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <FileUp />}
          </span>
          {busy ? (
            <span className="text-headline text-fg" aria-live="polite">
              Lendo <span className="break-all">{reading}</span>…
            </span>
          ) : (
            <>
              <span className="text-headline text-fg">
                Escolher arquivo OFX ou CSV
              </span>
              <span className="text-caption text-fg-3">
                <span className="max-md:hidden">
                  Ou arraste o arquivo para cá ·{" "}
                </span>
                até 2 MB
              </span>
            </>
          )}
          <input
            id={`${id}-file`}
            type="file"
            accept={FILE_INPUT_ACCEPT}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-file-error` : undefined}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Clear it, so choosing the same file again still fires.
              event.target.value = "";
              if (file) onFile(file);
            }}
          />
        </label>
        <FieldError id={`${id}-file-error`}>{error}</FieldError>
      </div>

      <details className="group rounded-control bg-surface-2/60 px-4 [&_summary::-webkit-details-marker]:hidden">
        <summary className="-mx-4 flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-control px-4 text-callout font-semibold text-fg">
          Onde baixo meu extrato?
          <ChevronDown
            aria-hidden="true"
            className="size-5 shrink-0 text-fg-3 transition-transform duration-150 group-open:rotate-180"
          />
        </summary>
        <ol className="flex list-decimal flex-col gap-2 pb-4 pl-5 text-callout text-fg-2 marker:font-semibold marker:text-fg-3">
          <li>
            No app ou no site do banco, abra o extrato da conta (ou a fatura do
            cartão) e escolha o período.
          </li>
          <li>
            Procure por{" "}
            <strong className="font-semibold text-fg">Exportar</strong>,{" "}
            <strong className="font-semibold text-fg">Baixar</strong> ou{" "}
            <strong className="font-semibold text-fg">Salvar extrato</strong>.
            Prefira o formato OFX, feito para programas de finanças; se ele não
            aparecer, use CSV.
          </li>
          <li>
            PDF não serve. Uma planilha do Excel pode ser salva como CSV no
            próprio Excel.
          </li>
          <li>
            Pode importar o mesmo período de novo: o que já existe fica de fora.
          </li>
        </ol>
      </details>
    </Card>
  );
}
