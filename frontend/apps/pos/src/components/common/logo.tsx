import { cn } from "@/utils/cn";

/** MicroMax POS mark: a flame on a plate, on a gold tile (same mark as the website). */
function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="MicroMax POS">
      <defs><linearGradient id="mx-logo-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f7cd7a" /><stop offset="1" stopColor="#e08a2a" /></linearGradient></defs>
      <rect width="40" height="40" rx="12" fill="url(#mx-logo-g)" />
      <path d="M20 8c3 4 6 6.5 6 11a6 6 0 0 1-12 0c0-2.4 1-4 2.5-5.5.3 2 1.2 3 2.3 3.4C18 14 18.6 11 20 8z" fill="#1a1208" />
      <rect x="9" y="29" width="22" height="3" rx="1.5" fill="#1a1208" />
    </svg>
  );
}

export function Logo({
  variant = "full",
  onDark = false,
  className,
}: {
  /** "mark" is just the icon; "full" adds the wordmark. */
  variant?: "full" | "mark";
  /** Light-on-dark wordmark, for permanently dark surfaces (the sidebar). */
  onDark?: boolean;
  className?: string;
}) {
  if (variant === "mark") return <Mark className={cn("inline-block", className)} />;
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Mark className="h-full w-auto" />
      <span className="leading-none">
        <span className={cn("block text-lg font-bold tracking-tight", onDark ? "text-white" : "text-foreground")}>
          MicroMax<span className="text-primary"> POS</span>
        </span>
        <span className={cn("mt-1 block text-[9px] font-semibold uppercase tracking-[0.2em]", onDark ? "text-white/60" : "text-muted-foreground")}>
          Restaurant OS
        </span>
      </span>
    </span>
  );
}
