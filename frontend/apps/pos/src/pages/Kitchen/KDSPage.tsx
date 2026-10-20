import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useFrappeEventListener, useFrappeGetCall } from "frappe-react-sdk";
import toast from "react-hot-toast";
import {
  ArrowLeft, Bike, Check, ChefHat, CircleDashed, Clock, History, ListOrdered, Maximize2, MoreVertical, Printer, RotateCcw, Store,
  Timer, Utensils, Volume2, VolumeX, Zap,
} from "lucide-react";
import { Logo } from "@/components/common/logo";
import { humanizeError, postCall } from "@/services/frappe";
import { printHtml } from "@/pages/POS/pos-receipt";
import { cn } from "@/utils/cn";

interface Line { row: string; item_code: string; item_name: string; qty: number; uom?: string; notes?: string; modifiers?: string;
  status: "Queued" | "Preparing" | "Ready" | "Served" | "Void"; round: number; station?: string; station_name?: string; image?: string }
interface Card { name: string; order_no: string; status: string; column: Column; channel: string; order_type: string; table?: string;
  table_label?: string; guests?: number; customer_name?: string; notes?: string; created: string; updated: string; progress: number;
  latest_round: number; items: Line[]; invoice?: string; stock_status?: string; rider_name?: string; delivery_by?: string }
interface Board { branch: string; branches: string[]; stations: { name: string; station_name: string; color?: string }[];
  settings: { amber: number; red: number; sound: number }; now: string; cards: Card[]; counts: Record<Column, number>;
  all_day: { item: string; qty: number }[] }
type Column = "Placed" | "Preparing" | "Ready" | "Completed";

const COLUMNS: Column[] = ["Placed", "Preparing", "Ready", "Completed"];
/** Card header colour by order type (as on the pass: dine-in red, walk-in black, delivery amber, pickup blue). */
const TYPE_STYLE: Record<string, { label: string; cls: string }> = {
  "Dine-in": { label: "Dine In", cls: "bg-gradient-to-r from-red-600 to-red-500 text-white" },
  Takeaway: { label: "Walk In", cls: "bg-gradient-to-r from-neutral-900 to-neutral-700 text-white" },
  Delivery: { label: "Delivery", cls: "bg-gradient-to-r from-amber-500 to-yellow-400 text-neutral-900" },
  Pickup: { label: "Pickup", cls: "bg-gradient-to-r from-sky-600 to-sky-500 text-white" },
};
/** Footer button by status. */
const FOOT: Record<Column, string> = {
  Placed: "bg-blue-700 hover:bg-blue-600 text-white",
  Preparing: "bg-teal-700 hover:bg-teal-600 text-white",
  Ready: "bg-amber-400 hover:bg-amber-300 text-neutral-900",
  Completed: "bg-green-600 text-white",
};
const NEXT: Record<Column, string> = { Placed: "Start cooking", Preparing: "Mark ready", Ready: "Serve / hand over", Completed: "" };
/** Delivery orders keep moving after the kitchen: Picked Up → Out for Delivery (own riders) → Delivered. */
const DISPATCH = ["Picked Up", "Out for Delivery"];
const nextDispatch = (c: Card) => (c.status === "Out for Delivery" || c.channel === "Foodpanda" ? "Mark delivered" : "Out for delivery");

