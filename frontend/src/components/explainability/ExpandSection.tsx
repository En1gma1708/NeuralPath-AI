"use client";

import { useState, Children } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * [ + ] bracket-expand progressive disclosure, in the style of
 * sentient.foundation's nav/footer/article pattern (reviewed live via
 * Playwright on 2026-08-24 - see docs/SCHEDULE.md Phase 5 item 2). Used
 * across the explainability pages for detail that shouldn't all be
 * on-screen at once - architecture stages, limitation call-outs, etc.
 *
 * Motion upgraded 2026-08-24: the bracket rotates+cross-fades between +/-
 * instead of just swapping text, the panel eases with a spring instead of
 * a flat duration-based curve, and children stagger in individually
 * rather than revealing as one flat block - reads as considered rather
 * than a generic accordion.
 */
export function ExpandSection({
  title,
  eyebrow,
  children,
  defaultOpen = false,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const childArray = Children.toArray(children);

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
        aria-expanded={open}
      >
        <div className="flex flex-col gap-1">
          {eyebrow && (
            <span className="text-[11px] uppercase tracking-widest text-brand font-mono">
              {eyebrow}
            </span>
          )}
          <span className="font-heading text-lg md:text-xl font-semibold text-foreground group-hover:text-brand transition-colors">
            {title}
          </span>
        </div>
        <span className="relative w-8 h-8 shrink-0 rounded-full border border-border group-hover:border-brand/50 flex items-center justify-center overflow-hidden">
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={open ? "minus" : "plus"}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute font-mono text-sm text-foreground"
            >
              {open ? "−" : "+"}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 30, mass: 0.7 }}
            className="overflow-hidden"
          >
            <div className="pb-6 text-sm md:text-base text-muted-foreground leading-relaxed space-y-3">
              {childArray.map((child, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.06, duration: 0.3, ease: "easeOut" }}
                >
                  {child}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
