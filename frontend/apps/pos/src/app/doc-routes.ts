/**
 * Where each DocType's record opens in the React app: `${base}${name}`.
 * Anything not listed opens in the ERPNext desk (`/desk/<doctype-slug>/<name>` — Frappe v16; proxied in dev and nginx).
 */
export const DOC_ROUTES: Record<string, string> = {
  // POS Awesome sells on Sales Invoice (is_pos); the shift / offer / coupon / cash documents are POS Awesome's own
  "POS Invoice": "/pos/invoices/",
  "Sales Invoice": "/pos/sales/",
  "Restaurant Order": "/restaurant/orders/",
  "Wastage Log": "/restaurant/wastage/",
  "POS Opening Shift": "/pos/openings/",
  "POS Closing Shift": "/pos/closings/",
  "POS Cash Movement": "/pos/cash-movements/",
  "POS Profile": "/pos/profiles/",
  "POS Offer": "/pos/offers/",
  "POS Coupon": "/pos/coupons/",
  "Loyalty Program": "/pos/loyalty/",
  "Restaurant Branch": "/restaurant/branches/",
  "Kitchen Station": "/restaurant/stations/",
  "Restaurant Table": "/restaurant/tables/",
  "Floor Area": "/restaurant/floor-areas/",
  "Menu Modifier Group": "/restaurant/modifiers/",
};

export const slug = (doctype: string) => doctype.toLowerCase().replace(/ /g, "-");

/** React route for a record, or the desk URL (external) when the app has no screen for it. */
export function docUrl(doctype: string, name: string): { href: string; external: boolean } {
  const base = DOC_ROUTES[doctype];
  return base ? { href: `${base}${encodeURIComponent(name)}`, external: false } : { href: deskUrl(doctype, name), external: true };
}

export const deskUrl = (doctype: string, name?: string) => `/desk/${slug(doctype)}${name ? `/${encodeURIComponent(name)}` : ""}`;
export const printUrl = (doctype: string, name: string, format?: string) =>
  `/printview?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(name)}&trigger_print=1${format ? `&format=${encodeURIComponent(format)}` : ""}`;
