/** Marks an intentional move to another app (sidebar link, launcher, search) so the app shell makes it the new origin
 *  instead of keeping the previous app's sidebar and "Back to …" bar. Per browser tab. */
export const SWITCH_KEY = "app.switch";

export function markAppSwitch() {
  try { sessionStorage.setItem(SWITCH_KEY, "1"); } catch { /* per-tab only */ }
}
