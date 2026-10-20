import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Hand, Minus, Plus, ShoppingBag, Trash2, Utensils, Store } from "lucide-react";
import { humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { ItemSheet } from "./ItemSheet";
import { type CartLine, cartPayload, linePrice, type MenuItem, money, useMenu } from "./menu";

type Stage = "welcome" | "type" | "menu" | "done";
interface Quote { subtotal: number; tax: number; total: number; discount: number; offers: string[] }

/** Self-order kiosk: touch to start → eat in / take away → big menu → pay at the counter (order number). Resets when idle. */
export default function KioskPage() {
  const { menu } = useMenu();
  const [stage, setStage] = useState<Stage>("welcome");
  const [type, setType] = useState<"Dine-in" | "Takeaway">("Dine-in");
  const [cat, setCat] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [open, setOpen] = useState<MenuItem | null>(null);
  const [name, setName] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [done, setDone] = useState<{ number: string; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => { setStage("welcome"); setCart([]); setOpen(null); setName(""); setDone(null); setQuote(null); }, []);
  // idle reset (and back to the welcome screen 25 s after the order number shows)
  useEffect(() => {
    if (stage === "welcome") return;
    const limit = (stage === "done" ? 25 : menu?.kiosk_idle_seconds ?? 90) * 1000;
    let t = setTimeout(reset, limit);
    const bump = () => { clearTimeout(t); t = setTimeout(reset, limit); };
    ["pointerdown", "keydown"].forEach((e) => window.addEventListener(e, bump));
    return () => { clearTimeout(t); ["pointerdown", "keydown"].forEach((e) => window.removeEventListener(e, bump)); };
  }, [stage, menu?.kiosk_idle_seconds, reset]);
  useEffect(() => {
    if (!cart.length) { setQuote(null); return; }
    const t = setTimeout(() => postCall<Quote>("restaurant_os.api.online.kiosk_quote", { data: JSON.stringify({ items: cartPayload(cart) }) }).then(setQuote).catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [cart]);

  if (!menu) return <div className="flex h-screen items-center justify-center bg-neutral-950 text-white">Loading…</div>;
  const cur = menu.currency;
  const category = cat || menu.categories[0];
  const count = cart.reduce((s, l) => s + l.qty, 0);

  const order = async () => {
    setBusy(true);
    try {
      const r = await postCall<{ number: string; total: number }>("restaurant_os.api.online.kiosk_order", { data: JSON.stringify({ order_type: type, name, items: cartPayload(cart) }) });
      setDone(r); setStage("done"); setCart([]);
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };

  if (!menu.kiosk_open) return <div className="flex h-screen items-center justify-center bg-neutral-950 text-3xl text-white">Please order at the counter</div>;

  if (stage === "welcome") return (
    <button onClick={() => setStage("type")} className="relative flex h-screen w-full flex-col items-center justify-center gap-8 overflow-hidden bg-gradient-to-br from-primary via-teal-700 to-violet-800 text-white">
      {menu.logo && <img src={menu.logo} alt="" className="h-28 w-auto rounded-2xl bg-white p-3 shadow-2xl" />}
      <h1 className="text-6xl font-extrabold">{menu.restaurant}</h1>
      <div className="flex animate-pulse items-center gap-3 rounded-full bg-white/15 px-10 py-5 text-3xl font-bold"><Hand className="h-9 w-9" /> Touch to order</div>
      <p className="text-xl text-white/70">Order here · pay at the counter</p>
    </button>
  );

  if (stage === "type") return (
    <div className="flex h-screen flex-col items-center justify-center gap-10 bg-neutral-950 text-white">
      <h2 className="text-5xl font-bold">Where will you eat?</h2>
      <div className="grid grid-cols-2 gap-8">
        {([["Dine-in", "Eat in", Utensils], ["Takeaway", "Take away", Store]] as const).map(([t, label, Icon]) => (
          <button key={t} onClick={() => { setType(t); setStage("menu"); }} className="flex h-72 w-72 flex-col items-center justify-center gap-6 rounded-3xl bg-white/10 text-4xl font-bold ring-2 ring-white/20 hover:bg-white/20">
            <Icon className="h-24 w-24" />{label}</button>
        ))}
      </div>
    </div>
  );

  if (stage === "done" && done) return (
    <button onClick={reset} className="flex h-screen w-full flex-col items-center justify-center gap-6 bg-gradient-to-br from-green-600 to-teal-700 text-white">
      <p className="text-3xl">Your order number</p>
      <div className="text-[10rem] font-black leading-none">{done.number}</div>
      <p className="text-4xl font-bold">Please pay {money(done.total, cur)} at the counter</p>
      <p className="text-2xl text-white/80">We start cooking as soon as you've paid. Thank you!</p>
    </button>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-white">
      <aside className="flex w-56 shrink-0 flex-col gap-2 overflow-y-auto bg-white p-3 dark:bg-neutral-900">
        {menu.logo && <img src={menu.logo} alt="" className="mb-3 h-14 w-auto self-center rounded-lg bg-white p-1" />}
        {menu.categories.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={cn("rounded-2xl px-4 py-5 text-left text-xl font-bold", category === c ? "bg-primary text-primary-foreground" : "bg-neutral-100 dark:bg-white/5")}>{c}</button>
        ))}
        <button onClick={reset} className="mt-auto rounded-2xl border border-neutral-300 py-4 text-lg dark:border-white/20">Start over</button>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-5">
        <h2 className="mb-4 text-3xl font-bold">{category}</h2>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
          {menu.items.filter((i) => i.item_group === category).map((i) => (
            <button key={i.item_code} disabled={i.sold_out} onClick={() => setOpen(i)} className="overflow-hidden rounded-3xl bg-white text-left shadow-lg disabled:opacity-50 dark:bg-neutral-900">
              <div className="relative h-44 bg-neutral-200 dark:bg-white/5">{i.image && <img src={i.image} alt="" className="h-full w-full object-cover" />}
                {i.sold_out && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-black text-white">SOLD OUT</span>}</div>
              <div className="p-4"><div className="text-xl font-bold">{i.item_name}</div><div className="mt-1 text-lg font-semibold text-primary">{money(i.price, cur)}</div></div>
            </button>
          ))}
        </div>
      </main>
      <aside className="flex w-96 shrink-0 flex-col bg-white dark:bg-neutral-900">
        <div className="flex items-center gap-2 border-b border-neutral-200 p-4 text-2xl font-bold dark:border-white/10"><ShoppingBag className="h-7 w-7" /> Your order
          <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-base text-primary">{type === "Dine-in" ? "Eat in" : "Take away"}</span></div>
        <div className="flex-1 divide-y divide-neutral-200 overflow-y-auto dark:divide-white/10">
          {cart.length === 0 && <p className="p-8 text-center text-lg text-neutral-500">Tap a dish to add it</p>}
          {cart.map((l) => (
            <div key={l.key} className="p-4">
              <div className="flex justify-between gap-2 text-lg font-semibold"><span>{l.item.item_name}</span><span>{money(linePrice(l) * l.qty, cur)}</span></div>
              {l.modifiers.length > 0 && <div className="text-sm text-neutral-500">{l.modifiers.map((m) => m.name).join(", ")}</div>}
              <div className="mt-2 flex items-center gap-2">
                <button onClick={() => setCart((c) => c.map((x) => x.key === l.key ? { ...x, qty: Math.max(1, x.qty - 1) } : x))} className="rounded-xl border border-neutral-300 p-3 dark:border-white/20"><Minus className="h-5 w-5" /></button>
                <span className="w-10 text-center text-xl font-bold">{l.qty}</span>
                <button onClick={() => setCart((c) => c.map((x) => x.key === l.key ? { ...x, qty: x.qty + 1 } : x))} className="rounded-xl border border-neutral-300 p-3 dark:border-white/20"><Plus className="h-5 w-5" /></button>
                <button onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))} className="ml-auto p-3 text-red-500" aria-label="Remove"><Trash2 className="h-6 w-6" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-3 border-t border-neutral-200 p-4 dark:border-white/10">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Your name (we'll call it out)" className="h-14 w-full rounded-2xl border border-neutral-300 bg-transparent px-4 text-lg dark:border-white/20" />
          {quote && <div className="space-y-1 text-lg">
            {quote.discount > 0 && <div className="flex justify-between text-green-600"><span>Offer</span><span>−{money(quote.discount, cur)}</span></div>}
            {quote.tax > 0 && <div className="flex justify-between text-neutral-500"><span>Tax</span><span>{money(quote.tax, cur)}</span></div>}
            <div className="flex justify-between text-2xl font-black"><span>Total</span><span>{money(quote.total, cur)}</span></div>
          </div>}
          <button disabled={!count || busy} onClick={() => void order()} className="h-16 w-full rounded-2xl bg-primary text-2xl font-black text-primary-foreground disabled:opacity-40">
            {busy ? "Sending…" : `Order · pay at counter`}</button>
        </div>
      </aside>
      {open && <ItemSheet big item={open} currency={cur} onClose={() => setOpen(null)}
        onAdd={(qty, modifiers) => { setCart((c) => [...c, { key: crypto.randomUUID(), item: open, qty, modifiers }]); setOpen(null); }} />}
    </div>
  );
}
