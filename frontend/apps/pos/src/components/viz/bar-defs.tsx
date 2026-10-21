/** SVG gradients for chart bars: azure (#3092df) → teal (#1bafb4). Call as {barDefs()} inside a chart — Recharts drops
 *  custom child components but keeps a raw <defs> element. */
export function barDefs() {
  return (
    <defs>
      <linearGradient id="mx-bar-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3092df" /><stop offset="100%" stopColor="#1bafb4" /></linearGradient>
      <linearGradient id="mx-bar-h" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#3092df" /><stop offset="100%" stopColor="#1bafb4" /></linearGradient>
    </defs>
  );
}
