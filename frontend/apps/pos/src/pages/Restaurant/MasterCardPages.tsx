import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import { Armchair, ChefHat, ChevronRight, Coffee, CookingPot, Flame, MonitorPlay, Phone, Plus, Snowflake, Search, SlidersVertical, Sparkles, Star, Sun, Users, UtensilsCrossed, Wheat } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DocConfig } from "@/components/doc/doc-config";
import { PageHeader } from "@/components/common/page-header";
import { formatMoney } from "@/utils/currency";
import { cn } from "@/utils/cn";

/* Card views for restaurant masters (config.listPage): a richer overview than the table, same form behind each card. */

const TONES = [
  { band: "from-teal-500 to-emerald-600", soft: "bg-teal-500/10 text-teal-700 dark:text-teal-300", ring: "hover:ring-teal-500/40", bar: "bg-teal-500" },
  { band: "from-violet-500 to-indigo-600", soft: "bg-violet-500/10 text-violet-700 dark:text-violet-300", ring: "hover:ring-violet-500/40", bar: "bg-violet-500" },
  { band: "from-amber-400 to-orange-500", soft: "bg-amber-500/10 text-amber-700 dark:text-amber-300", ring: "hover:ring-amber-500/40", bar: "bg-amber-500" },
  { band: "from-sky-500 to-blue-600", soft: "bg-sky-500/10 text-sky-700 dark:text-sky-300", ring: "hover:ring-sky-500/40", bar: "bg-sky-500" },
  { band: "from-rose-500 to-pink-600", soft: "bg-rose-500/10 text-rose-700 dark:text-rose-300", ring: "hover:ring-rose-500/40", bar: "bg-rose-500" },
];
const tone = (i: number) => TONES[i % TONES.length];

