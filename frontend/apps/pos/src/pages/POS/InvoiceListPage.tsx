import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import {
  BadgeCheck, Banknote, Bike, CalendarDays, ChevronRight, Clock, CreditCard, FileX2, Globe, Landmark, Plus, Receipt, RotateCcw, Search, Store,
  TabletSmartphone, TrendingUp, Undo2, Wallet,
} from "lucide-react";
import type { DocConfig } from "@/components/doc/doc-config";
import { PageHeader } from "@/components/common/page-header";
import { formatMoney } from "@/utils/currency";
import { todayISO } from "@/utils/dates";
import { cn } from "@/utils/cn";

interface Row {
  name: string; customer: string; customer_name: string; posting_date: string; posting_time: string; status: string; docstatus: number; is_return: number;
  total: number; outstanding_amount: number; pos_profile?: string; cashier: string; line_count: number; modes?: string; ros_channel?: string;
  fbr_status?: string; fbr_invoice_number?: string;
}
interface Data { rows: Row[]; counts: Record<string, number>; total_count: number; summary: { sales: number; outstanding: number; returns: number; tax: number } }

const STATUS_STYLE: Record<string, string> = {
  Paid: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
  Consolidated: "bg-sky-500/12 text-sky-700 ring-sky-500/30 dark:text-sky-300",
  Unpaid: "bg-amber-500/15 text-amber-700 ring-amber-500/35 dark:text-amber-300",
  Overdue: "bg-rose-500/12 text-rose-700 ring-rose-500/30 dark:text-rose-300",
  "Partly Paid": "bg-amber-500/12 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  Return: "bg-rose-500/12 text-rose-700 ring-rose-500/30 dark:text-rose-300",
  "Credit Note Issued": "bg-violet-500/12 text-violet-700 ring-violet-500/30 dark:text-violet-300",
  Draft: "bg-muted text-muted-foreground ring-border",
  Cancelled: "bg-muted text-muted-foreground ring-border line-through",
};
const CHANNEL: Record<string, { icon: typeof Store; cls: string }> = {
  POS: { icon: Store, cls: "text-sky-600 dark:text-sky-300" }, Web: { icon: Globe, cls: "text-emerald-600 dark:text-emerald-300" },
  Phone: { icon: Bike, cls: "text-violet-600 dark:text-violet-300" }, Foodpanda: { icon: Bike, cls: "text-pink-600 dark:text-pink-300" },
  Kiosk: { icon: TabletSmartphone, cls: "text-amber-600 dark:text-amber-300" }, "Dine-in": { icon: Store, cls: "text-teal-600 dark:text-teal-300" },
};
const modeIcon = (m: string) => (/card|credit/i.test(m) ? CreditCard : /bank|transfer/i.test(m) ? Landmark : /online|wallet/i.test(m) ? Wallet : Banknote);
const AVATARS = ["from-[#3092df] to-[#1bafb4]", "from-[#f7cd7a] to-[#e08a2a]", "from-emerald-400 to-teal-600", "from-violet-400 to-indigo-600", "from-rose-400 to-pink-600"];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const hash = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0);
const dayLabel = (iso: string) => {
  const t = todayISO(); const y = new Date(t); y.setDate(y.getDate() - 1);
  if (iso === t) return "Today";
  if (iso === y.toISOString().slice(0, 10)) return "Yesterday";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};

