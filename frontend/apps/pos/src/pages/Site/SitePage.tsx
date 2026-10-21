import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BadgeCheck, Bike, Boxes, Check, ChefHat, ChevronDown, CloudOff, CreditCard, Gift, Globe, LineChart, Menu, MonitorSmartphone,
  Receipt, ShieldCheck, Smartphone, Sparkles, Store, TabletSmartphone, Timer, Truck, UtensilsCrossed, X, Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { MicroMaxLogo, shot, SITE_STYLE } from "./brand";

/* ============================================================ business settings (owner to confirm) */
/** Monthly prices in PKR per branch; yearly = 10 months (2 months free). Change here — every price on the page follows. */
const PLANS = [
  { key: "Starter", price: 4999, blurb: "One counter, everything to sell and cook.", cta: "Start free trial",
    features: ["Counter POS with offline mode", "Kitchen display (KDS)", "FBR / PRA invoice reporting + QR receipt", "Sales tax, discounts, returns, shifts & Z-report",
      "Table map for dine-in", "Daily sales & shift reports"] },
  { key: "Growth", price: 9999, popular: true, blurb: "Sell online and deliver with your own riders.", cta: "Start free trial",
    features: ["Everything in Starter, up to 3 counters", "Online ordering site & self-order kiosk", "Rider app, dispatch map & live tracking",
      "Foodpanda integration", "Customer display, loyalty points & reviews", "Recipe stock deduction & wastage"] },
  { key: "Enterprise", price: 0, blurb: "Many branches, central kitchen, your own processes.", cta: "Talk to sales",
    features: ["Everything in Growth, unlimited counters", "Multi-branch & central store procurement", "Ingredient variance & menu engineering",
      "Online payments (JazzCash, Easypaisa, cards)", "Custom reports & integrations", "Dedicated onboarding manager"] },
];
const TRIAL_DAYS = 14;
const yearly = (m: number) => m * 10;
const pkr = (v: number) => `Rs ${v.toLocaleString("en-PK")}`;

