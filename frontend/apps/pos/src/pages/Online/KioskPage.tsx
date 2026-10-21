import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, Check, Hand, Minus, Plus, RotateCcw, ShoppingBag, Sparkles, Store, Trash2, Utensils, UtensilsCrossed } from "lucide-react";
import { humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { ItemSheet } from "./ItemSheet";
import { type CartLine, cartPayload, catIcon, linePrice, type MenuItem, money, SERIF_FONT, useMenu } from "./menu";

type Stage = "welcome" | "type" | "menu" | "done";

/* Fonts + small motion for the kiosk menu (same look as the customer display). */
const KIOSK_STYLE = `
${SERIF_FONT}
.kiosk .serif { font-family: Fraunces, Georgia, serif; letter-spacing: -0.01em; }
.kiosk .gold-grad { background: linear-gradient(120deg, #fde3a7, #f5c46b 45%, #e59a3a); -webkit-background-clip: text; background-clip: text; color: transparent; }
.kiosk .glass { background: linear-gradient(160deg, rgba(255,255,255,.08), rgba(255,255,255,.02)); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
@keyframes kiosk-zoom { from { transform: scale(1.05); } to { transform: scale(1.18) translate(-1.5%, -1%); } }
@keyframes kiosk-fadein { from { opacity: 0; } to { opacity: 1; } }
@keyframes kiosk-pulse { 0%, 100% { box-shadow: 0 25px 60px -20px rgba(229,154,58,.9), 0 0 0 0 rgba(245,196,107,.45); } 50% { box-shadow: 0 25px 60px -20px rgba(229,154,58,.9), 0 0 0 18px rgba(245,196,107,0); } }
@keyframes kiosk-count { from { transform: scaleX(1); } to { transform: scaleX(0); } }
.kiosk .kiosk-zoom { animation: kiosk-zoom 8s ease-out forwards; }
.kiosk .kiosk-fade { animation: kiosk-fadein 1.2s ease both; }
.kiosk .kiosk-pulse { animation: kiosk-pulse 2.4s ease-in-out infinite; }
.kiosk .kiosk-count { transform-origin: left; animation: kiosk-count 25s linear forwards; }
@keyframes kiosk-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.kiosk .rise { animation: kiosk-rise .5s cubic-bezier(.2,.7,.2,1) both; }
.kiosk ::-webkit-scrollbar { width: 0; height: 0; }
@media (prefers-reduced-motion: reduce) { .kiosk * { animation: none !important; transition: none !important; } }
`;
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
  const [confirmReset, setConfirmReset] = useState(false);   // "Start over" with items in the cart asks once more

  const reset = useCallback(() => { setConfirmReset(false); setStage("welcome"); setCart([]); setOpen(null); setName(""); setDone(null); setQuote(null); }, []);
  // idle reset (and back to the welcome screen 25 s after the order number shows)
  useEffect(() => {
    if (stage === "welcome") return;
    const limit = (stage === "done" ? 25 : menu?.kiosk_idle_seconds ?? 90) * 1000;
    let t = setTimeout(reset, limit);
    const bump = () => { clearTimeout(t); t = setTimeout(reset, limit); };
    ["pointerdown", "keydown"].forEach((e) => window.addEventListener(e, bump));
    return () => { clearTimeout(t); ["pointerdown", "keydown"].forEach((e) => window.removeEventListener(e, bump)); };
  }, [stage, menu?.kiosk_idle_seconds, reset]);
  useEffect(() => { if (!confirmReset) return; const t = setTimeout(() => setConfirmReset(false), 4000); return () => clearTimeout(t); }, [confirmReset]);
  useEffect(() => {
    if (!cart.length) { setQuote(null); return; }
    const t = setTimeout(() => postCall<Quote>("restaurant_os.api.online.kiosk_quote", { data: JSON.stringify({ items: cartPayload(cart) }) }).then(setQuote).catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [cart]);

  if (!menu) return <div className="flex h-screen items-center justify-center bg-[#0b0a09] text-lg text-[#f5c46b]/80">Loading the menu…</div>;
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

  if (!menu.kiosk_open) return (
    <div className="kiosk flex h-screen flex-col items-center justify-center gap-4 bg-[#0b0a09] text-[#f6efe4]"><style>{KIOSK_STYLE}</style>
      {menu.logo && <img src={menu.logo} alt="" className="h-16 w-auto rounded-2xl bg-white/95 px-3 py-2" />}
      <div className="serif text-5xl font-semibold">Please order at the counter</div><div className="text-xl text-[#d8ccb9]">Our team will be happy to help.</div></div>
  );

  if (stage === "welcome") return <Welcome menu={menu} onStart={() => setStage("type")} />;

  if (stage === "type") {
    const hero = menu.items.find((i) => i.image && !i.sold_out)?.image;
    return (
      <div className="kiosk relative flex h-screen flex-col items-center justify-center overflow-hidden bg-[#0b0a09] px-8 text-[#f6efe4]">
        <style>{KIOSK_STYLE}</style>
        {hero && <img src={hero} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl" />}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b0a09]/70 via-[#0b0a09]/85 to-[#0b0a09]" />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-[#e59a3a]/15 blur-[120px]" />
        <button onClick={reset} className="absolute left-8 top-8 z-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-base text-white/60 backdrop-blur hover:bg-white/10 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back</button>
        <div className="relative z-10 flex flex-col items-center">
          {menu.logo && <img src={menu.logo} alt="" className="rise mb-8 h-16 w-auto rounded-2xl bg-white/95 px-3 py-2 shadow-2xl" />}
          <div className="rise text-sm font-semibold uppercase tracking-[0.35em] text-[#f5c46b]/85" style={{ animationDelay: ".05s" }}>Welcome to {menu.restaurant}</div>
          <h2 className="serif rise mt-3 text-center text-6xl font-semibold" style={{ animationDelay: ".1s" }}>Where will you eat today?</h2>
          <div className="mt-14 grid grid-cols-2 gap-8">
            {([["Dine-in", "Eat in", "Enjoy it at our tables", Utensils], ["Takeaway", "Take away", "Packed fresh to go", Store]] as const).map(([t, label, sub, Icon], k) => (
              <button key={t} onClick={() => { setType(t); setStage("menu"); }} style={{ animationDelay: `${0.18 + k * 0.08}s` }}
                className="glass rise group relative flex h-80 w-80 flex-col items-center justify-center gap-5 overflow-hidden rounded-[2.25rem] border border-white/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[#f5c46b]/50 hover:shadow-[0_30px_80px_-25px_rgba(229,154,58,.45)] active:scale-[0.98]">
                <span className="pointer-events-none absolute inset-x-10 -top-16 h-32 rounded-full bg-[#f5c46b]/0 blur-3xl transition-colors duration-500 group-hover:bg-[#f5c46b]/20" />
                <span className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[#f5c46b] to-[#e59a3a] text-[#1a1208] shadow-[0_18px_40px_-15px_rgba(229,154,58,.9)] transition-transform duration-300 group-hover:scale-105">
                  <Icon className="h-12 w-12" strokeWidth={1.75} /></span>
                <span className="serif text-4xl font-semibold">{label}</span>
                <span className="text-lg text-white/55">{sub}</span>
              </button>
            ))}
          </div>
          <p className="rise mt-12 text-base text-white/40" style={{ animationDelay: ".4s" }}>Order here · pay at the counter</p>
        </div>
      </div>
    );
  }

  if (stage === "done" && done) return <Done number={done.number} total={money(done.total, cur)} name={name} onDone={reset} />;

  const inCat = menu.items.filter((i) => i.item_group === category);
  return (
    <div className="kiosk flex h-screen overflow-hidden bg-[#0b0a09] text-[#f6efe4]">
      <style>{KIOSK_STYLE}</style>
      {/* category rail */}
      <aside className="relative flex w-64 shrink-0 flex-col overflow-hidden border-r border-white/[0.06] bg-gradient-to-b from-[#16120e] to-[#0d0b09]">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#e59a3a]/10 blur-3xl" />
        <div className="relative px-5 pb-4 pt-6">
          {menu.logo ? <img src={menu.logo} alt="" className="h-12 w-auto rounded-xl bg-white/95 px-2 py-1 shadow-lg" />
            : <div className="serif text-2xl font-semibold">{menu.restaurant}</div>}
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#f5c46b]/30 bg-[#f5c46b]/10 px-3 py-1 text-sm font-semibold text-[#f5c46b]">
            {type === "Dine-in" ? <Utensils className="h-4 w-4" /> : <Store className="h-4 w-4" />}{type === "Dine-in" ? "Eating in" : "Taking away"}</div>
        </div>
        <div className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/35">Menu</div>
        <nav className="relative flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
          {menu.categories.map((c) => {
            const Icon = catIcon(c);
            const on = category === c;
            const n = menu.items.filter((i) => i.item_group === c && !i.sold_out).length;
            return (
              <button key={c} onClick={() => setCat(c)} aria-current={on ? "page" : undefined}
                className={cn("group relative flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-3.5 text-left transition-all duration-300",
                  on ? "bg-gradient-to-r from-[#f5c46b] to-[#e59a3a] text-[#1a1208] shadow-[0_12px_30px_-12px_rgba(229,154,58,.7)]" : "text-white/75 hover:bg-white/[0.05] hover:text-white")}>
                <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
                  on ? "bg-black/15" : "bg-white/[0.06] group-hover:bg-white/10")}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-semibold leading-tight">{c}</span>
                  <span className={cn("block text-xs", on ? "text-black/55" : "text-white/40")}>{n} item{n === 1 ? "" : "s"}</span>
                </span>
              </button>
            );
          })}
        </nav>
        <div className="relative border-t border-white/[0.06] p-3">
          <button onClick={() => (cart.length && !confirmReset ? setConfirmReset(true) : reset())}
            className={cn("group flex w-full items-center justify-center gap-2.5 rounded-2xl border py-3.5 text-base font-medium transition-all duration-300",
              confirmReset ? "border-red-400/40 bg-red-500/10 text-red-200" : "border-white/10 bg-white/[0.03] text-white/60 hover:border-[#f5c46b]/40 hover:bg-[#f5c46b]/[0.06] hover:text-[#fde3a7]")}>
            <RotateCcw className={cn("h-4 w-4 transition-transform duration-500", !confirmReset && "group-hover:-rotate-180")} />
            {confirmReset ? "Tap again to clear" : "Start over"}</button>
        </div>
      </aside>

      {/* dishes */}
      <main className="min-w-0 flex-1 overflow-y-auto px-8 pb-10 pt-7">
        <div key={category} className="rise mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[#f5c46b]/80">Freshly made</div>
            <h2 className="serif mt-1 text-5xl font-semibold">{category}</h2>
          </div>
          {menu.offers && menu.offers.length > 0 && (
            <div className="hidden max-w-sm items-center gap-2 rounded-2xl border border-[#f5c46b]/20 bg-[#f5c46b]/[0.07] px-4 py-2.5 text-sm text-[#fde3a7] xl:flex">
              <Sparkles className="h-4 w-4 shrink-0 text-[#f5c46b]" /><span className="truncate">{menu.offers[0].title}</span></div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
          {inCat.map((i, k) => (
            <button key={i.item_code} disabled={i.sold_out} onClick={() => setOpen(i)} style={{ animationDelay: `${Math.min(k, 8) * 45}ms` }}
              className="rise group relative flex flex-col overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-[#15120f] text-left shadow-[0_20px_50px_-25px_rgba(0,0,0,.8)] transition-all duration-300 hover:-translate-y-1 hover:border-[#f5c46b]/30 active:scale-[0.98] disabled:pointer-events-none">
              <div className="relative aspect-[4/3] overflow-hidden bg-white/5">
                {i.image
                  ? <img src={i.image} alt="" loading="lazy" className={cn("h-full w-full object-cover transition-transform duration-700 group-hover:scale-110", i.sold_out && "grayscale")} />
                  : <div className="flex h-full items-center justify-center text-white/20"><UtensilsCrossed className="h-12 w-12" /></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-[#15120f] via-transparent to-transparent" />
                <span className="glass absolute left-3 top-3 rounded-full border border-white/15 px-3.5 py-1.5 text-base font-bold text-white shadow-lg">{money(i.price, cur)}</span>
                {i.sold_out && <span className="absolute inset-0 flex items-center justify-center bg-black/55">
                  <span className="rounded-full border border-white/30 px-5 py-2 text-lg font-bold uppercase tracking-[0.25em] text-white">Sold out</span></span>}
              </div>
              <div className="flex flex-1 items-end gap-3 px-5 pb-5 pt-1">
                <div className="min-w-0 flex-1">
                  <div className="serif text-2xl font-semibold leading-tight">{i.item_name}</div>
                  <div className="mt-1 line-clamp-1 text-sm text-white/45">{i.description || (i.modifiers.length ? "Make it your way" : "\u00a0")}</div>
                </div>
                {!i.sold_out && <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f5c46b] to-[#e59a3a] text-[#1a1208] shadow-[0_10px_25px_-10px_rgba(229,154,58,.8)] transition-transform group-hover:scale-110">
                  <Plus className="h-6 w-6" strokeWidth={2.75} /></span>}
              </div>
            </button>
          ))}
        </div>
      </main>
      <aside className="flex w-96 shrink-0 flex-col border-l border-white/[0.06] bg-[#120f0c]">
        <div className="flex items-center gap-3 px-5 pb-4 pt-6"><ShoppingBag className="h-6 w-6 text-[#f5c46b]" /><span className="serif text-3xl font-semibold">Your order</span>
          {count > 0 && <span className="ml-auto rounded-full bg-[#f5c46b]/15 px-3 py-1 text-sm font-bold text-[#f5c46b]">{count} item{count === 1 ? "" : "s"}</span>}</div>
        <div className="flex-1 divide-y divide-white/[0.06] overflow-y-auto">
          {cart.length === 0 && <div className="flex flex-col items-center gap-3 px-8 py-16 text-center text-white/40"><UtensilsCrossed className="h-10 w-10" /><p className="text-lg">Tap a dish to add it</p></div>}
          {cart.map((l) => (
            <div key={l.key} className="p-4">
              <div className="flex justify-between gap-2 text-lg font-semibold"><span>{l.item.item_name}</span><span className="tabular-nums">{money(linePrice(l) * l.qty, cur)}</span></div>
              {l.modifiers.length > 0 && <div className="text-sm text-white/45">{l.modifiers.map((m) => m.name).join(", ")}</div>}
              <div className="mt-2 flex items-center gap-2">
                <button onClick={() => setCart((c) => c.map((x) => x.key === l.key ? { ...x, qty: Math.max(1, x.qty - 1) } : x))} className="rounded-xl border border-white/15 p-3 hover:bg-white/5"><Minus className="h-5 w-5" /></button>
                <span className="w-10 text-center text-xl font-bold">{l.qty}</span>
                <button onClick={() => setCart((c) => c.map((x) => x.key === l.key ? { ...x, qty: x.qty + 1 } : x))} className="rounded-xl border border-white/15 p-3 hover:bg-white/5"><Plus className="h-5 w-5" /></button>
                <button onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))} className="ml-auto p-3 text-red-400/80 hover:text-red-400" aria-label="Remove"><Trash2 className="h-6 w-6" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-3 border-t border-white/[0.06] p-5">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Your name (we'll call it out)" className="h-14 w-full rounded-2xl border !border-white/10 !bg-white/[0.04] px-4 text-lg text-white placeholder:text-[#a89a87] !shadow-none !outline-none focus:!border-[#f5c46b]/60 [color-scheme:dark]" />
          {quote && <div className="space-y-1 text-lg">
            {quote.discount > 0 && <div className="flex justify-between text-emerald-300"><span>Offer</span><span>−{money(quote.discount, cur)}</span></div>}
            {quote.tax > 0 && <div className="flex justify-between text-white/50"><span>Tax</span><span>{money(quote.tax, cur)}</span></div>}
            <div className="flex items-baseline justify-between pt-1"><span className="text-xl font-semibold">Total</span><span className="serif gold-grad text-4xl font-semibold tabular-nums">{money(quote.total, cur)}</span></div>
          </div>}
          <button disabled={!count || busy} onClick={() => void order()} className="h-16 w-full rounded-2xl bg-gradient-to-r from-[#f5c46b] to-[#e59a3a] text-2xl font-bold text-[#1a1208] shadow-[0_15px_35px_-15px_rgba(229,154,58,.8)] transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none">
            {busy ? "Sending…" : `Order · pay at counter`}</button>
        </div>
      </aside>
      {open && <ItemSheet big warm item={open} currency={cur} onClose={() => setOpen(null)}
        onAdd={(qty, modifiers) => { setCart((c) => [...c, { key: crypto.randomUUID(), item: open, qty, modifiers }]); setOpen(null); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ welcome: full-screen dishes, gold call to action */
function Welcome({ menu, onStart }: { menu: NonNullable<ReturnType<typeof useMenu>["menu"]>; onStart: () => void }) {
  const dishes = menu.items.filter((i) => i.image && !i.sold_out);
  const [i, setI] = useState(0);
  useEffect(() => { if (dishes.length < 2) return; const t = setInterval(() => setI((x) => (x + 1) % dishes.length), 6500); return () => clearInterval(t); }, [dishes.length]);
  const d = dishes[i % Math.max(dishes.length, 1)];
  return (
    <button onClick={onStart} className="kiosk relative flex h-screen w-full flex-col overflow-hidden bg-[#0b0a09] text-left text-[#f6efe4]">
      <style>{KIOSK_STYLE}</style>
      {d && <div key={d.item_code} className="kiosk-fade absolute inset-0"><img src={d.image} alt="" className="kiosk-zoom h-full w-full object-cover" /></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0a09] via-[#0b0a09]/45 to-[#0b0a09]/70" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0a09]/80 via-transparent to-transparent" />
      <div className="relative flex items-center justify-between px-12 pt-10">
        {menu.logo ? <img src={menu.logo} alt="" className="h-16 w-auto rounded-2xl bg-white/95 px-3 py-2 shadow-2xl" /> : <span />}
        <span className="rounded-full border border-white/15 bg-black/30 px-5 py-2 text-base font-medium text-[#efe5d6] backdrop-blur">Order here · pay at the counter</span>
      </div>
      <div className="relative mt-auto px-12 pb-14">
        <div className="text-sm font-bold uppercase tracking-[0.35em] text-[#f5c46b]">Welcome to</div>
        <h1 className="serif mt-3 text-[clamp(3.5rem,7vw,6.5rem)] font-semibold leading-[0.95]">{menu.restaurant}</h1>
        {d && <p key={`n-${d.item_code}`} className="rise mt-5 text-2xl text-[#e8dccb]">Today: <span className="font-semibold text-white">{d.item_name}</span> · <span className="gold-grad font-semibold">{money(d.price, menu.currency)}</span></p>}
        <div className="mt-10 flex flex-wrap items-center gap-6">
          <span className="kiosk-pulse inline-flex items-center gap-4 rounded-full bg-gradient-to-r from-[#f7cd7a] to-[#e59a3a] px-12 py-6 text-3xl font-bold text-[#1a1208] shadow-[0_25px_60px_-20px_rgba(229,154,58,.9)]">
            <Hand className="h-9 w-9" /> Touch to order</span>
          {menu.offers && menu.offers.length > 0 && (
            <div className="flex flex-wrap gap-3">{menu.offers.slice(0, 3).map((o) => (
              <span key={o.title} className="inline-flex items-center gap-2 rounded-full border border-[#f5c46b]/35 bg-black/35 px-5 py-3 text-lg font-semibold text-[#fde3a7] backdrop-blur"><Sparkles className="h-5 w-5 text-[#f5c46b]" />{o.title}</span>
            ))}</div>
          )}
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ order number */
function Done({ number, total, name, onDone }: { number: string; total: string; name: string; onDone: () => void }) {
  return (
    <button onClick={onDone} className="kiosk relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#0b0a09] px-10 text-center text-[#f6efe4]">
      <style>{KIOSK_STYLE}</style>
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e59a3a]/15 blur-[120px]" />
      <span className="rise relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-400/15 ring-2 ring-emerald-400/60"><Check className="h-10 w-10 text-emerald-300" strokeWidth={2.5} /></span>
      <div className="rise relative mt-6 text-lg font-bold uppercase tracking-[0.35em] text-[#f5c46b]" style={{ animationDelay: ".1s" }}>{name ? `Thank you, ${name.split(" ")[0]}` : "Thank you"} · your order number</div>
      <div className="serif rise relative mt-2 text-[clamp(8rem,18vw,13rem)] font-semibold leading-none" style={{ animationDelay: ".18s" }}><span className="gold-grad">{number}</span></div>
      <div className="rise relative mt-6 rounded-3xl border border-white/10 bg-white/[0.04] px-10 py-5 text-3xl font-semibold" style={{ animationDelay: ".26s" }}>Please pay <span className="gold-grad">{total}</span> at the counter</div>
      <div className="rise relative mt-12 grid max-w-4xl grid-cols-3 gap-5" style={{ animationDelay: ".34s" }}>
        {[["1", "Pay at the counter", "Show your number"], ["2", "We start cooking", "Fresh, right after payment"], ["3", "Collect your food", "We'll call your number"]].map(([n, t, d]) => (
          <div key={n} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-left">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#f7cd7a] to-[#e59a3a] text-lg font-bold text-[#1a1208]">{n}</span>
            <div className="mt-4 text-xl font-semibold">{t}</div><div className="mt-1 text-base text-[#d2c5b1]">{d}</div>
          </div>
        ))}
      </div>
      <div className="relative mt-12 h-1.5 w-72 overflow-hidden rounded-full bg-white/10"><div className="kiosk-count h-full w-full bg-[#f5c46b]" /></div>
      <div className="relative mt-3 text-sm text-[#bfb29f]">Tap anywhere to start a new order</div>
    </button>
  );
}