const parse = (s: string) => new Date(s.replace(" ", "T"));
function ago(ms: number) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} hour${h > 1 ? "s" : ""} ago` : `${Math.floor(h / 24)} day${h >= 48 ? "s" : ""} ago`;
}
const clock = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Short double beep for a new ticket (WebAudio, no asset needed). */
function beep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    [0, 0.22].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
    });
  } catch { /* no audio */ }
}

const STORE = "ros.kds";
function useStored<T>(key: string, fallback: T) {
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(`${STORE}.${key}`); return s === null ? fallback : JSON.parse(s); } catch { return fallback; } });
  useEffect(() => { try { localStorage.setItem(`${STORE}.${key}`, JSON.stringify(v)); } catch { /* private mode */ } }, [key, v]);
  return [v, setV] as const;
}

function ticketHtml(c: Card) {
  const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]!));
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:80mm auto;margin:3mm}body{font:13px/1.35 monospace;width:74mm}
    h1{font-size:20px;margin:0 0 2mm;text-align:center}.r{display:flex;gap:2mm}.q{font-weight:700;min-width:8mm}.n{font-size:11px;padding-left:10mm}
    hr{border:0;border-top:1px dashed #000}</style></head><body>
    <h1>${esc(TYPE_STYLE[c.order_type]?.label ?? c.order_type)} #${esc(c.order_no)}</h1>
    <div>${c.table_label ? `Table ${esc(c.table_label)} · ` : ""}${esc(c.channel)} · ${esc(clock(parse(c.created)))}</div><hr>
    ${c.items.map((i) => `<div class="r"><span class="q">${i.qty}x</span><span>${esc(i.item_name)}</span></div>${i.notes ? `<div class="n">${esc(i.notes)}</div>` : ""}`).join("")}
    ${c.notes ? `<hr><div>${esc(c.notes)}</div>` : ""}</body></html>`;
}

