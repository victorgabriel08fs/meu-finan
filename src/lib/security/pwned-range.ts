/**
 * Reads a Pwned Passwords range response (lines of `SUFFIX:COUNT`) and returns
 * how many times the password with that SHA-1 suffix appears in leaks, or 0.
 * Padding lines have a count of 0; a malformed count also counts as 0, so a
 * strange response never blocks anyone.
 */
export function pwnedCount(body: string, hashSuffix: string): number {
  const wanted = hashSuffix.trim().toUpperCase();
  if (!wanted) return 0;
  for (const line of body.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    if (line.slice(0, separator).trim().toUpperCase() !== wanted) continue;
    const raw = line.slice(separator + 1).trim();
    if (!/^\d+$/.test(raw)) return 0;
    return Number(raw);
  }
  return 0;
}
