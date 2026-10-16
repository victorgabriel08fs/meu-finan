import { Download, FileDown } from "lucide-react";

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
        className="flex min-h-16 items-center gap-3 px-4 py-2 -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2"
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-surface-2 text-fg-2 [&_svg]:size-5"
        >
          <FileDown />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body font-semibold text-fg">
            Exportar lançamentos (CSV)
          </span>
          <span className="truncate text-caption text-fg-3">
            Planilha com todos os lançamentos, para o Excel
          </span>
        </span>
        <Download aria-hidden="true" className="size-5 shrink-0 text-fg-3" />
      </a>
    </li>
  );
}