/* ============================================================ helpers */
function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
    document.querySelectorAll(".mx .reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

function Eyebrow({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return <div className={cn("text-xs font-semibold uppercase tracking-[0.32em]", dark ? "text-[#f5c46b]/85" : "text-[#b9781f]")}>{children}</div>;
}

/** A screenshot in a soft browser frame. */
function Frame({ src, alt, className, bar = true }: { src: string; alt: string; className?: string; bar?: boolean }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-white/10 bg-[#141110] shadow-[0_40px_90px_-35px_rgba(0,0,0,.85)]", className)}>
      {bar && <div className="flex items-center gap-1.5 border-b border-white/[0.06] bg-white/[0.03] px-4 py-2.5">
        {["#f87171", "#fbbf24", "#34d399"].map((c) => <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c, opacity: 0.8 }} />)}
      </div>}
      <img src={src} alt={alt} loading="lazy" className="block w-full" />
    </div>
  );
}
function Phone({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[2.2rem] border-[7px] border-[#1f1b17] bg-[#1f1b17] shadow-[0_40px_80px_-30px_rgba(0,0,0,.9)] ring-1 ring-white/10", className)}>
      <img src={src} alt={alt} loading="lazy" className="block w-full rounded-[1.6rem]" />
    </div>
  );
}

/* ============================================================ page */
export default function SitePage() {
  useReveal();
  const { isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    document.title = "MicroMax POS — Restaurant POS & management for Pakistan";
    const on = () => setScrolled(window.scrollY > 20);
    on(); window.addEventListener("scroll", on, { passive: true });
    const hash = window.location.hash.slice(1);                // e.g. /#demo from the sign-in page
    if (hash) setTimeout(() => go(hash), 300);
    return () => window.removeEventListener("scroll", on);
  }, []);
  const nav = [["features", "Features"], ["modules", "Modules"], ["pricing", "Pricing"], ["faq", "FAQ"]] as const;

  return (
    <div className="mx min-h-screen bg-[#faf7f1] text-[#14110d]">
      <style>{SITE_STYLE}</style>

      {/* ------------------------------------------------ nav */}
      <header className={cn("fixed inset-x-0 top-0 z-50 transition-all duration-300", scrolled ? "bg-[#0d0b09]/85 shadow-[0_10px_40px_-20px_rgba(0,0,0,.8)] backdrop-blur-xl" : "bg-transparent")}>
        <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-6 px-5 lg:px-8">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="MicroMax POS home"><MicroMaxLogo /></button>
          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {nav.map(([id, label]) => <button key={id} onClick={() => go(id)} className="rounded-full px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white">{label}</button>)}
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Link to={isAuthenticated ? "/pos" : "/login"} className="rounded-full px-4 py-2 text-sm font-semibold text-white/80 hover:text-white">{isAuthenticated ? "Open POS" : "Sign in"}</Link>
            <button onClick={() => go("demo")} className="btn-gold inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition">Book a free demo <ArrowRight className="h-4 w-4" /></button>
          </div>
          <button onClick={() => setMenuOpen((v) => !v)} className="ml-auto rounded-full p-2 text-white md:hidden" aria-label="Menu">{menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}</button>
        </div>
        {menuOpen && (
          <div className="border-t border-white/10 bg-[#0d0b09]/95 px-5 pb-5 pt-2 backdrop-blur-xl md:hidden">
            {nav.map(([id, label]) => <button key={id} onClick={() => { setMenuOpen(false); go(id); }} className="block w-full py-3 text-left text-base font-medium text-white/80">{label}</button>)}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Link to={isAuthenticated ? "/pos" : "/login"} className="rounded-full border border-white/15 py-3 text-center text-sm font-semibold text-white">{isAuthenticated ? "Open POS" : "Sign in"}</Link>
              <button onClick={() => { setMenuOpen(false); go("demo"); }} className="btn-gold rounded-full py-3 text-sm font-bold">Book a demo</button>
            </div>
          </div>
        )}
      </header>

      {/* ------------------------------------------------ hero */}
      <section className="relative overflow-hidden bg-[#0b0a09] pb-24 pt-36 text-[#f6efe4] lg:pb-32 lg:pt-44">
        <div className="grain pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -left-40 top-10 h-[40rem] w-[40rem] rounded-full bg-[#e59a3a]/[0.13] blur-[140px]" />
        <div className="pointer-events-none absolute -right-40 bottom-0 h-[34rem] w-[34rem] rounded-full bg-[#0d9488]/[0.12] blur-[140px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 lg:grid-cols-[1.02fr_1fr] lg:px-8">
          <div>
            <div className="rise inline-flex items-center gap-2 rounded-full border border-[#f5c46b]/25 bg-[#f5c46b]/[0.07] px-4 py-1.5 text-xs font-semibold text-[#fde3a7]">
              <BadgeCheck className="h-4 w-4 text-[#f5c46b]" /> Built for Pakistan · FBR &amp; PRA ready
            </div>
            <h1 className="serif rise mt-6 text-5xl font-semibold leading-[1.02] sm:text-6xl lg:text-[4.6rem]" style={{ animationDelay: ".08s" }}>
              Run your whole restaurant from <span className="gold-grad">one screen.</span>
            </h1>
            <p className="rise mt-6 max-w-xl text-lg leading-relaxed text-white/65" style={{ animationDelay: ".16s" }}>
              Counter, kitchen, online orders, riders, stock and accounts — connected. Every order moves itself from the till to the kitchen,
              the rider and the books, with nothing typed twice.
            </p>
            <div className="rise mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: ".24s" }}>
              <button onClick={() => go("demo")} className="btn-gold inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-bold transition">Book a free demo <ArrowRight className="h-5 w-5" /></button>
              <button onClick={() => go("pricing")} className="rounded-full border border-white/15 px-7 py-3.5 text-base font-semibold text-white/85 transition hover:bg-white/5">See pricing</button>
            </div>
            <div className="rise mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/55" style={{ animationDelay: ".32s" }}>
              {[`${TRIAL_DAYS}-day free trial`, "No setup fee", "Works offline"].map((t) => <span key={t} className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#f5c46b]" />{t}</span>)}
            </div>
          </div>
          <div className="relative">
            <Frame src={shot("terminal")} alt="MicroMax POS counter terminal" className="rise relative z-10" />
            <Phone src={shot("order-phone")} alt="Online ordering on a phone" className="float absolute -bottom-14 -left-6 z-20 hidden w-40 sm:block lg:-left-14 lg:w-48" />
            <div className="glass float absolute -right-3 -top-8 z-20 hidden rounded-2xl px-4 py-3 text-sm shadow-2xl sm:block" style={{ animationDelay: "1.5s" }}>
              <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300"><ChefHat className="h-5 w-5" /></span>
                <div><div className="font-semibold text-white">On the kitchen screen</div><div className="text-xs text-white/55">in under a second</div></div></div>
            </div>
            <div className="glass float absolute -bottom-8 right-6 z-20 hidden rounded-2xl px-4 py-3 text-sm shadow-2xl sm:block" style={{ animationDelay: ".8s" }}>
              <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f5c46b]/15 text-[#f5c46b]"><Receipt className="h-5 w-5" /></span>
                <div><div className="font-semibold text-white">FBR invoice + QR</div><div className="text-xs text-white/55">on every receipt</div></div></div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ proof strip */}
      <section className="border-b border-[#14110d]/[0.07] bg-[#f3eee5]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-5 lg:grid-cols-4 lg:px-8">
          {[["< 1 s", "order to kitchen screen", Zap], ["0.2 s", "to ring up a sale", Timer], ["Offline", "keeps selling, syncs later", CloudOff], ["9 steps", "automated end to end", Sparkles]].map(([v, l, Icon]) => {
            const I = Icon as typeof Zap;
            return (
              <div key={l as string} className="reveal flex items-center gap-4 px-2 py-8 lg:justify-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#14110d] text-[#f5c46b]"><I className="h-5 w-5" /></span>
                <div><div className="serif text-3xl font-semibold leading-none">{v as string}</div><div className="mt-1 text-sm text-[#14110d]/55">{l as string}</div></div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------ flow */}
      <section id="features" className="scroll-mt-20 py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="reveal mx-auto max-w-2xl text-center">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="serif mt-4 text-4xl font-semibold leading-tight sm:text-5xl">From the first order to the last report — <span className="gold">automatically</span></h2>
            <p className="mt-5 text-lg text-[#14110d]/60">Each step triggers the next. Your staff cook, serve and deliver; MicroMax does the paperwork.</p>
          </div>
          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [Store, "Order from anywhere", "Counter, tables, website, app, kiosk, phone or Foodpanda — one queue."],
              [ChefHat, "Kitchen sees it instantly", "Tickets split by station; cooks bump lines as they go."],
              [Bike, "Rider is offered the delivery", "The nearest free rider gets it the moment it's ready."],
              [Truck, "Delivered with proof", "Customer code or photo, cash collected and tracked."],
              [Gift, "Reviews & loyalty", "Customers rate the order and earn points automatically."],
              [Boxes, "Stock updates itself", "Recipes deduct ingredients; low stock raises a reorder."],
            ].map(([Icon, t, d], k) => {
              const I = Icon as typeof Store;
              return (
                <div key={t as string} className="reveal group relative overflow-hidden rounded-3xl border border-[#14110d]/[0.07] bg-white p-7 shadow-[0_20px_50px_-35px_rgba(20,17,13,.35)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(185,120,31,.35)]" style={{ transitionDelay: `${k * 60}ms` }}>
                  <span className="serif absolute right-6 top-4 text-6xl font-semibold text-[#14110d]/[0.05]">{String(k + 1).padStart(2, "0")}</span>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f7cd7a] to-[#e59a3a] text-[#1a1208] shadow-[0_12px_24px_-12px_rgba(229,154,58,.9)]"><I className="h-6 w-6" /></span>
                  <h3 className="mt-6 text-xl font-semibold">{t as string}</h3>
                  <p className="mt-2 leading-relaxed text-[#14110d]/60">{d as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ modules showcase */}
      <section id="modules" className="scroll-mt-20 bg-[#0b0a09] py-24 text-[#f6efe4] lg:py-32">
        <div className="mx-auto max-w-7xl space-y-28 px-5 lg:px-8">
          <div className="reveal mx-auto max-w-2xl text-center">
            <Eyebrow dark>Every screen your restaurant needs</Eyebrow>
            <h2 className="serif mt-4 text-4xl font-semibold leading-tight sm:text-5xl">Beautiful where your <span className="gold-grad">customers</span> look. Fast where your <span className="gold-grad">staff</span> work.</h2>
          </div>
          {[
            { img: "kds", eyebrow: "Kitchen display", title: "No more lost tickets", icon: ChefHat,
              points: ["Live board by station: Grill, Handi, Fryer, Drinks", "Colour timers turn amber, then red", "Second rounds marked “+ New items”", "Assign the rider straight from the ticket"] },
            { img: "display", eyebrow: "Customer display", title: "Let guests watch their bill build", icon: MonitorSmartphone,
              points: ["Each item, offer and tax as it's rung up", "Amount to pay and change, in big type", "Thank-you screen with the FBR QR", "Dish slideshow and offers between customers"] },
            { img: "kiosk", eyebrow: "Self-order kiosk", title: "Queues move while you cook", icon: TabletSmartphone,
              points: ["Photo menu with add-ons and offers", "Eat in or take away", "Order number, pay at the counter", "Resets itself when idle"] },
            { img: "dispatch", eyebrow: "Delivery & riders", title: "Every rider on one map", icon: Bike,
              points: ["Own riders and Foodpanda riders, live", "Auto-offer to the nearest free rider", "Rider app with delivery code and cash", "Customer tracking link by WhatsApp"] },
            { img: "dashboard", eyebrow: "Owner dashboard", title: "Know your numbers by lunch", icon: LineChart,
              points: ["Today vs yesterday, live", "Food cost %, late tickets, kitchen load", "Menu engineering and variance", "Reviews and low-rating alerts"] },
          ].map((m, k) => {
            const I = m.icon;
            return (
              <div key={m.img} className={cn("grid items-center gap-12 lg:grid-cols-2 lg:gap-20", k % 2 && "lg:[&>*:first-child]:order-2")}>
                <div className="reveal">
                  <Frame src={shot(m.img)} alt={m.title} />
                </div>
                <div className="reveal">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#f5c46b]/25 bg-[#f5c46b]/[0.07] px-3.5 py-1.5 text-xs font-semibold text-[#fde3a7]"><I className="h-4 w-4 text-[#f5c46b]" />{m.eyebrow}</span>
                  <h3 className="serif mt-5 text-4xl font-semibold leading-tight">{m.title}</h3>
                  <ul className="mt-7 space-y-3.5">
                    {m.points.map((p) => <li key={p} className="flex items-start gap-3 text-lg text-white/70"><span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f5c46b]/15"><Check className="h-3.5 w-3.5 text-[#f5c46b]" /></span>{p}</li>)}
                  </ul>
                </div>
              </div>
            );
          })}
          <div className="reveal grid items-center gap-12 lg:grid-cols-[1fr_auto_auto]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#f5c46b]/25 bg-[#f5c46b]/[0.07] px-3.5 py-1.5 text-xs font-semibold text-[#fde3a7]"><Smartphone className="h-4 w-4 text-[#f5c46b]" />Your brand, online</span>
              <h3 className="serif mt-5 text-4xl font-semibold leading-tight">Commission-free online orders</h3>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/65">Your own ordering site and installable app: photo menu, add-ons, promo codes, loyalty points, cash or card — and a live tracking page for every order.</p>
            </div>
            <Phone src={shot("order-phone")} alt="Ordering site" className="mx-auto w-56" />
            <Phone src={shot("rider-phone")} alt="Rider app" className="mx-auto w-56 lg:translate-y-10" />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ why us */}
      <section className="py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="reveal max-w-2xl">
            <Eyebrow>Why MicroMax</Eyebrow>
            <h2 className="serif mt-4 text-4xl font-semibold leading-tight sm:text-5xl">Made for how restaurants work <span className="gold">here</span>.</h2>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[
              [Receipt, "FBR & PRA invoicing", "Every sale reported, fiscal number and QR printed. 18% sales tax on top or included — your choice."],
              [Globe, "Foodpanda built in", "Orders land on your kitchen screen with Foodpanda prices; invoiced when delivered."],
              [CreditCard, "Local payments", "Cash, card, bank transfer, and online payment through Pakistani gateways."],
              [ShieldCheck, "Owner-grade control", "Manager approval for big discounts and refunds, full audit trail, shift cash-up."],
              [Boxes, "Real accounting inside", "Built on ERPNext: invoices, stock, purchasing and ledgers — not a separate spreadsheet."],
              [UtensilsCrossed, "Multi-branch ready", "One owner view across branches, central store and kitchens."],
            ].map(([Icon, t, d], k) => {
              const I = Icon as typeof Receipt;
              return (
                <div key={t as string} className="reveal flex gap-5 rounded-3xl p-6 transition-colors hover:bg-white" style={{ transitionDelay: `${k * 50}ms` }}>
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#14110d] text-[#f5c46b]"><I className="h-5 w-5" /></span>
                  <div><h3 className="text-lg font-semibold">{t as string}</h3><p className="mt-1.5 leading-relaxed text-[#14110d]/60">{d as string}</p></div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ pricing */}
      <Pricing />

      {/* ------------------------------------------------ faq */}
      <section id="faq" className="scroll-mt-20 py-24 lg:py-32">
        <div className="mx-auto grid max-w-7xl gap-14 px-5 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div className="reveal">
            <Eyebrow>Questions</Eyebrow>
            <h2 className="serif mt-4 text-4xl font-semibold leading-tight sm:text-5xl">Good to know</h2>
            <p className="mt-5 text-lg text-[#14110d]/60">Anything else? Book a demo and ask us directly — we'll show it on your own menu.</p>
          </div>
          <div className="reveal divide-y divide-[#14110d]/10 border-y border-[#14110d]/10">
            {[
              ["Does it work when the internet goes down?", "Yes. The counter keeps selling offline and syncs every sale once the connection is back — each sale is posted exactly once."],
              ["Is it connected to FBR?", "Yes. Each invoice is reported to FBR (or PRA in Punjab) and the fiscal invoice number and QR code print on the receipt. We set it up with your POS ID."],
              ["What hardware do I need?", "Any Windows PC, tablet or Android device with a modern browser, an 80 mm or 58 mm thermal printer, and optionally a cash drawer, kitchen screen and second monitor for the customer display."],
              ["Can I take Foodpanda orders?", "Yes. Foodpanda orders arrive on the same kitchen screen with their own prices and are invoiced when delivered."],
              ["How long does setup take?", "Most restaurants are live within a few days: we load your menu, recipes and staff, connect your printers and train your team."],
              ["Can I change plans later?", "Any time. Start small and add online ordering, riders or more branches when you need them."],
            ].map(([q, a]) => <Faq key={q} q={q} a={a} />)}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ demo */}
      <Demo />

      {/* ------------------------------------------------ footer */}
      <footer className="bg-[#0b0a09] pb-10 pt-16 text-white/55">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="flex flex-col gap-10 border-b border-white/10 pb-12 md:flex-row md:items-start md:justify-between">
            <div className="max-w-sm"><MicroMaxLogo /><p className="mt-5 text-sm leading-relaxed">Restaurant point of sale and management, from the counter to the accounts.</p></div>
            <div className="grid grid-cols-2 gap-x-16 gap-y-3 text-sm">
              {nav.map(([id, label]) => <button key={id} onClick={() => go(id)} className="text-left hover:text-white">{label}</button>)}
              <button onClick={() => go("demo")} className="text-left hover:text-white">Book a demo</button>
              <Link to="/login" className="hover:text-white">Sign in</Link>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-3 pt-8 text-xs md:flex-row">
            <span>© {new Date().getFullYear()} MicroMax. All rights reserved.</span>
            <span>Prices in PKR per branch. Taxes extra where applicable.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ============================================================ pricing */
function Pricing() {
  const [annual, setAnnual] = useState(true);
  return (
    <section id="pricing" className="relative scroll-mt-20 overflow-hidden bg-[#0b0a09] py-24 text-[#f6efe4] lg:py-32">
      <div className="grain pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[30rem] w-[50rem] -translate-x-1/2 rounded-full bg-[#e59a3a]/[0.1] blur-[140px]" />
      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <div className="reveal mx-auto max-w-2xl text-center">
          <Eyebrow dark>Pricing</Eyebrow>
          <h2 className="serif mt-4 text-4xl font-semibold leading-tight sm:text-5xl">Simple plans. <span className="gold-grad">No surprises.</span></h2>
          <p className="mt-5 text-lg text-white/60">Every plan includes menu setup, staff training and support. {TRIAL_DAYS} days free to try.</p>
          <div className="mt-9 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1.5">
            {[[false, "Monthly"], [true, "Yearly"]].map(([v, l]) => (
              <button key={l as string} onClick={() => setAnnual(v as boolean)} className={cn("rounded-full px-6 py-2.5 text-sm font-semibold transition-all", annual === v ? "btn-gold" : "text-white/65 hover:text-white")}>
                {l as string}{v ? <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[11px]", annual ? "bg-black/15" : "bg-[#f5c46b]/15 text-[#f5c46b]")}>2 months free</span> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-14 grid items-stretch gap-6 lg:grid-cols-3">
          {PLANS.map((p, k) => (
            <div key={p.key} style={{ transitionDelay: `${k * 80}ms` }}
              className={cn("reveal relative flex flex-col rounded-[2rem] p-8", p.popular
                ? "bg-gradient-to-b from-[#2a2015] to-[#16110c] ring-2 ring-[#f5c46b]/60 shadow-[0_40px_90px_-40px_rgba(229,154,58,.6)] lg:-translate-y-4"
                : "glass")}>
              {p.popular && <span className="btn-gold absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold">Most popular</span>}
              <h3 className="serif text-3xl font-semibold">{p.key}</h3>
              <p className="mt-2 min-h-[3rem] text-white/60">{p.blurb}</p>
              <div className="mt-6 flex items-end gap-2">
                {p.price ? <>
                  <span className="serif text-5xl font-semibold leading-none">{pkr(annual ? Math.round(yearly(p.price) / 12) : p.price)}</span>
                  <span className="pb-1 text-sm text-white/50">/ month</span>
                </> : <span className="serif text-5xl font-semibold leading-none">Custom</span>}
              </div>
              <p className="mt-2 h-5 text-sm text-white/45">{p.price ? (annual ? `${pkr(yearly(p.price))} billed yearly, per branch` : "Billed monthly, per branch") : "For groups and chains"}</p>
              <button onClick={() => { (document.getElementById("demo-plan") as HTMLSelectElement | null)?.setAttribute("data-pick", p.key); window.dispatchEvent(new CustomEvent("mx-plan", { detail: p.key })); go("demo"); }}
                className={cn("mt-8 inline-flex items-center justify-center gap-2 rounded-full py-3.5 text-base font-bold transition", p.popular ? "btn-gold" : "border border-white/15 text-white hover:bg-white/5")}>
                {p.cta} <ArrowRight className="h-4 w-4" /></button>
              <ul className="mt-8 space-y-3.5 border-t border-white/10 pt-8">
                {p.features.map((f) => <li key={f} className="flex items-start gap-3 text-[15px] text-white/75"><Check className="mt-0.5 h-5 w-5 shrink-0 text-[#f5c46b]" />{f}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className="reveal mt-10 text-center text-sm text-white/45">Need printers, tablets or a kitchen screen? Ask about hardware bundles when you book your demo.</p>
      </div>
    </section>
  );
}

/* ============================================================ faq item */
function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-6 py-6 text-left">
        <span className="text-lg font-semibold">{q}</span>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#14110d]/15 transition-transform duration-300", open && "rotate-180 bg-[#14110d] text-[#f5c46b]")}><ChevronDown className="h-4 w-4" /></span>
      </button>
      <div className="overflow-hidden transition-[max-height] duration-500" style={{ maxHeight: open ? body.current?.scrollHeight ?? 400 : 0 }}>
        <div ref={body} className="pb-6 pr-14 leading-relaxed text-[#14110d]/65">{a}</div>
      </div>
    </div>
  );
}

/* ============================================================ demo form */
function Demo() {
  const [f, setF] = useState({ name: "", phone: "", restaurant: "", city: "", email: "", branches: "1", plan: "Growth", message: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { const on = (e: Event) => setF((x) => ({ ...x, plan: (e as CustomEvent).detail })); window.addEventListener("mx-plan", on); return () => window.removeEventListener("mx-plan", on); }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await postCall("restaurant_os.api.site.request_demo", f); setSent(true); } catch (x) { setErr(humanizeError(x)); } finally { setBusy(false); }
  };
  const field = "h-12 w-full rounded-xl border border-white/10 !bg-white/[0.05] px-4 [color-scheme:dark] text-white placeholder:text-white/35 focus:border-[#f5c46b]/60 focus:outline-none";
  return (
    <section id="demo" className="relative scroll-mt-20 overflow-hidden bg-[#0b0a09] py-24 text-[#f6efe4] lg:py-32">
      <img src={shot("display")} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.12] blur-sm" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0a09] via-[#0b0a09]/90 to-[#0b0a09]/70" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 lg:grid-cols-2 lg:px-8">
        <div className="reveal">
          <Eyebrow dark>Book a free demo</Eyebrow>
          <h2 className="serif mt-4 text-4xl font-semibold leading-tight sm:text-5xl">See it running on <span className="gold-grad">your menu.</span></h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/65">Tell us about your restaurant. We'll call you back, set up a trial with your dishes and show the whole flow — counter, kitchen, riders and reports.</p>
          <ul className="mt-8 space-y-3 text-white/70">
            {["30-minute walkthrough, online or at your restaurant", `${TRIAL_DAYS}-day free trial with your own menu`, "Help moving from your current system"].map((t) => <li key={t} className="flex items-center gap-3"><Check className="h-5 w-5 text-[#f5c46b]" />{t}</li>)}
          </ul>
        </div>
        <div className="reveal glass rounded-[2rem] p-7 sm:p-9">
          {sent ? (
            <div className="py-10 text-center">
              <span className="btn-gold mx-auto flex h-16 w-16 items-center justify-center rounded-full"><Check className="h-8 w-8" /></span>
              <h3 className="serif mt-6 text-3xl font-semibold">Thank you, {f.name.split(" ")[0]}!</h3>
              <p className="mt-3 text-white/65">We've got your request and will call you on {f.phone} shortly.</p>
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-1"><span className="mb-1.5 block text-sm text-white/60">Your name *</span><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={field} /></label>
              <label><span className="mb-1.5 block text-sm text-white/60">Mobile *</span><input required type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="03xx xxxxxxx" className={field} /></label>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-sm text-white/60">Restaurant name *</span><input required value={f.restaurant} onChange={(e) => setF({ ...f, restaurant: e.target.value })} className={field} /></label>
              <label><span className="mb-1.5 block text-sm text-white/60">City</span><input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} className={field} /></label>
              <label><span className="mb-1.5 block text-sm text-white/60">Email</span><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={field} /></label>
              <label><span className="mb-1.5 block text-sm text-white/60">Branches</span>
                <select value={f.branches} onChange={(e) => setF({ ...f, branches: e.target.value })} className={field}>{["1", "2–3", "4–10", "10+"].map((b) => <option key={b} className="text-black">{b}</option>)}</select></label>
              <label><span className="mb-1.5 block text-sm text-white/60">Plan</span>
                <select id="demo-plan" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} className={field}>{[...PLANS.map((p) => p.key), "Not sure"].map((p) => <option key={p} className="text-black">{p}</option>)}</select></label>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-sm text-white/60">Anything we should know?</span>
                <textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} rows={3} className={cn(field, "h-auto py-3")} /></label>
              {err && <p className="text-sm text-red-300 sm:col-span-2">{err}</p>}
              <button disabled={busy} className="btn-gold inline-flex items-center justify-center gap-2 rounded-full py-4 text-base font-bold transition disabled:opacity-60 sm:col-span-2">
                {busy ? "Sending…" : <>Book my free demo <ArrowRight className="h-5 w-5" /></>}</button>
              <p className="text-center text-xs text-white/40 sm:col-span-2">We only use your details to contact you about MicroMax POS.</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
