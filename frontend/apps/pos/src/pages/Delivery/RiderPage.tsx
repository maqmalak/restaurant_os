import { useEffect, useRef, useState } from "react";
import { useFrappeEventListener, useFrappeGetCall } from "frappe-react-sdk";
import toast from "react-hot-toast";
import { Banknote, Bike, Camera, Check, LogOut, MapPin, Navigation, Package, Phone, Power, X } from "lucide-react";
import { Logo } from "@/components/common/logo";
import { useAuth } from "@/hooks/useAuth";
import { humanizeError, postCall } from "@/services/frappe";
import { formatMoney } from "@/utils/currency";
import { cn } from "@/utils/cn";

interface Job { assignment: string; status: string; order: string; order_no: string; order_status: string; channel: string; customer_name?: string;
  phone?: string; address?: string; lat?: number; lng?: number; cod_amount: number; distance_km: number; notes?: string; invoice?: string;
  items: { item_name: string; qty: number }[]; cash_collected: number }
interface Me { rider: { name: string; rider_name: string; status: string; branch: string; vehicle: string; cash_in_hand: number };
  branch: { name: string; lat: number; lng: number; address?: string }; ping_seconds: number; require_otp: number;
  offers: Job[]; active: Job[]; done: Job[] }

const mapsLink = (j: Job) => j.lat && j.lng ? `https://www.google.com/maps/dir/?api=1&destination=${j.lat},${j.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.address ?? "")}`;

