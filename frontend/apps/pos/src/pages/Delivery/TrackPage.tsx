import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Bike, Check, ChefHat, Clock, MapPin, Package, Phone, Receipt } from "lucide-react";
import { LiveMap, type MapMarker } from "@/components/common/live-map";
import { getCall, humanizeError } from "@/services/frappe";
import { formatMoney } from "@/utils/currency";
import { cn } from "@/utils/cn";

interface Track { order_no: string; status: string; steps: string[]; step: number; cancelled: boolean; restaurant: string; logo?: string;
  branch_point: { lat: number; lng: number }; drop: { lat?: number; lng?: number; address?: string };
  rider: { name?: string; phone?: string; lat?: number; lng?: number; by?: string }; eta_minutes: number; delivery_code?: string;
  cod_amount: number; items: { item_name: string; qty: number }[] }

const ICONS = [Receipt, ChefHat, Package, Bike, Check];

/** Public order tracking (the link sent to the customer): status steps, the rider on the map, ETA, delivery code. */
export default function TrackPage() {
  const { key = "" } = useParams();
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
  const delivered = t.status === "Delivered";
  return (
    <div className="mx-auto min-h-screen max-w-md bg-background">
      <header className="flex items-center gap-3 px-4 py-4">
        {t.logo ? <img src={t.logo} alt="" className="h-9 w-auto rounded bg-white p-1" /> : null}
        <div><div className="font-bold">{t.restaurant}</div><div className="text-xs text-muted-foreground">Order #{t.order_no}</div></div>
      </header>
      <div className="mx-4 rounded-2xl bg-gradient-to-br from-primary to-violet-700 p-5 text-white shadow-lg">
        <div className="text-xs uppercase tracking-wide text-white/75">{t.cancelled ? "Order cancelled" : delivered ? "Delivered" : "Arriving in"}</div>
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
          {t.items.map((i, k) => <div key={k} className="flex justify-between py-0.5"><span>{i.qty} × {i.item_name}</span></div>)}
          {t.cod_amount > 0 && <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold"><span>Pay on delivery</span><span>{formatMoney(t.cod_amount)}</span></div>}
        </div>
      </div>
    </div>
  );
}
