import { useEffect, useState } from "react";

/**
 * POS terminal → customer-facing display, on the same counter PC (second monitor / pole display window).
 * BroadcastChannel is instant and works offline; the last state is also kept in localStorage so a display opened later
 * (or reloaded) shows the current sale straight away.
 */
export interface DisplayLine { name: string; qty: number; uom?: string; rate: number; amount: number; list?: number; free?: boolean }
export interface DisplayTotals { subtotal: number; discount: number; taxes: { description: string; amount: number }[]; total: number }
export type DisplayState =
  | { kind: "idle"; counter?: string }
  | { kind: "cart"; counter?: string; customer?: string; lines: DisplayLine[]; totals: DisplayTotals; offers?: string[]; currency: string }
  | { kind: "pay"; counter?: string; customer?: string; total: number; points: number; due: number; paid: number; change: number; currency: string }
  | { kind: "done"; counter?: string; customer?: string; invoice: string; total: number; paid: number; change: number; currency: string;
      fbr?: string; qr?: string; offline?: boolean };

const CHANNEL = "ros-customer-display";
const KEY = "ros.cfd.state";
let channel: BroadcastChannel | null = null;
const chan = () => {
  if (typeof BroadcastChannel === "undefined") return null;
  channel ??= new BroadcastChannel(CHANNEL);
  return channel;
};

export function publishDisplay(state: DisplayState) {
  const msg = { ...state, at: Date.now() };
  try { chan()?.postMessage(msg); } catch { /* closed */ }
  try { localStorage.setItem(KEY, JSON.stringify(msg)); } catch { /* private mode */ }
}

/** Back to the menu — unless a sale just finished: the display keeps thanking the customer until its own timer ends. */
export function publishIdle(counter?: string) {
  try {
    const last = JSON.parse(localStorage.getItem(KEY) || "{}") as { kind?: string; at?: number };
    if (last.kind === "done" && Date.now() - (last.at ?? 0) < 15000) return;
    if (last.kind === "idle") return;
  } catch { /* no previous state */ }
  publishDisplay({ kind: "idle", counter });
}

export function useDisplayState(): DisplayState & { at?: number } {
  const [state, setState] = useState<DisplayState & { at?: number }>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || "") as DisplayState; } catch { return { kind: "idle" }; }
  });
  useEffect(() => {
    const c = chan();
    const onMsg = (e: MessageEvent) => setState(e.data as DisplayState);
    c?.addEventListener("message", onMsg);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY && e.newValue) { try { setState(JSON.parse(e.newValue)); } catch { /* bad JSON */ } } };
    window.addEventListener("storage", onStorage);               // fallback for browsers without BroadcastChannel
    return () => { c?.removeEventListener("message", onMsg); window.removeEventListener("storage", onStorage); };
  }, []);
  return state;
}

/** Open (or focus) the display window — on the second screen, full screen, when the browser allows it. */
export async function openCustomerDisplay() {
  const url = "/ros/display";                                // the router basename is /ros in dev and on the server
  let features = "popup,width=1024,height=768";
  try {
    // Window Management API (Chrome): place the window on the screen that isn't this one
    const w = window as unknown as { getScreenDetails?: () => Promise<{ screens: { left: number; top: number; availWidth: number; availHeight: number; isPrimary: boolean }[]; currentScreen: { left: number } }> };
    if (w.getScreenDetails) {
      const d = await w.getScreenDetails();
      const other = d.screens.find((s) => s.left !== d.currentScreen.left);
      if (other) features = `popup,left=${other.left},top=${other.top},width=${other.availWidth},height=${other.availHeight}`;
    }
  } catch { /* permission denied: open next to the terminal */ }
  const win = window.open(url, "ros-customer-display", features);
  win?.focus();
  return !!win;
}