function Shell({ config, count, q, setQ, children }: { config: DocConfig; count?: number; q: string; setQ: (v: string) => void; children: React.ReactNode }) {
  const Icon = config.icon;
  return (
    <div className="space-y-5">
      <PageHeader title={config.plural} subtitle={config.subtitle} icon={Icon ? <Icon className="h-5 w-5" /> : undefined}
        badge={count != null ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{count}</span> : undefined}
        actions={
          <div className="flex items-center gap-2">
            <label className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${config.plural.toLowerCase()}…`}
                className="h-9 w-56 rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus:border-primary focus:outline-none" />
            </label>
            <Link to={`${config.base}/new`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95">
              <Plus className="h-4 w-4" /> New {config.singular.toLowerCase()}</Link>
          </div>} />
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">{text}</div>;
}

function Skeletons() {
  return <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((k) => <div key={k} className="h-72 animate-pulse rounded-3xl bg-muted" />)}</div>;
}

/* ------------------------------------------------------------------ floor areas */
interface TableRow { name: string; table_number: string; seats: number; status: string; guests: number; shape: string; seated_at?: string; total: number }
interface Area { name: string; area_name: string; branch: string; tables: TableRow[]; seats: number; occupied: number; guests: number; open_total: number }

const areaIcon = (n: string): LucideIcon => (/roof|terrace|garden|outdoor/i.test(n) ? Sun : /family|private/i.test(n) ? Users : /cafe|lounge/i.test(n) ? Coffee : UtensilsCrossed);
const STATUS: Record<string, string> = {
  Free: "border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300",
  Occupied: "border-transparent bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_6px_14px_-6px_rgba(245,158,11,.8)]",
  Reserved: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  Cleaning: "border-border bg-muted text-muted-foreground",
};

export function FloorAreasPage({ config }: { config: DocConfig }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { data, isLoading } = useFrappeGetCall<{ message: Area[] }>("restaurant_os.api.views.floor_areas", undefined, "ros.views.floor_areas", { refreshInterval: 20000 });
  const areas = useMemo(() => (data?.message ?? []).filter((a) => !q || `${a.area_name} ${a.branch}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  return (
    <Shell config={config} count={data?.message?.length} q={q} setQ={setQ}>
      {isLoading ? <Skeletons /> : !areas.length ? <Empty text="No floor areas yet — add one to start placing tables." /> : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {areas.map((a, k) => {
            const t = tone(k);
            const Icon = areaIcon(a.area_name);
            const pct = a.tables.length ? Math.round((a.occupied / a.tables.length) * 100) : 0;
            return (
              <article key={a.name} onClick={() => navigate(`${config.base}/${encodeURIComponent(a.name)}`)}
                className={cn("group cursor-pointer overflow-hidden rounded-3xl border border-border bg-card shadow-sm ring-1 ring-transparent transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl", t.ring)}>
                <div className={cn("relative overflow-hidden bg-gradient-to-br px-5 pb-5 pt-4 text-white", t.band)}>
                  <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
                  <Icon className="pointer-events-none absolute -bottom-4 right-3 h-24 w-24 text-white/10" strokeWidth={1.25} />
                  <div className="relative flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-inset ring-white/30 backdrop-blur"><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-xl font-bold tracking-tight">{a.area_name}</h3>
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/75">{a.branch}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-white/70 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
                    {[["Tables", a.tables.length], ["Seats", a.seats], ["Guests now", a.guests]].map(([label, v]) => (
                      <div key={label as string} className="rounded-xl bg-white/15 px-2 py-1.5 backdrop-blur">
                        <div className="text-lg font-bold tabular-nums leading-tight">{v}</div>
                        <div className="text-[10px] font-medium uppercase tracking-wider text-white/75">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">Occupancy</span>
                      <span className="font-semibold tabular-nums">{a.occupied}/{a.tables.length} · {pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-all duration-700", t.bar)} style={{ width: `${pct}%` }} /></div>
                  </div>
                  {a.tables.length ? (
                    <div className="flex flex-wrap gap-2">
                      {a.tables.map((tb) => (
                        <span key={tb.name} title={`${tb.table_number} · ${tb.seats} seats · ${tb.status}${tb.status === "Occupied" ? ` · ${tb.guests} guests · ${formatMoney(tb.total)}` : ""}`}
                          className={cn("flex h-12 min-w-12 flex-col items-center justify-center border px-2 text-xs font-bold leading-tight", tb.shape === "Round" ? "rounded-full" : "rounded-xl", STATUS[tb.status] ?? STATUS.Free)}>
                          {tb.table_number}
                          <span className="text-[10px] font-medium opacity-80">{tb.status === "Occupied" ? `${tb.guests}/${tb.seats}` : `${tb.seats} seats`}</span>
                        </span>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">No tables in this area yet.</p>}
                  <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                    <span className="text-muted-foreground">{a.open_total ? <>Open bills <b className="text-foreground">{formatMoney(a.open_total)}</b></> : "No open bills"}</span>
                    <Link to="/pos/tables" onClick={(e) => e.stopPropagation()} className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold", t.soft)}>
                      <Armchair className="h-3.5 w-3.5" /> Table map</Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {Object.entries({ Free: "Free", Occupied: "Occupied", Reserved: "Reserved", Cleaning: "Cleaning" }).map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className={cn("h-3 w-3 rounded border", STATUS[k])} />{label}</span>))}
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ menu modifier groups */
interface Modifier { name: string; price: number; item?: string; is_default: number }
interface Group { name: string; group_name: string; min_select: number; max_select: number; required: number; disabled: number; modifiers: Modifier[]; items: { item: string; item_name: string; image?: string }[] }

const groupIcon = (n: string): LucideIcon => (/spice|heat|chilli|chili/i.test(n) ? Flame : /bread|naan|roti|paratha/i.test(n) ? Wheat : /cheese|extra|topping/i.test(n) ? Sparkles : SlidersVertical);
const rule = (g: Group) => {
  const max = g.max_select || 0, min = g.min_select || (g.required ? 1 : 0);
  if (max === 1) return min ? "Choose 1" : "Up to 1";
  if (max > 1) return min ? `Choose ${min}–${max}` : `Up to ${max}`;
  return min ? `At least ${min}` : "Any number";
};

export function ModifierGroupsPage({ config }: { config: DocConfig }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { data, isLoading } = useFrappeGetCall<{ message: Group[] }>("restaurant_os.api.views.modifier_groups", undefined, "ros.views.modifier_groups");
  const groups = useMemo(() => (data?.message ?? []).filter((g) => !q || `${g.group_name} ${g.modifiers.map((m) => m.name).join(" ")} ${g.items.map((i) => i.item_name).join(" ")}`
    .toLowerCase().includes(q.toLowerCase())), [data, q]);
  return (
    <Shell config={config} count={data?.message?.length} q={q} setQ={setQ}>
      {isLoading ? <Skeletons /> : !groups.length ? <Empty text="No modifier groups yet — add choices like spice level or extra cheese." /> : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g, k) => {
            const t = tone(k);
            const Icon = groupIcon(g.group_name);
            const shown = g.items.slice(0, 6);
            return (
              <article key={g.name} onClick={() => navigate(`${config.base}/${encodeURIComponent(g.name)}`)}
                className={cn("group flex cursor-pointer flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm ring-1 ring-transparent transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl",
                  t.ring, g.disabled && "opacity-60")}>
                <div className="flex items-start gap-3.5 p-5 pb-4">
                  <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md", t.band)}><Icon className="h-6 w-6" /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-bold tracking-tight">{g.group_name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                      <span className={cn("rounded-full px-2 py-0.5", g.required ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-muted text-muted-foreground")}>{g.required ? "Required" : "Optional"}</span>
                      <span className={cn("rounded-full px-2 py-0.5", t.soft)}>{rule(g)}</span>
                      {g.disabled ? <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Disabled</span> : null}
                    </div>
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="flex-1 px-5">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Choices · {g.modifiers.length}</div>
                  <div className="flex flex-wrap gap-2">
                    {g.modifiers.map((m) => (
                      <span key={m.name} className={cn("inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm",
                        m.is_default ? "border-primary/40 bg-primary/[0.07] font-semibold" : "border-border bg-background")}>
                        {m.is_default ? <Star className="h-3.5 w-3.5 fill-current text-primary" /> : null}
                        {m.name}
                        <span className={cn("text-xs tabular-nums", m.price ? "font-semibold text-foreground/80" : "text-muted-foreground")}>{m.price ? `+${formatMoney(m.price)}` : "free"}</span>
                      </span>
                    ))}
                    {!g.modifiers.length && <span className="text-sm text-muted-foreground">No choices yet.</span>}
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-3 border-t border-border bg-muted/30 px-5 py-3.5">
                  <div className="flex -space-x-2.5">
                    {shown.map((i) => i.image
                      ? <img key={i.item} src={i.image} alt="" title={i.item_name} className="h-9 w-9 rounded-full border-2 border-card object-cover" />
                      : <span key={i.item} title={i.item_name} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-muted text-xs font-bold text-muted-foreground">{i.item_name.slice(0, 1)}</span>)}
                    {g.items.length > shown.length && <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-muted text-[11px] font-bold text-muted-foreground">+{g.items.length - shown.length}</span>}
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-semibold">{g.items.length ? `Offered on ${g.items.length} dish${g.items.length === 1 ? "" : "es"}` : "Not on any dish yet"}</div>
                    {g.items.length ? <div className="truncate text-xs text-muted-foreground">{g.items.map((i) => i.item_name).join(" · ")}</div> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ tables */
const since = (iso?: string) => {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso.replace(" ", "T")).getTime()) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} m`;
};
const STATUS_PILL: Record<string, string> = {
  Free: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", Occupied: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  Reserved: "bg-violet-500/10 text-violet-700 dark:text-violet-300", Cleaning: "bg-muted text-muted-foreground",
};

/** A small top-down drawing of the table: chairs around a round or square top, filled for guests seated. */
function TableArt({ t }: { t: TableRow }) {
  const seats = Math.max(1, Math.min(t.seats || 2, 12));
  const filled = t.status === "Occupied" ? Math.min(t.guests || 0, seats) : 0;
  const round = t.shape === "Round";
  const busy = t.status === "Occupied";
  return (
    <div className="relative mx-auto h-28 w-28">
      {Array.from({ length: seats }).map((_, i) => {
        const a = (i / seats) * Math.PI * 2 - Math.PI / 2;
        return <span key={i} className={cn("absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-md transition-colors",
          i < filled ? "bg-amber-500" : "bg-muted-foreground/25")} style={{ left: `${50 + 44 * Math.cos(a)}%`, top: `${50 + 44 * Math.sin(a)}%` }} />;
      })}
      <div className={cn("absolute inset-[22%] flex flex-col items-center justify-center shadow-inner transition-colors", round ? "rounded-full" : "rounded-2xl",
        busy ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white" : t.status === "Reserved" ? "bg-violet-500/15 text-violet-700 dark:text-violet-200"
          : "bg-gradient-to-br from-emerald-500/15 to-teal-500/10 text-emerald-800 dark:text-emerald-200")}>
        <span className="text-xl font-extrabold leading-none tracking-tight">{t.table_number}</span>
      </div>
    </div>
  );
}

export function TablesPage({ config }: { config: DocConfig }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const { data, isLoading } = useFrappeGetCall<{ message: Area[] }>("restaurant_os.api.views.floor_areas", undefined, "ros.views.floor_areas", { refreshInterval: 15000 });
  const areas = data?.message ?? [];
  const all = areas.flatMap((a) => a.tables);
  const counts = all.reduce<Record<string, number>>((m, t) => ({ ...m, [t.status]: (m[t.status] ?? 0) + 1 }), {});
  const match = (t: TableRow, a: Area) => (!status || t.status === status) && (!q || `${t.table_number} ${a.area_name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Shell config={config} count={all.length} q={q} setQ={setQ}>
      <div className="flex flex-wrap gap-2">
        {[["", "All", all.length], ...["Free", "Occupied", "Reserved", "Cleaning"].map((s) => [s, s, counts[s] ?? 0])].map(([k, label, n]) => (
          <button key={label as string} onClick={() => setStatus(k as string)}
            className={cn("inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
              status === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
            {label}<span className={cn("rounded-full px-1.5 text-xs tabular-nums", status === k ? "bg-white/20" : "bg-muted")}>{n as number}</span></button>
        ))}
      </div>
      {isLoading ? <Skeletons /> : !all.length ? <Empty text="No tables yet — add tables to a floor area." /> : areas.map((a, k) => {
        const rows = a.tables.filter((t) => match(t, a));
        if (!rows.length) return null;
        const Icon = areaIcon(a.area_name);
        return (
          <section key={a.name} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow", tone(k).band)}><Icon className="h-4 w-4" /></span>
              <div><h3 className="text-lg font-bold leading-tight">{a.area_name}</h3><p className="text-xs text-muted-foreground">{a.branch} · {a.tables.length} tables · {a.seats} seats · {a.occupied} occupied</p></div>
              <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {rows.map((t) => (
                <article key={t.name} onClick={() => navigate(`${config.base}/${encodeURIComponent(t.name)}`)}
                  className={cn("group cursor-pointer rounded-3xl border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl",
                    t.status === "Occupied" ? "border-amber-500/40 ring-1 ring-amber-500/20" : "border-border")}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_PILL[t.status] ?? STATUS_PILL.Free)}>{t.status}</span>
                    <span className="text-[11px] text-muted-foreground">{t.shape || "Square"}</span>
                  </div>
                  <TableArt t={t} />
                  <div className="mt-2 text-center">
                    {t.status === "Occupied" ? (
                      <>
                        <div className="text-sm font-semibold">{t.guests} of {t.seats} guests · {since(t.seated_at)}</div>
                        <div className="text-base font-bold tabular-nums text-amber-700 dark:text-amber-300">{formatMoney(t.total)}</div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-semibold">{t.seats} seats</div>
                        <div className="text-xs text-muted-foreground">{t.status === "Free" ? "Ready for guests" : t.status}</div>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </Shell>
  );
}

/* ------------------------------------------------------------------ riders */
interface RiderRow { name: string; rider_name: string; photo?: string; phone?: string; branch: string; vehicle?: string; vehicle_number?: string; status: string;
  last_seen?: string; cash_in_hand: number; disabled: number; delivered_today: number; avg_minutes?: number | null; active: number; on_duty_since?: string | null }

const RIDER_STATUS: Record<string, { band: string; dot: string; pill: string }> = {
  Available: { band: "from-emerald-500 to-teal-600", dot: "bg-emerald-400", pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  "On Delivery": { band: "from-sky-500 to-indigo-600", dot: "bg-sky-400", pill: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  "Off Duty": { band: "from-slate-500 to-slate-700", dot: "bg-slate-400", pill: "bg-muted text-muted-foreground" },
};
const ago = (iso?: string | null) => {
  if (!iso) return "never";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso.replace(" ", "T")).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`;
};
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export function RidersPage({ config }: { config: DocConfig }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { data, isLoading } = useFrappeGetCall<{ message: RiderRow[] }>("restaurant_os.api.views.riders", undefined, "ros.views.riders", { refreshInterval: 20000 });
  const rows = (data?.message ?? []).filter((r) => !q || `${r.rider_name} ${r.phone ?? ""} ${r.vehicle_number ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Shell config={config} count={data?.message?.length} q={q} setQ={setQ}>
      {isLoading ? <Skeletons /> : !rows.length ? <Empty text="No riders yet — add one with a login for the rider app." /> : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((r) => {
            const st = RIDER_STATUS[r.status] ?? RIDER_STATUS["Off Duty"];
            return (
              <article key={r.name} onClick={() => navigate(`${config.base}/${encodeURIComponent(r.name)}`)}
                className={cn("group cursor-pointer overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl", r.disabled && "opacity-55")}>
                <div className={cn("relative h-24 bg-gradient-to-br", st.band)}>
                  <div className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
                  <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                    <span className={cn("h-2 w-2 rounded-full", st.dot, r.status !== "Off Duty" && "animate-pulse")} />{r.status}</span>
                </div>
                <div className="relative z-10 -mt-12 flex flex-col items-center px-5 text-center">
                  {r.photo
                    ? <img src={r.photo} alt="" className="h-24 w-24 rounded-full border-4 border-card object-cover shadow-lg" />
                    : <span className={cn("flex h-24 w-24 items-center justify-center rounded-full border-4 border-card bg-gradient-to-br text-3xl font-bold text-white shadow-lg", st.band)}>{initials(r.rider_name)}</span>}
                  <h3 className="mt-3 text-lg font-bold tracking-tight">{r.rider_name}</h3>
                  <p className="text-sm text-muted-foreground">{r.vehicle || "Motorbike"}{r.vehicle_number ? ` · ${r.vehicle_number}` : ""} · {r.branch}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{r.on_duty_since ? `On duty since ${new Date(r.on_duty_since.replace(" ", "T")).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : `Last seen ${ago(r.last_seen)}`}</p>
                </div>
                <div className="mx-5 mt-4 grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-muted/30 text-center">
                  {[["Today", r.delivered_today], ["Active", r.active], ["Avg", r.avg_minutes ? `${r.avg_minutes}m` : "—"]].map(([label, v]) => (
                    <div key={label as string} className="py-2.5"><div className="text-lg font-bold tabular-nums leading-tight">{v}</div><div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div></div>
                  ))}
                </div>
                <div className="flex items-center justify-between px-5 py-4 text-sm">
                  <span className="text-muted-foreground">Cash in hand <b className={cn("tabular-nums", r.cash_in_hand ? "text-amber-700 dark:text-amber-300" : "text-foreground")}>{formatMoney(r.cash_in_hand)}</b></span>
                  {r.phone && <a href={`tel:${r.phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white shadow hover:bg-emerald-500" aria-label={`Call ${r.rider_name}`}><Phone className="h-4 w-4" /></a>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ kitchen stations */
interface StationRow { name: string; station_name: string; branch: string; color?: string; printer?: string; disabled: number; item_groups: string[];
  dishes: { item: string; item_name: string; image?: string }[]; queued: number; preparing: number; ready: number }

const STATION_COLORS = ["#0d9488", "#7c3aed", "#f59e0b", "#0284c7", "#e11d48", "#16a34a"];
const stationIcon = (n: string): LucideIcon => (/grill|bbq|tandoor/i.test(n) ? Flame : /fry|fryer/i.test(n) ? Sparkles : /drink|bar|bev/i.test(n) ? Coffee : /cold|salad/i.test(n) ? Snowflake : /handi|curry|pot/i.test(n) ? CookingPot : ChefHat);

export function StationsPage({ config }: { config: DocConfig }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { data, isLoading } = useFrappeGetCall<{ message: StationRow[] }>("restaurant_os.api.views.stations", undefined, "ros.views.stations", { refreshInterval: 15000 });
  const rows = (data?.message ?? []).filter((s) => !q || `${s.station_name} ${s.item_groups.join(" ")} ${s.dishes.map((d) => d.item_name).join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Shell config={config} count={data?.message?.length} q={q} setQ={setQ}>
      {isLoading ? <Skeletons /> : !rows.length ? <Empty text="No kitchen stations yet — add Grill, Fryer, Drinks…" /> : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((s, k) => {
            const color = s.color || STATION_COLORS[k % STATION_COLORS.length];
            const Icon = stationIcon(s.station_name);
            const open = s.queued + s.preparing;
            const shown = s.dishes.slice(0, 7);
            return (
              <article key={s.name} onClick={() => navigate(`${config.base}/${encodeURIComponent(s.name)}`)}
                className={cn("group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl", s.disabled && "opacity-55")}>
                <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: color }} />
                <div className="flex items-start gap-3.5 p-5 pb-3">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)`, boxShadow: `0 12px 24px -12px ${color}` }}>
                    <Icon className="h-7 w-7" /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-xl font-bold tracking-tight">{s.station_name}</h3>
                    <p className="text-xs text-muted-foreground">{s.branch}{s.printer ? ` · printer ${s.printer}` : " · no printer yet"}</p>
                  </div>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", open ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>
                    <span className={cn("h-2 w-2 rounded-full", open ? "animate-pulse bg-amber-500" : "bg-emerald-500")} />{open ? "Cooking" : "Clear"}</span>
                </div>
                <div className="mx-5 grid grid-cols-3 gap-2 text-center">
                  {[["Queued", s.queued, "text-slate-600 dark:text-slate-300"], ["Preparing", s.preparing, "text-amber-600 dark:text-amber-300"], ["Ready", s.ready, "text-emerald-600 dark:text-emerald-300"]].map(([label, v, cls]) => (
                    <div key={label as string} className="rounded-2xl border border-border bg-muted/30 py-2.5">
                      <div className={cn("text-2xl font-bold tabular-nums leading-tight", cls as string)}>{v as number}</div>
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="flex-1 px-5 pt-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Cooks</div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.item_groups.map((g) => <span key={g} className="rounded-lg px-2.5 py-1 text-xs font-semibold" style={{ background: `${color}1f`, color }}>{g}</span>)}
                    {!s.item_groups.length && <span className="text-xs text-muted-foreground">Picked dishes only</span>}
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3 border-t border-border bg-muted/30 px-5 py-3.5">
                  <div className="flex -space-x-2.5">
                    {shown.map((d) => d.image
                      ? <img key={d.item} src={d.image} alt="" title={d.item_name} className="h-9 w-9 rounded-full border-2 border-card object-cover" />
                      : <span key={d.item} title={d.item_name} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-muted text-xs font-bold text-muted-foreground">{d.item_name.slice(0, 1)}</span>)}
                    {s.dishes.length > shown.length && <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-muted text-[11px] font-bold text-muted-foreground">+{s.dishes.length - shown.length}</span>}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.dishes.length} dish{s.dishes.length === 1 ? "" : "es"}</span>
                  <Link to="/kds" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold" style={{ background: `${color}1f`, color }}>
                    <MonitorPlay className="h-3.5 w-3.5" /> KDS</Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
