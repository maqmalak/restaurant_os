import { useMemo, useState } from "react";
import { useFrappeEventListener, useFrappeGetCall } from "frappe-react-sdk";
import toast from "react-hot-toast";
import { Banknote, Bike, ExternalLink, MapPin, Phone, Plus, Search, Trash2, Zap } from "lucide-react";
import { LiveMap, type MapLine, type MapMarker } from "@/components/common/live-map";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { humanizeError, postCall } from "@/services/frappe";
import { formatMoney } from "@/utils/currency";
import { cn } from "@/utils/cn";

interface Rider { name: string; rider_name: string; phone?: string; vehicle: string; status: string; latitude?: number; longitude?: number;
  cash_in_hand: number; active: number; seen_seconds?: number | null }
interface Order { name: string; order_no: string; status: string; channel: string; delivery_by: string; customer_name?: string; phone?: string;
  address?: string; lat?: number; lng?: number; rider?: string; rider_name?: string; ext_rider_status?: string; assignment_status?: string;
  offered_to?: string; cod_amount: number; distance_km: number; grand_total: number; invoice?: string; placed_at: string; eta: number;
  tracking_key?: string; rider_lat?: number; rider_lng?: number }
interface Board { branch: string; branch_point: { lat: number; lng: number }; riders: Rider[]; orders: Order[]; rule: string }

