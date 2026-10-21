import { useEffect, useState } from "react";

/**
 * Chart colours — MicroMax azure first (bars draw it as the azure → teal gradient, see BarDefs), then gold and rose.
 * Validated with the dataviz checker against the warm card surfaces (light #fdfbf7, dark #1d1813): all pairs pass.
 * Text never wears a series colour: axes and labels use the theme's muted / foreground ink.
 */
const LIGHT = { s1: "#2196cf", s2: "#b8791f", s3: "#d0457a", neutral: "#a89b88", grid: "#ece4d6" };
const DARK = { s1: "#2196cf", s2: "#c4862a", s3: "#d55181", neutral: "#7a6d5c", grid: "#2e261e" };

/** The azure → teal gradient for bars (put <BarDefs /> inside a chart, then fill="url(#mx-bar-v)" or "url(#mx-bar-h)"). */
export const BAR_V = "url(#mx-bar-v)";
export const BAR_H = "url(#mx-bar-h)";

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
