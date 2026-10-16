/**
 * Shared by the privacy store and the root layout, without importing zustand
 * into Server Components.
 */

/** localStorage key of the persisted privacy choice (one per device). */
export const PRIVACY_STORAGE_KEY = "meu-finan:privacidade";

/**
 * Runs before the first paint (inline in the root layout) and mirrors the
 * saved choice on <html data-privacy="on|off">: CSS then hides every value
 * rendered by <Money>, with no flash and no hydration mismatch. It reads the
 * zustand `persist` format: {"state":{"hidden":true},"version":1}.
 */
export const PRIVACY_BOOT_SCRIPT = `try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  PRIVACY_STORAGE_KEY,
)})||"null");document.documentElement.dataset.privacy=p&&p.state&&p.state.hidden?"on":"off"}catch(e){}`;
