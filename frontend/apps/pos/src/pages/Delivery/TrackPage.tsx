import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Bike, Check, ChefHat, Clock, Gift, MapPin, Package, Phone, Receipt, Star } from "lucide-react";
import { LiveMap, type MapMarker } from "@/components/common/live-map";
import { useNavigate } from "react-router-dom";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { formatMoney } from "@/utils/currency";
import { cn } from "@/utils/cn";

interface Track { order_no: string; status: string; steps: string[]; step: number; cancelled: boolean; restaurant: string; logo?: string;
  branch_point: { lat: number; lng: number }; drop: { lat?: number; lng?: number; address?: string };
  rider: { name?: string; phone?: string; lat?: number; lng?: number; by?: string }; eta_minutes: number; delivery_code?: string;
  cod_amount: number; items: { item_code: string; item_name: string; qty: number; free?: number }[];
  can_review?: boolean; rating?: number; points_earned?: number; offers?: string[]; coupon?: string; order_type?: string; payment_method?: string; payment_status?: string; awaiting_payment?: boolean }

const ICONS = [Receipt, ChefHat, Package, Bike, Check];

/** Public order tracking (the link sent to the customer): status steps, the rider on the map, ETA, delivery code. */
export default function TrackPage() {
  const { key = "" } = useParams();
  const navigate = useNavigate();
  const payAgain = async () => {
    try {
      const r = await postCall<{ payment_url: string }>("restaurant_os.api.payments.retry", { key });
      if (r.payment_url.startsWith("/ros/")) navigate(r.payment_url.replace(/^\/ros/, "")); else window.location.assign(r.payment_url);
    } catch (e) { setErr(humanizeError(e)); }
  };
  const [t, setT] = useState<Track | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    const load = () => getCall<Track>("restaurant_os.api.riders.track", { key }).then((r) => live && setT(r)).catch((e) => live && setErr(humanizeError(e)));
    void load();
    const id = setInterval(load, 10000);
    return () => { live = false; clearInterval(id); };
  }, [key]);
  const markers = useMemo<MapMarker[]>(() => {
    if (!t) return [];
    const m: MapMarker[] = [{ id: "b", lat: t.branch_point.lat, lng: t.branch_point.lng, color: "#0d9488", kind: "home", label: "🍽", title: t.restaurant }];
    if (t.drop.lat && t.drop.lng) m.push({ id: "d", lat: t.drop.lat, lng: t.drop.lng, color: "#ea580c", label: "🏠", title: "You" });
    if (t.rider.lat && t.rider.lng) m.push({ id: "r", lat: t.rider.lat, lng: t.rider.lng, color: t.rider.by === "Foodpanda Rider" ? "#db2777" : "#2563eb", kind: "dot", label: "🛵", title: t.rider.name });
    return m;
  }, [t]);

  if (err) return <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground">{err}</div>;
  if (!t) return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading your order…</div>;
  const delivered = t.status === "Delivered" || t.status === "Completed";
  return (
    <div className="mx-auto min-h-screen max-w-md bg-background">
      <header className="flex items-center gap-3 px-4 py-4">
        {t.logo ? <img src={t.logo} alt="" className="h-9 w-auto rounded bg-white p-1" /> : null}
        <div><div className="font-bold">{t.restaurant}</div><div className="text-xs text-muted-foreground">Order #{t.order_no}</div></div>
      </header>
      {t.awaiting_payment && (
        <div className="mx-4 mb-3 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          <div className="font-semibold text-amber-800 dark:text-amber-300">{t.payment_status === "Failed" ? "Your payment didn't go through." : "Waiting for your payment."}</div>
          <div className="mt-0.5 text-muted-foreground">We start cooking as soon as it's paid.</div>
          <button onClick={() => void payAgain()} className="mt-3 h-11 w-full rounded-xl bg-primary font-bold text-primary-foreground">Pay now</button>
        </div>
      )}
      <div className="mx-4 rounded-2xl bg-gradient-to-br from-primary to-violet-700 p-5 text-white shadow-lg">
        <div className="text-xs uppercase tracking-wide text-white/75">{t.cancelled ? "Order cancelled" : delivered ? (t.order_type === "Delivery" ? "Delivered" : "Collected") : t.order_type === "Delivery" ? "Arriving in" : "Ready for pickup in"}</div>
        <div className="text-3xl font-extrabold">{t.cancelled ? "—" : delivered ? "Enjoy your meal!" : `${t.eta_minutes} min`}</div>
        {t.delivery_code && !t.cancelled && <div className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-sm">Give this code to the rider: <b className="ml-1 font-mono text-lg tracking-[0.3em]">{t.delivery_code}</b></div>}
      </div>
      <ol className="mx-4 mt-5 grid grid-cols-5 gap-1">
        {t.steps.map((s, i) => { const Icon = ICONS[i] ?? Clock; const done = i <= t.step; return (
          <li key={s} className="flex flex-col items-center text-center">
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", done ? "bg-green-600 text-white" : "bg-muted text-muted-foreground")}><Icon className="h-4 w-4" /></span>
            <span className={cn("mt-1 text-[10px] leading-tight", done ? "font-semibold" : "text-muted-foreground")}>{s}</span>
          </li>
        ); })}
      </ol>
      <LiveMap markers={markers} lines={t.rider.lat && t.drop.lat ? [{ id: "l", points: [[t.rider.lat, t.rider.lng!], [t.drop.lat, t.drop.lng!]], color: "#2563eb", dashed: true }] : []}
        className="mx-4 mt-5 h-64 overflow-hidden rounded-2xl" fitKey={t.rider.lat ? "rider" : "base"} />
      <div className="mx-4 mt-4 space-y-3 pb-10 text-sm">
        {t.rider.name && <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          <Bike className="h-5 w-5 text-primary" /><div className="flex-1"><div className="font-semibold">{t.rider.name}</div><div className="text-xs text-muted-foreground">{t.rider.by === "Foodpanda Rider" ? "Foodpanda rider" : "Our rider"}</div></div>
          {t.rider.phone && <a href={`tel:${t.rider.phone}`} className="rounded-full bg-green-600 p-2 text-white"><Phone className="h-4 w-4" /></a>}
        </div>}
        {t.drop.address && <div className="flex gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />{t.drop.address}</div>}
        <div className="rounded-xl border border-border bg-card p-3">
          {t.items.map((i, k) => <div key={k} className="flex justify-between py-0.5"><span>{i.qty} × {i.item_name}</span>{i.free ? <span className="text-xs font-semibold text-green-600">Free</span> : null}</div>)}
          {(t.offers?.length || t.coupon) ? <div className="mt-2 flex items-center gap-1 text-xs text-green-600"><Gift className="h-3.5 w-3.5" />{[...(t.offers ?? []), t.coupon].filter(Boolean).join(" · ")}</div> : null}
          {t.cod_amount > 0 && <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold"><span>Pay on {t.order_type === "Delivery" ? "delivery" : "pickup"}</span><span>{formatMoney(t.cod_amount)}</span></div>}
          {t.payment_status === "Paid" && <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold text-green-600"><span>Paid online</span><span>✓</span></div>}
        </div>
        {t.points_earned ? <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300"><Star className="h-4 w-4" />You earned <b>{t.points_earned} points</b> on this order.</div> : null}
        {t.can_review && <ReviewForm trackKey={key} items={t.items.filter((i) => !i.free)} delivery={t.order_type === "Delivery"} onDone={(r) => setT({ ...t, can_review: false, rating: r })} />}
        {!t.can_review && t.rating ? <div className="rounded-xl border border-border bg-card p-3 text-center"><Stars value={t.rating} /><div className="mt-1 text-xs text-muted-foreground">Thanks for your feedback!</div></div> : null}
      </div>
    </div>
  );
}

function Stars({ value, onChange, size = "h-6 w-6", label }: { value: number; onChange?: (v: number) => void; size?: string; label?: string }) {
  return (
    <div className="flex justify-center gap-1" role={onChange ? "radiogroup" : undefined} aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = <Star className={cn(size, n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />;
        return onChange
          ? <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(n)} className="p-0.5">{icon}</button>
          : <span key={n}>{icon}</span>;
      })}
    </div>
  );
}

/** Rate the order once it's delivered / collected: overall, food, delivery, each dish and a comment. */
function ReviewForm({ trackKey, items, delivery, onDone }: { trackKey: string; items: { item_code: string; item_name: string }[]; delivery: boolean; onDone: (rating: number) => void }) {
  const [r, setR] = useState({ overall: 0, food: 0, delivery: 0 });
  const [dish, setDish] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dishes = [...new Map(items.map((i) => [i.item_code, i])).values()];
  const send = async () => {
    setBusy(true); setErr("");
    try {
      await postCall("restaurant_os.api.online.review", { key: trackKey, data: JSON.stringify({ rating_overall: r.overall, rating_food: r.food || undefined,
        rating_delivery: delivery ? r.delivery || undefined : undefined, comment: comment.trim() || undefined,
        items: Object.entries(dish).filter(([, v]) => v).map(([item_code, rating]) => ({ item_code, rating })) }) });
      onDone(r.overall);
    } catch (e) { setErr(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="text-center"><div className="font-semibold">How was your order?</div><div className="mt-2"><Stars value={r.overall} onChange={(v) => setR({ ...r, overall: v })} size="h-9 w-9" label="Overall rating" /></div></div>
      {r.overall > 0 && <>
        <div className="grid grid-cols-2 gap-3 text-center text-xs text-muted-foreground">
          <div>Food<Stars value={r.food} onChange={(v) => setR({ ...r, food: v })} size="h-5 w-5" label="Food rating" /></div>
          {delivery && <div>Delivery<Stars value={r.delivery} onChange={(v) => setR({ ...r, delivery: v })} size="h-5 w-5" label="Delivery rating" /></div>}
        </div>
        {dishes.length > 1 && <div className="space-y-1">{dishes.map((d) => (
          <div key={d.item_code} className="flex items-center justify-between text-sm"><span className="truncate">{d.item_name}</span>
            <Stars value={dish[d.item_code] ?? 0} onChange={(v) => setDish({ ...dish, [d.item_code]: v })} size="h-4 w-4" label={`${d.item_name} rating`} /></div>))}</div>}
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} placeholder="Tell us more (optional)"
          className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm" />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button disabled={busy} onClick={() => void send()} className="h-11 w-full rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy ? "Sending…" : "Send review"}</button>
      </>}
    </div>
  );
}
