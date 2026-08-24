"use client";

import { cn } from "@/lib/utils";

/**
 * A soft radial highlight anchored near the top of its container, in the
 * style popularized by Aceternity UI's "Spotlight" component - adds depth
 * to an otherwise flat hero section without any JS/mouse-tracking cost
 * (pure CSS gradient, so it's cheap and themes correctly via the brand
 * token instead of a hardcoded color).
 */
export function Spotlight({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      <div
        className="absolute left-1/2 top-[-10%] h-[600px] w-[900px] -translate-x-1/2 opacity-40 dark:opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 50% 50% at 50% 50%, color-mix(in oklch, var(--brand) 35%, transparent) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      <div
        className="absolute right-[10%] top-[5%] h-[400px] w-[500px] opacity-25 dark:opacity-20"
        style={{
          background:
            "radial-gradient(ellipse 50% 50% at 50% 50%, color-mix(in oklch, var(--brand) 25%, transparent) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />
    </div>
  );
}
