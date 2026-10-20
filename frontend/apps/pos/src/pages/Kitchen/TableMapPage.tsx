import { useEffect, useMemo, useState } from "react";
import { useFrappeEventListener, useFrappeGetCall } from "frappe-react-sdk";
import toast from "react-hot-toast";
import {
  ArrowRightLeft, Armchair, Banknote, Eye, Minus, Plus, Printer, Search, Send, Trash2, UserPlus, Users, UtensilsCrossed, X,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { loadPrinter, printHtml, receiptHtml } from "@/pages/POS/pos-receipt";
import type { ReceiptData } from "@/pages/POS/pos-offline";
import { formatMoney } from "@/utils/currency";
import { cn } from "@/utils/cn";

interface TableRow { name: string; table_number: string; floor_area?: string; seats: number; shape: string; pos_x: number; pos_y: number;
  status: string; guests?: number; seated_at?: string; current_order?: string;
  order?: { name: string; order_no: string; status: string; total: number; settled: boolean; placed_at: string } | null }
interface Floor { branch: string; branches: string[]; areas: { name: string; area_name: string }[]; tables: TableRow[]; now: string;
  occupied: number; guests: number; pos_profile: string; price_list: string }
interface Bill { rounded_total: number; grand_total: number; net_total: number; total_taxes_and_charges: number; discount_amount: number;
  items: { item_name: string; qty: number; rate: number; amount: number; is_free_item?: number }[]; taxes: { description: string; tax_amount: number }[] }
interface View { table: string; table_number: string; guests: number; seated_at: string; pos_profile: string; bill: Bill | null;
  order: { name: string; order_no: string; status: string; invoice?: string; items: { item_name: string; qty: number; rate: number; amount: number; round: number; status: string; notes?: string }[] } | null }

const parse = (s?: string) => (s ? new Date(s.replace(" ", "T")).getTime() : 0);
const hms = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, "0")).join(":"); };
const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]!));