/** Rider app (phone): duty switch, offers, active deliveries, proof of delivery and cash, live GPS while on duty. */
export default function RiderPage() {
  const { logout } = useAuth();
  const { data, mutate, error } = useFrappeGetCall<{ message: Me }>("restaurant_os.api.riders.me", undefined, "ros.rider.me", { refreshInterval: 20000 });
  const me = data?.message;
  const [busy, setBusy] = useState("");
  const [deliver, setDeliver] = useState<Job | null>(null);
  const [gps, setGps] = useState<"off" | "on" | "denied">("off");
  useFrappeEventListener("ros_rider", (e: { event: string }) => { if (e.event === "offer") { try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ } toast("New delivery offer"); } void mutate(); });

  // GPS while on duty: watchPosition, posted at most every ping_seconds
  const last = useRef(0);
  const onDuty = me && me.rider.status !== "Off Duty";
  useEffect(() => {
    if (!onDuty || !("geolocation" in navigator)) { setGps("off"); return; }
    const id = navigator.geolocation.watchPosition((p) => {
      setGps("on");
      const now = Date.now();
      if (now - last.current < (me!.ping_seconds || 15) * 1000) return;
      last.current = now;
      void postCall("restaurant_os.api.riders.location", { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, speed: p.coords.speed ?? 0 }).catch(() => undefined);
    }, () => setGps("denied"), { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [onDuty, me?.ping_seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  /** One GPS fix for the HR check-in (8 s at most; check in without it when the phone can't tell). */
  const here = () => new Promise<{ lat?: number; lng?: number }>((resolve) => {
    if (!("geolocation" in navigator)) return resolve({});
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
  });
  const toggleDuty = async () => {
    setBusy("duty");
    const pos = await here();
    setBusy("");
    await act("duty", "set_duty", { on: onDuty ? 0 : 1, ...pos }, onDuty ? "Checked out — off duty" : "Checked in — on duty, waiting for orders");
  };

  const act = async (key: string, method: string, args: Record<string, unknown>, ok?: string) => {
    setBusy(key);
    try { await postCall(`restaurant_os.api.riders.${method}`, args); if (ok) toast.success(ok); await mutate(); return true; }
    catch (e) { toast.error(humanizeError(e)); return false; } finally { setBusy(""); }
  };

  if (error) return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center text-sm">{humanizeError(error)}<button onClick={() => void logout()} className="text-primary underline">Sign out</button></div>;
  if (!me) return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Logo className="h-8 w-auto" />
          <button onClick={() => void logout()} className="ml-auto rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{me.rider.rider_name}</div>
            <div className="text-xs text-muted-foreground">{me.rider.vehicle} · {me.rider.branch} · GPS {gps === "on" ? "on" : gps === "denied" ? "blocked" : "off"}</div>
          </div>
          <button disabled={busy === "duty"} onClick={() => void toggleDuty()} title={onDuty ? "Check out (go off duty)" : "Check in (go on duty)"}
            className={cn("flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-white shadow", onDuty ? "bg-green-600" : "bg-neutral-500")}>
            <Power className="h-4 w-4" /> {onDuty ? (me.rider.status === "On Delivery" ? "On delivery" : "On duty") : "Off duty"}</button>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-sm dark:bg-amber-500/10">
          <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300"><Banknote className="h-4 w-4" /> Cash in hand</span>
          <b>{formatMoney(me.rider.cash_in_hand)}</b>
        </div>
      </header>

      <main className="space-y-5 p-4">
        {me.offers.length > 0 && <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">New offers</h2>
          {me.offers.map((j) => <JobCard key={j.assignment} j={j} offer>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={!!busy} onClick={() => void act(j.assignment, "reject", { assignment: j.assignment }, "Declined")} className="flex h-11 items-center justify-center gap-1 rounded-xl border border-border font-semibold"><X className="h-4 w-4" /> Decline</button>
              <button disabled={!!busy} onClick={() => void act(j.assignment, "accept", { assignment: j.assignment }, `Order #${j.order_no} is yours`)} className="flex h-11 items-center justify-center gap-1 rounded-xl bg-green-600 font-semibold text-white"><Check className="h-4 w-4" /> Accept</button>
            </div>
          </JobCard>)}
        </section>}

        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">My deliveries</h2>
          {me.active.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{onDuty ? "Waiting for the next order…" : "Go on duty to receive orders."}</p>}
          {me.active.map((j) => <JobCard key={j.assignment} j={j}>
            <div className="grid grid-cols-3 gap-2">
              {j.phone && <a href={`tel:${j.phone}`} className="flex h-11 items-center justify-center gap-1 rounded-xl border border-border text-sm font-semibold"><Phone className="h-4 w-4" /> Call</a>}
              <a href={mapsLink(j)} target="_blank" rel="noopener" className="flex h-11 items-center justify-center gap-1 rounded-xl border border-border text-sm font-semibold"><Navigation className="h-4 w-4" /> Route</a>
              {j.status === "Accepted"
                ? <button disabled={!!busy || j.order_status !== "Ready"} onClick={() => void act(j.assignment, "pickup", { assignment: j.assignment }, "Picked up — on the way")}
                    className="flex h-11 items-center justify-center gap-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50" title={j.order_status !== "Ready" ? "The kitchen hasn't finished it yet" : ""}>
                    <Package className="h-4 w-4" /> {j.order_status === "Ready" ? "Picked up" : "Cooking…"}</button>
                : <button onClick={() => setDeliver(j)} className="flex h-11 items-center justify-center gap-1 rounded-xl bg-green-600 text-sm font-semibold text-white"><Check className="h-4 w-4" /> Delivered</button>}
            </div>
          </JobCard>)}
        </section>

        {me.done.length > 0 && <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Delivered today ({me.done.length})</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {me.done.map((j) => <li key={j.assignment} className="flex justify-between px-3 py-2"><span>#{j.order_no} · {j.customer_name}</span><span className="text-muted-foreground">{j.cash_collected ? formatMoney(j.cash_collected) : "prepaid"}</span></li>)}
          </ul>
        </section>}
      </main>

      {deliver && <DeliverSheet j={deliver} requireOtp={!!me.require_otp} onClose={() => setDeliver(null)}
        onDone={async (otp, photo, cash) => { const ok = await act(deliver.assignment, "deliver", { assignment: deliver.assignment, otp: otp || undefined, photo: photo || undefined, cash }, `Order #${deliver.order_no} delivered`); if (ok) setDeliver(null); }} />}
    </div>
  );
}

function JobCard({ j, offer, children }: { j: Job; offer?: boolean; children: React.ReactNode }) {
  return (
    <article className={cn("mb-3 overflow-hidden rounded-2xl border bg-card shadow-sm", offer ? "border-primary ring-2 ring-primary/20" : "border-border")}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Bike className="h-4 w-4 text-primary" />
        <span className="font-bold">Order #{j.order_no}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase">{j.channel}</span>
        <span className="ml-auto text-xs text-muted-foreground">{j.distance_km ? `${j.distance_km.toFixed(1)} km` : ""}</span>
      </div>
      <div className="space-y-2 px-4 py-3 text-sm">
        <div className="font-semibold">{j.customer_name}</div>
        <div className="flex gap-1.5 text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{j.address || "—"}</div>
        <div className="text-xs text-muted-foreground">{j.items.map((i) => `${i.qty}× ${i.item_name}`).join(" · ")}</div>
        {j.notes && <div className="rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">{j.notes}</div>}
        <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
          <span className="text-xs text-muted-foreground">{j.cod_amount > 0 ? "Collect cash" : "Prepaid"}</span>
          <b className={cn(j.cod_amount > 0 && "text-amber-600")}>{j.cod_amount > 0 ? formatMoney(j.cod_amount) : "—"}</b>
        </div>
        {children}
      </div>
    </article>
  );
}

function DeliverSheet({ j, requireOtp, onClose, onDone }: { j: Job; requireOtp: boolean; onClose: () => void; onDone: (otp: string, photo: string, cash: number) => void }) {
  const [otp, setOtp] = useState("");
  const [cash, setCash] = useState(String(j.cod_amount || 0));
  const [photo, setPhoto] = useState("");
  const [uploading, setUploading] = useState(false);
  const upload = async (f: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f); fd.append("is_private", "1"); fd.append("folder", "Home");
      const res = await fetch("/api/method/upload_file", { method: "POST", body: fd, headers: { "X-Frappe-CSRF-Token": (window as unknown as { csrf_token?: string }).csrf_token ?? "" }, credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?._server_messages || "Upload failed");
      setPhoto(json.message.file_url);
    } catch (e) { toast.error(humanizeError(e)); } finally { setUploading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div className="mx-auto w-full max-w-md space-y-3 rounded-t-3xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold">Deliver order #{j.order_no}</h3>
        <label className="block text-sm">Customer's delivery code
          <input inputMode="numeric" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="4 digits"
            className="mt-1 h-12 w-full rounded-xl border border-input bg-transparent px-3 text-center text-2xl tracking-[0.5em]" /></label>
        {!requireOtp && <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm">
          <Camera className="h-4 w-4" /> {uploading ? "Uploading…" : photo ? "Photo attached ✓" : "…or take a photo of the handover"}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} /></label>}
        <label className="block text-sm">Cash collected
          <input type="number" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} className="mt-1 h-12 w-full rounded-xl border border-input bg-transparent px-3 text-right text-xl" /></label>
        <button disabled={uploading || (!otp && (requireOtp || !photo))} onClick={() => onDone(otp, photo, Number(cash) || 0)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-green-600 font-bold text-white disabled:opacity-50"><Check className="h-5 w-5" /> Confirm delivery</button>
      </div>
    </div>
  );
}
