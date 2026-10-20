import { useMemo, useState } from "react";
import { useFrappeGetCall } from "frappe-react-sdk";
import { Scale } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { formatMoney } from "@/utils/currency";
import { cn } from "@/utils/cn";

interface Row { item_code: string; uom: string; opening: number; received: number; recipe: number; wastage: number; other_out: number;
  expected: number; counted: number; variance: number; variance_pct: number; valuation_rate: number; variance_value: number }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const n = (v: number) => (Math.abs(v) < 0.0005 ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 3 }));

/** Theoretical vs actual consumption per ingredient (script report "Ingredient Variance"). */
export default function VariancePage() {
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 7 * 864e5)));
  const [to, setTo] = useState(() => iso(new Date()));
  const { data, isLoading } = useFrappeGetCall<{ message: { result: Row[] } }>("frappe.desk.query_report.run",
    { report_name: "Ingredient Variance", filters: JSON.stringify({ from_date: from, to_date: to }) }, `ros.variance.${from}.${to}`);
  const rows = useMemo(() => (data?.message?.result ?? []).filter((r) => r && r.item_code), [data]);
  const loss = rows.reduce((s, r) => s + Math.min(r.variance_value, 0), 0);
  const waste = rows.reduce((s, r) => s + r.wastage * r.valuation_rate, 0);
  return (
    <div className="space-y-4">
      <PageHeader title="Ingredient Variance" subtitle="What the recipes say the kitchen used vs what the stock count found — negative variance is missing stock." />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block h-9 rounded-md border border-input bg-transparent px-2 text-sm" /></label>
        <label className="text-xs text-muted-foreground">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block h-9 rounded-md border border-input bg-transparent px-2 text-sm" /></label>
        <div className="ml-auto flex gap-3">
          <div className="rounded-xl border border-border bg-card px-4 py-2"><div className="text-[11px] uppercase text-muted-foreground">Unexplained loss</div><div className="text-lg font-bold text-red-600">{formatMoney(loss)}</div></div>
          <div className="rounded-xl border border-border bg-card px-4 py-2"><div className="text-[11px] uppercase text-muted-foreground">Logged wastage</div><div className="text-lg font-bold text-amber-600">{formatMoney(waste)}</div></div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>
            {["Ingredient", "Opening", "Received", "Recipe use", "Wastage", "Other out", "Expected", "Counted", "Variance", "% of use", "Value"].map((h) => <th key={h} className="px-3 py-2 text-right first:text-left">{h}</th>)}
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-muted-foreground"><Scale className="mx-auto mb-1 h-6 w-6" />No kitchen stock movement in this period</td></tr>}
            {rows.map((r) => (
              <tr key={r.item_code} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{r.item_code} <span className="text-xs text-muted-foreground">{r.uom}</span></td>
                {[r.opening, r.received, r.recipe, r.wastage, r.other_out, r.expected, r.counted].map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{n(v)}</td>)}
                <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", r.variance < 0 ? "text-red-600" : r.variance > 0 ? "text-amber-600" : "")}>{n(r.variance)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.variance_pct ? `${r.variance_pct.toFixed(1)}%` : "—"}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", r.variance_value < 0 && "text-red-600")}>{r.variance_value ? formatMoney(r.variance_value) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Counts come from Stock Reconciliation entries on the kitchen warehouse. Full report with branch filter: <a className="text-primary hover:underline" href="/app/query-report/Ingredient Variance" target="_blank" rel="noopener">ERPNext desk</a>.</p>
    </div>
  );
}
