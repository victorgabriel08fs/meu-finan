// The ZIP of "Exportar todos os dados" (Ajustes › Dados), pure: built in
// memory and sent straight in the response, never stored anywhere.
import { strToU8, zipSync } from "fflate";

/** The Route Handler that builds the archive (src/app/api/export/data). */
export const EXPORT_DATA_PATH = "/api/export/data";

/**
 * Header the app's own fetch sends to the route: a prefetch, a link or a
 * cross-site <img> never does, so none of them runs an export.
 */
export const EXPORT_FETCH_HEADER = {
  name: "X-Requested-With",
  value: "fetch",
} as const;

/** Below the 4.5 MB response limit of a Vercel Function. */
export const MAX_ARCHIVE_BYTES = 4_000_000;

export const ARCHIVE_FILES = {
  json: "prumo-dados.json",
  csv: "lancamentos.csv",
  readme: "LEIA-ME.txt",
} as const;

export function dataArchiveName(todayIso: string): string {
  return `prumo-dados-${todayIso}.zip`;
}

export function buildDataArchive(
  files: { json: string; csv: string; readme: string },
  now: Date,
): Uint8Array {
  return zipSync(
    {
      [ARCHIVE_FILES.json]: strToU8(files.json),
      [ARCHIVE_FILES.csv]: strToU8(files.csv),
      [ARCHIVE_FILES.readme]: strToU8(files.readme),
    },
    { level: 6, mtime: now },
  );
}
