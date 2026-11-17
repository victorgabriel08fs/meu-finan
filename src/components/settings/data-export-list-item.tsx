"use client";

import { Download, FileArchive, LoaderCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { CLAMP_TEXT, CLAMP_TITLE } from "@/components/ui/clamp";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { RecentSignInContent } from "./recent-sign-in-sheet";
import { useDataExport } from "./use-data-export";

/**
 * "Exportar todos os dados" for an InsetList (doc 02 §6.14, "Dados"): styled
 * like InsetListItem, but a button, since the ZIP comes from a fetch (the
 * route needs a recent sign-in and the app's header). While it runs, the
 * description says so (announced politely).
 */
export function DataExportListItem() {
  const [reauth, setReauth] = useState(false);
  const openReauth = useCallback(() => setReauth(true), []);
  const { busy, start } = useDataExport(openReauth);

  return (
    <li data-tip="data-export">
      <button
        type="button"
        onClick={start}
        // Not `disabled`: the focus stays on the row while it runs (a second
        // tap is ignored by the hook).
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        className="flex min-h-16 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-left -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2 aria-disabled:cursor-progress"
      >
        <span className="flex min-w-0 flex-[1_1_10rem] items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-[min(2rem,40px)] shrink-0 items-center justify-center rounded-chip bg-surface-2 text-fg-2 [&_svg]:size-[min(1.25rem,24px)]"
          >
            <FileArchive />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={cn("text-body font-semibold text-fg", CLAMP_TITLE)}
            >
              Exportar todos os dados
            </span>
            <span
              aria-live="polite"
              className={cn("text-caption text-fg-3", CLAMP_TEXT)}
            >
              {busy
                ? "Preparando o arquivo…"
                : "Arquivo ZIP com contas, lançamentos, metas e tudo mais"}
            </span>
          </span>
        </span>
        {busy ? (
          <LoaderCircle
            aria-hidden="true"
            className="ml-auto size-5 shrink-0 animate-spin text-fg-3"
          />
        ) : (
          <Download
            aria-hidden="true"
            className="ml-auto size-5 shrink-0 text-fg-3"
          />
        )}
      </button>
      <Sheet open={reauth} onOpenChange={setReauth}>
        <RecentSignInContent onCancel={() => setReauth(false)} />
      </Sheet>
    </li>
  );
}
