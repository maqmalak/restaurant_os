import { useEffect, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { type Chosen, defaultChoices, type MenuItem, money } from "./menu";

/** A dish with its add-on groups: choose (respecting required / max), quantity, a note — then add to the cart. */
export function ItemSheet({ item, currency, onClose, onAdd, big }: { item: MenuItem; currency: string; onClose: () => void;
  onAdd: (qty: number, mods: Chosen[], notes?: string) => void; big?: boolean }) {
  const [mods, setMods] = useState<Chosen[]>(() => defaultChoices(item));
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const toggle = (group: string, name: string, max: number) => setMods((m) => {
    const g = item.modifiers.find((x) => x.group === group);
    if (m.some((c) => c.group === group && c.name === name)) {
      // a required single choice stays chosen (tapping it again doesn't empty it)
      if (max === 1 && (g?.required || g?.min)) return m;
      return m.filter((c) => !(c.group === group && c.name === name));
    }
    if (max === 1) return [...m.filter((c) => c.group !== group), { group, name }];        // single choice: swap
    if (max > 1 && m.filter((c) => c.group === group).length >= max) return m;              // limit reached
    return [...m, { group, name }];
  });
  const missing = item.modifiers.filter((g) => (g.required || g.min) && mods.filter((c) => c.group === g.group).length < Math.max(g.min, g.required ? 1 : 0));
  const unit = item.price + mods.reduce((s, c) => s + (item.modifiers.find((g) => g.group === c.group)?.options.find((o) => o.name === c.name)?.price ?? 0), 0);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className={cn("max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-card sm:rounded-3xl", big ? "max-w-2xl" : "max-w-md")} onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          {item.image ? <img src={item.image} alt="" className={cn("w-full object-cover", big ? "h-72" : "h-52")} /> : <div className="h-24 bg-muted" />}
          <button onClick={onClose} className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className={cn("space-y-4 p-5", big && "p-7")}>
          <div>
            <h2 className={cn("font-bold", big ? "text-3xl" : "text-xl")}>{item.item_name}</h2>
            {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
            <div className={cn("mt-1 font-semibold text-primary", big && "text-xl")}>{money(item.price, currency)}</div>
          </div>
          {item.modifiers.map((g) => (
            <div key={g.group}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className={cn("font-semibold", big && "text-lg")}>{g.group}</h3>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", g.required || g.min ? "bg-red-500/10 text-red-600" : "bg-muted text-muted-foreground")}>
                  {g.required || g.min ? "Required" : "Optional"}{g.max > 1 ? ` · up to ${g.max}` : ""}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.options.map((o) => {
                  const on = mods.some((c) => c.group === g.group && c.name === o.name);
                  return (
                    <button key={o.name} onClick={() => toggle(g.group, o.name, g.max)}
                      className={cn("flex items-center justify-between rounded-xl border px-3 text-left", big ? "h-14 text-lg" : "h-11 text-sm", on ? "border-primary bg-primary/10 font-semibold" : "border-border")}>
                      <span>{o.name}</span><span className="text-muted-foreground">{o.price ? `+ ${money(o.price, currency)}` : ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!big && <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={140} placeholder="Note for the kitchen (no onion, extra sauce…)"
            className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-sm" />}
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-xl border border-border">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className={cn("px-3", big ? "h-14" : "h-11")} aria-label="Less"><Minus className="h-4 w-4" /></button>
              <span className={cn("w-8 text-center font-bold", big && "text-xl")}>{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} className={cn("px-3", big ? "h-14" : "h-11")} aria-label="More"><Plus className="h-4 w-4" /></button>
            </div>
            <button disabled={missing.length > 0} onClick={() => onAdd(qty, mods, notes || undefined)}
              className={cn("flex-1 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50", big ? "h-14 text-lg" : "h-11")}>
              {missing.length ? `Choose ${missing[0].group}` : `Add · ${money(unit * qty, currency)}`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
