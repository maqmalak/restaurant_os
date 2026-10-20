import { useEffect, useState } from "react";

/**
 * Chart colours (dataviz reference palette, slots 1–3 validated all-pairs against this app's card surfaces:
 * light #ffffff, dark #121d2e). Slot 3 (aqua) is below 3:1 on white → every chart ships a table / direct labels.
 * Text never wears a series colour: axes and labels use the theme's muted / foreground ink.
 */
const LIGHT = { s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a", neutral: "#9ca3af", grid: "#e5e7eb" };
const DARK = { s1: "#3987e5", s2: "#d95926", s3: "#199e70", neutral: "#6b7280", grid: "#243047" };

export type Viz = typeof LIGHT & { ink: string; muted: string };

/** The palette for the current theme; re-renders when the light / dark class on <html> changes. */
export function useViz(): Viz {
  const read = () => document.documentElement.classList.contains("dark");
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return { ...(dark ? DARK : LIGHT), ink: "hsl(var(--foreground))", muted: "hsl(var(--muted-foreground))" };
}

export const axis = (v: Viz) => ({ tick: { fill: v.muted, fontSize: 11 }, axisLine: false, tickLine: false } as const);

/** Download rows as CSV (Excel opens it). */
export function downloadCsv(name: string, rows: Record<string, unknown>[], columns?: { key: string; label: string }[]) {
  if (!rows.length) return;
  const cols = columns ?? Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
  const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.map((c) => cell(c.label)).join(","), ...rows.map((r) => cols.map((c) => cell(r[c.key])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
