// The form of the Nova transação comes in a chunk of its own: the sheet
// fetches it when the page is idle, and the triggers as soon as they are
// touched or focused, before the click.
type FormModule = typeof import("./quick-add-form");

let pending: Promise<FormModule> | null = null;

/** The form's module, fetched once (a failed fetch is tried again). */
export function loadQuickAddForm(): Promise<FormModule> {
  pending ??= import("./quick-add-form").catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}

/** Starts fetching the form; never throws (opening the sheet tries again). */
export function preloadQuickAddForm(): Promise<void> {
  return loadQuickAddForm().then(
    () => undefined,
    () => undefined,
  );
}
