"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  dataArchiveName,
  EXPORT_DATA_PATH,
  EXPORT_FETCH_HEADER,
} from "@/lib/export/archive";
import { todayInTimeZone } from "@/lib/format/date";

const FAILED = "Não conseguimos gerar o arquivo.";

function filenameOf(response: Response): string {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  return (
    /filename="([^"]+)"/.exec(disposition)?.[1] ??
    dataArchiveName(todayInTimeZone())
  );
}

async function messageOf(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    return body.error?.message ?? null;
  } catch {
    return null;
  }
}

/** Saves `blob` through a temporary link: the browser's own download. */
function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Later, so the download has started before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * "Exportar todos os dados": fetches the ZIP (src/app/api/export/data) and
 * saves it. Without a recent sign-in the route answers 403 REAUTH_REQUIRED
 * and `onReauth` opens the "Entre de novo" step; the other refusals become a
 * toast, with "Tentar de novo" when retrying may help.
 */
export function useDataExport(onReauth: () => void) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    let retry = false;
    let message: string | null = null;
    try {
      const response = await fetch(EXPORT_DATA_PATH, {
        headers: { [EXPORT_FETCH_HEADER.name]: EXPORT_FETCH_HEADER.value },
        cache: "no-store",
      });
      if (response.ok) {
        save(await response.blob(), filenameOf(response));
        toast("Arquivo pronto. Confira os downloads do aparelho.");
        return;
      }
      if (response.status === 403) {
        onReauth();
        return;
      }
      message = await messageOf(response);
      retry = response.status >= 500;
    } catch {
      retry = true;
    } finally {
      running.current = false;
      setBusy(false);
    }
    toast.error(
      message ?? FAILED,
      retry
        ? { action: { label: "Tentar de novo", onClick: () => void start() } }
        : undefined,
    );
  }, [onReauth]);

  return { busy, start };
}
