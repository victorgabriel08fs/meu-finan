"use client";

import { useEffect, useRef } from "react";

/**
 * The back button (Android) and the back gesture close the topmost open
 * sheet instead of leaving the page (doc 02 §4.4). Opening a sheet pushes a
 * history entry with the same URL, which Next.js fills with its router state;
 * going back pops it and closes the sheet. Closing from the UI steps back
 * over that entry, unless the URL changed meanwhile (a navigation from inside
 * the sheet leaves the entry behind rather than undoing the navigation).
 *
 * So a flow that leaves the page after an action should navigate and let
 * the sheet unmount with the page, not close it first: that step back would
 * race the navigation (see ArchiveAccountSheet).
 */

type OpenSheet = { close: () => void; href: string };

const openSheets: OpenSheet[] = [];
let ignoredPops = 0;
let listening = false;

function onPopState() {
  if (ignoredPops > 0) {
    ignoredPops -= 1;
    return;
  }
  openSheets.pop()?.close();
}

export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!open) return;
    const sheet: OpenSheet = { close: () => closeRef.current(), href: "" };
    // Deferred so that StrictMode's discarded first mount pushes nothing.
    const timer = window.setTimeout(() => {
      if (!listening) {
        window.addEventListener("popstate", onPopState);
        listening = true;
      }
      sheet.href = window.location.href;
      openSheets.push(sheet);
      window.history.pushState({ meuFinanSheet: true }, "");
    }, 0);
    return () => {
      window.clearTimeout(timer);
      const index = openSheets.indexOf(sheet);
      // Never pushed, or already popped by going back.
      if (index === -1) return;
      openSheets.splice(index, 1);
      if (window.location.href === sheet.href) {
        ignoredPops += 1;
        window.history.back();
      }
    };
  }, [open]);
}