const RIDER_COLOR: Record<string, string> = { Available: "#16a34a", "On Delivery": "#2563eb", "Off Duty": "#9ca3af" };
const ago = (s?: number | null) => (s == null ? "never" : s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`);

/** Dispatch: live map of riders (own + Foodpanda) and deliveries, assignment, phone orders, rider cash. */
export default function DispatchPage() {
  const { data, mutate } = useFrappeGetCall<{ message: Board }>("restaurant_os.api.riders.dispatch", undefined, "ros.dispatch", { refreshInterval: 10000 });
  const b = data?.message;
  useFrappeEventListener("ros_dispatch", () => void mutate());
  useFrappeEventListener("ros_rider_location", () => void mutate());
  useFrappeEventListener("ros_kds", () => void mutate());
  const [newOrder, setNewOrder] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  const open = (b?.orders ?? []).filter((o) => o.status !== "Delivered");
  const waiting = open.filter((o) => o.delivery_by === "Own Rider" && !o.rider);
  const road = open.filter((o) => o.rider || o.delivery_by === "Foodpanda Rider");
  const delivered = (b?.orders ?? []).filter((o) => o.status === "Delivered");

  const { markers, lines } = useMemo(() => {
    const mk: MapMarker[] = [], ln: MapLine[] = [];
    if (!b) return { markers: mk, lines: ln };
    mk.push({ id: "branch", lat: b.branch_point.lat, lng: b.branch_point.lng, color: "#0d9488", label: "🍽", kind: "home", title: `${b.branch} (restaurant)` });
    b.riders.filter((r) => r.latitude && r.status !== "Off Duty").forEach((r) =>
      mk.push({ id: `r-${r.name}`, lat: r.latitude!, lng: r.longitude!, color: RIDER_COLOR[r.status] ?? "#6b7280", kind: "dot",
        label: r.rider_name.split(" ").map((w) => w[0]).join(""), title: `${r.rider_name} · ${r.status} · seen ${ago(r.seen_seconds)}` }));
    open.forEach((o) => {
      if (o.lat && o.lng) mk.push({ id: `o-${o.name}`, lat: o.lat, lng: o.lng, color: o.delivery_by === "Foodpanda Rider" ? "#db2777" : o.name === sel ? "#ea580c" : "#f59e0b",
        label: o.order_no, title: `#${o.order_no} · ${o.customer_name ?? ""} · ${o.status}` });
      if (o.delivery_by === "Foodpanda Rider" && o.rider_lat) mk.push({ id: `fp-${o.name}`, lat: o.rider_lat, lng: o.rider_lng!, color: "#db2777", kind: "dot", label: "FP", title: o.rider_name ?? "Foodpanda rider" });
      if (o.rider_lat && o.lat) ln.push({ id: `l-${o.name}`, points: [[o.rider_lat, o.rider_lng!], [o.lat, o.lng!]], color: o.delivery_by === "Foodpanda Rider" ? "#db2777" : "#2563eb", dashed: true });
    });
    return { markers: mk, lines: ln };
  }, [b, open, sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (method: string, args: Record<string, unknown>, ok: string) => {
    try { await postCall(`restaurant_os.api.riders.${method}`, args); toast.success(ok); await mutate(); } catch (e) { toast.error(humanizeError(e)); }
  };

  return (
    <div className="-m-3 grid h-[calc(100vh-3.5rem)] grid-cols-1 sm:-m-5 lg:grid-cols-[380px_1fr]">
      <aside className="flex min-h-0 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <h1 className="text-lg font-bold">Dispatch</h1>
          <span className="text-xs text-muted-foreground">{b?.rule}</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => void run("simulate_delivery_order", {}, "Demo delivery order added")} title="Demo: random phone order"><Zap className="h-4 w-4" /></Button>
          <Button size="sm" className="bg-primary text-primary-foreground" onClick={() => setNewOrder(true)}><Plus className="h-4 w-4" /> Phone order</Button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          <Section title={`Waiting for a rider (${waiting.length})`}>
            {waiting.length === 0 && <Empty text="Nothing waiting" />}
            {waiting.map((o) => <OrderRow key={o.name} o={o} selected={sel === o.name} onClick={() => setSel(o.name)}>
              <select defaultValue="" onChange={(e) => e.target.value && void run("assign", { order: o.name, rider: e.target.value }, "Rider assigned")}
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs">
                <option value="">{o.offered_to ? `Offered to ${o.offered_to} — reassign…` : "Assign rider…"}</option>
                {(b?.riders ?? []).filter((r) => r.status !== "Off Duty").map((r) => <option key={r.name} value={r.name}>{r.rider_name} · {r.status} · {r.active} active</option>)}
              </select>
            </OrderRow>)}
          </Section>
          <Section title={`On the way / with a rider (${road.length})`}>
            {road.length === 0 && <Empty text="No deliveries out" />}
            {road.map((o) => <OrderRow key={o.name} o={o} selected={sel === o.name} onClick={() => setSel(o.name)} />)}
          </Section>
          <Section title={`Riders (${b?.riders.length ?? 0})`}>
            {(b?.riders ?? []).map((r) => (
              <div key={r.name} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: RIDER_COLOR[r.status] }} />
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.rider_name}</div>
                  <div className="text-xs text-muted-foreground">{r.status} · {r.vehicle} · seen {ago(r.seen_seconds)}</div></div>
                {r.phone && <a href={`tel:${r.phone}`} className="rounded p-1 hover:bg-muted"><Phone className="h-4 w-4" /></a>}
                <button disabled={r.cash_in_hand <= 0} onClick={() => void run("handover", { rider: r.name }, `${formatMoney(r.cash_in_hand)} handed over`)}
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold disabled:opacity-40" title="Rider hands the cash over at the counter">
                  <Banknote className="h-3.5 w-3.5" /> {formatMoney(r.cash_in_hand)}</button>
              </div>
            ))}
          </Section>
          {delivered.length > 0 && <Section title={`Delivered today (${delivered.length})`}>
            {delivered.map((o) => <div key={o.name} className="flex justify-between text-xs text-muted-foreground"><span>#{o.order_no} · {o.customer_name}</span><span>{o.rider_name} · {o.invoice}</span></div>)}
          </Section>}
        </div>
      </aside>
      <LiveMap markers={markers} lines={lines} className="h-full w-full" />
      {newOrder && b && <PhoneOrderDialog center={b.branch_point} onClose={() => setNewOrder(false)} onDone={() => { setNewOrder(false); void mutate(); }} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h2><div className="space-y-2">{children}</div></section>;
}
const Empty = ({ text }: { text: string }) => <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">{text}</p>;

function OrderRow({ o, selected, onClick, children }: { o: Order; selected: boolean; onClick: () => void; children?: React.ReactNode }) {
  const fp = o.delivery_by === "Foodpanda Rider";
  return (
    <div onClick={onClick} className={cn("cursor-pointer rounded-lg border p-2 text-sm", selected ? "border-primary ring-1 ring-primary" : "border-border")}>
      <div className="flex items-center gap-2">
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white", fp ? "bg-pink-600" : "bg-amber-500")}>{o.channel}</span>
        <b>#{o.order_no}</b><span className="truncate text-xs text-muted-foreground">{o.customer_name}</span>
        <span className="ml-auto whitespace-nowrap text-xs font-semibold">{o.status}</span>
      </div>
      <div className="mt-1 flex gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{o.address ?? "—"}</span></div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <Bike className="h-3.5 w-3.5" /><span className="truncate">{o.rider_name ? `${o.rider_name}${fp && o.ext_rider_status ? ` · ${o.ext_rider_status}` : ""}` : "no rider yet"}</span>
        <span className="ml-auto whitespace-nowrap">{o.distance_km ? `${o.distance_km.toFixed(1)} km · ` : ""}ETA {o.eta} min</span>
        {o.tracking_key && <a href={`/ros/track/${o.tracking_key}`} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="text-primary" title="Customer tracking page"><ExternalLink className="h-3.5 w-3.5" /></a>}
      </div>
      {o.cod_amount > 0 && <div className="mt-1 text-xs text-amber-600">Cash to collect {formatMoney(o.cod_amount)}</div>}
      {children && <div className="mt-2" onClick={(e) => e.stopPropagation()}>{children}</div>}
    </div>
  );
}

interface MenuItem { item_code: string; item_name: string; price_list_rate: number }

function PhoneOrderDialog({ center, onClose, onDone }: { center: { lat: number; lng: number }; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ customer_name: "", phone: "", address: "", notes: "" });
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, { item: MenuItem; qty: number }>>({});
  const [saving, setSaving] = useState(false);
  const { data: floor } = useFrappeGetCall<{ message: { pos_profile: string; price_list: string } }>("restaurant_os.api.tables.floor", undefined, "ros.floor.");
  const prof = floor?.message;
  const { data } = useFrappeGetCall<{ message: { items: MenuItem[] } }>("erpnext.selling.page.point_of_sale.point_of_sale.get_items",
    { start: 0, page_length: 60, price_list: prof?.price_list, item_group: "", pos_profile: prof?.pos_profile, search_term: q }, prof ? `ros.phonemenu.${q}` : null);
  const lines = Object.values(cart);
  const total = lines.reduce((s, l) => s + l.qty * l.item.price_list_rate, 0);
  const add = (it: MenuItem, d: number) => setCart((c) => { const qty = (c[it.item_code]?.qty ?? 0) + d; const n = { ...c }; if (qty <= 0) delete n[it.item_code]; else n[it.item_code] = { item: it, qty }; return n; });
  const save = async () => {
    setSaving(true);
    try {
      const r = await postCall<{ order_no: string; tracking_key: string }>("restaurant_os.api.riders.new_delivery_order", { data: JSON.stringify({ ...f, lat: pin?.lat, lng: pin?.lng,
        items: lines.map((l) => ({ item_code: l.item.item_code, qty: l.qty })) }) });
      toast.success(`Delivery order #${r.order_no} sent to the kitchen`);
      onDone();
    } catch (e) { toast.error(humanizeError(e)); } finally { setSaving(false); }
  };
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <label className="block text-xs text-muted-foreground">{label}<input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground" /></label>);
  return (
    <Dialog open onClose={onClose} title="Phone delivery order" size="xl">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          {field("customer_name", "Customer name")}{field("phone", "Phone", "tel")}{field("address", "Delivery address")}
          <div className="text-xs text-muted-foreground">Tap the map to pin the drop-off {pin ? `· ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : ""}</div>
          <LiveMap className="h-56 w-full rounded-lg" onMapClick={(lat, lng) => setPin({ lat, lng })} fitKey="phone"
            markers={[{ id: "b", lat: center.lat, lng: center.lng, color: "#0d9488", kind: "home", label: "🍽", title: "Restaurant" },
              ...(pin ? [{ id: "p", lat: pin.lat, lng: pin.lng, color: "#ea580c", label: "📦", title: "Drop-off" }] : [])]} />
          {field("notes", "Note for the kitchen / rider")}
        </div>
        <div className="flex min-h-0 flex-col">
          <label className="mb-2 flex items-center gap-2 rounded-md border border-input px-2"><Search className="h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the menu" className="h-9 flex-1 bg-transparent text-sm outline-none" /></label>
          <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto">
            {(data?.message?.items ?? []).map((it) => <button key={it.item_code} onClick={() => add(it, 1)} className="rounded border border-border px-2 py-1.5 text-left text-xs hover:bg-muted"><div className="truncate font-medium">{it.item_name}</div><div className="text-primary">{formatMoney(it.price_list_rate)}</div></button>)}
          </div>
          <div className="mt-2 flex-1 divide-y divide-border rounded-lg border border-border">
            {lines.length === 0 && <p className="p-3 text-center text-xs text-muted-foreground">Tap dishes to add them</p>}
            {lines.map((l) => <div key={l.item.item_code} className="flex items-center gap-2 px-2 py-1.5 text-sm"><span className="flex-1 truncate">{l.qty} × {l.item.item_name}</span>
              <button onClick={() => add(l.item, -1)} className="rounded border border-border px-1.5">−</button><button onClick={() => add(l.item, 1)} className="rounded border border-border px-1.5">+</button>
              <button onClick={() => add(l.item, -l.qty)} className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></div>)}
          </div>
          <div className="mt-2 flex justify-between text-sm font-semibold"><span>Subtotal (tax added at billing)</span><span>{formatMoney(total)}</span></div>
          <Button className="mt-2 w-full bg-primary text-primary-foreground" disabled={saving || !lines.length || !f.address} onClick={() => void save()}>{saving ? "Saving…" : "Send to kitchen (cash on delivery)"}</Button>
        </div>
      </div>
    </Dialog>
  );
}
