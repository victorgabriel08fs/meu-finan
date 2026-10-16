import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import { PRIVACY_STORAGE_KEY } from "./privacy-boot";

/**
 * Privacy mode (doc 02 §2.7): hides every amount in the app with one tap and
 * is remembered per device. `<Money>` reacts through CSS (the `data-privacy`
 * attribute on <html>), so it stays a Server Component; read `hidden` here
 * only where a value is drawn outside <Money> (charts, tooltips).
 */
type PrivacyState = {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  toggle: () => void;
};

/** localStorage that never throws (private mode, blocked storage, quota). */
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Storage unavailable: the choice lasts until the tab closes.
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Nothing to remove.
    }
  },
};

function applyToDocument(hidden: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.privacy = hidden ? "on" : "off";
}

export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set, get) => ({
      hidden: false,
      setHidden: (hidden) => {
        applyToDocument(hidden);
        set({ hidden });
      },
      toggle: () => get().setHidden(!get().hidden),
    }),
    {
      name: PRIVACY_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ hidden: state.hidden }),
      // Rehydrated after mount (see Providers): the first client render must
      // match the server's, and the inline boot script already hid the values.
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (state) applyToDocument(state.hidden);
      },
    },
  ),
);
