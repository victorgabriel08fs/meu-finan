"use client";

import { createContext, type ReactNode, use } from "react";
import { defaultFlags, type FlagKey, type Flags } from "@/lib/flags/registry";

type FlagsValue = Flags | Promise<Flags>;

const FlagsContext = createContext<FlagsValue | null>(null);

/**
 * Hands the signed-in person's feature flags to Client Components (doc 01
 * §11.10). The value comes from the server, either as a promise created
 * without awaiting it (the app shell, src/app/(app)/layout.tsx) or as flags a
 * Server Component already has.
 */
export function FlagsProvider({
  flags,
  children,
}: {
  flags: FlagsValue;
  children: ReactNode;
}) {
  return <FlagsContext value={flags}>{children}</FlagsContext>;
}

function isThenable(value: FlagsValue): value is Promise<Flags> {
  return typeof (value as Promise<Flags>).then === "function";
}

/**
 * A flag's value for the signed-in person. Suspends until the flags arrive, so
 * call it inside <Suspense>. It only shapes the UI: the server enforces every
 * flag on its own (`isFlagEnabled`, `flaggedAction`). Outside a FlagsProvider
 * it returns the registry default.
 */
export function useFlag(key: FlagKey): boolean {
  const value = use(FlagsContext);
  if (value === null) return defaultFlags()[key];
  return (isThenable(value) ? use(value) : value)[key];
}
