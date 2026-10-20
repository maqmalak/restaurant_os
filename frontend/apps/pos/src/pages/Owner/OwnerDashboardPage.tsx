import { Link } from "react-router-dom";
import { useFrappeEventListener, useFrappeGetCall } from "frappe-react-sdk";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle, Armchair, ArrowDownRight, ArrowUpRight, Bike, ChefHat, CircleAlert, ClipboardList, Flame, Gauge, LayoutDashboard,
  PackageX, Percent, Receipt, Star, Timer, Trash2, Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { axis, useViz } from "@/components/viz/palette";
import { formatMoney } from "@/utils/currency";
import { cn } from "@/utils/cn";

interface Day { net: number; orders: number; avg_ticket: number; food_cost: number; food_cost_pct: number }
interface Live {
  branch: string; branches: string[]; today: Day; yesterday: Day;
  hours: { hour: number; today: number; yesterday: number }[]; channels: { channel: string; amount: number }[];
  top_items: { item: string; qty: number; amount: number }[];
  open: { count: number; late: number; by_status: Record<string, number>; by_channel: Record<string, number>;
    orders: { name: string; order_no: string; status: string; channel: string; order_type: string; table_name?: string; customer_name?: string; age_minutes: number }[] };
  kitchen_load: { station: string; queued: number; preparing: number }[]; avg_ticket_minutes: number; red_minutes: number;
  tables: { total: number; occupied: number; guests: number }; riders: { available: number; on_delivery: number; off_duty: number };
  deliveries: { on_road: number; waiting_rider: number }; low_stock: { item_name: string; actual_qty: number; warehouse_reorder_level: number; stock_uom: string }[];
  sold_out: string[]; wastage_today: number; alerts: { level: "critical" | "warning"; text: string }[];
}

const short = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v)));
const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);

