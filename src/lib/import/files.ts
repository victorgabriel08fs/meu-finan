/**
 * Which files the import accepts (doc 02 §6.13): OFX/QFX and CSV/TXT up to
 * 2 MB. Shared by the file input (a quick check before uploading) and the
 * Server Action (the real check, before reading the content).
 */

/** Statements are small; anything bigger is refused before it is read. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** Rows per import (doc 01 RF-13); a longer period goes in more files. */
export const MAX_IMPORT_ROWS = 2000;
export const ACCEPTED_EXTENSIONS = [".ofx", ".qfx", ".csv", ".txt"] as const;
/** What browsers report for these files: often nothing, or Excel's type for .csv. */
export const ACCEPTED_MIME_TYPES: readonly string[] = [
  "",
  "text/csv",
  "text/plain",
  "text/x-csv",
  "text/comma-separated-values",
  "text/tab-separated-values",
  "text/ofx",
  "application/csv",
  "application/x-csv",
  "application/vnd.ms-excel",
  "application/x-ofx",
  "application/ofx",
  "application/x-qfx",
  "application/vnd.intu.qfx",
  "application/octet-stream",
];
/** The file input's `accept`: extensions plus the common types. */
export const FILE_INPUT_ACCEPT =
  ".ofx,.qfx,.csv,.txt,text/csv,text/plain,application/x-ofx,application/vnd.ms-excel";

/** A pt-BR message when the file cannot be imported as is, or null. */
export function checkFile(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (file.size === 0) return "O arquivo está vazio.";
  if (file.size > MAX_FILE_BYTES) {
    return "O arquivo passa de 2 MB. Baixe um período menor no seu banco.";
  }
  const name = file.name.toLowerCase();
  const type = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    !ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension)) ||
    !ACCEPTED_MIME_TYPES.includes(type)
  ) {
    return "Envie um arquivo OFX ou CSV.";
  }
  return null;
}
