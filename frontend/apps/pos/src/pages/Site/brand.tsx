import { cn } from "@/utils/cn";

/** Shared look for the public site and the sign-in page: fonts, colours, small motion. */
export const SITE_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
.mx { font-family: Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.mx .serif { font-family: Fraunces, Georgia, serif; letter-spacing: -0.02em; }
.mx .gold { color: #e3a33f; }
.mx .gold-grad { background: linear-gradient(110deg, #fde3a7 0%, #f5c46b 40%, #e59a3a 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.mx .btn-gold { background: linear-gradient(120deg, #f7cd7a, #e59a3a); color: #1a1208; box-shadow: 0 14px 34px -14px rgba(229,154,58,.85); }
.mx .btn-gold:hover { filter: brightness(1.05); }
.mx .glass { background: linear-gradient(160deg, rgba(255,255,255,.10), rgba(255,255,255,.03)); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,.12); }
.mx .grain { background-image: radial-gradient(rgba(255,255,255,.035) 1px, transparent 1px); background-size: 3px 3px; }
@keyframes mx-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes mx-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
.mx .rise { animation: mx-rise .8s cubic-bezier(.2,.7,.2,1) both; }
.mx .float { animation: mx-float 6s ease-in-out infinite; }
.mx .reveal { opacity: 0; transform: translateY(24px); transition: opacity .8s cubic-bezier(.2,.7,.2,1), transform .8s cubic-bezier(.2,.7,.2,1); }
.mx .reveal.in { opacity: 1; transform: none; }
@keyframes mx-sheen { 0%, 55% { transform: translateX(-130%) skewX(-18deg); } 100% { transform: translateX(230%) skewX(-18deg); } }
.mx .sheen { position: relative; overflow: hidden; }
.mx .sheen::after { content: ""; position: absolute; inset: 0; width: 45%; pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent); animation: mx-sheen 6.5s ease-in-out infinite; }
.mx .glare { background: linear-gradient(135deg, rgba(255,255,255,.22) 0%, rgba(255,255,255,.04) 28%, transparent 45%); }
@media (prefers-reduced-motion: reduce) { .mx * { animation: none !important; transition: none !important; } .mx .reveal { opacity: 1; transform: none; } }
`;

/** Path to a file in public/site (works in dev and in the Frappe-served build). */
export const shot = (name: string) => `${import.meta.env.BASE_URL}site/${name}.webp`;

/** MicroMax POS wordmark: a gold flame-in-plate mark and the name. */
export function MicroMaxLogo({ className, light = true }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden>
        <defs><linearGradient id="mxg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f7cd7a" /><stop offset="1" stopColor="#e08a2a" /></linearGradient></defs>
        <rect width="40" height="40" rx="12" fill="url(#mxg)" />
        <path d="M20 8c3 4 6 6.5 6 11a6 6 0 0 1-12 0c0-2.4 1-4 2.5-5.5.3 2 1.2 3 2.3 3.4C18 14 18.6 11 20 8z" fill="#1a1208" />
        <rect x="9" y="29" width="22" height="3" rx="1.5" fill="#1a1208" />
      </svg>
      <span className="leading-none">
        <span className={cn("block text-lg font-bold tracking-tight", light ? "text-white" : "text-[#14110d]")}>MicroMax<span className="gold"> POS</span></span>
        <span className={cn("block text-[10px] font-semibold uppercase tracking-[0.28em]", light ? "text-white/45" : "text-[#14110d]/45")}>Restaurant OS</span>
      </span>
    </span>
  );
}
