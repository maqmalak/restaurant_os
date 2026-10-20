import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Gift, Maximize2, Sparkles, Star } from "lucide-react";
import { useMenu } from "@/pages/Online/menu";
import { cn } from "@/utils/cn";
import { qrSvg } from "./pos-receipt";
import { useDisplayState, type DisplayState } from "./customer-display-channel";

const DONE_SECONDS = 15;                                   // the thank-you screen stays this long, then the menu returns
const SLIDE_SECONDS = 7;

const money = (v: number, currency = "PKR") => `${currency === "PKR" ? "Rs" : currency} ${Math.round(v).toLocaleString()}`;

/* Fonts and motion for this screen only (the rest of the app keeps Inter and no animation). */
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@300;400;500;600;700&display=swap');
.cfd { font-family: Inter, system-ui, sans-serif; font-feature-settings: "tnum" 1, "cv11" 1; }
.cfd .serif { font-family: Fraunces, Georgia, serif; font-optical-sizing: auto; letter-spacing: -0.01em; }
.cfd .glass { background: linear-gradient(160deg, rgba(255,255,255,.09), rgba(255,255,255,.03)); backdrop-filter: blur(22px) saturate(140%);
  -webkit-backdrop-filter: blur(22px) saturate(140%); border: 1px solid rgba(255,255,255,.10); box-shadow: 0 30px 80px -30px rgba(0,0,0,.6); }