/** POS Invoices / Sales Invoices as an elegant card list: KPIs, status tabs, search, date range, rows grouped by day. */
export function InvoiceListPage({ config }: { config: DocConfig }) {
  const navigate = useNavigate();
  const isPI = config.doctype === "POS Invoice";
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(40);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => setLimit(40), [status, channel, dq, from, to]);
  const params = { doctype: config.doctype, status: status || undefined, q: dq || undefined, from_date: from || undefined, to_date: to || undefined,
    channel: channel || undefined, page_length: limit };
  const { data, isLoading } = useFrappeGetCall<{ message: Data }>("restaurant_os.api.views.invoices", params, `ros.inv.${JSON.stringify(params)}`, { keepPreviousData: true });
  const d = data?.message;
  const tabs = useMemo(() => {
    const order = isPI ? ["Paid", "Consolidated", "Return", "Draft", "Cancelled"] : ["Paid", "Unpaid", "Overdue", "Partly Paid", "Return", "Credit Note Issued", "Draft", "Cancelled"];
    const c = d?.counts ?? {};
    return [["", "All", Object.values(c).reduce((a, n) => a + n, 0)] as const, ...order.filter((s) => c[s]).map((s) => [s, s, c[s]] as const)];
  }, [d?.counts, isPI]);
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    (d?.rows ?? []).forEach((r) => { m.set(r.posting_date, [...(m.get(r.posting_date) ?? []), r]); });
    return [...m.entries()];
  }, [d?.rows]);
  const Icon = config.icon ?? Receipt;

  return (
    <div className="space-y-5">
      <PageHeader title={config.plural} subtitle={isPI ? "Counter sales from the POS terminals — merged into Sales Invoices when the shift closes" : "Every Sales Invoice: merged counter shifts, web, phone and Foodpanda deliveries"}
        icon={<Icon className="h-5 w-5" />}
        actions={isPI ? <Link to="/pos/terminal" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> New sale</Link>
          : <Link to={`${config.base}/new`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> New invoice</Link>} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Net sales", value: formatMoney(d?.summary.sales ?? 0), hint: `${d?.total_count ?? 0} invoice${d?.total_count === 1 ? "" : "s"}`, icon: TrendingUp, g: "from-[#3092df] to-[#1bafb4]" },
          { label: "Tax collected", value: formatMoney(d?.summary.tax ?? 0), hint: "sales tax + FBR fee", icon: BadgeCheck, g: "from-[#f7cd7a] to-[#e08a2a]" },
          { label: "Still to collect", value: formatMoney(d?.summary.outstanding ?? 0), hint: "outstanding", icon: Clock, g: "from-amber-400 to-orange-600", warn: (d?.summary.outstanding ?? 0) > 0 },
          { label: "Returns", value: formatMoney(d?.summary.returns ?? 0), hint: "refunded", icon: RotateCcw, g: "from-rose-400 to-pink-600" },
        ].map((k) => (
          <div key={k.label} className="kpi-card relative overflow-hidden rounded-2xl border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">{k.label}</div>
                <div className={cn("mt-1.5 truncate text-2xl font-extrabold tabular-nums", k.warn && "text-amber-600 dark:text-amber-300")}>{k.value}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{k.hint}</div>
              </div>
              <span className={cn("icon-tile bg-gradient-to-br", k.g)}><k.icon className="h-5 w-5" /></span>
            </div>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="kpi-card flex flex-col gap-3 rounded-2xl border border-border p-3 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-wrap gap-1.5">
          {tabs.map(([k, label, n]) => (
            <button key={label} onClick={() => setStatus(k)}
              className={cn("inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold transition-all", status === k ? "bg-primary text-white" : "text-foreground/70 hover:bg-muted hover:text-foreground")}>
              {label}<span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", status === k ? "bg-white/25" : "bg-muted text-muted-foreground")}>{n}</span></button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isPI && (
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-9 rounded-xl border border-border bg-background px-3 text-sm" aria-label="Channel">
              <option value="">All channels</option>{["POS", "Web", "Phone", "Foodpanda", "Kiosk", "Dine-in"].map((c) => <option key={c}>{c}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 py-1">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 bg-transparent text-xs outline-none" aria-label="From date" />
            <span className="text-muted-foreground">→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 bg-transparent text-xs outline-none" aria-label="To date" />
          </div>
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice or customer…" className="h-9 w-56 rounded-xl border border-border bg-background pl-9 pr-3 text-sm" />
          </label>
        </div>
      </div>

      {/* rows */}
      {isLoading && !d ? <div className="space-y-2">{[0, 1, 2, 3, 4].map((k) => <div key={k} className="h-[72px] animate-pulse rounded-2xl bg-muted" />)}</div>
        : !groups.length ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-muted-foreground"><FileX2 className="h-10 w-10 opacity-60" />No invoices match these filters.</div>
        ) : (
          <div className="space-y-6">
            {groups.map(([day, rows]) => {
              const dayTotal = rows.filter((r) => r.docstatus === 1 && !r.is_return).reduce((a, r) => a + r.total, 0);
              return (
                <section key={day}>
                  <div className="mb-2 flex items-center gap-3 px-1">
                    <h3 className="text-sm font-bold">{dayLabel(day)}</h3>
                    <span className="text-xs text-muted-foreground">{rows.length} invoice{rows.length === 1 ? "" : "s"} · {formatMoney(dayTotal)}</span>
                    <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
                  </div>
                  <div className="kpi-card divide-y divide-border overflow-hidden rounded-2xl border border-border">
                    {rows.map((r) => {
                      const ch = r.ros_channel ? CHANNEL[r.ros_channel] : undefined;
                      return (
                        <button key={r.name} onClick={() => navigate(`${config.base}/${encodeURIComponent(r.name)}`)}
                          className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-primary/[0.05] md:grid-cols-[auto_1.4fr_1fr_auto_auto]">
                          <span className={cn("flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-sm font-bold text-white shadow-md", r.is_return ? "from-rose-400 to-pink-600" : AVATARS[hash(r.customer || r.name) % AVATARS.length])}>
                            {r.is_return ? <Undo2 className="h-5 w-5" /> : initials(r.customer_name || r.customer)}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{r.customer_name || r.customer}</span>
                            <span className="mt-0.5 flex items-center gap-2 truncate text-xs text-muted-foreground">
                              <span className="font-mono">{r.name}</span><span>·</span><span>{r.posting_time}</span>
                              {r.line_count ? <><span>·</span><span>{r.line_count} item{r.line_count === 1 ? "" : "s"}</span></> : null}
                            </span>
                          </span>
                          <span className="hidden min-w-0 flex-wrap items-center gap-1.5 md:flex">
                            {ch && r.ros_channel && <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-[11px] font-semibold"><ch.icon className={cn("h-3.5 w-3.5", ch.cls)} />{r.ros_channel}</span>}
                            {(r.modes || "").split(", ").filter(Boolean).slice(0, 2).map((m) => { const M = modeIcon(m); return <span key={m} className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-[11px] font-medium text-foreground/80"><M className="h-3.5 w-3.5" />{m}</span>; })}
                            {r.fbr_invoice_number && <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"><BadgeCheck className="h-3.5 w-3.5" />FBR</span>}
                            <span className="text-[11px] text-muted-foreground">by {r.cashier.split(" ")[0]}</span>
                          </span>
                          <span className="text-right">
                            <span className={cn("block text-base font-extrabold tabular-nums", r.is_return && "text-rose-600 dark:text-rose-400")}>{formatMoney(r.total)}</span>
                            {r.outstanding_amount > 0.005 && <span className="block text-[11px] font-semibold text-amber-600 dark:text-amber-300">{formatMoney(r.outstanding_amount)} due</span>}
                          </span>
                          <span className="hidden items-center gap-2 md:flex">
                            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1", STATUS_STYLE[r.status] ?? STATUS_STYLE.Draft)}>{r.status}</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {d && d.rows.length < d.total_count && (
              <div className="flex justify-center"><button onClick={() => setLimit((l) => l + 40)} className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold hover:bg-muted">
                Show more · {d.total_count - d.rows.length} left</button></div>
            )}
          </div>
        )}
    </div>
  );
}
