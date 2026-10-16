"use client";

import { type ReactNode, useId, useMemo, useState } from "react";
import { Money } from "@/components/money/money";
import { NativeSelect } from "@/components/planning/form/native-select";
import { Switch } from "@/components/planning/form/switch";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { shortDateLabel } from "@/lib/format/date";
import { detectDecimalSeparator } from "@/lib/import/amount";
import type { CsvRecord } from "@/lib/import/csv";
import { type DateFormat, detectDateFormat } from "@/lib/import/date";
import {
  type AmountMapping,
  applyMapping,
  type CsvMapping,
  type SkipReason,
} from "@/lib/import/mapping";
import type { CsvSetup } from "@/lib/import/statement";

type MappingStepProps = {
  csv: CsvSetup;
  invertSign: boolean;
  fileName: string;
  /** Why the columns in use did not work (from the server). */
  problem: string | null;
  error: string | null;
  pending: boolean;
  onSubmit: (mapping: CsvMapping, invertSign: boolean) => void;
  onCancel: () => void;
};

const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  dmy: "dd/mm/aaaa",
  ymd: "aaaa-mm-dd",
  mdy: "mm/dd/aaaa",
};

const SKIP_LABELS: Record<SkipReason, string> = {
  date: "Data não reconhecida",
  amount: "Valor não reconhecido",
  zero: "Valor zerado",
  future: "Data muito no futuro",
};

/** How many rows of the sample the preview shows. */
const PREVIEW_ROWS = 6;

function initialMapping(csv: CsvSetup): CsvMapping {
  if (csv.mapping) return csv.mapping;
  const last = Math.max(0, csv.columns.length - 1);
  return {
    headerRow: null,
    date: 0,
    description: [Math.min(1, last)],
    amount: { mode: "signed", amount: Math.min(2, last), indicator: null },
    id: null,
    dateFormat: "dmy",
    decimal: ",",
  };
}

const cellsOf = (sample: readonly CsvRecord[], column: number) =>
  sample.map((record) => record.cells[column]?.trim() ?? "");

/**
 * Step 2 for CSV files (doc 02 §6.13): which column is the date, the
 * description and the amount (or debit and credit), with the date format
 * and the decimal separator found automatically and a live preview of the
 * first rows. Shown when the header is not obvious, or on "Ajustar colunas".
 */
