"use client";

import { ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { SectionHeader } from "@/components/app/section-header";
import { actionErrorMessage } from "@/components/transactions/action-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { undoImportAction } from "@/server/actions/imports";
import type { RecentImportView } from "./types";

const formatInt = new Intl.NumberFormat("pt-BR");

/**
 * "Importações recentes" (doc 02 §6.13): the last imports with their account,
 * size and period, a link to the statement and "Desfazer" while the 24 hours
 * last.
 */
export function RecentImports({ items }: { items: RecentImportView[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const undo = useAction(undoImportAction);

  async function undoImport(item: RecentImportView) {
    setPendingId(item.id);
    try {
      const result = await undo.executeAsync({ importId: item.id });
      const message = actionErrorMessage(result);
      if (message) {
        toast.error(message);
        return;
      }
      const undone = result?.data?.undone ?? 0;
      toast(
        `Importação desfeita: ${formatInt.format(undone)} ${undone === 1 ? "lançamento removido" : "lançamentos removidos"}.`,
      );
    } catch {
      toast.error("Não conseguimos desfazer. Verifique a conexão.");
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="importacoes-recentes">
      <SectionHeader id="importacoes-recentes" title="Importações recentes" />
      <ul
        aria-labelledby="importacoes-recentes"
        className="overflow-hidden rounded-2xl bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border"
      >
        {items.map((item) => {
          const content = (
            <>
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-surface-2 text-fg-2 [&_svg]:size-5"
              >
                <FileText />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-semibold text-fg">
                  {item.accountName}
                </span>
                <span className="truncate text-caption text-fg-3">
                  {item.summary}
                </span>
                <span className="truncate text-caption text-fg-3">
                  {item.when}
                </span>
              </span>
            </>
          );
          return (
            <li key={item.id} className="flex items-center gap-1 pr-2">
              {item.href ? (
                <Link
                  href={item.href}
                  className="flex min-h-18 min-w-0 flex-1 items-center gap-3 py-2 pl-4 -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2"
                >
                  {content}
                  {item.undoable ? null : (
                    <ChevronRight
                      aria-hidden="true"
                      className="size-5 shrink-0 text-fg-3"
                    />
                  )}
                </Link>
              ) : (
                <div className="flex min-h-18 min-w-0 flex-1 items-center gap-3 py-2 pl-4">
                  {content}
                </div>
              )}
              {item.undoable ? (
                <Button
                  variant="tonal"
                  size="sm"
                  loading={pendingId === item.id}
                  disabled={pendingId !== null && pendingId !== item.id}
                  aria-label={`Desfazer importação em ${item.accountName}, ${item.summary}`}
                  onClick={() => undoImport(item)}
                >
                  Desfazer
                </Button>
              ) : item.undone ? (
                <Badge className="mr-2">Desfeita</Badge>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
