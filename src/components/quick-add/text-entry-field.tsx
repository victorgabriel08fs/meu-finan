"use client";

import { CircleAlert, Info, Sparkles } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { interpretEntryTextAction } from "@/server/actions/entry-text";
import type { EntryTextResult } from "@/server/domain/entry-text";
import { actionErrorMessage } from "../transactions/action-result";

const TEXT_ENTRY_NETWORK_ERROR =
  "Não deu para preencher agora. Verifique a conexão.";

type Feedback = {
  summary: string;
  warnings: string[];
};

type TextEntryFieldProps = {
  kind: "expense" | "income";
  /** Merges the reading into the form and says what it filled. */
  onResult: (result: EntryTextResult) => Feedback;
};

/**
 * "Lançamento por texto" (doc 02 §6.5): one line that understands "café 12 no
 * nubank ontem #viagem". Enter or "Preencher" asks the server and fills the
 * form; it never saves the entry.
 */
export function TextEntryField({ kind, onResult }: TextEntryFieldProps) {
  const messageId = useId();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phrase = text.trim();
    if (phrase === "" || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await interpretEntryTextAction({ text: phrase, kind });
      const message = actionErrorMessage(result);
      if (message !== null || !result?.data) {
        setFeedback(null);
        setError(message ?? TEXT_ENTRY_NETWORK_ERROR);
        return;
      }
      setFeedback(onResult(result.data));
    } catch {
      setFeedback(null);
      setError(TEXT_ENTRY_NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-12 min-w-[min(12rem,100%)] flex-1 items-center gap-2.5 rounded-control border border-border-strong bg-surface px-3.5 focus-within:border-primary focus-within:shadow-[inset_0_0_0_1px_var(--primary)]">
          <Sparkles
            aria-hidden="true"
            className="size-4.5 shrink-0 text-fg-3"
          />
          <span className="sr-only">Escrever o lançamento</span>
          <input
            type="text"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (error) setError(null);
            }}
            placeholder="Ex.: café 12 ontem #viagem"
            maxLength={200}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="done"
            aria-describedby={feedback || error ? messageId : undefined}
            className="h-11 min-w-0 flex-1 bg-transparent text-input text-fg outline-none placeholder:text-fg-3"
          />
        </label>
        <Button
          type="submit"
          variant="tonal"
          size="md"
          loading={pending}
          disabled={text.trim() === ""}
        >
          Preencher
        </Button>
      </div>
      <div id={messageId} aria-live="polite" className="flex flex-col gap-1">
        {feedback ? (
          <>
            <p className="text-caption text-fg-2">{feedback.summary}</p>
            {feedback.warnings.map((warning) => (
              <p
                key={warning}
                className="flex items-start gap-1.5 text-caption text-fg-2"
              >
                <Info aria-hidden="true" className="mt-px size-4 shrink-0" />
                <span>{warning}</span>
              </p>
            ))}
          </>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-caption font-semibold text-danger"
          >
            <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </form>
  );
}