export function MappingStep({
  csv,
  invertSign,
  fileName,
  problem,
  error,
  pending,
  onSubmit,
  onCancel,
}: MappingStepProps) {
  const id = useId();
  const [mapping, setMapping] = useState<CsvMapping>(() => initialMapping(csv));
  const [invert, setInvert] = useState(invertSign);

  const options = useMemo(
    () =>
      csv.columns.map((name, index) => {
        const example = cellsOf(csv.sample, index).find(Boolean);
        const text = example ? `${name} · ex.: ${example}` : name;
        return {
          value: String(index),
          label: text.length > 48 ? `${text.slice(0, 47)}…` : text,
        };
      }),
    [csv],
  );

  const preview = useMemo(
    () =>
      csv.sample.slice(0, PREVIEW_ROWS).map((record) => {
        const single = { ...mapping, headerRow: null };
        const { rows, skipped } = applyMapping([record], single);
        return {
          line: record.line,
          row: rows[0] ?? null,
          reason: skipped[0]?.reason ?? null,
        };
      }),
    [csv.sample, mapping],
  );
  const readable = useMemo(
    () => applyMapping(csv.sample, { ...mapping, headerRow: null }),
    [csv.sample, mapping],
  );
  const tried = readable.rows.length + readable.skipped.length;

  /** Changing a column re-detects the formats from its cells. */
  function setDateColumn(column: number) {
    setMapping((current) => ({
      ...current,
      date: column,
      dateFormat:
        detectDateFormat(cellsOf(csv.sample, column)) ?? current.dateFormat,
    }));
  }

  function setAmount(amount: AmountMapping) {
    const columns =
      amount.mode === "signed"
        ? [amount.amount]
        : [amount.debit, amount.credit];
    setMapping((current) => ({
      ...current,
      amount,
      decimal: detectDecimalSeparator(
        columns
          .flatMap((column) => cellsOf(csv.sample, column))
          .filter(Boolean),
      ),
    }));
  }

  function setDescription(primary: number, extra: number | null) {
    setMapping((current) => ({
      ...current,
      description:
        extra === null || extra === primary ? [primary] : [primary, extra],
    }));
  }

  const [primary = 0, extra = null] = mapping.description;
  const amount = mapping.amount;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-title-3 text-fg">Confira as colunas</h2>
        <p className="text-body text-fg-2">
          Diga onde estão a data, a descrição e o valor em{" "}
          <span className="font-semibold break-all text-fg">{fileName}</span>.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-5 p-5">
            <CardTitle as="h3">Colunas</CardTitle>
            <Field id={`${id}-date`} label="Data">
              <NativeSelect
                id={`${id}-date`}
                value={String(mapping.date)}
                onChange={(event) => setDateColumn(Number(event.target.value))}
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id={`${id}-description`} label="Descrição">
              <NativeSelect
                id={`${id}-description`}
                value={String(primary)}
                onChange={(event) =>
                  setDescription(Number(event.target.value), extra)
                }
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              id={`${id}-extra`}
              label="Complemento da descrição"
              hint="Opcional: juntado à descrição, como em “Pix enviado - Fulano”."
            >
              <NativeSelect
                id={`${id}-extra`}
                aria-describedby={`${id}-extra-hint`}
                value={extra === null ? "" : String(extra)}
                onChange={(event) =>
                  setDescription(
                    primary,
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                  )
                }
              >
                <option value="">Nenhum</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <fieldset className="flex min-w-0 flex-col gap-3">
              <legend className="mb-2 text-callout font-semibold text-fg">
                Valor
              </legend>
              <SegmentedControl
                ariaLabel="Como o valor aparece"
                value={amount.mode}
                options={[
                  { value: "signed", label: "Uma coluna" },
                  { value: "split", label: "Débito e crédito" },
                ]}
                onValueChange={(mode) => {
                  if (mode === amount.mode) return;
                  const first =
                    amount.mode === "signed" ? amount.amount : amount.debit;
                  setAmount(
                    mode === "split"
                      ? {
                          mode: "split",
                          debit: first,
                          credit: Math.min(first + 1, csv.columns.length - 1),
                        }
                      : { mode: "signed", amount: first, indicator: null },
                  );
                }}
              />
              {amount.mode === "signed" ? (
                <>
                  <Field id={`${id}-amount`} label="Coluna do valor">
                    <NativeSelect
                      id={`${id}-amount`}
                      value={String(amount.amount)}
                      onChange={(event) =>
                        setAmount({
                          ...amount,
                          amount: Number(event.target.value),
                        })
                      }
                    >
                      {options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field
                    id={`${id}-indicator`}
                    label="Coluna de débito/crédito"
                    hint="Opcional: quando o valor vem sem sinal e outra coluna diz D ou C, Saída ou Entrada."
                  >
                    <NativeSelect
                      id={`${id}-indicator`}
                      aria-describedby={`${id}-indicator-hint`}
                      value={
                        amount.indicator === null
                          ? ""
                          : String(amount.indicator)
                      }
                      onChange={(event) =>
                        setAmount({
                          ...amount,
                          indicator:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        })
                      }
                    >
                      <option value="">Nenhuma</option>
                      {options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id={`${id}-debit`} label="Débitos (saídas)">
                    <NativeSelect
                      id={`${id}-debit`}
                      value={String(amount.debit)}
                      onChange={(event) =>
                        setAmount({
                          ...amount,
                          debit: Number(event.target.value),
                        })
                      }
                    >
                      {options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field id={`${id}-credit`} label="Créditos (entradas)">
                    <NativeSelect
                      id={`${id}-credit`}
                      value={String(amount.credit)}
                      onChange={(event) =>
                        setAmount({
                          ...amount,
                          credit: Number(event.target.value),
                        })
                      }
                    >
                      {options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </div>
              )}
            </fieldset>
          </Card>

          <Card className="flex flex-col gap-5 p-5">
            <CardTitle as="h3">Formatos</CardTitle>
            <Field id={`${id}-date-format`} label="Formato da data">
              <NativeSelect
                id={`${id}-date-format`}
                value={mapping.dateFormat}
                onChange={(event) =>
                  setMapping((current) => ({
                    ...current,
                    dateFormat: event.target.value as DateFormat,
                  }))
                }
              >
                {(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map(
                  (format) => (
                    <option key={format} value={format}>
                      {DATE_FORMAT_LABELS[format]}
                    </option>
                  ),
                )}
              </NativeSelect>
            </Field>
            <div className="flex flex-col gap-2">
              <p className="text-callout font-semibold text-fg">
                Separador dos centavos
              </p>
              <SegmentedControl
                ariaLabel="Separador dos centavos"
                value={mapping.decimal}
                options={[
                  { value: ",", label: "1.234,56" },
                  { value: ".", label: "1,234.56" },
                ]}
                onValueChange={(decimal) =>
                  setMapping((current) => ({
                    ...current,
                    decimal: decimal === "." ? "." : ",",
                  }))
                }
              />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p
                  id={`${id}-invert`}
                  className="text-callout font-semibold text-fg"
                >
                  Inverter sinais
                </p>
                <p id={`${id}-invert-help`} className="text-caption text-fg-3">
                  Use quando as compras aparecem como valores positivos, comum
                  em faturas de cartão.
                </p>
              </div>
              <Switch
                checked={invert}
                onCheckedChange={setInvert}
                labelledBy={`${id}-invert`}
                describedBy={`${id}-invert-help`}
              />
            </div>
          </Card>
        </div>

        <Card className="flex flex-col p-0">
          <CardHeader className="mb-0 px-5 pt-5 pb-3">
            <CardTitle as="h3">Prévia</CardTitle>
            <p className="text-caption text-fg-3" aria-live="polite">
              {readable.rows.length} de {tried}{" "}
              {tried === 1 ? "linha reconhecida" : "linhas reconhecidas"}
            </p>
          </CardHeader>
          {preview.length === 0 ? (
            <p className="px-5 pb-5 text-callout text-fg-2">
              Nenhuma linha de dados encontrada.
            </p>
          ) : (
            <ul className="[&>li+li]:border-t [&>li+li]:border-border">
              {preview.map(({ line, row, reason }) => (
                <li
                  key={line}
                  className="flex min-h-15 items-center gap-3 px-5 py-2.5"
                >
                  <span className="w-12 shrink-0 text-caption text-fg-3 tabular-nums">
                    {row ? shortDateLabel(row.occurredOn) : `L. ${line}`}
                  </span>
                  <span className="min-w-0 flex-1">
                    {row ? (
                      <span className="block truncate text-body text-fg">
                        {row.description || "Sem descrição"}
                      </span>
                    ) : (
                      <span className="block text-callout text-danger">
                        {reason ? SKIP_LABELS[reason] : "Linha em branco"}
                      </span>
                    )}
                  </span>
                  {row ? (
                    <Money
                      cents={invert ? -row.amountCents : row.amountCents}
                      variant="callout"
                      className="shrink-0 font-semibold"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <FieldError id={`${id}-error`}>{error ?? problem}</FieldError>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" size="lg" onClick={onCancel} disabled={pending}>
          Escolher outro arquivo
        </Button>
        <Button
          size="lg"
          loading={pending}
          className="sm:min-w-56"
          onClick={() => onSubmit(mapping, invert)}
        >
          Continuar
        </Button>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  /** Shown under the field; the control points at `${id}-hint`. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-caption text-fg-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
