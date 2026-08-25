"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, MotionValue } from "framer-motion";

interface Stage {
  eyebrow: string;
  title: string;
}

/**
 * Podium.global-style scroll-sequenced rail: a sticky vertical progress
 * indicator that fills and highlights the active stage as the user
 * scrolls past each section, rather than a static list. This is the
 * actual "sequence-driven scroll animation" pattern the user referenced
 * (podium.global) - distinct from the simple viewport-entry fades used
 * elsewhere (Sentient-style), and specifically meant for the
 * explainability pages per the 2026-08-24 scope correction in
 * docs/SCHEDULE.md (Podium pattern = these pages' structure, not an
 * app-wide retrofit).
 *
 * Usage: wrap the page's stage sections in a container with this rail
 * alongside it; each stage section needs a ref registered via
 * `sectionRefs` so scroll progress can be mapped to an active index.
 */
export function ScrollStageRail({
  stages,
  containerRef,
}: {
  stages: Stage[];
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"],
  });

  return (
    <div className="hidden lg:flex flex-col gap-6 sticky top-32 self-start w-48 shrink-0">
      <div className="relative pl-6">
        <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
        <motion.div
          className="absolute left-0 top-0 w-px bg-brand origin-top"
          style={{
            scaleY: scrollYProgress,
            height: "100%",
          }}
        />
        <div className="flex flex-col gap-10">
          {stages.map((stage, i) => (
            <StageLabel
              key={stage.title}
              stage={stage}
              index={i}
              total={stages.length}
              scrollYProgress={scrollYProgress}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StageLabel({
  stage,
  index,
  total,
  scrollYProgress,
}: {
  stage: Stage;
  index: number;
  total: number;
  scrollYProgress: MotionValue<number>;
}) {
  const bandStart = index / total;
  const bandEnd = (index + 1) / total;
  const opacity = useTransform(
    scrollYProgress,
    [Math.max(0, bandStart - 0.05), bandStart, bandEnd, Math.min(1, bandEnd + 0.05)],
    [0.35, 1, 1, 0.35]
  );

  return (
    <motion.div style={{ opacity }} className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-brand font-mono">
        {stage.eyebrow}
      </span>
      <span className="text-sm font-heading font-semibold text-foreground leading-snug">
        {stage.title}
      </span>
    </motion.div>
  );
}
