import { cn } from "@/utils/cn";

/** Restaurant OS mark: a cloche on a teal tile. */
function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="Restaurant OS">
      <rect width="40" height="40" rx="10" fill="hsl(173 80% 36%)" />
      <path d="M9 27h22M11 25a9 9 0 0 1 18 0M20 13.5v-2.5M18 11h4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
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
          Restaurant<span className="text-primary">OS</span>
        </span>
        <span className={cn("mt-1 block text-[9px] font-semibold uppercase tracking-[0.2em]", onDark ? "text-white/60" : "text-muted-foreground")}>
          Point of sale
        </span>
      </span>
    </span>
  );
}
