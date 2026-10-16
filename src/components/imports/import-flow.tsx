"use client";

import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import {
  actionErrorMessage,
  GENERIC_ERROR,
} from "@/components/transactions/action-result";
import { useBackToClose } from "@/components/ui/use-back-to-close";
import { checkFile } from "@/lib/import/files";
import type { CsvMapping } from "@/lib/import/mapping";
import type { CsvSetup, StatementOptions } from "@/lib/import/statement";
import { cn } from "@/lib/utils";
import {
  analyzeImportAction,
  confirmImportAction,
  undoImportAction,
} from "@/server/actions/imports";
import { FileStep } from "./file-step";
import { MappingStep } from "./mapping-step";
import { RecentImports } from "./recent-imports";
import { type ConfirmRequest, ReviewStep } from "./review-step";
import { SummaryStep } from "./summary-step";
import type {
  ConfirmData,
  ImportAccountOption,
  ImportCategoryOption,
  RecentImportView,
  ReviewStage,
} from "./types";

type Step =
  | { name: "file" }
  | {
      name: "mapping";
      csv: CsvSetup;
      invertSign: boolean;
      problem: string | null;
      fileName: string;
    }
  | { name: "review"; data: ReviewStage; version: number }
  | {
      name: "done";
      result: ConfirmData;
      accountId: string;
      accountName: string;
      undone: boolean;
    };

const UPLOAD_ERROR =
  "Não conseguimos enviar o arquivo. Verifique a conexão e tente de novo.";

type ImportFlowProps = {
  accounts: ImportAccountOption[];
  categories: ImportCategoryOption[];
  defaultAccountId: string;
  /** `YYYY-MM-DD` in the user's time zone. */
  today: string;
  /** "Importações recentes", shown with the file step and the result. */
  recent: RecentImportView[];
};

/**
 * "Importar extrato" (doc 02 §6.13): Arquivo → Colunas (CSV, when needed) →
 * Revisão → Pronto. The file stays in memory on this page: the server reads
 * it on every step that needs it and never stores it. Going back (button or
 * gesture) from a later step returns to the file instead of leaving.
 */
