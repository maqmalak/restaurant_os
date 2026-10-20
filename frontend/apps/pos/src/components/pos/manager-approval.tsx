import { useCallback, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { humanizeError } from "@/services/frappe";

export interface Approval { user: string; password: string }

/** The server refused because a manager must approve (big discount, return): `restaurant_os.services.approvals`. */
export const needsApproval = (e: unknown) => (e as { response?: { data?: { exc_type?: string } } })?.response?.data?.exc_type === "ApprovalRequired";

export class ApprovalCancelled extends Error { constructor() { super("Manager approval cancelled"); } }

/**
 * `withApproval(call)` runs `call()`; when the server answers ApprovalRequired it shows a manager sign-in and retries
 * `call(approval)` until it succeeds or the cashier cancels (→ ApprovalCancelled). Render `dialog` once.
 */
export function useManagerApproval() {
  const [ask, setAsk] = useState<{ reason: string } | null>(null);
  const resolver = useRef<((a: Approval | null) => void) | null>(null);
  const prompt = (reason: string) => new Promise<Approval | null>((resolve) => { resolver.current = resolve; setAsk({ reason }); });
  const close = (a: Approval | null) => { resolver.current?.(a); resolver.current = null; setAsk(null); };

  const withApproval = useCallback(async <T,>(call: (approval?: Approval) => Promise<T>): Promise<T> => {
    try { return await call(); } catch (e) {
      if (!needsApproval(e)) throw e;
      let reason = humanizeError(e);
      for (;;) {
        const a = await prompt(reason);
        if (!a) throw new ApprovalCancelled();
        try { return await call(a); } catch (e2) { if (!needsApproval(e2)) throw e2; reason = humanizeError(e2); }
      }
    }
  }, []);

  const dialog = ask ? <ApprovalDialog reason={ask.reason} onDone={close} /> : null;
  return { withApproval, dialog };
}

function ApprovalDialog({ reason, onDone }: { reason: string; onDone: (a: Approval | null) => void }) {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  return (
    <Dialog open onClose={() => onDone(null)} title="Manager approval" size="sm">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (user && password) onDone({ user: user.trim(), password }); }}>
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{reason}</p>
        <label className="block text-sm">Manager (email or username)<Input autoFocus autoComplete="off" value={user} onChange={(e) => setUser(e.target.value)} className="mt-1" /></label>
        <label className="block text-sm">Password<Input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" /></label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onDone(null)}>Cancel</Button>
          <Button type="submit" disabled={!user || !password}>Approve</Button>
        </div>
      </form>
    </Dialog>
  );
}
