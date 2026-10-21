import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, Check, ChefHat, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-provider";
import { MicroMaxLogo, shot, SITE_STYLE } from "@/pages/Site/brand";
import { useAuth } from "@/hooks/useAuth";
import { humanizeError } from "@/services/frappe";

/** Cashier sign-in (an ERPNext user with a POS Profile). */
export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const from = (location.state as { from?: string } | null)?.from || "/pos";

  useEffect(() => { document.title = "Sign in · MicroMax POS"; }, []);
  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate(from === "/login" ? "/pos" : from, { replace: true });
  }, [isAuthenticated, isLoading, navigate, from]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx grid min-h-screen bg-background lg:grid-cols-[1.1fr_1fr]">
      <style>{SITE_STYLE}</style>
      {/* brand panel: a staged product scene */}
      <aside className="relative hidden h-screen min-h-[640px] flex-col overflow-hidden bg-[#0a0908] text-[#f6efe4] lg:sticky lg:top-0 lg:flex">
        <div className="grain pointer-events-none absolute inset-0" />
        {/* light */}
        <div className="pointer-events-none absolute -left-32 -top-40 h-[38rem] w-[38rem] rounded-full bg-[#e59a3a]/[0.16] blur-[130px]" />
        <div className="pointer-events-none absolute -bottom-48 -right-24 h-[34rem] w-[34rem] rounded-full bg-[#0d9488]/[0.14] blur-[130px]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_50%_100%,rgba(245,196,107,.10),transparent_65%)]" />
        <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_60%_70%,black,transparent_70%)]" />

        <div className="relative flex items-center justify-between px-10 pt-9 xl:px-14">
          <Link to="/"><MicroMaxLogo /></Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1 text-xs font-semibold text-emerald-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> All systems running</span>
        </div>

        <div className="relative px-10 pt-[6vh] xl:px-14">
          <div className="text-xs font-bold uppercase tracking-[0.32em] text-[#f5c46b]">Welcome back</div>
          <h1 className="serif mt-3 max-w-xl text-[clamp(2.3rem,3.4vw,3.6rem)] font-semibold leading-[1.04]">Your restaurant, <span className="gold-grad">ready when you are.</span></h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-[#e2d6c4] xl:text-lg">Counter, kitchen and deliveries pick up exactly where you left them.</p>
        </div>

        {/* devices */}
        <div className="relative mt-auto flex min-h-0 flex-1 items-end justify-center px-10 pb-0 pt-8 xl:px-14">
          <div className="relative aspect-[16/11] h-full max-h-[460px] w-auto max-w-full">
            {/* monitor */}
            <div className="absolute left-[6%] right-[2%] top-[4%]">
              <div className="rounded-[18px] border border-white/10 bg-gradient-to-b from-[#2a2622] to-[#161311] p-[1.4%] shadow-[0_50px_100px_-40px_rgba(0,0,0,.95),inset_0_1px_0_rgba(255,255,255,.08)]">
                <div className="overflow-hidden rounded-[10px] bg-black ring-1 ring-black/60">
                  <img src={shot("terminal-clean")} alt="MicroMax POS terminal" className="block aspect-[16/10] w-full object-cover object-top [filter:brightness(1.06)_saturate(1.1)]" />
                </div>
              </div>
              <div className="mx-auto h-[5%] min-h-[14px] w-[16%] bg-gradient-to-b from-[#2a2622] to-[#1a1714]" />
              <div className="mx-auto h-[8px] w-[34%] rounded-full bg-gradient-to-b from-[#2f2a25] to-[#191613] shadow-[0_18px_30px_-10px_rgba(0,0,0,.9)]" />
            </div>
            {/* phone */}
            <div className="float absolute -bottom-[1%] -left-[3%] z-20 w-[25%]" style={{ animationDelay: ".6s" }}>
              <div className="pointer-events-none absolute -inset-6 rounded-full bg-[#f5c46b]/25 blur-3xl" />
              <div className="relative rounded-[30px] bg-gradient-to-b from-[#3a332c] to-[#15120f] p-[5px] shadow-[0_40px_70px_-25px_rgba(0,0,0,.95)] ring-1 ring-white/15">
                <div className="sheen relative overflow-hidden rounded-[25px] bg-black">
                  <img src={shot("phone-hi")} alt="Online ordering on a phone" className="block aspect-[9/17.5] w-full object-cover object-top [filter:brightness(1.08)_saturate(1.15)]" />
                  <div className="glare pointer-events-none absolute inset-0" />
                  <span className="absolute left-1/2 top-1.5 h-[14px] w-[30%] -translate-x-1/2 rounded-full bg-black" />
                </div>
              </div>
            </div>
            {/* customer display */}
            <div className="float absolute -right-[4%] bottom-[10%] z-20 w-[40%]" style={{ animationDelay: "1.4s" }}>
              <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-[#e59a3a]/20 blur-3xl" />
              <div className="relative rounded-[16px] bg-gradient-to-b from-[#3a332c] to-[#15120f] p-[5px] shadow-[0_40px_70px_-25px_rgba(0,0,0,.95)] ring-1 ring-white/15">
                <div className="sheen relative overflow-hidden rounded-[11px] bg-black" style={{ animationDelay: "2s" }}>
                  <img src={shot("display-hi")} alt="Customer display" className="block aspect-[16/10] w-full object-cover [filter:brightness(1.12)_saturate(1.15)]" />
                  <div className="glare pointer-events-none absolute inset-0" />
                </div>
              </div>
              <div className="absolute -top-3 left-4 rounded-full bg-gradient-to-r from-[#f7cd7a] to-[#e59a3a] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1a1208] shadow-lg">Customer display</div>
            </div>
            {/* live chips */}
            <div className="glass float absolute left-[24%] top-0 rounded-2xl px-3.5 py-2.5 shadow-2xl" style={{ animationDelay: ".2s" }}>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/75">Today's sales</div>
              <div className="mt-0.5 flex items-baseline gap-2"><span className="text-lg font-bold tabular-nums">Rs 22,798</span><span className="rounded-full bg-emerald-400/15 px-1.5 text-[11px] font-semibold text-emerald-300">+19%</span></div>
            </div>
            <div className="glass float absolute right-[4%] top-[-2%] flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 shadow-2xl" style={{ animationDelay: "1s" }}>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f5c46b]/15 text-[#f5c46b]"><ChefHat className="h-4 w-4" /></span>
              <div><div className="text-sm font-semibold">Order #34 ready</div><div className="text-[11px] text-white/75">Rider Imran assigned</div></div>
            </div>
          </div>
        </div>
      </aside>

      {/* form: its own warm palette in light (ivory) and dark (charcoal) */}
      <main className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#f6f1e8] px-6 py-8 text-[#1c1610] sm:px-10 dark:bg-[#0f0c0a] dark:text-[#f6efe4]">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[26rem] w-[26rem] rounded-full bg-[#e59a3a]/[0.12] blur-[110px]" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-[22rem] w-[22rem] rounded-full bg-[#e59a3a]/[0.06] blur-[110px]" />
        <div className="relative flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-[#e3d5bf] bg-white/60 px-3.5 py-1.5 text-sm font-semibold text-[#3d3226] hover:border-[#e59a3a] hover:text-[#1c1610] dark:border-[#3a3026] dark:bg-white/[0.04] dark:text-[#e6dac8] dark:hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to website</Link>
          <ThemeToggle />
        </div>
        <div className="relative mx-auto my-auto w-full max-w-[27rem] py-10">
          <div className="relative rounded-[28px] border border-[#e8dcc8] bg-[#fffdf9] p-8 shadow-[0_40px_90px_-45px_rgba(91,62,24,.45)] sm:p-10 dark:border-[#3a3026] dark:bg-gradient-to-b dark:from-[#1d1813] dark:to-[#15110d] dark:shadow-[0_40px_90px_-40px_rgba(0,0,0,.9)]">
            <span className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#e59a3a]/70 to-transparent" />
            <div className="lg:hidden"><span className="inline-block rounded-2xl bg-[#0b0a09] px-4 py-3"><MicroMaxLogo /></span></div>
            <span className="mt-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f7cd7a] to-[#e59a3a] text-[#1a1208] shadow-[0_12px_26px_-12px_rgba(229,154,58,.9)] lg:mt-0"><Lock className="h-5 w-5" /></span>
            <h2 className="serif mt-5 text-[2.5rem] font-semibold leading-none tracking-tight text-[#1c1610] dark:text-white">Sign in</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-[#5a4c3b] dark:text-[#cfc2ae]">Use your MicroMax POS account to open the counter.</p>
            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <label htmlFor="usr" className="text-sm font-semibold text-[#2b2219] dark:text-[#efe5d6]">Email or username</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a7862] dark:text-[#a8988a]" />
                  <input id="usr" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="you@restaurant.pk"
                    className="h-12 w-full rounded-xl border !border-[#dccfb9] !bg-white pl-10 pr-4 text-[15px] font-medium text-[#1c1610] shadow-sm transition placeholder:font-normal placeholder:text-[#a3937d] focus:!border-[#e59a3a] !outline-none focus:!ring-4 focus:!ring-[#e59a3a]/20 focus-visible:!ring-4 focus-visible:!ring-[#e59a3a]/20 !ring-offset-0 !shadow-none dark:!border-[#4a3e31] dark:focus:!border-[#e59a3a] dark:!bg-[#100d0a] dark:text-white [color-scheme:light] dark:[color-scheme:dark] dark:placeholder:text-[#8f8170]" />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="pwd" className="text-sm font-semibold text-[#2b2219] dark:text-[#efe5d6]">Password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a7862] dark:text-[#a8988a]" />
                  <input id="pwd" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Your password"
                    className="h-12 w-full rounded-xl border !border-[#dccfb9] !bg-white pl-10 pr-12 text-[15px] font-medium text-[#1c1610] shadow-sm transition placeholder:font-normal placeholder:text-[#a3937d] focus:!border-[#e59a3a] !outline-none focus:!ring-4 focus:!ring-[#e59a3a]/20 focus-visible:!ring-4 focus-visible:!ring-[#e59a3a]/20 !ring-offset-0 !shadow-none dark:!border-[#4a3e31] dark:focus:!border-[#e59a3a] dark:!bg-[#100d0a] dark:text-white [color-scheme:light] dark:[color-scheme:dark] dark:placeholder:text-[#8f8170]" />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#7a6a55] hover:bg-[#f3eadb] hover:text-[#1c1610] dark:text-[#b3a492] dark:hover:bg-white/5 dark:hover:text-white">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                </div>
              </div>
              {error && (
                <p className="flex items-start gap-2 rounded-xl border border-red-300/60 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </p>
              )}
              <button type="submit" disabled={submitting} className="btn-gold inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-bold transition disabled:opacity-60">
                {submitting ? "Signing in…" : <>Sign in <ArrowRight className="h-4 w-4" /></>}</button>
            </form>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-[#eee3d2] pt-6 text-[13px] font-medium text-[#5a4c3b] dark:border-[#30281f] dark:text-[#c9bca8]">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Encrypted session</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-[#c98a2b] dark:text-[#f5c46b]" /> Role-based access</span>
            </div>
          </div>
          <p className="mt-7 text-center text-[15px] text-[#4a3e30] dark:text-[#d6c9b5]">New to MicroMax POS? <Link to="/#demo" className="font-bold text-[#a8691a] underline-offset-4 hover:underline dark:text-[#f5c46b]">Book a free demo</Link></p>
        </div>
        <p className="relative text-center text-[13px] text-[#6b5c49] dark:text-[#b3a593]">Accounts, permissions and data are managed securely by ERPNext.</p>
      </main>
    </div>
  );
}
