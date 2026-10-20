import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CreditCard, Lock, ShieldCheck } from "lucide-react";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { money } from "./menu";

interface Session { status: string; amount: number; currency: string; order_no: string; tracking_key: string; restaurant: string; logo?: string; mock: boolean; paid: boolean }

/** The built-in test gateway (Restaurant Settings → Online Payment → Mode = Mock). A live provider replaces this page
 *  with its own hosted checkout and calls the webhook. */
export default function PayPage() {
  const { session = "" } = useParams();
  const navigate = useNavigate();
  const [s, setS] = useState<Session | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState({ number: "4242 4242 4242 4242", exp: "12/30", cvc: "123", name: "" });
  useEffect(() => { getCall<Session>("restaurant_os.api.payments.session", { session }).then((r) => { setS(r); if (r.paid) navigate(`/track/${r.tracking_key}`, { replace: true }); }).catch((e) => setErr(humanizeError(e))); }, [session, navigate]);
  const pay = async (outcome: "success" | "fail") => {
    setBusy(true);
    try {
      const r = await postCall<Session>("restaurant_os.api.payments.mock_pay", { session, outcome });
      navigate(`/track/${r.tracking_key}`, { replace: true });
    } catch (e) { setErr(humanizeError(e)); } finally { setBusy(false); }
  };
  if (err) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-muted-foreground">{err}</div>;
  if (!s) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading payment…</div>;
  const field = (k: keyof typeof card, label: string, cls = "") => (
    <label className={cn("block text-xs text-muted-foreground", cls)}>{label}<input value={card[k]} onChange={(e) => setCard({ ...card, [k]: e.target.value })}
      className="mt-1 h-11 w-full rounded-xl border border-input bg-transparent px-3 text-base text-foreground" /></label>);
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 bg-background p-5">
      {s.mock && <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-center text-xs font-semibold text-amber-800 dark:text-amber-300">TEST GATEWAY — no real money is charged</div>}
      <div className="flex items-center gap-3">
        {s.logo && <img src={s.logo} alt="" className="h-10 w-auto rounded bg-white p-1" />}
        <div><div className="font-bold">{s.restaurant}</div><div className="text-xs text-muted-foreground">Order #{s.order_no}</div></div>
        <div className="ml-auto text-right"><div className="text-xs text-muted-foreground">Amount</div><div className="text-2xl font-extrabold">{money(s.amount, s.currency)}</div></div>
      </div>
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 font-semibold"><CreditCard className="h-5 w-5 text-primary" /> Card details</div>
        {field("number", "Card number")}
        <div className="grid grid-cols-2 gap-3">{field("exp", "Expiry (MM/YY)")}{field("cvc", "CVC")}</div>
        {field("name", "Name on card")}
      </div>
      <button disabled={busy} onClick={() => void pay("success")} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-bold text-primary-foreground disabled:opacity-50">
        <Lock className="h-5 w-5" /> {busy ? "Processing…" : `Pay ${money(s.amount, s.currency)}`}</button>
      {s.mock && <button disabled={busy} onClick={() => void pay("fail")} className="text-sm text-muted-foreground underline">Simulate a declined card</button>}
      <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Card details are not stored by the restaurant</p>
    </div>
  );
}