/** Kitchen Display — a status board of every order (all channels), live over Socket.IO, filterable by station. */
export default function KDSPage() {
  const [branch, setBranch] = useStored<string>("branch", "");
  const [station, setStation] = useStored<string>("station", "");
  const [sound, setSound] = useStored<boolean>("sound", true);
  const [past, setPast] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { data, mutate } = useFrappeGetCall<{ message: Board }>("restaurant_os.api.kds.board",
    { branch: branch || undefined, station: station || undefined, past: past ? 1 : 0 }, `ros.kds.${branch}.${station}.${past}`,
    { refreshInterval: 15000, revalidateOnFocus: true });
  const board = data?.message;
  const offset = useMemo(() => (board ? parse(board.now).getTime() - Date.now() : 0), [board]);
  useFrappeEventListener("ros_kds", () => void mutate());
  const { data: avail, mutate: mutateAvail } = useFrappeGetCall<{ message: { sold_out: { item_code: string; item_name: string }[]; items: { item_code: string; item_name: string; portions: number }[] } }>(
    "restaurant_os.services.availability.board", { branch: branch || undefined }, `ros.avail.${branch}`, { refreshInterval: 60000 });
  useFrappeEventListener("ros_availability", () => void mutateAvail());
  const low = (avail?.message?.items ?? []).filter((i) => i.portions > 0 && i.portions <= 5);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // sound on tickets we haven't seen yet
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!board) return;
    const names = new Set(board.cards.filter((c) => c.column === "Placed").map((c) => c.name));
    if (seen.current && sound && board.settings.sound && [...names].some((n) => !seen.current!.has(n))) beep();
    seen.current = new Set([...(seen.current ?? []), ...names]);
  }, [board, sound]);

  const act = useCallback(async (key: string, method: string, args: Record<string, unknown>) => {
    setBusy(key);
    try { await postCall(`restaurant_os.api.kds.${method}`, args); await mutate(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(null); }
  }, [mutate]);

  const simulate = async () => {
    try { const r = await postCall<{ order_no: string }>("restaurant_os.api.integrations.simulate_foodpanda_order", { items: 2 }); toast.success(`Foodpanda order #${r.order_no}`); void mutate(); }
    catch (e) { toast.error(humanizeError(e)); }
  };

  const serverNow = now + offset;
  const amber = (board?.settings.amber ?? 8) * 60000;
  const red = (board?.settings.red ?? 15) * 60000;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-3 dark:border-white/10 dark:bg-neutral-900">
        <Link to="/pos" className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-white/10" title="Back to POS"><ArrowLeft className="h-5 w-5" /></Link>
        <Logo className="h-8 w-auto" />
        <span className="ml-1 hidden items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary sm:inline-flex"><ChefHat className="h-3.5 w-3.5" /> Kitchen Display</span>
        <div className="mx-auto text-xl font-semibold tabular-nums">{new Date(serverNow).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
        {board && board.branches.length > 1 && (
          <select value={board.branch} onChange={(e) => setBranch(e.target.value)} className="h-9 rounded-md border border-neutral-300 bg-transparent px-2 text-sm dark:border-white/15">
            {board.branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        <button onClick={() => setAllDay((v) => !v)} className={cn("hidden h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold md:inline-flex", allDay ? "bg-primary text-primary-foreground" : "hover:bg-neutral-100 dark:hover:bg-white/10")}>
          <ListOrdered className="h-4 w-4" /> All day · 86
          {(avail?.message?.sold_out.length ?? 0) > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] text-white">{avail!.message.sold_out.length}</span>}</button>
        <button onClick={() => setPast((v) => !v)} className={cn("h-9 rounded-md px-3 text-xs font-bold uppercase tracking-wide", past ? "bg-violet-700 text-white" : "bg-violet-900 text-white hover:bg-violet-800")}>
          <History className="mr-1 inline h-4 w-4" />{past ? "Today only" : "Load past orders"}</button>
        <button onClick={() => setSound((v) => !v)} className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-white/10" title={sound ? "Mute" : "Sound on"}>
          {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 text-red-500" />}</button>
        <button onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)} className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-white/10" title="Full screen"><Maximize2 className="h-5 w-5" /></button>
        <button onClick={() => void simulate()} className="hidden rounded-lg p-2 text-pink-600 hover:bg-pink-50 dark:hover:bg-white/10 lg:block" title="Simulate a Foodpanda order (mock mode)"><Zap className="h-5 w-5" /></button>
      </header>

      {/* station chips */}
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-neutral-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-neutral-900">
        {[{ name: "", station_name: "All stations" }, ...(board?.stations ?? [])].map((s) => (
          <button key={s.name} onClick={() => setStation(s.name)}
            className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              station === s.name ? "border-primary bg-primary text-primary-foreground" : "border-neutral-300 hover:bg-neutral-100 dark:border-white/15 dark:hover:bg-white/10")}>
            {s.station_name}</button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* columns */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-x-auto bg-neutral-200 dark:bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const cards = (board?.cards ?? []).filter((c) => c.column === col);
            return (
              <section key={col} className="flex min-h-0 min-w-[280px] flex-col bg-neutral-100 dark:bg-neutral-950">
                <div className="shrink-0 border-b border-neutral-200 bg-white py-2 text-center dark:border-white/10 dark:bg-neutral-900">
                  <div className="text-base font-bold">{col}</div>
                  <div className="text-xs text-neutral-500">{board?.counts[col] ?? 0}</div>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  {cards.length === 0 && <p className="pt-10 text-center text-sm text-neutral-400">No orders</p>}
                  {cards.map((c) => (
                    <TicketCard key={c.name} card={c} now={serverNow} amber={amber} red={red} busy={busy}
                      onAdvance={() => void act(c.name, "advance", { order: c.name, station: station || undefined })}
                      onBump={(row) => void act(row, "bump_item", { order: c.name, row })}
                      onRecall={() => void act(c.name, "recall", { order: c.name })} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        {allDay && (
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900 md:block">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-red-600">86 — sold out</h3>
            {(avail?.message?.sold_out ?? []).length === 0 ? <p className="mb-4 text-sm text-neutral-400">Everything available</p> : (
              <ul className="mb-4 space-y-1">{avail!.message.sold_out.map((s) => (
                <li key={s.item_code} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-sm font-medium text-red-700 line-through dark:bg-red-500/15 dark:text-red-300">{s.item_name}</li>
              ))}</ul>
            )}
            {low.length > 0 && <>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-600">Running low (portions)</h3>
              <ul className="mb-4 space-y-1">{low.map((s) => (
                <li key={s.item_code} className="flex justify-between rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm dark:bg-amber-500/15"><span className="truncate">{s.item_name}</span><b>{s.portions}</b></li>
              ))}</ul>
            </>}
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">All day — to cook</h3>
            {(board?.all_day ?? []).length === 0 ? <p className="text-sm text-neutral-400">Nothing waiting</p> : (
              <ul className="space-y-1.5">{board!.all_day.map((a) => (
                <li key={a.item} className="flex items-center justify-between rounded-lg bg-neutral-100 px-2.5 py-1.5 text-sm dark:bg-white/5">
                  <span className="truncate">{a.item}</span><span className="ml-2 rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground">{a.qty}</span></li>
              ))}</ul>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function TicketCard({ card: c, now, amber, red, busy, onAdvance, onBump, onRecall }: {
  card: Card; now: number; amber: number; red: number; busy: string | null; onAdvance: () => void; onBump: (row: string) => void; onRecall: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const style = TYPE_STYLE[c.order_type] ?? TYPE_STYLE.Takeaway;
  const created = parse(c.created).getTime();
  const updated = parse(c.updated).getTime();
  const age = now - created;
  const open = c.column !== "Completed";
  const dispatch = DISPATCH.includes(c.status);           // a delivery card past the kitchen, still to be delivered
  const ageCls = !open ? "" : age >= red ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" : age >= amber ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300" : "";
  const multi = c.latest_round > 1;
  const fresh = multi ? c.items.filter((i) => i.round === c.latest_round) : c.items;
  const older = multi ? c.items.filter((i) => i.round < c.latest_round) : [];
  let n = 0;
  const line = (i: Line) => {
    n += 1;
    const icon = i.status === "Ready" || i.status === "Served" ? <Check className="h-4 w-4 text-white" /> : i.status === "Preparing" ? <Timer className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />;
    return (
      <button key={i.row} disabled={!open || busy === i.row} onClick={() => onBump(i.row)}
        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-neutral-50 disabled:cursor-default dark:hover:bg-white/5">
        <span className="w-4 pt-1 text-xs text-neutral-500">{n}.</span>
        {i.image ? <img src={i.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover" /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-neutral-200 dark:bg-white/10"><Utensils className="h-4 w-4 text-neutral-500" /></span>}
        <span className="mt-0.5 flex h-7 min-w-7 items-center justify-center rounded-full border border-neutral-300 px-1 text-xs font-bold dark:border-white/20">{i.qty}x</span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm font-medium leading-tight", (i.status === "Ready" || i.status === "Served") && "text-neutral-400 line-through dark:text-neutral-500")}>{i.item_name}</span>
          {i.station_name && <span className="block text-[10px] uppercase tracking-wide text-neutral-500">{i.station_name}</span>}
          {i.modifiers && <span className="block text-xs text-neutral-500">{i.modifiers}</span>}
          {i.notes && <span className="block text-xs font-semibold text-red-600 dark:text-red-400">{i.notes}</span>}
        </span>
        <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full", i.status === "Ready" || i.status === "Served" ? "bg-green-500" : "text-neutral-500")}>{icon}</span>
      </button>
    );
  };
  return (
    <article className="overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10">
      <div className={cn("relative flex items-center gap-2 px-3 py-2.5", style.cls)}>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-neutral-900">{c.channel === "Foodpanda" ? "panda" : c.channel}</span>
        <span className="flex-1 text-center text-base font-bold">
          {c.order_type === "Delivery" ? <Bike className="mr-1 inline h-4 w-4" /> : c.order_type === "Dine-in" ? <Utensils className="mr-1 inline h-4 w-4" /> : <Store className="mr-1 inline h-4 w-4" />}
          {style.label} #{c.order_no}{c.table_label ? ` · T${c.table_label.replace(/^T/, "")}` : ""}
        </span>
        <button onClick={() => setMenu((v) => !v)} className="rounded p-0.5 hover:bg-black/10" aria-label="Order menu"><MoreVertical className="h-4 w-4" /></button>
        {menu && (
          <div className="absolute right-2 top-10 z-10 w-44 overflow-hidden rounded-lg bg-white text-sm text-neutral-900 shadow-xl ring-1 ring-black/10 dark:bg-neutral-800 dark:text-neutral-100" onMouseLeave={() => setMenu(false)}>
            {c.column !== "Placed" && <button onClick={() => { setMenu(false); onRecall(); }} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-neutral-100 dark:hover:bg-white/10"><RotateCcw className="h-4 w-4" /> Recall</button>}
            <button onClick={() => { setMenu(false); printHtml(ticketHtml(c)); }} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-neutral-100 dark:hover:bg-white/10"><Printer className="h-4 w-4" /> Print ticket</button>
            <a href={`/desk/restaurant-order/${encodeURIComponent(c.name)}`} target="_blank" rel="noopener" className="flex w-full items-center gap-2 px-3 py-2 hover:bg-neutral-100 dark:hover:bg-white/10"><ListOrdered className="h-4 w-4" /> Open order</a>
          </div>
        )}
      </div>
      {c.column !== "Placed" && (
        <div className="flex items-center gap-2 px-3 pt-2.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10"><div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${c.progress}%` }} /></div>
          <span className="w-9 text-right text-xs text-neutral-500">{c.progress}%</span>
        </div>
      )}
      {open && updated - created > 60000 && (
        <div className="flex items-center gap-1.5 px-3 pt-2 text-xs font-medium text-orange-600"><History className="h-3.5 w-3.5" /> Updated {ago(now - updated)}<span className="ml-auto">{clock(new Date(updated))}</span></div>
      )}
      <div className={cn("mx-3 mt-2 flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-1.5 text-xs dark:bg-white/5", ageCls)}>
        <Clock className="h-3.5 w-3.5" /> Created {ago(age)}
        {open && <span className="font-mono font-semibold">· {mmss(age)}</span>}
        <span className="ml-auto">{clock(new Date(created))}</span>
      </div>
      {(c.customer_name && c.order_type !== "Dine-in" && c.channel !== "POS") && <div className="px-3 pt-1.5 text-xs text-neutral-500">{c.customer_name}</div>}
      <div className="mt-1.5">
        {multi && <div className="bg-green-600 px-3 py-1 text-xs font-bold text-white">+ New Items</div>}
        {fresh.map(line)}
        {multi && <div className="bg-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600 dark:bg-white/10 dark:text-neutral-300">Already Ordered</div>}
        {older.map(line)}
      </div>
      {c.notes && <div className="mx-3 mb-2 rounded-md bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">{c.notes}</div>}
      {c.order_type === "Delivery" && (
        <div className="mx-3 mb-2 flex items-center gap-1.5 text-[11px] text-neutral-500">
          <Bike className="h-3.5 w-3.5" />{c.rider_name ? c.rider_name : c.delivery_by === "Foodpanda Rider" ? "Foodpanda rider" : "Waiting for a rider"}
          {c.invoice && <span className="ml-auto">{c.invoice}</span>}
        </div>
      )}
      <div className={cn("flex items-center gap-2 px-3 py-2", dispatch ? "bg-sky-700 text-white hover:bg-sky-600" : FOOT[c.column])}>
        <button onClick={() => printHtml(ticketHtml(c))} className="rounded-full bg-white/90 p-1.5 text-neutral-900" title="Print ticket"><Printer className="h-4 w-4" /></button>
        <button disabled={(!open && !dispatch) || busy === c.name} onClick={onAdvance} title={dispatch ? nextDispatch(c) : NEXT[c.column]}
          className="flex-1 text-center text-base font-bold disabled:cursor-default">{busy === c.name ? "…" : c.column === "Completed" ? c.status : c.status === "Accepted" ? "Placed" : c.status}</button>
        {(open || dispatch) && <button disabled={busy === c.name} onClick={onAdvance} className="rounded-full bg-white/90 p-1.5 text-neutral-900"
          title={dispatch ? nextDispatch(c) : NEXT[c.column]}>{dispatch ? <Bike className="h-4 w-4" /> : <ChefHat className="h-4 w-4" />}</button>}
      </div>
    </article>
  );
}
