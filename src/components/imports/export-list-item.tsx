import { Download, FileDown } from "lucide-react";
import { CLAMP_TEXT, CLAMP_TITLE } from "@/components/ui/clamp";
import { cn } from "@/lib/utils";

/** The Route Handler that streams the CSV (src/app/api/export/transactions). */
export const EXPORT_TRANSACTIONS_PATH = "/api/export/transactions";

/**
 * "Exportar lançamentos (CSV)" for an InsetList (doc 02 §6.14, "Dados"): a
 * plain download link, styled like InsetListItem. Not a next/link: that
 * would prefetch the route (running the export) and try a client navigation.
 */
export function ExportListItem() {
  return (
    <li>
      <a
        href={EXPORT_TRANSACTIONS_PATH}
        download
        className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2"
      >
        <span className="flex min-w-0 flex-[1_1_10rem] items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-[min(2rem,40px)] shrink-0 items-center justify-center rounded-chip bg-surface-2 text-fg-2 [&_svg]:size-[min(1.25rem,24px)]"
          >
            <FileDown />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={cn("text-body font-semibold text-fg", CLAMP_TITLE)}
            >
              Exportar lançamentos (CSV)
            </span>
            <span className={cn("text-caption text-fg-3", CLAMP_TEXT)}>
              Planilha com todos os lançamentos, para o Excel
            </span>
          </span>
        </span>
        <Download
          aria-hidden="true"
          className="ml-auto size-5 shrink-0 text-fg-3"
        />
      </a>
    </li>
  );
}
