import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { BarChart3, ChefHat, Download, ExternalLink, Scale, Sparkles, Users } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { axis, downloadCsv, useViz, type Viz } from "@/components/viz/palette";
import { formatMoney } from "@/utils/currency";
import { cn } from "@/utils/cn";
import { Empty, Panel } from "./OwnerDashboardPage";

type Tab = "sales" | "kitchen" | "menu" | "customers";
const TABS: { id: Tab; label: string; icon: typeof BarChart3; report: string }[] = [
  { id: "sales", label: "Sales", icon: BarChart3, report: "Restaurant Sales Analysis" },
  { id: "kitchen", label: "Kitchen & Delivery", icon: ChefHat, report: "Kitchen Performance" },
  { id: "menu", label: "Menu Engineering", icon: Sparkles, report: "Menu Engineering" },
  { id: "customers", label: "Customers", icon: Users, report: "Customer Insights" },
];
const GROUPS = ["Channel", "Order Type", "Item", "Item Group", "Hour", "Day Part", "Weekday", "Date", "Cashier", "Branch"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const short = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v)));
const n1 = (v?: number | null) => (v == null ? "—" : v.toFixed(1));
const tip = { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--popover-foreground))" };

/** Owner reports — the same numbers as the desk script reports, with charts, tables and CSV. */
export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("sales");
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 6 * 864e5)));
  const [to, setTo] = useState(() => iso(new Date()));
  const [group, setGroup] = useState("Channel");
  const filters = JSON.stringify({ from_date: from, to_date: to, group_by: group });
  const current = TABS.find((t) => t.id === tab)!;
  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle="Sales, kitchen, menu and customers — net amounts before tax" icon={<BarChart3 className="h-5 w-5" />}
        actions={<a href={`/app/query-report/${encodeURIComponent(current.report)}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"><ExternalLink className="h-4 w-4" /> Open in desk</a>} />
      {/* filters: one row above the charts */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        <div className="flex gap-1">{TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium", tab === t.id ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            <t.icon className="h-4 w-4" />{t.label}</button>
        ))}<Link to="/restaurant/variance" className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium hover:bg-muted"><Scale className="h-4 w-4" />Variance</Link></div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          {[["7 days", 6], ["30 days", 29], ["Today", 0]].map(([label, days]) => (
            <button key={label as string} onClick={() => { setFrom(iso(new Date(Date.now() - (days as number) * 864e5))); setTo(iso(new Date())); }}
              className="h-9 rounded-md border border-border px-2.5 text-xs hover:bg-muted">{label}</button>
          ))}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" />
          <span className="pb-2 text-muted-foreground">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" />
          {tab === "sales" && <select value={group} onChange={(e) => setGroup(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
            {GROUPS.map((g) => <option key={g}>{g}</option>)}</select>}
        </div>
      </div>
      {tab === "sales" && <SalesTab filters={filters} group={group} />}
      {tab === "kitchen" && <KitchenTab filters={filters} />}
      {tab === "menu" && <MenuTab filters={filters} />}
      {tab === "customers" && <CustomersTab filters={filters} />}
    </div>
  );
}

function Csv({ name, rows, cols }: { name: string; rows: Record<string, unknown>[]; cols?: { key: string; label: string }[] }) {
  return <button disabled={!rows.length} onClick={() => downloadCsv(name, rows, cols)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary disabled:opacity-40"><Download className="h-3.5 w-3.5" /> CSV</button>;
}

function Table({ cols, rows }: { cols: { key: string; label: string; fmt?: (v: any, r: any) => React.ReactNode; right?: boolean }[]; rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground"><tr>{cols.map((c) => <th key={c.key} className={cn("px-2 py-1.5 font-medium", c.right ? "text-right" : "text-left")}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{cols.map((c) => <td key={c.key} className={cn("px-2 py-1.5", c.right && "text-right tabular-nums")}>{c.fmt ? c.fmt(r[c.key], r) : r[c.key]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function SalesTab({ filters, group }: { filters: string; group: string }) {
  const v = useViz();
  const { data, isLoading } = useFrappeGetCall<{ message: any[] }>("restaurant_os.api.analytics.sales", { filters }, `ros.rep.sales.${filters}`);
  const rows = data?.message ?? [];
  const total = rows.reduce((s, r) => s + r.net_sales, 0);
  const cost = rows.reduce((s, r) => s + r.food_cost, 0);
  const orders = group === "Item" || group === "Item Group" ? null : rows.reduce((s, r) => s + r.orders, 0);
  const timeLike = ["Hour", "Date", "Day Part", "Weekday"].includes(group);
  const chartRows = timeLike ? rows : rows.slice(0, 12);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Net sales" value={formatMoney(total)} /><Kpi label="Orders" value={orders == null ? "—" : String(orders)} />
        <Kpi label="Food cost" value={total ? `${((cost / total) * 100).toFixed(1)}%` : "—"} /><Kpi label="Gross margin" value={formatMoney(total - cost)} />
      </div>
      <Panel title={`Net sales by ${group.toLowerCase()}`} sub={timeLike ? undefined : rows.length > 12 ? "Top 12 — all rows in the table" : undefined}>
        {isLoading ? <Empty text="Loading…" /> : rows.length === 0 ? <Empty text="No sales in this period" /> : (
          <ResponsiveContainer width="100%" height={timeLike ? 260 : Math.max(180, chartRows.length * 30 + 30)}>
            {timeLike ? (
              <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
                <CartesianGrid stroke={v.grid} vertical={false} />
                <XAxis dataKey="group" {...axis(v)} /><YAxis {...axis(v)} tickFormatter={short} width={44} />
                <Tooltip formatter={(x: number) => formatMoney(x)} contentStyle={tip} cursor={{ fill: v.grid, opacity: 0.4 }} />
                <Bar dataKey="net_sales" name="Net sales" fill={v.s1} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            ) : (
              <BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 0 }} barCategoryGap={6}>
                <XAxis type="number" hide /><YAxis type="category" dataKey="group" {...axis(v)} width={130} />
                <Tooltip formatter={(x: number) => formatMoney(x)} contentStyle={tip} cursor={{ fill: v.grid, opacity: 0.4 }} />
                <Bar dataKey="net_sales" name="Net sales" fill={v.s1} radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: "right", fill: v.muted, fontSize: 11, formatter: (x: number) => short(x) }} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </Panel>
      <Panel title="Detail" right={<Csv name={`sales-by-${group}`} rows={rows} />}>
        <Table rows={rows} cols={[{ key: "group", label: group }, { key: "orders", label: "Orders", right: true }, { key: "qty", label: "Qty", right: true },
          { key: "net_sales", label: "Net sales", right: true, fmt: (x) => formatMoney(x) }, { key: "share", label: "Share", right: true, fmt: (x) => `${n1(x)}%` },
          { key: "avg_ticket", label: "Avg ticket", right: true, fmt: (x) => formatMoney(x) }, { key: "food_cost_pct", label: "Food cost", right: true, fmt: (x) => `${n1(x)}%` },
          { key: "margin", label: "Margin", right: true, fmt: (x) => formatMoney(x) }]} />
      </Panel>
    </>
  );
}

function KitchenTab({ filters }: { filters: string }) {
  const v = useViz();
  const { data } = useFrappeGetCall<{ message: any }>("restaurant_os.api.analytics.kitchen", { filters }, `ros.rep.kitchen.${filters}`);
  const d = data?.message;
  if (!d) return <Empty text="Loading…" />;
  const late = d.stations.reduce((s: number, r: any) => s + r.late, 0), dishes = d.stations.reduce((s: number, r: any) => s + r.dishes, 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Dishes timed" value={String(dishes)} /><Kpi label={`Late (> ${d.red_minutes} min)`} value={dishes ? `${late} · ${((late / dishes) * 100).toFixed(0)}%` : "—"} warn={late > 0} />
        <Kpi label="Avg delivery" value={d.delivery.delivered ? `${d.delivery.avg_minutes.toFixed(0)} min` : "—"} /><Kpi label="Late deliveries" value={`${d.delivery.late} / ${d.delivery.delivered}`} warn={d.delivery.late > 0} />
      </div>
      <Panel title="Time per station" sub="Average minutes: waiting to start, then cooking (stacked = order to ready)">
        {d.stations.length === 0 ? <Empty text="No timed dishes in this period" /> : (
          <ResponsiveContainer width="100%" height={Math.max(160, d.stations.length * 34 + 50)}>
            <BarChart data={d.stations} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap={8}>
              <XAxis type="number" {...axis(v)} unit=" min" /><YAxis type="category" dataKey="station" {...axis(v)} width={130} />
              <Tooltip formatter={(x: number) => `${x.toFixed(1)} min`} contentStyle={tip} cursor={{ fill: v.grid, opacity: 0.4 }} />
              <Legend formatter={(nm) => <span style={{ color: v.muted }}>{nm}</span>} />
              <ReferenceLine x={d.red_minutes} stroke={v.neutral} strokeDasharray="4 4" label={{ value: "late", fill: v.muted, fontSize: 10, position: "top" }} />
              <Bar dataKey="wait" name="Waiting" stackId="t" fill={v.s2} maxBarSize={18} stroke="hsl(var(--card))" strokeWidth={2} />
              <Bar dataKey="cook" name="Cooking" stackId="t" fill={v.s1} radius={[0, 4, 4, 0]} maxBarSize={18} stroke="hsl(var(--card))" strokeWidth={2} />
            </BarChart>
          </ResponsiveContainer>
        )}
        <Table rows={d.stations} cols={[{ key: "station", label: "Station" }, { key: "dishes", label: "Dishes", right: true }, { key: "wait", label: "Wait", right: true, fmt: n1 },
          { key: "cook", label: "Cook", right: true, fmt: n1 }, { key: "total", label: "Order → ready", right: true, fmt: n1 }, { key: "late", label: "Late", right: true }]} />
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Ticket times by order type" right={<Csv name="ticket-times" rows={d.tickets} />}>
          {d.tickets.length === 0 ? <Empty text="No tickets" /> : <Table rows={d.tickets} cols={[{ key: "order_type", label: "Type" }, { key: "orders", label: "Orders", right: true },
            { key: "to_ready", label: "To ready (min)", right: true, fmt: n1 }, { key: "to_done", label: "To done (min)", right: true, fmt: n1 }, { key: "late", label: "Late", right: true }]} />}
        </Panel>
        <Panel title="Rider performance" right={<Csv name="riders" rows={d.riders} />}>
          {d.riders.length === 0 ? <Empty text="No deliveries by own riders" /> : <Table rows={d.riders} cols={[{ key: "rider", label: "Rider" }, { key: "delivered", label: "Delivered", right: true },
            { key: "rejected", label: "Declined", right: true }, { key: "avg_minutes", label: "Avg min", right: true, fmt: n1 }, { key: "avg_km", label: "Avg km", right: true, fmt: n1 },
            { key: "cash", label: "Cash collected", right: true, fmt: (x) => formatMoney(x) }]} />}
        </Panel>
      </div>
    </>
  );
}

const CLASS_ORDER = ["Star", "Plowhorse", "Puzzle", "Dog"] as const;
const classColor = (v: Viz, c: string) => ({ Star: v.s1, Plowhorse: v.s2, Puzzle: v.s3, Dog: v.neutral } as Record<string, string>)[c];
const CLASS_HINT: Record<string, string> = { Star: "popular & profitable — keep", Plowhorse: "popular, low margin — re-price / cheaper recipe",
  Puzzle: "profitable, not popular — promote", Dog: "neither — rework or drop" };

function MenuTab({ filters }: { filters: string }) {
  const v = useViz();
  const { data } = useFrappeGetCall<{ message: any }>("restaurant_os.api.analytics.menu_engineering", { filters }, `ros.rep.menu.${filters}`);
  const d = data?.message;
  const series = useMemo(() => CLASS_ORDER.map((c) => ({ c, rows: (d?.items ?? []).filter((r: any) => r.class === c) })), [d]);
  if (!d) return <Empty text="Loading…" />;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {CLASS_ORDER.map((c) => <Kpi key={c} label={c} value={String(series.find((s) => s.c === c)!.rows.length)} hint={CLASS_HINT[c]} dot={classColor(v, c)} />)}
      </div>
      <Panel title="Popularity vs margin" sub={`Each dot is a dish · lines: ${d.popularity_threshold.toFixed(1)}% of dishes sold, ${formatMoney(d.avg_cm)} average margin · food cost ${d.food_cost_pct.toFixed(1)}%`}>
        {d.items.length === 0 ? <Empty text="No dishes sold in this period" /> : (
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={v.grid} />
              <XAxis type="number" dataKey="mix" name="Menu mix" unit="%" {...axis(v)} />
              <YAxis type="number" dataKey="cm" name="Margin per dish" tickFormatter={short} width={48} {...axis(v)} />
              <ZAxis range={[90, 90]} />
              <ReferenceLine x={d.popularity_threshold} stroke={v.neutral} strokeDasharray="4 4" />
              <ReferenceLine y={d.avg_cm} stroke={v.neutral} strokeDasharray="4 4" />
              <Tooltip contentStyle={tip} cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => {
                const r: any = payload?.[0]?.payload; if (!r) return null;
                return <div style={tip} className="px-3 py-2 text-xs"><div className="font-semibold">{r.item_name}</div><div>{r.class} · sold {r.qty} · mix {r.mix.toFixed(1)}%</div>
                  <div>price {formatMoney(r.price)} · cost {formatMoney(r.unit_cost)} · margin {formatMoney(r.cm)}</div></div>;
              }} />
              <Legend formatter={(nm) => <span style={{ color: v.muted }}>{nm}</span>} />
              {series.map((s) => <Scatter key={s.c} name={s.c} data={s.rows} fill={classColor(v, s.c)} stroke="hsl(var(--card))" strokeWidth={2} />)}
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </Panel>
      <Panel title="Dishes" right={<Csv name="menu-engineering" rows={d.items} />}>
        <Table rows={d.items} cols={[{ key: "item_name", label: "Dish" }, { key: "item_group", label: "Category" }, { key: "qty", label: "Sold", right: true },
          { key: "mix", label: "Mix", right: true, fmt: (x) => `${n1(x)}%` }, { key: "price", label: "Price", right: true, fmt: (x) => formatMoney(x) },
          { key: "unit_cost", label: "Cost", right: true, fmt: (x) => formatMoney(x) }, { key: "food_cost_pct", label: "Food cost", right: true, fmt: (x) => `${n1(x)}%` },
          { key: "cm", label: "Margin", right: true, fmt: (x) => formatMoney(x) }, { key: "total_cm", label: "Total margin", right: true, fmt: (x) => formatMoney(x) },
          { key: "class", label: "Class", fmt: (x) => <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: classColor(v, x) }} />{x}</span> }]} />
      </Panel>
    </>
  );
}

function CustomersTab({ filters }: { filters: string }) {
  const { data } = useFrappeGetCall<{ message: any }>("restaurant_os.api.analytics.customers", { filters }, `ros.rep.cust.${filters}`);
  const d = data?.message;
  if (!d) return <Empty text="Loading…" />;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="New customers" value={String(d.new)} /><Kpi label="Returning" value={String(d.returning)} />
        <Kpi label="Retention" value={d.previous_customers ? `${d.retention_pct.toFixed(0)}%` : "—"} hint={`${d.retained} of ${d.previous_customers} from the previous period came back`} />
        <Kpi label="Avg lifetime value" value={formatMoney(d.avg_ltv)} />
      </div>
      <Panel title="Customers in this period" sub="Named customers only — walk-in and Foodpanda sales are not counted" right={<Csv name="customers" rows={d.rows} />}>
        {d.rows.length === 0 ? <Empty text="No named customers in this period — pick a customer at the counter or take phone orders to build this" /> : (
          <Table rows={d.rows} cols={[{ key: "customer_name", label: "Customer" }, { key: "type", label: "Type" }, { key: "orders", label: "Orders", right: true },
            { key: "spend", label: "Spend", right: true, fmt: (x) => formatMoney(x) }, { key: "avg_ticket", label: "Avg ticket", right: true, fmt: (x) => formatMoney(x) },
            { key: "first_order", label: "First order" }, { key: "last_order", label: "Last order" }, { key: "lifetime_orders", label: "Lifetime orders", right: true },
            { key: "ltv", label: "Lifetime value", right: true, fmt: (x) => formatMoney(x) }]} />
        )}
      </Panel>
    </>
  );
}

function Kpi({ label, value, hint, warn, dot }: { label: string; value: string; hint?: string; warn?: boolean; dot?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-3 shadow-sm", warn ? "border-amber-500/50" : "border-border")}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{dot && <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />}{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
