"use client";

import { motion } from "framer-motion";

interface Stat {
  value: string;
  label: string;
}

/**
 * Bold 4-up number grid (ClearPath's 450+/80+/9+/25+ pattern, reviewed
 * live via Playwright on 2026-08-24 - see docs/SCHEDULE.md Phase 5 item 2).
 * Every value passed in must trace to a real row in docs/METRICS.md -
 * this component doesn't validate that, the caller must.
 */
export function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10">
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ delay: i * 0.08, duration: 0.5 }}
          className="flex flex-col gap-1 border-t border-border pt-4"
        >
          <span className="font-heading text-3xl md:text-4xl font-bold tracking-tight text-foreground tabular-nums">
            {s.value}
          </span>
          <span className="text-xs md:text-sm text-muted-foreground leading-snug">
            {s.label}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