.cfd .gold { color: #f5c46b; }
.cfd .gold-grad { background: linear-gradient(120deg, #fde3a7 0%, #f5c46b 45%, #e59a3a 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
@keyframes cfd-kenburns { from { transform: scale(1.04) translate3d(0,0,0); } to { transform: scale(1.16) translate3d(-1.5%, -1%, 0); } }
@keyframes cfd-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes cfd-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes cfd-slide { from { opacity: 0; transform: translateX(-18px); } to { opacity: 1; transform: none; } }
@keyframes cfd-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
@keyframes cfd-ring { from { stroke-dashoffset: 302; } to { stroke-dashoffset: 0; } }
@keyframes cfd-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.cfd .kenburns { animation: cfd-kenburns ${SLIDE_SECONDS + 1}s ease-out forwards; }
.cfd .fade { animation: cfd-fade 1.1s ease forwards; }
.cfd .rise { animation: cfd-rise .7s cubic-bezier(.2,.7,.2,1) both; }
.cfd .slide { animation: cfd-slide .6s cubic-bezier(.2,.7,.2,1) both; }
.cfd .pop { animation: cfd-pop .7s cubic-bezier(.2,.7,.2,1) both; }
.cfd .ring { stroke-dasharray: 302; animation: cfd-ring .9s .2s ease-out both; }
.cfd .progress { transform-origin: left; animation: cfd-progress ${SLIDE_SECONDS}s linear forwards; }
.cfd ::-webkit-scrollbar { width: 0; }
@media (prefers-reduced-motion: reduce) { .cfd * { animation-duration: .01ms !important; } }
`;

/** Counts up to `value` (eases), so the total glides instead of jumping. */
function useTween(value: number, ms = 450) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now(), a = from.current, b = value;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3);
      setShown(a + (b - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = b; };
  }, [value, ms]);
  return shown;
}

/**
 * Customer-facing display: the second screen at the counter, turned to the customer. It mirrors the POS terminal on the
 * same PC (customer-display-channel): the cart as it is rung up, the amount to pay and change, then a thank-you with the
 * FBR QR. Between customers it shows the menu and today's offers. Opened from the terminal's "Customer display" button.
 */
export default function CustomerDisplayPage() {
  const live = useDisplayState();
  const { menu } = useMenu();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { document.title = "Customer display"; }, []);
  const state: DisplayState = live.kind === "done" && live.at && now - live.at > DONE_SECONDS * 1000 ? { kind: "idle" } : live;
  const images = useMemo(() => Object.fromEntries((menu?.items ?? []).filter((i) => i.image).map((i) => [i.item_code, i.image!])), [menu]);
  const [hint, setHint] = useState(true);
  const goFull = () => { void document.documentElement.requestFullscreen?.().catch(() => undefined); setHint(false); };
  const t = new Date(now);

  return (
    <div className="cfd relative h-screen w-screen select-none overflow-hidden bg-[#0b0a09] text-[#f6efe4]" onDoubleClick={goFull}>
      <style>{STYLE}</style>
      {/* warm ambient light behind everything */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-[42rem] w-[42rem] rounded-full bg-[#e59a3a]/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-52 right-0 h-[38rem] w-[38rem] rounded-full bg-[#0d9488]/10 blur-[130px]" />

      <header className="absolute inset-x-0 top-0 z-20 flex items-center gap-4 px-10 pt-7">
        {menu?.logo ? <img src={menu.logo} alt="" className="h-11 w-auto rounded-xl bg-white/95 px-2 py-1 shadow-lg" /> : null}
        <div className="min-w-0">
          <div className="serif text-2xl font-semibold leading-tight">{menu?.restaurant ?? "Welcome"}</div>
          {menu?.branch.address && <div className="truncate text-xs uppercase tracking-[0.25em] text-white/45">{menu.branch.address}</div>}
        </div>
        <div className="ml-auto text-right">
          <div className="text-3xl font-light tabular-nums">{t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          <div className="text-xs uppercase tracking-[0.25em] text-white/40">{t.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}</div>
        </div>
      </header>

      <main className="relative z-10 h-full">
        {state.kind === "cart" && <Cart key="cart" s={state} images={images} />}
        {state.kind === "pay" && <Pay key="pay" s={state} />}
        {state.kind === "done" && <Done key={`done-${state.invoice}`} s={state} />}
        {state.kind === "idle" && <Idle key="idle" menu={menu} />}
      </main>

      {hint && state.kind === "idle" && (
        <button onClick={goFull} className="absolute bottom-6 right-8 z-30 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-widest text-white/50 backdrop-blur hover:bg-white/10">
          <Maximize2 className="h-3.5 w-3.5" /> Full screen · double-click</button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ cart */
function Cart({ s, images }: { s: Extract<DisplayState, { kind: "cart" }>; images: Record<string, string> }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [s.lines.length]);
  const total = useTween(s.totals.total);
  const count = s.lines.reduce((a, l) => a + (l.free ? 0 : l.qty), 0);
  const lastCode = [...s.lines].reverse().find((l) => l.code && images[l.code])?.code;
  const backdrop = lastCode ? images[lastCode] : undefined;

  return (
    <div className="absolute inset-0">
      {backdrop && <img key={backdrop} src={backdrop} alt="" className="fade absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl" />}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0a09] via-[#0b0a09]/85 to-[#0b0a09]/60" />
      <div className="relative grid h-full grid-cols-[1fr_34rem] gap-10 px-10 pb-10 pt-32">
        <section className="flex min-h-0 flex-col">
          <div className="rise mb-6 flex items-end justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-white/40">Your order</div>
              <div className="serif mt-1 text-4xl font-semibold">{s.customer ? <>Welcome back, <span className="gold-grad">{s.customer.split(" ")[0]}</span></> : "Freshly prepared for you"}</div>
            </div>
            <div className="text-right text-sm text-white/45">{+count.toFixed(2)} item{count === 1 ? "" : "s"}</div>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
            {s.lines.map((l, i) => (
              <div key={`${i}-${l.code}`} className={cn("slide flex items-center gap-5 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3 pr-6 transition-colors duration-700",
                i === s.lines.length - 1 && "border-[#f5c46b]/30 bg-[#f5c46b]/[0.06]")}>
                {l.code && images[l.code]
                  ? <img src={images[l.code]} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                  : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/5 text-2xl font-semibold text-white/30">{l.name.slice(0, 1)}</div>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-2xl font-medium">{l.name}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-base text-white/45">
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-sm font-semibold text-white/80 tabular-nums">× {+l.qty.toFixed(3)}{l.uom && !["Nos", "Plate"].includes(l.uom) ? ` ${l.uom}` : ""}</span>
                    {!l.free && <span className="tabular-nums">{l.list && l.list > l.rate ? <s className="mr-1.5 text-white/30">{money(l.list, s.currency)}</s> : null}{money(l.rate, s.currency)} each</span>}
                  </div>
                </div>
                {l.free
                  ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1 text-base font-semibold text-emerald-300"><Gift className="h-4 w-4" />Free</span>
                  : <div className="text-2xl font-semibold tabular-nums">{money(l.amount, s.currency)}</div>}
              </div>
            ))}
            <div ref={end} />
          </div>
        </section>

        <aside className="glass rise flex flex-col rounded-[2rem] p-8" style={{ animationDelay: ".1s" }}>
          {s.offers && s.offers.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.3em] text-white/40">Applied for you</div>
              {s.offers.map((o) => (
                <div key={o} className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-[#f5c46b]/15 to-transparent px-4 py-3 text-lg font-medium"><Sparkles className="gold h-5 w-5" />{o}</div>
              ))}
            </div>
          )}
          <div className="mt-auto space-y-3 text-lg">
            <Line label="Subtotal" value={money(s.totals.subtotal, s.currency)} />
            {s.totals.discount > 0 && <Line label="You save" value={`− ${money(s.totals.discount, s.currency)}`} tone="text-emerald-300" />}
            {s.totals.taxes.map((t) => <Line key={t.description} label={t.description} value={money(t.amount, s.currency)} />)}
          </div>
          <div className="mt-6 border-t border-white/10 pt-6">
            <div className="text-xs uppercase tracking-[0.3em] text-white/40">Total</div>
            <div className="serif mt-1 text-[5.5rem] font-semibold leading-none tabular-nums"><span className="gold-grad">{money(total, s.currency)}</span></div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className={cn("flex items-baseline justify-between", tone ?? "text-white/60")}><span>{label}</span><span className="tabular-nums text-white/85">{value}</span></div>;
}

/* ------------------------------------------------------------------ paying */
function Pay({ s }: { s: Extract<DisplayState, { kind: "pay" }> }) {
  const due = useTween(s.due);
  const left = Math.max(0, s.due - s.paid);
  return (
    <div className="flex h-full flex-col items-center justify-center px-10 pt-16 text-center">
      <div className="rise text-sm uppercase tracking-[0.35em] text-white/45">Amount to pay</div>
      <div className="serif rise mt-3 text-[10rem] font-semibold leading-none tabular-nums" style={{ animationDelay: ".08s" }}><span className="gold-grad">{money(due, s.currency)}</span></div>
      {s.points > 0 && <div className="rise mt-4 inline-flex items-center gap-2 rounded-full bg-[#f5c46b]/10 px-5 py-2 text-xl text-[#f5c46b]" style={{ animationDelay: ".15s" }}>
        <Star className="h-5 w-5 fill-current" /> {s.points} reward points used · {money(s.total, s.currency)} before points</div>}
      <div className="rise mt-12 grid grid-cols-2 gap-6" style={{ animationDelay: ".2s" }}>
        <Tile label="Paid" value={money(s.paid, s.currency)} />
        {s.change > 0
          ? <Tile label="Your change" value={money(s.change, s.currency)} accent="text-emerald-300" />
          : <Tile label="Remaining" value={money(left, s.currency)} accent={left ? "text-[#f5c46b]" : "text-emerald-300"} />}
      </div>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="glass min-w-[20rem] rounded-3xl px-10 py-7 text-left">
      <div className="text-xs uppercase tracking-[0.3em] text-white/45">{label}</div>
      <div className={cn("mt-2 text-6xl font-semibold tabular-nums", accent)}>{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ thank you */
function Done({ s }: { s: Extract<DisplayState, { kind: "done" }> }) {
  const qr = useMemo(() => (s.qr ? qrSvg(s.qr, 1.2) : ""), [s.qr]);
  return (
    <div className="flex h-full items-center justify-center gap-20 px-12 pt-16">
      <div className="max-w-2xl text-center">
        <div className="pop relative mx-auto h-32 w-32">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
            <circle cx="50" cy="50" r="48" fill="rgba(52,211,153,.08)" />
            <circle cx="50" cy="50" r="48" fill="none" stroke="#34d399" strokeWidth="2.5" className="ring" transform="rotate(-90 50 50)" />
          </svg>
          <Check className="absolute inset-0 m-auto h-16 w-16 text-emerald-300" strokeWidth={2.5} />
        </div>
        <div className="serif rise mt-8 text-7xl font-semibold" style={{ animationDelay: ".25s" }}>Thank you{s.customer ? <>, <span className="gold-grad">{s.customer.split(" ")[0]}</span></> : ""}</div>
        <div className="rise mt-4 text-xl text-white/55" style={{ animationDelay: ".35s" }}>We hope to see you again soon.</div>
        <div className="rise mt-2 text-base text-white/35" style={{ animationDelay: ".4s" }}>Paid {money(s.paid, s.currency)} · Receipt {s.invoice}{s.offline ? " · saved offline" : ""}</div>
        {s.change > 0 && (
          <div className="glass rise mx-auto mt-10 inline-block rounded-3xl px-14 py-7" style={{ animationDelay: ".5s" }}>
            <div className="text-xs uppercase tracking-[0.3em] text-emerald-300/70">Your change</div>
            <div className="mt-1 text-8xl font-semibold tabular-nums text-emerald-300">{money(s.change, s.currency)}</div>
          </div>
        )}
      </div>
      {qr && (
        <div className="rise rounded-[2rem] bg-[#fbf7f0] p-7 text-center text-stone-900 shadow-2xl" style={{ animationDelay: ".6s" }}>
          <div className="[&>svg]:h-60 [&>svg]:w-60" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="mt-3 text-sm font-semibold uppercase tracking-[0.2em]">FBR invoice</div>
          {s.fbr && <div className="mt-0.5 font-mono text-xs text-stone-600">{s.fbr}</div>}
          <div className="mt-1 text-xs text-stone-500">Scan to verify</div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ between customers */
function Idle({ menu }: { menu: ReturnType<typeof useMenu>["menu"] }) {
  const dishes = useMemo(() => (menu?.items ?? []).filter((i) => i.image && !i.sold_out), [menu]);
  const [i, setI] = useState(0);
  useEffect(() => { if (dishes.length < 2) return; const t = setInterval(() => setI((x) => (x + 1) % dishes.length), SLIDE_SECONDS * 1000); return () => clearInterval(t); }, [dishes.length]);
  const d = dishes[i % Math.max(dishes.length, 1)];
  const offers = menu?.offers ?? [];
  const dots = Math.min(dishes.length, 12);
  return (
    <div className="absolute inset-0">
      {d && (
        <div key={d.item_code} className="fade absolute inset-0 overflow-hidden">
          <img src={d.image} alt="" className="kenburns h-full w-full object-cover" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0a09]/90 via-[#0b0a09]/10 to-[#0b0a09]/80" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0a09]/95 via-transparent to-[#0b0a09]/60" />

      <div className="relative grid h-full grid-cols-[1fr_32rem] gap-10 px-12 pb-12 pt-36">
        <div className="flex flex-col justify-end">
          <div className="gold rise text-xs uppercase tracking-[0.35em]">From our kitchen</div>
          {d && <div key={d.item_code}>
            <div className="serif rise mt-3 max-w-3xl text-[5.5rem] font-semibold leading-[0.95]">{d.item_name}</div>
            {d.description && <div className="rise mt-4 max-w-xl text-xl text-white/60" style={{ animationDelay: ".1s" }}>{d.description}</div>}
            <div className="gold rise mt-6 inline-flex w-fit items-center rounded-full border border-[#f5c46b]/40 bg-[#f5c46b]/10 px-6 py-2.5 text-3xl font-semibold" style={{ animationDelay: ".18s" }}>{money(d.price, menu?.currency)}</div>
          </div>}
          {dots > 1 && (
            <div className="mt-10 flex max-w-md gap-1.5">
              {Array.from({ length: dots }).map((_, k) => (
                <div key={k} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
                  {k === i % dots && <div key={i} className="progress h-full w-full bg-[#f5c46b]" />}
                  {k < i % dots && <div className="h-full w-full bg-white/50" />}
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="glass rise flex flex-col self-center rounded-[2rem] p-9" style={{ animationDelay: ".15s" }}>
          <div className="serif text-5xl font-semibold leading-tight">Welcome<span className="gold">.</span></div>
          <div className="mt-3 text-lg text-white/55">Your order will appear here as it's rung up.</div>
          {offers.length > 0 && (
            <div className="mt-8 space-y-3">
              <div className="text-xs uppercase tracking-[0.3em] text-white/40">Today's offers</div>
              {offers.map((o, k) => (
                <div key={o.title} className="rise rounded-2xl border border-white/[0.07] bg-gradient-to-r from-[#f5c46b]/[0.12] to-transparent px-5 py-4" style={{ animationDelay: `${0.25 + k * 0.08}s` }}>
                  <div className="flex items-center gap-2.5 text-xl font-semibold"><Sparkles className="gold h-5 w-5" />{o.title}</div>
                  {o.description && <div className="mt-1 pl-[1.85rem] text-base text-white/55">{o.description}</div>}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
