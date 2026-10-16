"use client";

import { useCallback, useState } from "react";

/**
 * State for a sheet opened from many places (a row, a button): the target
 * stays mounted while the sheet animates out, and `key` changes on every
 * opening so the form inside starts fresh.
 */
export function useSheetTarget<T>() {
  const [state, setState] = useState<{
    isOpen: boolean;
    target: T | null;
    key: number;
  }>({ isOpen: false, target: null, key: 0 });

  const show = useCallback((target: T) => {
    setState((current) => ({ isOpen: true, target, key: current.key + 1 }));
  }, []);
  const close = useCallback(() => {
    setState((current) => ({ ...current, isOpen: false }));
  }, []);
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) close();
    },
    [close],
  );

  return { ...state, show, close, onOpenChange };
}
