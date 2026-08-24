"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * An animated light traveling around a container's border, in the style
 * popularized by Magic UI's "Border Beam" - a small, low-cost detail that
 * reads as considered/premium on an otherwise plain dashed dropzone. Pure
 * CSS conic-gradient + Framer Motion rotation, no extra dependency beyond
 * what's already in this project.
 */
export function BorderBeam({
  className,
  duration = 6,
}: {
  className?: string;
  duration?: number;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]",
        className
      )}
    >
      <motion.div
        className="absolute inset-[-100%]"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0%, transparent 75%, var(--brand) 85%, transparent 95%)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute inset-[2px] rounded-[inherit] bg-secondary/40" />
    </div>
  );
}