export function ImportFlow({
  accounts,
  categories,
  defaultAccountId,
  today,
  recent,
}: ImportFlowProps) {
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>({ name: "file" });
  /** The current file went through "Colunas" (kept in the step indicator). */
  const [mapped, setMapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analyze = useAction(analyzeImportAction);
  const confirm = useAction(confirmImportAction);
  const undo = useAction(undoImportAction);
  const account = accounts.find((item) => item.id === accountId) ?? accounts[0];

  useBackToClose(step.name !== "file", () => restart());

  function restart() {
    setStep({ name: "file" });
    setMapped(false);
    setError(null);
  }

  async function read(nextFile: File, options: StatementOptions) {
    if (!account) return;
    const problem = checkFile(nextFile);
    if (problem) {
      setError(problem);
      return;
    }
    setFile(nextFile);
    setError(null);
    const form = new FormData();
    form.set("accountId", account.id);
    form.set("file", nextFile);
    form.set("options", JSON.stringify(options));
    let result: Awaited<ReturnType<typeof analyze.executeAsync>>;
    try {
      result = await analyze.executeAsync(form);
    } catch {
      setError(UPLOAD_ERROR);
      return;
    }
    const message = actionErrorMessage(result);
    const data = result?.data;
    if (message || !data) {
      setError(message ?? GENERIC_ERROR);
      return;
    }
    if (data.stage === "mapping") {
      setMapped(true);
      setStep({
        name: "mapping",
        csv: data.csv,
        invertSign: data.invertSign,
        problem: data.problem,
        fileName: data.fileName,
      });
      return;
    }
    setStep((current) => ({
      name: "review",
      data,
      // A new key for the review: a re-read starts from its defaults.
      version: current.name === "review" ? current.version + 1 : 0,
    }));
  }

  async function submit(request: ConfirmRequest) {
    if (step.name !== "review" || !account) return;
    setError(null);
    let result: Awaited<ReturnType<typeof confirm.executeAsync>>;
    try {
      result = await confirm.executeAsync({
        accountId: step.data.accountId,
        format: step.data.format,
        ...request,
      });
    } catch {
      setError(
        "Não conseguimos importar. Verifique a conexão e tente de novo.",
      );
      return;
    }
    const message = actionErrorMessage(result);
    if (message || !result?.data) {
      setError(message ?? GENERIC_ERROR);
      return;
    }
    const target =
      accounts.find((item) => item.id === step.data.accountId) ?? account;
    setStep({
      name: "done",
      result: result.data,
      accountId: target.id,
      accountName: target.name,
      undone: false,
    });
  }

  async function undoImport() {
    if (step.name !== "done") return;
    setError(null);
    try {
      const result = await undo.executeAsync({
        importId: step.result.importId,
      });
      const message = actionErrorMessage(result);
      if (message) {
        setError(message);
        return;
      }
      setStep({ ...step, undone: true });
    } catch {
      setError("Não conseguimos desfazer. Verifique a conexão.");
    }
  }

  if (!account) return null;
  // The file and the result read best in a column; columns and rows use the width.
  const narrow = step.name === "file" || step.name === "done";

  return (
    <div className={cn("flex flex-col gap-6", narrow && "w-full max-w-2xl")}>
      <StepIndicator step={step.name} withColumns={mapped} />

      {step.name === "file" ? (
        <FileStep
          accounts={accounts}
          accountId={account.id}
          onAccountChange={setAccountId}
          onFile={(next) => read(next, {})}
          reading={analyze.isPending ? (file?.name ?? "") : null}
          error={error}
        />
      ) : null}

      {step.name === "mapping" ? (
        <MappingStep
          csv={step.csv}
          invertSign={step.invertSign}
          fileName={step.fileName}
          problem={step.problem}
          error={error}
          pending={analyze.isPending}
          onSubmit={(mapping: CsvMapping, invertSign: boolean) => {
            if (file) read(file, { mapping, invertSign });
          }}
          onCancel={restart}
        />
      ) : null}

      {step.name === "review" ? (
        <ReviewStep
          key={step.version}
          data={step.data}
          account={account}
          categories={categories}
          today={today}
          confirming={confirm.isPending}
          rereading={analyze.isPending}
          error={error}
          onConfirm={submit}
          onInvert={(invertSign) => {
            if (!file) return;
            read(file, {
              mapping: step.data.csv?.mapping ?? null,
              invertSign,
            });
          }}
          onAdjustColumns={
            step.data.csv
              ? () => {
                  const csv = step.data.csv;
                  if (!csv) return;
                  setError(null);
                  setMapped(true);
                  setStep({
                    name: "mapping",
                    csv,
                    invertSign: step.data.invertSign,
                    problem: null,
                    fileName: step.data.fileName,
                  });
                }
              : null
          }
          onCancel={restart}
        />
      ) : null}

      {step.name === "done" ? (
        <>
          <SummaryStep
            result={step.result}
            accountId={step.accountId}
            accountName={step.accountName}
            undoing={undo.isPending}
            undone={step.undone}
            onUndo={undoImport}
            onAnother={restart}
          />
          {error ? (
            <p role="alert" className="text-center text-callout text-danger">
              {error}
            </p>
          ) : null}
        </>
      ) : null}

      {narrow ? <RecentImports items={recent} /> : null}
    </div>
  );
}

const STEPS = [
  { name: "file", label: "Arquivo" },
  { name: "mapping", label: "Colunas" },
  { name: "review", label: "Revisão" },
  { name: "done", label: "Pronto" },
] as const;

/** "Arquivo · Revisão · Pronto", with "Colunas" for a CSV that needed it. */
function StepIndicator({
  step,
  withColumns,
}: {
  step: Step["name"];
  withColumns: boolean;
}) {
  const steps = STEPS.filter((item) => item.name !== "mapping" || withColumns);
  const current = steps.findIndex((item) => item.name === step);
  return (
    <ol
      aria-label="Etapas"
      className="flex flex-wrap items-center gap-x-2 gap-y-1"
    >
      {steps.map((item, index) => (
        <li
          key={item.name}
          aria-current={index === current ? "step" : undefined}
          className={cn(
            "flex items-center gap-2 text-caption font-semibold",
            index === current
              ? "text-primary"
              : index < current
                ? "text-fg-2"
                : "text-fg-3",
          )}
        >
          {index > 0 ? (
            <span aria-hidden="true" className="h-px w-4 bg-border-strong/50" />
          ) : null}
          <span
            aria-hidden="true"
            className={cn(
              "flex size-5 items-center justify-center rounded-full text-micro tabular-nums",
              index === current
                ? "bg-primary text-on-primary"
                : index < current
                  ? "bg-primary-soft text-on-primary-soft"
                  : "bg-surface-2 text-fg-3",
            )}
          >
            {index + 1}
          </span>
          {item.label}
        </li>
      ))}
    </ol>
  );
}
