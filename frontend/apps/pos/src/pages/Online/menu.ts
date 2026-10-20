import { useEffect, useState } from "react";
import { getCall } from "@/services/frappe";

export interface ModOption { name: string; price: number; item?: string; default: number }
export interface ModGroup { group: string; min: number; max: number; required: number; options: ModOption[] }
export interface MenuItem { item_code: string; item_name: string; description?: string; image?: string; item_group: string; price: number;
  sold_out: boolean; modifiers: ModGroup[] }
export interface Menu {
  restaurant: string; logo?: string; currency: string;
  branch: { name: string; address?: string; phone?: string; lat: number; lng: number; delivery_radius_km: number; delivery_minutes: number; prep_minutes: number };
  branches: { name: string; address?: string }[]; categories: string[]; items: MenuItem[]; open: number; kiosk_open: number; kiosk_idle_seconds: number;
  delivery_fee: number; min_order: number; tax: { rate: number; included: boolean };
  online_payment: number; payment_test_mode: boolean;
  offers?: { title: string; description?: string }[];
}
export interface Chosen { group: string; name: string }
export interface CartLine { key: string; item: MenuItem; qty: number; modifiers: Chosen[]; notes?: string }

/** Unit price of a cart line: the dish plus every chosen add-on. */
export const linePrice = (l: CartLine) => l.item.price + l.modifiers.reduce((s, c) => {
  const g = l.item.modifiers.find((x) => x.group === c.group);
  return s + (g?.options.find((o) => o.name === c.name)?.price ?? 0);
}, 0);

export const cartPayload = (lines: CartLine[]) => lines.map((l) => ({ item_code: l.item.item_code, qty: l.qty, modifiers: l.modifiers, notes: l.notes }));

/** Default choices: each group's default options (or the first one when a choice is required). */
export function defaultChoices(item: MenuItem): Chosen[] {
  return item.modifiers.flatMap((g) => {
    const d = g.options.filter((o) => o.default);
    if (d.length) return d.map((o) => ({ group: g.group, name: o.name }));
    return g.required && g.options[0] ? [{ group: g.group, name: g.options[0].name }] : [];
  });
}

export function useMenu(branch?: string) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = () => getCall<Menu>("restaurant_os.api.online.menu", branch ? { branch } : undefined).then((m) => live && setMenu(m)).catch((e) => live && setError(String(e?.message ?? e)));
    void load();
    const t = setInterval(load, 60000);                    // sold-out flags stay fresh
    return () => { live = false; clearInterval(t); };
  }, [branch]);
  return { menu, error };
}

export const money = (v: number, currency = "PKR") => `${currency === "PKR" ? "Rs" : currency} ${Math.round(v).toLocaleString()}`;