/** Owner dashboard: today's business at a glance, live (orders, kitchen, tables, riders, stock, alerts). */
export default function OwnerDashboardPage() {
  const v = useViz();
  const { data, mutate } = useFrappeGetCall<{ message: Live }>("restaurant_os.api.analytics.live", undefined, "ros.owner.live", { refreshInterval: 30000 });
  useFrappeEventListener("ros_kds", () => void mutate());
  useFrappeEventListener("ros_dispatch", () => void mutate());
  const d = data?.message;
  if (!d) return <div className="p-10 text-center text-sm text-muted-foreground">Loading the dashboard…</div>;
  const nowHour = new Date().getHours();
  const hours = d.hours.filter((h) => h.hour >= 7 || h.today || h.yesterday).map((h) => ({ ...h, label: `${h.hour}:00`, today: h.hour <= nowHour ? h.today : null }));

  return (
    <div className="space-y-4">
      <PageHeader title="Owner dashboard" subtitle={`${d.branch} · today, live`} icon={<LayoutDashboard className="h-5 w-5" />}
        actions={<Link to="/restaurant/reports" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"><ClipboardList className="h-4 w-4" /> Reports</Link>} />

      {d.alerts.length > 0 && (
        <div className="space-y-2">{d.alerts.map((a, i) => (
          <div key={i} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            a.level === "critical" ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300" : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300")}>
            {a.level === "critical" ? <CircleAlert className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span className="font-semibold">{a.level === "critical" ? "Critical" : "Warning"}:</span> {a.text}
          </div>
        ))}</div>
      )}

      {/* headline numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={Wallet} label="Net sales today" value={formatMoney(d.today.net)} delta={pct(d.today.net, d.yesterday.net)} hint={`yesterday ${formatMoney(d.yesterday.net)}`} big />
        <Tile icon={Receipt} label="Orders" value={String(d.today.orders)} delta={pct(d.today.orders, d.yesterday.orders)} hint={`yesterday ${d.yesterday.orders}`} />
        <Tile icon={Gauge} label="Avg ticket" value={formatMoney(d.today.avg_ticket)} delta={pct(d.today.avg_ticket, d.yesterday.avg_ticket)} />
        <Tile icon={Percent} label="Food cost" value={`${d.today.food_cost_pct.toFixed(1)}%`} hint={formatMoney(d.today.food_cost)} warn={d.today.food_cost_pct > 40} />
        <Tile icon={Flame} label="Open orders" value={String(d.open.count)} hint={d.open.late ? `${d.open.late} late (> ${d.red_minutes} min)` : "none late"} warn={d.open.late > 0} />
        <Tile icon={Timer} label="Ticket time" value={d.avg_ticket_minutes ? `${d.avg_ticket_minutes.toFixed(0)} min` : "—"} hint="order → ready, today" warn={d.avg_ticket_minutes > d.red_minutes} />
        <Tile icon={Armchair} label="Tables" value={`${d.tables.occupied}/${d.tables.total}`} hint={`${d.tables.guests} guests seated`} />
        <Tile icon={Trash2} label="Wastage today" value={formatMoney(d.wastage_today)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Sales by hour" sub="Net sales — today vs yesterday" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={hours} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={v.grid} vertical={false} />
              <XAxis dataKey="label" {...axis(v)} interval={1} />
              <YAxis {...axis(v)} tickFormatter={short} width={44} />
              <Tooltip formatter={(x: number, n: string) => [formatMoney(x), n === "today" ? "Today" : "Yesterday"]}
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--popover-foreground))" }} />
              <Legend formatter={(n) => <span style={{ color: v.muted }}>{n === "today" ? "Today" : "Yesterday"}</span>} />
              <Line type="monotone" dataKey="yesterday" stroke={v.neutral} strokeWidth={2} strokeDasharray="5 4" dot={false} />
              <Line type="monotone" dataKey="today" stroke={v.s1} strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Sales by channel" sub="Today, net">
          {d.channels.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={d.channels} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }} barCategoryGap={6}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="channel" {...axis(v)} width={78} />
                <Tooltip formatter={(x: number) => formatMoney(x)} cursor={{ fill: v.grid, opacity: 0.4 }}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="amount" fill={v.s1} radius={[0, 4, 4, 0]} maxBarSize={18}
                  label={{ position: "right", fill: v.muted, fontSize: 11, formatter: (x: number) => short(x) }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Top dishes today" sub="By net sales">
          {d.top_items.length === 0 ? <Empty /> : (
            <ol className="space-y-2">{d.top_items.map((t, i) => (
              <li key={t.item} className="text-sm">
                <div className="flex justify-between gap-2"><span className="truncate"><span className="mr-1.5 text-muted-foreground">{i + 1}.</span>{t.item}</span>
                  <span className="whitespace-nowrap tabular-nums">{formatMoney(t.amount)} <span className="text-xs text-muted-foreground">· {t.qty}</span></span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(t.amount / (d.top_items[0]?.amount || 1)) * 100}%`, background: v.s1 }} /></div>
              </li>
            ))}</ol>
          )}
        </Panel>
        <Panel title="Kitchen load" sub="Dishes waiting or cooking, by station" right={<Link to="/kds" className="text-xs font-semibold text-primary hover:underline">Open KDS</Link>}>
          {d.kitchen_load.length === 0 ? <Empty text="Kitchen is clear" /> : (
            <ResponsiveContainer width="100%" height={Math.max(120, d.kitchen_load.length * 34 + 40)}>
              <BarChart data={d.kitchen_load} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap={8}>
                <XAxis type="number" allowDecimals={false} {...axis(v)} />
                <YAxis type="category" dataKey="station" {...axis(v)} width={110} />
                <Tooltip cursor={{ fill: v.grid, opacity: 0.4 }} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend formatter={(n) => <span style={{ color: v.muted }}>{n === "queued" ? "Waiting" : "Cooking"}</span>} />
                <Bar dataKey="queued" stackId="k" fill={v.s2} name="queued" maxBarSize={18} stroke="hsl(var(--card))" strokeWidth={2} />
                <Bar dataKey="preparing" stackId="k" fill={v.s1} name="preparing" radius={[0, 4, 4, 0]} maxBarSize={18} stroke="hsl(var(--card))" strokeWidth={2} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="Delivery" sub="Riders and deliveries now" right={<Link to="/dispatch" className="text-xs font-semibold text-primary hover:underline">Dispatch map</Link>}>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Mini icon={Bike} label="On the road" value={d.deliveries.on_road} />
            <Mini icon={AlertTriangle} label="Ready, no rider" value={d.deliveries.waiting_rider} warn={d.deliveries.waiting_rider > 0} />
            <Mini icon={Bike} label="Riders available" value={d.riders.available} />
            <Mini icon={Bike} label="On delivery" value={d.riders.on_delivery} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{d.riders.off_duty} rider(s) off duty</p>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Open orders" sub={Object.entries(d.open.by_channel).map(([k, n]) => `${k} ${n}`).join(" · ") || "None"} className="xl:col-span-2">
          {d.open.orders.length === 0 ? <Empty text="No open orders" /> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Order</th><th>Channel</th><th>Type</th><th>Customer / table</th><th>Status</th><th className="text-right">Age</th></tr></thead>
              <tbody>{d.open.orders.map((o) => (
                <tr key={o.name} className="border-t border-border">
                  <td className="py-1.5 font-semibold">#{o.order_no}</td><td>{o.channel}</td><td>{o.order_type}</td>
                  <td className="truncate">{o.table_name ? o.table_name.replace(/^.*-/, "Table ") : o.customer_name}</td><td>{o.status}</td>
                  <td className={cn("text-right tabular-nums", o.age_minutes >= d.red_minutes && o.status !== "Ready" && "font-semibold text-red-600")}>{o.age_minutes} min</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Panel>
        <Panel title="Stock" sub="Kitchen" right={<Link to="/restaurant/variance" className="text-xs font-semibold text-primary hover:underline">Variance</Link>}>
          {d.sold_out.length > 0 && <div className="mb-3 flex flex-wrap gap-1">{d.sold_out.map((s) => <span key={s} className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300"><PackageX className="h-3 w-3" /> {s}</span>)}</div>}
          {d.low_stock.length === 0 ? <Empty text="Nothing below its reorder level" /> : (
            <ul className="space-y-1.5 text-sm">{d.low_stock.map((l) => (
              <li key={l.item_name} className="flex justify-between"><span className="truncate">{l.item_name}</span>
                <span className="tabular-nums text-amber-700 dark:text-amber-300">{+l.actual_qty.toFixed(2)} / {l.warehouse_reorder_level} {l.stock_uom}</span></li>
            ))}</ul>
          )}
          <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><Star className="h-3 w-3" /> Customer reviews appear here with phase 9.</p>
        </Panel>
      </div>
    </div>
  );
}

function Tile({ icon: Icon, label, value, hint, delta, warn, big }: { icon: typeof Wallet; label: string; value: string; hint?: string; delta?: number | null; warn?: boolean; big?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-card p-3 shadow-sm", warn ? "border-amber-500/50" : "border-border")}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className={cn("mt-1 font-bold tabular-nums", big ? "text-2xl" : "text-xl")}>{value}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        {delta != null && (
          <span className={cn("inline-flex items-center font-semibold", delta >= 0 ? "text-green-600" : "text-red-600")}>
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(delta).toFixed(0)}%</span>
        )}
        {hint && <span className="truncate">{hint}</span>}
      </div>
    </div>
  );
}

function Mini({ icon: Icon, label, value, warn }: { icon: typeof Bike; label: string; value: number; warn?: boolean }) {
  return <div className={cn("rounded-lg border p-2", warn ? "border-amber-500/50 bg-amber-500/5" : "border-border")}>
    <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Icon className="h-3 w-3" />{label}</div><div className="text-lg font-bold">{value}</div></div>;
}

export function Panel({ title, sub, right, className, children }: { title: string; sub?: string; right?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", className)}>
      <div className="mb-3 flex items-start gap-2"><div className="min-w-0 flex-1"><h2 className="font-semibold">{title}</h2>{sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}</div>{right}</div>
      {children}
    </section>
  );
}

export const Empty = ({ text = "No sales yet today" }: { text?: string }) => <p className="py-8 text-center text-sm text-muted-foreground"><ChefHat className="mx-auto mb-1 h-5 w-5 opacity-60" />{text}</p>;
