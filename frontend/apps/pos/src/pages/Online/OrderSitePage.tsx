import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Bike, Clock, MapPin, Minus, Phone, Plus, ShoppingBag, Store, Trash2, X } from "lucide-react";
import { LiveMap } from "@/components/common/live-map";
import { humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { ItemSheet } from "./ItemSheet";
import { type CartLine, cartPayload, linePrice, type MenuItem, money, useMenu } from "./menu";

interface Quote { subtotal: number; tax: number; total: number; taxes: { description: string; amount: number }[]; distance_km?: number; min_order: number }
const CART_KEY = "ros.web.cart";
const load = (): CartLine[] => { try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; } };

/** Public ordering site: menu → cart → delivery or pickup → order straight to the kitchen → live tracking. */
export default function OrderSitePage() {
  const [branch, setBranch] = useState<string | undefined>();
  const { menu, error } = useMenu(branch);
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState<MenuItem | null>(null);
  const [cart, setCart] = useState<CartLine[]>(load);
  const [checkout, setCheckout] = useState(false);
  const sections = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {                                          // save — unless it's already what's stored (e.g. synced from another tab)
    try { const v = JSON.stringify(cart); if (localStorage.getItem(CART_KEY) !== v) localStorage.setItem(CART_KEY, v); } catch { /* private mode */ }
  }, [cart]);
  useEffect(() => {                                          // other tabs: follow their changes instead of overwriting them
    const onStorage = (e: StorageEvent) => { if (e.key === CART_KEY) setCart(load()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {                                          // installable as an app on phones
    const l = document.createElement("link"); l.rel = "manifest"; l.href = `${import.meta.env.BASE_URL}order/manifest.webmanifest`;
    document.head.appendChild(l); document.title = menu ? `${menu.restaurant} · Order online` : "Order online";
    return () => l.remove();
  }, [menu]);
  useEffect(() => {                                          // drop lines whose dish is now sold out or gone — and only then touch the cart
    if (!menu) return;
    setCart((c) => { const keep = c.filter((l) => menu.items.some((i) => i.item_code === l.item.item_code && !i.sold_out)); return keep.length === c.length ? c : keep; });
  }, [menu]);
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const subtotal = cart.reduce((s, l) => s + linePrice(l) * l.qty, 0);

  if (error) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-muted-foreground">Can't load the menu right now.</div>;
  if (!menu) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading the menu…</div>;
  const cur = menu.currency;

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="relative overflow-hidden bg-gradient-to-br from-primary to-violet-700 px-4 pb-6 pt-5 text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          {menu.logo && <img src={menu.logo} alt="" className="h-12 w-auto rounded-lg bg-white p-1.5" />}
          <div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-extrabold">{menu.restaurant}</h1>
            <p className="flex items-center gap-1 text-sm text-white/80"><MapPin className="h-3.5 w-3.5" />{menu.branch.address || menu.branch.name}</p></div>
          {menu.branch.phone && <a href={`tel:${menu.branch.phone}`} className="rounded-full bg-white/15 p-2.5" aria-label="Call"><Phone className="h-5 w-5" /></a>}
        </div>
        <div className="mx-auto mt-4 flex max-w-5xl flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1"><Bike className="h-3.5 w-3.5" /> Delivery ~{menu.branch.delivery_minutes} min · {money(menu.delivery_fee, cur)}</span>
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1"><Store className="h-3.5 w-3.5" /> Pickup ~{menu.branch.prep_minutes} min</span>
          <span className="rounded-full bg-white/15 px-3 py-1">Min order {money(menu.min_order, cur)}</span>
          {menu.branches.length > 1 && <select value={menu.branch.name} onChange={(e) => setBranch(e.target.value)} className="rounded-full bg-white/15 px-3 py-1 text-white">
            {menu.branches.map((b) => <option key={b.name} value={b.name} className="text-black">{b.name}</option>)}</select>}
        </div>
        {!menu.open && <div className="mx-auto mt-3 max-w-5xl rounded-lg bg-black/30 px-3 py-2 text-sm font-semibold">Online ordering is closed right now.</div>}
      </header>

      <nav className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-2">
          {menu.categories.map((c) => (
            <button key={c} onClick={() => { setCat(c); sections.current[c]?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
              className={cn("whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold", cat === c ? "bg-primary text-primary-foreground" : "bg-muted")}>{c}</button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-5">
        {menu.categories.map((c) => (
          <section key={c} ref={(el) => { sections.current[c] = el; }} className="scroll-mt-16">
            <h2 className="mb-3 text-xl font-bold">{c}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {menu.items.filter((i) => i.item_group === c).map((i) => (
                <button key={i.item_code} disabled={i.sold_out || !menu.open} onClick={() => setOpen(i)}
                  className="flex gap-3 overflow-hidden rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition hover:shadow-md disabled:opacity-60">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{i.item_name}</div>
                    {i.description && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{i.description}</div>}
                    <div className="mt-2 font-bold text-primary">{money(i.price, cur)}</div>
                    {i.sold_out && <div className="mt-1 text-xs font-bold uppercase text-red-600">Sold out</div>}
                  </div>
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {i.image && <img src={i.image} alt="" loading="lazy" className="h-full w-full object-cover" />}
                    {!i.sold_out && <span className="absolute bottom-1 right-1 rounded-full bg-white p-1 text-primary shadow"><Plus className="h-4 w-4" /></span>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
        <p className="pb-6 text-center text-xs text-muted-foreground">Prices {menu.tax.included ? "include" : "exclude"} {menu.tax.rate ? `${menu.tax.rate}% sales tax` : "tax"}.</p>
      </main>

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3">
          <button onClick={() => setCheckout(true)} className="mx-auto flex h-14 w-full max-w-xl items-center justify-between rounded-2xl bg-primary px-5 font-bold text-primary-foreground shadow-xl">
            <span className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" /> {count} item{count === 1 ? "" : "s"}</span><span>View cart · {money(subtotal, cur)}</span>
          </button>
        </div>
      )}

      {open && <ItemSheet item={open} currency={cur} onClose={() => setOpen(null)}
        onAdd={(qty, modifiers, notes) => { setCart((c) => [...c, { key: crypto.randomUUID(), item: open, qty, modifiers, notes }]); setOpen(null); toast.success(`${open.item_name} added`); }} />}
      {checkout && <Checkout menu={menu} cart={cart} setCart={setCart} onClose={() => setCheckout(false)} />}
    </div>
  );
}

function Checkout({ menu, cart, setCart, onClose }: { menu: NonNullable<ReturnType<typeof useMenu>["menu"]>; cart: CartLine[]; setCart: (f: (c: CartLine[]) => CartLine[]) => void; onClose: () => void }) {
  const navigate = useNavigate();
  const cur = menu.currency;
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem("ros.web.me") || "{}"); } catch { return {}; } }, []);
  const [type, setType] = useState<"Delivery" | "Pickup">(saved.type ?? "Delivery");
  const [f, setF] = useState({ name: saved.name ?? "", phone: saved.phone ?? "", address: saved.address ?? "", notes: "" });
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(saved.pin ?? null);
  const [pay, setPay] = useState<"Cash" | "Online">(saved.pay === "Online" && menu.online_payment ? "Online" : "Cash");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const uuid = useRef(crypto.randomUUID());
  const items = cartPayload(cart);
  const key = JSON.stringify([items, type, pin]);
  useEffect(() => {
    if (!cart.length) return;
    const t = setTimeout(() => { postCall<Quote>("restaurant_os.api.online.quote", { data: JSON.stringify({ branch: menu.branch.name, order_type: type, items, lat: pin?.lat, lng: pin?.lng }) })
      .then(setQuote).catch((e) => toast.error(humanizeError(e))); }, 250);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const far = type === "Delivery" && quote?.distance_km != null && menu.branch.delivery_radius_km > 0 && quote.distance_km > menu.branch.delivery_radius_km;
  const subtotalNoFee = cart.reduce((s, l) => s + linePrice(l) * l.qty, 0);
  const belowMin = subtotalNoFee < menu.min_order;
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => setPin({ lat: p.coords.latitude, lng: p.coords.longitude }), () => toast.error("Couldn't get your location — tap the map instead"));
  const place = async () => {
    setBusy(true);
    try {
      localStorage.setItem("ros.web.me", JSON.stringify({ type, name: f.name, phone: f.phone, address: f.address, pin, pay }));
      const r = await postCall<{ tracking_key: string; order_no: string; payment_url?: string }>("restaurant_os.api.online.place_order", { data: JSON.stringify({
        branch: menu.branch.name, order_type: type, items, customer_name: f.name, phone: f.phone, address: f.address, notes: f.notes, payment: pay,
        lat: pin?.lat, lng: pin?.lng, client_order_uuid: uuid.current,
        source: window.matchMedia("(display-mode: standalone)").matches ? "app" : "web" }) });
      // clear the saved cart right away: navigating unmounts this page before its save-to-storage effect would run
      try { localStorage.removeItem(CART_KEY); } catch { /* private mode */ }
      setCart(() => []);
      if (r.payment_url) {                                   // pay online: the gateway (or the in-app test gateway)
        if (r.payment_url.startsWith("/ros/")) navigate(r.payment_url.replace(/^\/ros/, ""));
        else window.location.assign(r.payment_url);
      } else navigate(`/track/${r.tracking_key}`);
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  const input = (k: keyof typeof f, label: string, type = "text", required = true) => (
    <label className="block text-sm">{label}{required && <span className="text-red-500"> *</span>}
      <input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-input bg-transparent px-3" /></label>);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col bg-background" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3"><h2 className="flex-1 text-lg font-bold">Your order</h2>
          {cart.length > 0 && <button onClick={() => setCart(() => [])} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-500/10">Clear cart</button>}
          <button onClick={onClose} className="rounded-full p-2 hover:bg-muted" aria-label="Close"><X className="h-5 w-5" /></button></div>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div className="divide-y divide-border rounded-2xl border border-border">
            {cart.map((l) => (
              <div key={l.key} className="flex gap-3 p-3">
                <div className="min-w-0 flex-1"><div className="font-medium">{l.item.item_name}</div>
                  {l.modifiers.length > 0 && <div className="text-xs text-muted-foreground">{l.modifiers.map((m) => m.name).join(", ")}</div>}
                  {l.notes && <div className="text-xs italic text-muted-foreground">“{l.notes}”</div>}
                  <div className="mt-1 text-sm font-semibold">{money(linePrice(l) * l.qty, cur)}</div></div>
                <div className="flex items-center gap-1 self-center">
                  <button onClick={() => setCart((c) => c.map((x) => x.key === l.key ? { ...x, qty: Math.max(1, x.qty - 1) } : x))} className="rounded-lg border border-border p-1.5"><Minus className="h-3.5 w-3.5" /></button>
                  <span className="w-6 text-center font-bold">{l.qty}</span>
                  <button onClick={() => setCart((c) => c.map((x) => x.key === l.key ? { ...x, qty: x.qty + 1 } : x))} className="rounded-lg border border-border p-1.5"><Plus className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))} className="p-1.5 text-red-500" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
            {cart.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Your cart is empty.</p>}
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
            {(["Delivery", "Pickup"] as const).map((t) => <button key={t} onClick={() => setType(t)} className={cn("flex h-11 items-center justify-center gap-2 rounded-xl font-semibold", type === t ? "bg-card shadow" : "text-muted-foreground")}>
              {t === "Delivery" ? <Bike className="h-4 w-4" /> : <Store className="h-4 w-4" />}{t}</button>)}
          </div>
          <div className="space-y-3">
            {input("name", "Your name")}{input("phone", "Mobile number", "tel")}
            {type === "Delivery" && <>
              {input("address", "Delivery address")}
              <div className="flex items-center justify-between text-sm"><span>Pin your location <span className="text-xs text-muted-foreground">(tap the map)</span></span>
                <button onClick={locate} className="text-xs font-semibold text-primary">Use my location</button></div>
              <LiveMap className="h-52 w-full overflow-hidden rounded-2xl" fitKey="checkout" onMapClick={(lat, lng) => setPin({ lat, lng })}
                markers={[{ id: "b", lat: menu.branch.lat, lng: menu.branch.lng, color: "#0d9488", kind: "home", label: "🍽", title: menu.restaurant },
                  ...(pin ? [{ id: "p", lat: pin.lat, lng: pin.lng, color: "#ea580c", label: "🏠", title: "You" }] : [])]} />
              {far && <p className="rounded-lg bg-red-500/10 p-2 text-sm text-red-600">That's {quote!.distance_km} km away — outside our {menu.branch.delivery_radius_km} km delivery area. Choose pickup instead.</p>}
            </>}
            <label className="block text-sm">Note for the restaurant<textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={300} rows={2} className="mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2" /></label>
          </div>
          <div className="rounded-2xl border border-border p-3 text-sm">
            <div className="mb-2 font-semibold">Payment</div>
            {([["Cash", `Cash on ${type === "Delivery" ? "delivery" : "pickup"}`, "Pay when you get your food"],
               ["Online", "Pay online — card / wallet", menu.payment_test_mode ? "Test gateway: no real money is charged" : "Secure payment page"]] as const).map(([k, label, hint]) => {
              const disabled = k === "Online" && !menu.online_payment;
              return (
                <button key={k} type="button" disabled={disabled} onClick={() => setPay(k)}
                  className={cn("mt-2 flex w-full items-center gap-3 rounded-xl border p-3 text-left first:mt-0 disabled:opacity-50", pay === k ? "border-primary bg-primary/5" : "border-border")}>
                  <span className={cn("h-4 w-4 shrink-0 rounded-full", pay === k ? "border-4 border-primary" : "border border-border")} />
                  <span><span className="block font-medium">{label}</span><span className="block text-xs text-muted-foreground">{disabled ? "Not available right now" : hint}</span></span>
                </button>
              );
            })}
          </div>
          {quote && <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{money(quote.subtotal, cur)}</span></div>
            {quote.taxes.map((t) => <div key={t.description} className="flex justify-between text-muted-foreground"><span>{t.description}</span><span>{money(t.amount, cur)}</span></div>)}
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><span>Total</span><span>{money(quote.total, cur)}</span></div>
            {type === "Delivery" && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> Includes the {money(menu.delivery_fee, cur)} delivery fee</p>}
          </div>}
        </div>
        <div className="border-t border-border p-4">
          {belowMin && <p className="mb-2 text-center text-xs text-red-600">Add {money(menu.min_order - subtotalNoFee, cur)} more to reach the minimum order.</p>}
          <button disabled={busy || !cart.length || !f.name.trim() || f.phone.replace(/\D/g, "").length < 10 || belowMin || far || (type === "Delivery" && !f.address.trim()) || !menu.open}
            onClick={() => void place()} className="h-14 w-full rounded-2xl bg-primary text-lg font-bold text-primary-foreground disabled:opacity-50">
            {busy ? "Placing your order…" : `${pay === "Online" ? "Pay" : "Place order"}${quote ? ` · ${money(quote.total, cur)}` : ""}`}</button>
        </div>
      </div>
    </div>
  );
}
