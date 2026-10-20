import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Gift, Maximize2, Sparkles } from "lucide-react";
import { useMenu } from "@/pages/Online/menu";
import { cn } from "@/utils/cn";
import { qrSvg } from "./pos-receipt";
import { useDisplayState, type DisplayState } from "./customer-display-channel";

const money = (v: number, currency = "PKR") => `${currency === "PKR" ? "Rs" : currency} ${Math.round(v).toLocaleString()}`;
const DONE_SECONDS = 15;                                   // the thank-you screen stays this long, then the menu returns

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
  // after a sale, thank the customer for a while, then go back to the menu
  const state: DisplayState = live.kind === "done" && live.at && now - live.at > DONE_SECONDS * 1000 ? { kind: "idle" } : live;
  const [chrome, setChrome] = useState(true);              // the full-screen hint hides once used
  const goFull = () => { void document.documentElement.requestFullscreen?.().catch(() => undefined); setChrome(false); };

  return (
    <div className="relative flex h-screen w-screen select-none flex-col overflow-hidden bg-neutral-950 text-white" onDoubleClick={goFull}>
      <header className="flex items-center gap-4 border-b border-white/10 px-8 py-4">
        {menu?.logo ? <img src={menu.logo} alt="" className="h-12 w-auto rounded-lg bg-white p-1" /> : null}
        <div className="flex-1">
          <div className="text-2xl font-bold">{menu?.restaurant ?? "Welcome"}</div>
          {menu?.branch.address && <div className="text-sm text-white/50">{menu.branch.address}</div>}
        </div>
        <div className="text-right text-white/60"><div className="text-3xl font-semibold tabular-nums">{new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></div>
      </header>
      <main className="min-h-0 flex-1">
        {state.kind === "cart" && <Cart s={state} />}
        {state.kind === "pay" && <Pay s={state} />}
        {state.kind === "done" && <Done s={state} />}
        {state.kind === "idle" && <Idle menu={menu} />}
      </main>
      {chrome && state.kind === "idle" && (
        <button onClick={goFull} className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/20">
          <Maximize2 className="h-4 w-4" /> Full screen (or double-click)</button>
      )}
    </div>
  );
}

function Cart({ s }: { s: Extract<DisplayState, { kind: "cart" }> }) {
  const end = useRef<HTMLDivElement>(null);
  const last = s.lines.length - 1;
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [s.lines.length]);
  const count = s.lines.reduce((a, l) => a + (l.free ? 0 : l.qty), 0);
  return (
    <div className="grid h-full grid-cols-[1fr_minmax(22rem,30%)]">
      <section className="min-h-0 overflow-y-auto px-8 py-6">
        {s.customer && <div className="mb-3 text-lg text-white/60">Welcome, <span className="font-semibold text-white">{s.customer}</span></div>}
        <table className="w-full text-2xl">
          <thead><tr className="text-left text-sm uppercase tracking-wider text-white/40"><th className="pb-3 font-medium">Item</th><th className="pb-3 text-center font-medium">Qty</th><th className="pb-3 text-right font-medium">Price</th><th className="pb-3 text-right font-medium">Amount</th></tr></thead>
          <tbody>{s.lines.map((l, i) => (
            <tr key={i} className={cn("border-t border-white/10", i === last && "bg-teal-500/15 transition-colors")}>
              <td className="py-3 pr-4 font-medium">{l.name}{l.free && <span className="ml-3 inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 align-middle text-sm font-bold text-green-300"><Gift className="h-4 w-4" />Free</span>}</td>
              <td className="py-3 text-center tabular-nums">{+l.qty.toFixed(3)}{l.uom && l.uom !== "Nos" && l.uom !== "Plate" ? <span className="ml-1 text-base text-white/50">{l.uom}</span> : null}</td>
              <td className="py-3 text-right tabular-nums text-white/70">
                {l.list && l.list > l.rate ? <span className="mr-2 text-base text-white/40 line-through">{money(l.list, s.currency)}</span> : null}{money(l.rate, s.currency)}</td>
              <td className="py-3 text-right font-semibold tabular-nums">{l.free ? "—" : money(l.amount, s.currency)}</td>
            </tr>
          ))}</tbody>
        </table>
        <div ref={end} />
      </section>
      <aside className="flex flex-col justify-end gap-3 bg-white/5 px-8 py-8">
        {s.offers && s.offers.length > 0 && <div className="mb-auto space-y-2">{s.offers.map((o) => (
          <div key={o} className="flex items-center gap-2 rounded-xl bg-green-500/15 px-4 py-3 text-lg font-semibold text-green-300"><Sparkles className="h-5 w-5" />{o}</div>))}</div>}
        <Row label={`Subtotal · ${+count.toFixed(2)} item${count === 1 ? "" : "s"}`} value={money(s.totals.subtotal, s.currency)} />
        {s.totals.discount > 0 && <Row label="Discount" value={`− ${money(s.totals.discount, s.currency)}`} tone="text-green-300" />}
        {s.totals.taxes.map((t) => <Row key={t.description} label={t.description} value={money(t.amount, s.currency)} />)}
        <div className="mt-2 border-t border-white/20 pt-4">
          <div className="text-lg uppercase tracking-wider text-white/50">Total</div>
          <div className="text-7xl font-extrabold tabular-nums text-teal-300">{money(s.totals.total, s.currency)}</div>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className={cn("flex justify-between text-xl", tone ?? "text-white/70")}><span>{label}</span><span className="tabular-nums">{value}</span></div>;
}