/** Dine-in floor plan: tables by area, live sitting timers, and the sitting's actions. */
export default function TableMapPage() {
  const [branch, setBranch] = useState("");
  const [area, setArea] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [dialog, setDialog] = useState<null | "order" | "view" | "settle" | "move" | "seat">(null);
  const { data, mutate } = useFrappeGetCall<{ message: Floor }>("restaurant_os.api.tables.floor", { branch: branch || undefined }, `ros.floor.${branch}`, { refreshInterval: 20000 });
  const floor = data?.message;
  useFrappeEventListener("ros_tables", () => void mutate());
  useFrappeEventListener("ros_kds", () => void mutate());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const offset = useMemo(() => (floor ? parse(floor.now) - Date.now() : 0), [floor]);
  const areaName = area || floor?.areas[0]?.name || "";
  const tables = (floor?.tables ?? []).filter((t) => !areaName || t.floor_area === areaName);
  const table = floor?.tables.find((t) => t.name === sel) ?? null;
  const serverNow = now + offset;

  const run = async (method: string, args: Record<string, unknown>, ok?: string) => {
    try { const r = await postCall(`restaurant_os.api.tables.${method}`, args); if (ok) toast.success(ok); await mutate(); return r; }
    catch (e) { toast.error(humanizeError(e)); return null; }
  };

  const printBill = async () => {
    if (!table) return;
    const v = await getCall<View>("restaurant_os.api.tables.view", { table: table.name });
    if (!v.order || !v.bill) return toast.error("Nothing ordered yet");
    const b = v.bill;
    const row = (k: string, val: string, bold = false) => `<div style="display:flex;justify-content:space-between;${bold ? "font-weight:700;font-size:15px" : ""}"><span>${k}</span><span>${val}</span></div>`;
    printHtml(`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:80mm auto;margin:3mm}body{font:12px/1.4 monospace;width:74mm}h2{text-align:center;margin:0}hr{border:0;border-top:1px dashed #000}</style></head><body>
      <h2>BILL</h2><div style="text-align:center">Table ${esc(v.table_number)} · Order #${esc(v.order.order_no)} · ${v.guests} guest(s)</div><hr>
      ${b.items.map((i) => row(`${i.qty} × ${esc(i.item_name)}${i.is_free_item ? " (free)" : ""}`, formatMoney(i.amount))).join("")}<hr>
      ${row("Subtotal", formatMoney(b.net_total))}${b.discount_amount ? row("Discount", `−${formatMoney(b.discount_amount)}`) : ""}
      ${b.taxes.map((t) => row(esc(t.description), formatMoney(t.tax_amount))).join("")}<hr>${row("TOTAL", formatMoney(b.rounded_total || b.grand_total), true)}
      <hr><div style="text-align:center">Pre-bill — not a tax receipt. Your FBR receipt prints on payment.</div></body></html>`);
  };

  return (
    <div className="-m-3 flex h-[calc(100vh-3.5rem)] sm:-m-5">
      {/* left: selected table */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
        {table ? (
          <>
            <div className="border-b border-border p-3">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>{table.order ? `#${table.order.order_no}` : ""} Table {table.table_number}</span>
                <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground"><Users className="h-4 w-4" />({table.guests || 0})</span>
              </div>
              {table.status === "Occupied" && table.seated_at ? (
                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>{new Date(parse(table.seated_at)).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span><span className="font-mono">{hms(serverNow - parse(table.seated_at))}</span></div>
                  {table.order && <div className="flex justify-between"><span>Time since order placed</span><span className="font-mono">{hms(serverNow - parse(table.order.placed_at))}</span></div>}
                  {table.order && <div className="flex justify-between"><span>{table.order.status}{table.order.settled ? " · settled" : ""}</span><span className="font-semibold text-foreground">{formatMoney(table.order.total)}</span></div>}
                </div>
              ) : <div className="mt-1 text-xs text-muted-foreground">{table.status} · {table.seats} seats</div>}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {table.status !== "Occupied" && <Action color="bg-green-600" icon={UserPlus} label="Seat Guests" onClick={() => setDialog("seat")} />}
              {table.status === "Occupied" && <>
                <Action color="bg-red-600" icon={UtensilsCrossed} label="End Sitting" onClick={() => void run("end_sitting", { table: table.name }, `Table ${table.table_number} is free`)} />
                {!table.order?.settled && <Action color="bg-orange-500" icon={Plus} label={table.order ? "Add Items" : "Take Order"} onClick={() => setDialog("order")} />}
                <Action color="bg-violet-700" icon={Eye} label="View Order" onClick={() => setDialog("view")} disabled={!table.order} />
                {!table.order?.settled && <Action color="bg-green-700" icon={Banknote} label="Settle" onClick={() => setDialog("settle")} disabled={!table.order} />}
                <Action color="bg-indigo-800" icon={ArrowRightLeft} label="Move" onClick={() => setDialog("move")} />
                <Action color="bg-blue-700" icon={Printer} label="Print Bill" onClick={() => void printBill()} disabled={!table.order} />
              </>}
            </div>
          </>
        ) : <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-sm text-muted-foreground"><Armchair className="mb-2 h-8 w-8" />Pick a table</div>}
      </aside>

      {/* floor */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
          <h1 className="text-lg font-bold">Dine In</h1>
          <span className="flex items-center gap-1 text-sm text-muted-foreground"><Armchair className="h-4 w-4" /> {floor?.tables.length ?? 0}</span>
          <span className="flex items-center gap-1 text-sm text-muted-foreground"><Users className="h-4 w-4" /> {floor?.guests ?? 0}</span>
          <div className="ml-4 flex gap-1">
            {(floor?.areas ?? []).map((a) => (
              <button key={a.name} onClick={() => setArea(a.name)} className={cn("rounded-full px-3 py-1 text-xs font-semibold", areaName === a.name ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{a.area_name}</button>
            ))}
          </div>
          {floor && floor.branches.length > 1 && (
            <select value={floor.branch} onChange={(e) => setBranch(e.target.value)} className="ml-auto h-8 rounded-md border border-input bg-transparent px-2 text-sm">
              {floor.branches.map((b) => <option key={b}>{b}</option>)}
            </select>
          )}
        </div>
        <div className="relative min-h-0 flex-1 overflow-auto bg-neutral-600 dark:bg-neutral-800" onClick={() => setSel(null)}>
          <div className="relative" style={{ width: 760, height: 520 }}>
            {tables.map((t) => <TableShape key={t.name} t={t} selected={t.name === sel} now={serverNow} onClick={() => setSel(t.name)} />)}
          </div>
        </div>
      </section>

      {table && dialog === "seat" && <SeatDialog table={table} onClose={() => setDialog(null)} onSeat={async (g) => { await run("seat", { table: table.name, guests: g }, `Table ${table.table_number} seated`); setDialog(null); }} />}
      {table && dialog === "order" && floor && <OrderDialog table={table} profile={floor.pos_profile} priceList={floor.price_list} onClose={() => setDialog(null)}
        onSend={async (items, notes) => { const r = await run("send", { table: table.name, items: JSON.stringify(items), notes }, "Sent to the kitchen"); if (r) setDialog(null); }} />}
      {table && dialog === "view" && <ViewDialog table={table} onClose={() => setDialog(null)} />}
      {table && dialog === "settle" && <SettleDialog table={table} onClose={() => setDialog(null)} onDone={async () => { setDialog(null); await mutate(); }} />}
      {table && dialog === "move" && floor && <Dialog open onClose={() => setDialog(null)} title={`Move table ${table.table_number}`} size="sm">
        <div className="grid grid-cols-4 gap-2">
          {floor.tables.filter((t) => t.status !== "Occupied").map((t) => (
            <button key={t.name} onClick={async () => { const r = await run("move", { table: table.name, to_table: t.name }, `Moved to ${t.table_number}`); if (r) { setDialog(null); setSel(t.name); } }}
              className="rounded-lg border border-border py-2 text-sm font-semibold hover:bg-muted">{t.table_number}</button>
          ))}
        </div>
      </Dialog>}
    </div>
  );
}

function Action({ color, icon: Icon, label, onClick, disabled }: { color: string; icon: typeof Eye; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex w-full items-center gap-3 rounded-lg border border-border bg-background p-1 pr-3 text-left text-sm font-semibold shadow-sm hover:bg-muted disabled:opacity-40">
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-md text-white", color)}><Icon className="h-5 w-5" /></span>
      <span className="flex-1 text-right">{label}</span>
    </button>
  );
}

/** A table on the plan: a diamond (or round) top with its chairs; green with a timer when seated. */
function TableShape({ t, selected, now, onClick }: { t: TableRow; selected: boolean; now: number; onClick: () => void }) {
  const busy = t.status === "Occupied";
  const round = t.shape === "Round";
  const x = 60 + (t.pos_x ?? 0) * 1.45;
  const y = 50 + (t.pos_y ?? 0) * 1.3;
  const chairs = Math.min(Math.max(t.seats || 4, 2), 8);
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} className="absolute" style={{ left: x, top: y, width: 110, height: 110 }} title={`Table ${t.table_number} · ${t.seats} seats`}>
      {Array.from({ length: chairs }).map((_, i) => {
        const a = (i / chairs) * Math.PI * 2 + (round ? 0 : Math.PI / 4);
        return <span key={i} className="absolute h-4 w-7 rounded-sm bg-neutral-400/90" style={{ left: 55 + Math.cos(a) * 44 - 14, top: 55 + Math.sin(a) * 44 - 8, transform: `rotate(${(a * 180) / Math.PI + 90}deg)` }} />;
      })}
      <span className={cn("absolute left-[22px] top-[22px] flex h-[66px] w-[66px] items-center justify-center shadow-lg transition-colors",
        round ? "rounded-full" : "rotate-45 rounded-xl",
        busy ? "bg-green-700 text-white" : t.status === "Reserved" ? "bg-sky-200 text-neutral-900" : t.status === "Cleaning" ? "bg-amber-200 text-neutral-900" : "bg-white text-neutral-900",
        selected && "outline outline-4 outline-offset-4 outline-green-400/70")}>
        <span className={cn("flex flex-col items-center leading-tight", !round && "-rotate-45")}>
          <span className="text-sm font-bold">{t.table_number}</span>
          {busy && t.seated_at && <span className="font-mono text-[10px]">{hms(now - parse(t.seated_at))}</span>}
          {busy && <span className="flex items-center gap-0.5 text-[10px]"><Users className="h-2.5 w-2.5" />({t.guests || 0})</span>}
        </span>
      </span>
    </button>
  );
}

function SeatDialog({ table, onClose, onSeat }: { table: TableRow; onClose: () => void; onSeat: (guests: number) => void }) {
  const [g, setG] = useState(Math.min(2, table.seats || 2));
  return (
    <Dialog open onClose={onClose} title={`Seat table ${table.table_number}`} size="sm">
      <div className="flex items-center justify-center gap-4 py-4">
        <Button variant="outline" size="icon" onClick={() => setG((v) => Math.max(1, v - 1))}><Minus className="h-4 w-4" /></Button>
        <span className="w-16 text-center text-3xl font-bold">{g}</span>
        <Button variant="outline" size="icon" onClick={() => setG((v) => v + 1)}><Plus className="h-4 w-4" /></Button>
      </div>
      <p className="mb-3 text-center text-xs text-muted-foreground">guests · {table.seats} seats</p>
      <Button className="w-full bg-primary text-primary-foreground" onClick={() => onSeat(g)}>Seat guests</Button>
    </Dialog>
  );
}

interface MenuItem { item_code: string; item_name: string; price_list_rate: number; item_image?: string; item_group?: string }

function OrderDialog({ table, profile, priceList, onClose, onSend }: { table: TableRow; profile: string; priceList: string; onClose: () => void;
  onSend: (items: { item_code: string; qty: number; notes?: string }[], notes?: string) => void }) {
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, { item: MenuItem; qty: number; notes?: string }>>({});
  const [notes, setNotes] = useState("");
  const { data } = useFrappeGetCall<{ message: { items: MenuItem[] } }>("erpnext.selling.page.point_of_sale.point_of_sale.get_items",
    { start: 0, page_length: 200, price_list: priceList, item_group: "", pos_profile: profile, search_term: q }, `ros.menu.${profile}.${priceList}.${q}`);
  const items = data?.message?.items ?? [];
  const add = (it: MenuItem, d = 1) => setCart((c) => {
    const qty = (c[it.item_code]?.qty ?? 0) + d;
    const next = { ...c };
    if (qty <= 0) delete next[it.item_code]; else next[it.item_code] = { ...c[it.item_code], item: it, qty };
    return next;
  });
  const lines = Object.values(cart);
  const total = lines.reduce((s, l) => s + l.qty * l.item.price_list_rate, 0);
  return (
    <Dialog open onClose={onClose} title={`Table ${table.table_number} — ${table.order ? `add to order #${table.order.order_no}` : "new order"}`} size="xl">
      <div className="grid h-[65vh] grid-cols-1 gap-3 md:grid-cols-[1fr_300px]">
        <div className="flex min-h-0 flex-col">
          <label className="mb-2 flex items-center gap-2 rounded-md border border-input px-2"><Search className="h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the menu" className="h-9 flex-1 bg-transparent text-sm outline-none" /></label>
          <div className="grid min-h-0 flex-1 auto-rows-max content-start grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {items.map((it) => (
              <button key={it.item_code} onClick={() => add(it)} className="overflow-hidden rounded-lg border border-border text-left hover:ring-2 hover:ring-primary">
                {it.item_image ? <img src={it.item_image} alt="" className="h-20 w-full object-cover" /> : <div className="h-20 bg-muted" />}
                <div className="p-2"><div className="truncate text-sm font-semibold">{it.item_name}</div><div className="text-xs text-primary">{formatMoney(it.price_list_rate)}</div></div>
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-h-0 flex-col rounded-lg border border-border">
          <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {lines.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Tap dishes to add them</p>}
            {lines.map((l) => (
              <div key={l.item.item_code} className="p-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.item.item_name}</span>
                  <button onClick={() => add(l.item, -1)} className="rounded border border-border p-1"><Minus className="h-3 w-3" /></button>
                  <span className="w-6 text-center text-sm font-bold">{l.qty}</span>
                  <button onClick={() => add(l.item, 1)} className="rounded border border-border p-1"><Plus className="h-3 w-3" /></button>
                  <button onClick={() => add(l.item, -l.qty)} className="p-1 text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <input value={l.notes ?? ""} onChange={(e) => setCart((c) => ({ ...c, [l.item.item_code]: { ...l, notes: e.target.value } }))}
                  placeholder="Note for the kitchen (spice, no onion…)" className="mt-1 h-7 w-full rounded border border-input bg-transparent px-2 text-xs" />
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-border p-2">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Order note" className="h-8 w-full rounded border border-input bg-transparent px-2 text-xs" />
            <div className="flex justify-between text-sm font-semibold"><span>Round total</span><span>{formatMoney(total)}</span></div>
            <Button className="w-full bg-primary text-primary-foreground" disabled={!lines.length}
              onClick={() => onSend(lines.map((l) => ({ item_code: l.item.item_code, qty: l.qty, notes: l.notes || undefined })), notes || undefined)}>
              <Send className="h-4 w-4" /> Send to kitchen</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function ViewDialog({ table, onClose }: { table: TableRow; onClose: () => void }) {
  const { data } = useFrappeGetCall<{ message: View }>("restaurant_os.api.tables.view", { table: table.name }, `ros.view.${table.name}.${table.order?.name}`);
  const v = data?.message;
  const rounds = [...new Set((v?.order?.items ?? []).map((i) => i.round))].sort((a, b) => a - b);
  return (
    <Dialog open onClose={onClose} title={`Table ${table.table_number} · order #${table.order?.order_no ?? ""}`} size="md">
      {!v ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="space-y-3">
          {rounds.map((r) => (
            <div key={r}>
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Round {r}</div>
              {v.order!.items.filter((i) => i.round === r).map((i, k) => (
                <div key={k} className="flex justify-between border-b border-border py-1 text-sm">
                  <span>{i.qty} × {i.item_name} <span className="text-xs text-muted-foreground">· {i.status}</span>{i.notes && <span className="block text-xs text-red-600">{i.notes}</span>}</span>
                  <span>{formatMoney(i.amount)}</span>
                </div>
              ))}
            </div>
          ))}
          {v.bill && <div className="rounded-lg bg-muted p-3 text-sm">
            {v.bill.taxes.map((t) => <div key={t.description} className="flex justify-between"><span>{t.description}</span><span>{formatMoney(t.tax_amount)}</span></div>)}
            {v.bill.discount_amount ? <div className="flex justify-between"><span>Discount</span><span>−{formatMoney(v.bill.discount_amount)}</span></div> : null}
            <div className="mt-1 flex justify-between text-base font-bold"><span>Total</span><span>{formatMoney(v.bill.rounded_total || v.bill.grand_total)}</span></div>
          </div>}
        </div>
      )}
    </Dialog>
  );
}

function SettleDialog({ table, onClose, onDone }: { table: TableRow; onClose: () => void; onDone: () => void }) {
  const { data } = useFrappeGetCall<{ message: View }>("restaurant_os.api.tables.view", { table: table.name }, `ros.settle.${table.name}.${table.order?.name}`);
  const { data: ctx } = useFrappeGetCall<{ message: { profile: { payments: { mode_of_payment: string; default: number }[] } } }>(
    "restaurant_os.api.pos.get_context", { pos_profile: data?.message?.pos_profile }, data?.message ? `ros.ctx.${data.message.pos_profile}` : null);
  const total = data?.message?.bill?.rounded_total || data?.message?.bill?.grand_total || 0;
  const modes = ctx?.message?.profile?.payments ?? [];
  const [mode, setMode] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const chosen = mode || modes.find((m) => m.default)?.mode_of_payment || modes[0]?.mode_of_payment || "Cash";
  const paid = amount === "" ? total : Number(amount);
  const settle = async () => {
    setSaving(true);
    try {
      const r = await postCall<{ name: string }>("restaurant_os.api.tables.settle", { table: table.name, payments: JSON.stringify([{ mode_of_payment: chosen, amount: paid }]) });
      toast.success(`Settled · ${r.name}`);
      const rec = await getCall<ReceiptData>("restaurant_os.api.pos.receipt", { name: r.name });
      printHtml(receiptHtml(rec, loadPrinter()));
      onDone();
    } catch (e) { toast.error(humanizeError(e)); } finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`Settle table ${table.table_number}`} size="sm">
      <div className="mb-3 rounded-xl bg-gradient-to-r from-primary to-violet-700 p-4 text-white">
        <div className="text-xs uppercase tracking-wide text-white/75">Amount to pay</div>
        <div className="text-3xl font-extrabold">{formatMoney(total)}</div>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {modes.map((m) => (
          <button key={m.mode_of_payment} onClick={() => setMode(m.mode_of_payment)}
            className={cn("rounded-lg border px-2 py-2 text-xs font-semibold", chosen === m.mode_of_payment ? "border-primary bg-primary/10 text-primary" : "border-border")}>{m.mode_of_payment}</button>
        ))}
      </div>
      <label className="mb-1 block text-xs text-muted-foreground">Tendered</label>
      <input type="number" value={amount} placeholder={String(total)} onChange={(e) => setAmount(e.target.value)} className="mb-2 h-10 w-full rounded-md border border-input bg-transparent px-3 text-right text-lg" />
      {paid > total && <div className="mb-2 flex justify-between text-sm font-semibold text-green-600"><span>Change</span><span>{formatMoney(paid - total)}</span></div>}
      <Button className="w-full bg-green-600 text-white hover:bg-green-700" disabled={saving || !total || paid < total} onClick={() => void settle()}>
        <Banknote className="h-4 w-4" /> {saving ? "Settling…" : "Settle & print receipt"}</Button>
      <button onClick={onClose} className="mt-2 flex w-full items-center justify-center gap-1 text-xs text-muted-foreground"><X className="h-3 w-3" /> Cancel</button>
    </Dialog>
  );
}