function Pay({ s }: { s: Extract<DisplayState, { kind: "pay" }> }) {
  const left = Math.max(0, s.due - s.paid);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 text-center">
      <div>
        <div className="text-2xl uppercase tracking-widest text-white/50">Amount to pay</div>
        <div className="text-[9rem] font-extrabold leading-none tabular-nums text-teal-300">{money(s.due, s.currency)}</div>
        {s.points > 0 && <div className="mt-3 text-2xl text-amber-300">{money(s.total, s.currency)} − {s.points} points</div>}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Big label="Paid" value={money(s.paid, s.currency)} />
        {s.change > 0 ? <Big label="Your change" value={money(s.change, s.currency)} tone="text-green-300" /> : <Big label="Remaining" value={money(left, s.currency)} tone={left ? "text-amber-300" : "text-green-300"} />}
      </div>
    </div>
  );
}

function Big({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-[18rem] rounded-3xl bg-white/5 px-10 py-6">
      <div className="text-lg uppercase tracking-wider text-white/50">{label}</div>
      <div className={cn("text-6xl font-bold tabular-nums", tone)}>{value}</div>
    </div>
  );
}

function Done({ s }: { s: Extract<DisplayState, { kind: "done" }> }) {
  const qr = useMemo(() => (s.qr ? qrSvg(s.qr, 1.2) : ""), [s.qr]);
  return (
    <div className="flex h-full items-center justify-center gap-16 px-10">
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-28 w-28 text-green-400" />
        <div className="mt-4 text-6xl font-extrabold">Thank you{s.customer ? `, ${s.customer.split(" ")[0]}` : ""}!</div>
        <div className="mt-3 text-2xl text-white/60">Paid {money(s.paid, s.currency)} · Receipt {s.invoice}{s.offline ? " (saved offline)" : ""}</div>
        {s.change > 0 && <div className="mt-8 inline-block rounded-3xl bg-green-500/15 px-12 py-6"><div className="text-xl uppercase tracking-wider text-green-300/80">Your change</div>
          <div className="text-8xl font-extrabold tabular-nums text-green-300">{money(s.change, s.currency)}</div></div>}
      </div>
      {qr && (
        <div className="rounded-3xl bg-white p-6 text-center text-neutral-900">
          <div className="[&>svg]:h-56 [&>svg]:w-56" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="mt-2 text-sm font-semibold">FBR invoice</div>
          {s.fbr && <div className="font-mono text-xs">{s.fbr}</div>}
          <div className="text-xs text-neutral-500">Scan to verify with Tax Asaan</div>
        </div>
      )}
    </div>
  );
}

function Idle({ menu }: { menu: ReturnType<typeof useMenu>["menu"] }) {
  const dishes = useMemo(() => (menu?.items ?? []).filter((i) => i.image && !i.sold_out), [menu]);
  const [i, setI] = useState(0);
  useEffect(() => { if (dishes.length < 2) return; const t = setInterval(() => setI((x) => (x + 1) % dishes.length), 6000); return () => clearInterval(t); }, [dishes.length]);
  const d = dishes[i % Math.max(dishes.length, 1)];
  const offers = menu?.offers ?? [];
  return (
    <div className="grid h-full grid-cols-[1.4fr_1fr]">
      <div className="relative overflow-hidden">
        {d && <img key={d.item_code} src={d.image} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        {d && <div className="absolute bottom-10 left-10"><div className="text-5xl font-extrabold drop-shadow">{d.item_name}</div>
          <div className="mt-2 text-3xl font-semibold text-teal-300">{money(d.price, menu?.currency)}</div></div>}
      </div>
      <div className="flex flex-col justify-center gap-5 px-10">
        <div className="text-4xl font-bold">Welcome!</div>
        <div className="text-xl text-white/60">Your order will appear here as it is rung up.</div>
        {offers.length > 0 && <div className="mt-4 space-y-3">
          <div className="text-sm font-semibold uppercase tracking-widest text-white/40">Today's offers</div>
          {offers.map((o) => (
            <div key={o.title} className="rounded-2xl bg-teal-500/15 px-5 py-4">
              <div className="flex items-center gap-2 text-2xl font-bold text-teal-200"><Sparkles className="h-6 w-6" />{o.title}</div>
              {o.description && <div className="mt-1 text-lg text-white/60">{o.description}</div>}
            </div>
          ))}
        </div>}
      </div>
    </div>
  );
}
